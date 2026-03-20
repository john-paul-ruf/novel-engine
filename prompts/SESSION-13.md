# Session 13 — UI Shell, Stores, Routing, Theme

## Context

Novel Engine Electron app. Sessions 01–12 built the entire backend. Now I start on the **frontend**. This session creates the app layout shell, Zustand stores, a simple view router, and the dark theme foundation.

## Architecture Rule

Everything in `src/renderer/`. Components only access the backend through `window.novelEngine` (the preload bridge). Stores hold UI state and async data fetched from the bridge. No direct imports from domain/infrastructure/application — only import **types** from `@domain` (using `import type`).

---

## Task 1: Zustand Stores

### `src/renderer/stores/settingsStore.ts`

```typescript
// State: AppSettings + loading flag + actions
// On mount: load settings from bridge
// Actions: saveApiKey, validateApiKey, updateSettings
// After saveApiKey: reload settings to get updated hasApiKey
```

Key shape:
```typescript
{
  settings: AppSettings | null;
  loading: boolean;
  load: () => Promise<void>;
  saveApiKey: (key: string) => Promise<void>;
  validateApiKey: (key: string) => Promise<boolean>;
  update: (partial: Partial<AppSettings>) => Promise<void>;
}
```

### `src/renderer/stores/bookStore.ts`

```typescript
// State: books list, activeBookSlug, activeBookMeta, wordCounts
// Actions: loadBooks, setActiveBook, createBook, refreshWordCount
```

Key shape:
```typescript
{
  books: BookSummary[];
  activeSlug: string;
  loading: boolean;
  loadBooks: () => Promise<void>;
  setActiveBook: (slug: string) => Promise<void>;
  createBook: (title: string) => Promise<string>;  // returns slug
  refreshWordCount: () => Promise<void>;
}
```

### `src/renderer/stores/chatStore.ts`

```typescript
// State: active conversation, messages, streaming state, thinking state
// Actions: createConversation, loadConversation, sendMessage, stream listener management
```

Key shape:
```typescript
{
  activeConversation: Conversation | null;
  conversations: Conversation[];
  messages: Message[];
  isStreaming: boolean;
  isThinking: boolean;
  streamBuffer: string;        // accumulates text deltas
  thinkingBuffer: string;      // accumulates thinking deltas
  
  loadConversations: (bookSlug: string) => Promise<void>;
  createConversation: (agentName: AgentName, bookSlug: string, phase: PipelinePhaseId | null) => Promise<void>;
  setActiveConversation: (conversationId: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  
  // Internal: called by the stream event listener
  _handleStreamEvent: (event: StreamEvent) => void;
  // Cleanup function ref for the stream listener
  _cleanupListener: (() => void) | null;
  initStreamListener: () => void;
  destroyStreamListener: () => void;
}
```

**Critical: `_handleStreamEvent` implementation:**
- `blockStart` with `thinking` → set `isThinking: true, isStreaming: true`
- `blockStart` with `text` → set `isThinking: false` (still streaming)
- `thinkingDelta` → append to `thinkingBuffer`
- `textDelta` → append to `streamBuffer`
- `blockEnd` → no-op (transitions are handled by blockStart)
- `done` → create a new `Message` from buffers, add to `messages`, reset all streaming state
- `error` → reset streaming state, add an error message to `messages`

**Critical: `sendMessage` implementation:**
1. Read `activeConversation` from the store to get `conversationId` and `agentName`
2. Read `bookStore.getState().activeSlug` for `bookSlug` (cross-store read via `getState()`)
3. If no active conversation, throw/return early
4. Add the user message to `messages` immediately (optimistic)
5. Set `isStreaming: true`, clear buffers
6. Call `window.novelEngine.chat.send({ agentName, message: content, conversationId, bookSlug })` — this is fire-and-forget, the response comes via the stream listener

> **Cross-store access:** Zustand stores can read other stores via `useOtherStore.getState()` outside of React components. This is the recommended pattern for store-to-store communication.

