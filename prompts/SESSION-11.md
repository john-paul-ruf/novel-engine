# Session 11 — IPC Handlers + Preload Bridge

## Context

Novel Engine Electron app. Sessions 01–10 built all domain types, infrastructure implementations, and application services. Now I need to **wire them together** through Electron's IPC system so the renderer can call them.

## Architecture Rule

The IPC layer is a **thin adapter**. Each handler does three things: (1) receive the call, (2) delegate to an application or infrastructure service, (3) return the result. No business logic lives here. The preload bridge exposes a typed API to the renderer.

---

## Task 1: `src/main/ipc/handlers.ts`

This is a single file that exports a `registerIpcHandlers` function. It receives all the service instances as parameters and registers every `ipcMain.handle` call.

### Function signature

```typescript
import { ipcMain, BrowserWindow } from 'electron';
// Import all domain types needed for params/returns

export function registerIpcHandlers(services: {
  settings: ISettingsService;
  agents: IAgentService;
  db: IDatabaseService;
  fs: IFileSystemService;
  chat: ChatService;
  pipeline: IPipelineService;
  build: IBuildService;
  usage: UsageService;
}, paths: {
  userDataPath: string;
  booksDir: string;
}) { ... }
```

### Channels to register

**Settings:**
- `'settings:load'` → `services.settings.load()`
- `'settings:detectClaudeCli'` → `services.settings.detectClaudeCli()`
- `'settings:update'` → `(_, partial)` → `services.settings.update(partial)`

**Agents:**
- `'agents:list'` → `services.agents.loadAll()` — return the agents but WITHOUT the `systemPrompt` field (it's huge, the renderer doesn't need it). Map to `AgentMeta[]`.
- `'agents:get'` → `(_, name: AgentName)` → `services.agents.load(name)` — same, strip `systemPrompt`.

**Books:**
- `'books:list'` → `services.fs.listBooks()`
- `'books:getActiveSlug'` → `services.fs.getActiveBookSlug()`
- `'books:setActive'` → `(_, slug: string)` → `services.fs.setActiveBook(slug)`
- `'books:create'` → `(_, title: string)` → reads `authorName` from `services.settings.load()` and passes it: `services.fs.createBook(title, settings.authorName)`. This ensures books use the author name configured during onboarding.
- `'books:getMeta'` → `(_, slug: string)` → `services.fs.getBookMeta(slug)`
- `'books:updateMeta'` → `(_, slug: string, partial)` → `services.fs.updateBookMeta(slug, partial)`
- `'books:wordCount'` → `(_, slug: string)` → `services.fs.countWordsPerChapter(slug)`

**Files:**
- `'files:read'` → `(_, bookSlug: string, path: string)` → `services.fs.readFile(bookSlug, path)`
- `'files:write'` → `(_, bookSlug: string, path: string, content: string)` → `services.fs.writeFile(bookSlug, path, content)`
- `'files:exists'` → `(_, bookSlug: string, path: string)` → `services.fs.fileExists(bookSlug, path)`
- `'files:listDir'` → `(_, bookSlug: string, path?: string)` → `services.fs.listDirectory(bookSlug, path)`

**Conversations:**
- `'chat:createConversation'` → `(_, params)` → `services.chat.createConversation(params)`
- `'chat:getConversations'` → `(_, bookSlug: string)` → `services.chat.getConversations(bookSlug)`
- `'chat:getMessages'` → `(_, conversationId: string)` → `services.chat.getMessages(conversationId)`
- `'chat:deleteConversation'` → `(_, conversationId: string)` → `services.db.deleteConversation(conversationId)`

**Chat (streaming):**
- `'chat:send'` → This one is special. It needs to stream events back to the renderer via `webContents.send`. Implementation:

```typescript
ipcMain.handle('chat:send', async (event, params: SendMessageParams) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) throw new Error('No window found');

  await services.chat.sendMessage({
    ...params,
    onEvent: (streamEvent) => {
      // Forward every stream event to the renderer
      win.webContents.send('chat:streamEvent', streamEvent);
    },
  });
});
```

**Pipeline:**
- `'pipeline:detect'` → `(_, bookSlug: string)` → `services.pipeline.detectPhases(bookSlug)`
- `'pipeline:getActive'` → `(_, bookSlug: string)` → `services.pipeline.getActivePhase(bookSlug)`

**Build:**
- `'build:run'` → special, streams progress:
```typescript
ipcMain.handle('build:run', async (event, bookSlug: string) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return services.build.build(bookSlug, (message) => {
    win?.webContents.send('build:progress', message);
  });
});
```
- `'build:isPandocAvailable'` → `services.build.isPandocAvailable()`

**Usage:**
- `'usage:summary'` → `(_, bookSlug?: string)` → `services.usage.getSummary(bookSlug)`
- `'usage:byConversation'` → `(_, conversationId: string)` → `services.usage.getByConversation(conversationId)`

> **Forward compatibility note:** Sessions 14 and 17 will add additional IPC channels (`settings:saveAuthorProfile`, `settings:loadAuthorProfile`, `books:getAbsolutePath`, `shell:openPath`). These use the `paths` parameter in the function signature above. When implementing those sessions, add the handlers to the same `registerIpcHandlers` function and update the preload accordingly.

---

## Task 2: `src/preload/index.ts`

Replace the stub from Session 01 with the full typed preload bridge.

### Structure