**Critical: `initStreamListener`:**
Call `window.novelEngine.chat.onStreamEvent(this._handleStreamEvent)` and store the cleanup function. Call this once when the chat view mounts.

### `src/renderer/stores/pipelineStore.ts`

```typescript
{
  phases: PipelinePhase[];
  activePhase: PipelinePhase | null;
  loading: boolean;
  loadPipeline: (bookSlug: string) => Promise<void>;
}
```

---

## Task 2: View Router

We don't need React Router — this is a single-window app with a fixed layout. Use a simple Zustand store for view navigation.

### `src/renderer/stores/viewStore.ts`

```typescript
type ViewId = 'onboarding' | 'chat' | 'files' | 'build' | 'settings';

type ViewPayload = {
  filePath?: string;       // For 'files' view: which file to open
  conversationId?: string; // For 'chat' view: which conversation to load
};

{
  currentView: ViewId;
  payload: ViewPayload;
  navigate: (view: ViewId, payload?: ViewPayload) => void;
}
```

> **Navigation payload:** The `navigate` function sets both `currentView` and `payload` atomically. When `payload` is omitted, it defaults to `{}`. Components read `payload` on mount to determine what to display. For example:
>
> - `FileTree` calls `viewStore.navigate('files', { filePath: 'source/voice-profile.md' })`
> - `FilesView` reads `viewStore.payload.filePath` on mount and loads that file
> - `PipelineTracker` calls `viewStore.navigate('chat', { conversationId: '...' })`

---

## Task 3: App Shell Layout

### `src/renderer/App.tsx`

The top-level component. On mount:
1. Load settings from the store
2. If `settings.initialized === false`, show the `Onboarding` view
3. Otherwise, show the main layout

### `src/renderer/components/Layout/AppLayout.tsx`

A three-column layout:

```
┌──────────┬──────────────────────────────────┐
│ Sidebar  │  Main Content Area               │
│ (260px)  │  (flex-1)                        │
│          │                                  │
│          │  Renders based on currentView:   │
│          │  - 'chat' → ChatView             │
│          │  - 'files' → FilesView           │
│          │  - 'build' → BuildView           │
│          │  - 'settings' → SettingsView     │
│          │                                  │
└──────────┴──────────────────────────────────┘
```

- Sidebar is fixed-width (260px), dark background (`bg-zinc-900`)
- Main area fills remaining space
- Full height: `h-screen`
- Add a custom drag region for the macOS title bar: a `div` with `-webkit-app-region: drag` at the top of the sidebar (32px tall)

### `src/renderer/components/Layout/Sidebar.tsx`

For now, just the structural shell with placeholder sections:
- **Drag region** (32px, for macOS window controls)
- **Book selector** area (placeholder)
- **Pipeline tracker** area (placeholder)
- **Navigation buttons:** Chat, Files, Build, Settings — each calls `viewStore.navigate()`
- **Token usage summary** at the bottom (placeholder)

Style the nav buttons: active state uses `bg-zinc-800`, hover uses `bg-zinc-800/50`, icons on the left.

---

## Task 4: Globals and Theme

### `src/renderer/styles/globals.css`

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";

/* Custom scrollbar for dark theme */
::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: #52525b; }

/* Drag region for macOS title bar */
.drag-region { -webkit-app-region: drag; }
.no-drag { -webkit-app-region: no-drag; }

```

### Color palette

Use Tailwind's `zinc` scale for the dark theme:
- Background: `zinc-950` (#09090b)
- Sidebar: `zinc-900` (#18181b)
- Cards/panels: `zinc-800` (#27272a)
- Borders: `zinc-700` (#3f3f46)
- Text primary: `zinc-100` (#f4f4f5)
- Text secondary: `zinc-400` (#a1a1aa)
- Accent: `blue-500` for interactive elements

---

## Verification

- `npm start` shows the app with a dark sidebar and main content area
- Navigation buttons switch between views (even though views are placeholder text)
- No console errors
- macOS: the title bar area is draggable
- Stores are created but no data is loaded yet (that comes with the real UI components)