```typescript
import { contextBridge, ipcRenderer } from 'electron';
// IMPORTANT: Import ONLY types from domain — never values. The preload runs
// in a sandboxed context and cannot access main-process modules.
import type {
  AppSettings, AgentMeta, AgentName, BookSummary, BookMeta,
  FileEntry, Conversation, Message, PipelinePhaseId, PipelinePhase,
  SendMessageParams, StreamEvent, BuildResult, UsageSummary, UsageRecord,
} from '@domain/types';

const api = {
  // Settings
  settings: {
    load: (): Promise<AppSettings> => ipcRenderer.invoke('settings:load'),
    detectClaudeCli: (): Promise<boolean> => ipcRenderer.invoke('settings:detectClaudeCli'),
    update: (partial: Partial<AppSettings>): Promise<void> => ipcRenderer.invoke('settings:update', partial),
  },

  // Agents
  agents: {
    list: (): Promise<AgentMeta[]> => ipcRenderer.invoke('agents:list'),
    get: (name: AgentName): Promise<AgentMeta> => ipcRenderer.invoke('agents:get', name),
  },

  // Books
  books: {
    list: (): Promise<BookSummary[]> => ipcRenderer.invoke('books:list'),
    getActiveSlug: (): Promise<string> => ipcRenderer.invoke('books:getActiveSlug'),
    setActive: (slug: string): Promise<void> => ipcRenderer.invoke('books:setActive', slug),
    create: (title: string): Promise<BookMeta> => ipcRenderer.invoke('books:create', title),
    getMeta: (slug: string): Promise<BookMeta> => ipcRenderer.invoke('books:getMeta', slug),
    updateMeta: (slug: string, partial: Partial<BookMeta>): Promise<void> => ipcRenderer.invoke('books:updateMeta', slug, partial),
    wordCount: (slug: string): Promise<{ slug: string; wordCount: number }[]> => ipcRenderer.invoke('books:wordCount', slug),
  },

  // Files
  files: {
    read: (bookSlug: string, path: string): Promise<string> => ipcRenderer.invoke('files:read', bookSlug, path),
    write: (bookSlug: string, path: string, content: string): Promise<void> => ipcRenderer.invoke('files:write', bookSlug, path, content),
    exists: (bookSlug: string, path: string): Promise<boolean> => ipcRenderer.invoke('files:exists', bookSlug, path),
    listDir: (bookSlug: string, path?: string): Promise<FileEntry[]> => ipcRenderer.invoke('files:listDir', bookSlug, path),
  },

  // Chat
  chat: {
    createConversation: (params: { bookSlug: string; agentName: AgentName; pipelinePhase: PipelinePhaseId | null }): Promise<Conversation> =>
      ipcRenderer.invoke('chat:createConversation', params),
    getConversations: (bookSlug: string): Promise<Conversation[]> =>
      ipcRenderer.invoke('chat:getConversations', bookSlug),
    getMessages: (conversationId: string): Promise<Message[]> =>
      ipcRenderer.invoke('chat:getMessages', conversationId),
    deleteConversation: (conversationId: string): Promise<void> =>
      ipcRenderer.invoke('chat:deleteConversation', conversationId),
    send: (params: SendMessageParams): Promise<void> =>
      ipcRenderer.invoke('chat:send', params),
    onStreamEvent: (callback: (event: StreamEvent) => void) => {
      const handler = (_: any, event: StreamEvent) => callback(event);
      ipcRenderer.on('chat:streamEvent', handler);
      return () => ipcRenderer.removeListener('chat:streamEvent', handler);
    },
  },

  // Pipeline
  pipeline: {
    detect: (bookSlug: string): Promise<PipelinePhase[]> => ipcRenderer.invoke('pipeline:detect', bookSlug),
    getActive: (bookSlug: string): Promise<PipelinePhase | null> => ipcRenderer.invoke('pipeline:getActive', bookSlug),
  },

  // Build
  build: {
    run: (bookSlug: string): Promise<BuildResult> => ipcRenderer.invoke('build:run', bookSlug),
    isPandocAvailable: (): Promise<boolean> => ipcRenderer.invoke('build:isPandocAvailable'),
    onProgress: (callback: (message: string) => void) => {
      const handler = (_: any, msg: string) => callback(msg);
      ipcRenderer.on('build:progress', handler);
      return () => ipcRenderer.removeListener('build:progress', handler);
    },
  },

  // Usage
  usage: {
    summary: (bookSlug?: string): Promise<UsageSummary> => ipcRenderer.invoke('usage:summary', bookSlug),
    byConversation: (conversationId: string): Promise<UsageRecord[]> => ipcRenderer.invoke('usage:byConversation', conversationId),
  },
};

contextBridge.exposeInMainWorld('novelEngine', api);
```

### TypeScript declaration

Add a type declaration so the renderer can use `window.novelEngine` with full types:

```typescript
// At the bottom of the preload file, or in a separate src/preload/types.d.ts
type NovelEngineAPI = typeof api;

declare global {
  interface Window {
    novelEngine: NovelEngineAPI;
  }
}
```

**Important:** The `onStreamEvent` and `onProgress` methods return cleanup functions. The renderer MUST call these when unmounting to avoid listener leaks. This is critical for React components.

## Verification

- Both files compile with `npx tsc --noEmit`
- `handlers.ts` has no business logic — every handler is a one-liner delegation (exception: `books:create` reads `authorName` from settings before delegating)
- `preload/index.ts` exposes the full bridge surface including `agents.get` and `settings.detectClaudeCli`
- `preload/index.ts` has explicit `import type` statements from `@domain/types` at the top
- Event listeners (`onStreamEvent`, `onProgress`) return cleanup functions
- `window.novelEngine` has full TypeScript types in the renderer
- The preload file imports NO domain/infrastructure/application **values** — only types (use `import type`)
