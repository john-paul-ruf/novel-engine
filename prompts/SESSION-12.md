# Session 12 — Main Process Entry + Bootstrap

## Context

Novel Engine Electron app. Sessions 01–11 built everything from domain types through IPC wiring. Now I need the **main process entry point** that instantiates all services, wires them together, and starts the app. Plus the **first-run bootstrap** that copies agent files and creates initial directories.

## Architecture Rule

`src/main/index.ts` is the **composition root** — the one place where concrete implementations are instantiated and injected into each other. After this file, everything flows through interfaces.

---

## Task 1: `src/main/bootstrap.ts`

### `bootstrap(userDataPath: string, resourcesPath: string): Promise<void>`

Called on first run (or if the `.initialized` flag file is missing).

**Steps:**
1. Create directories: `{userDataPath}/books/`, `{userDataPath}/custom-agents/`
2. Copy bundled agent `.md` files from `{resourcesPath}/agents/` to `{userDataPath}/custom-agents/`. If the destination file already exists, **do not overwrite** (user may have customized it).
3. Create `{userDataPath}/author-profile.md` with template content (if not exists):
   ```markdown
   # Author Profile

   Describe your writing voice, themes, genres, and style here.
   This is loaded by Spark and Quill to understand your creative DNA.
   ```
4. Create `{userDataPath}/active-book.json` with `{ "book": "" }` (if not exists).
5. Write the flag file `{userDataPath}/.initialized` with the current ISO timestamp.

### `needsBootstrap(userDataPath: string): Promise<boolean>`

Check if `{userDataPath}/.initialized` exists. Return true if it doesn't.

---

## Task 2: `src/infrastructure/pandoc/index.ts`

**Create this before `src/main/index.ts`** — the main entry imports from `@infra/pandoc`, so this file must exist first.

Small utility to resolve the Pandoc binary path.

```typescript
import path from 'node:path';
import os from 'node:os';

export function resolvePandocPath(resourcesPath: string): string {
  const platform = os.platform();
  const arch = os.arch();
  const ext = platform === 'win32' ? '.exe' : '';
  return path.join(resourcesPath, 'pandoc', `pandoc-${platform}-${arch}${ext}`);
}
```

---

## Task 3: `src/main/index.ts`

Replace the stub from Session 01 with the full composition root.

### The wiring order matters. Follow this exact sequence:

```typescript
import { app, BrowserWindow, protocol, net } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Infrastructure
import { SettingsService } from '@infra/settings';
import { DatabaseService } from '@infra/database';
import { AgentService } from '@infra/agents';
import { FileSystemService } from '@infra/filesystem';
import { ClaudeCodeClient } from '@infra/claude-cli';

// Application
import { ContextBuilder } from '@app/ContextBuilder';
import { ChatService } from '@app/ChatService';
import { PipelineService } from '@app/PipelineService';
import { BuildService } from '@app/BuildService';
import { UsageService } from '@app/UsageService';

// IPC
import { registerIpcHandlers } from './ipc/handlers';

// Bootstrap
import { bootstrap, needsBootstrap } from './bootstrap';

// Paths
import { resolvePandocPath } from '@infra/pandoc'; // create this small utility
```

### `createWindow()`

Same as Session 01 but with the correct Vite entry points. The Electron Forge Vite plugin defines `MAIN_WINDOW_VITE_DEV_SERVER_URL` and `MAIN_WINDOW_VITE_NAME` for the renderer entry.

```typescript
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#09090b', // zinc-950 — prevents white flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // Forge/Vite handles this path
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Vite dev server or production file
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }
}
```

Declare the Vite globals at the top of the file:
```typescript
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;
```

### Custom protocol for serving local images

Before `app.whenReady()`, register a privilege for a custom `novel-asset` protocol that can serve local files (book covers, etc.) to the renderer securely:

```typescript
protocol.registerSchemesAsPrivileged([
  { scheme: 'novel-asset', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
```

Inside `initializeApp()`, after paths are resolved, register the protocol handler:

```typescript
protocol.handle('novel-asset', (request) => {
  // URL format: novel-asset://cover/{bookSlug}
  // Resolves to the absolute cover image path on disk
  const url = new URL(request.url);
  if (url.hostname === 'cover') {
    const bookSlug = url.pathname.replace(/^\//, '');
    const bookDir = path.join(booksDir, bookSlug);
    // Read about.json to get the cover filename, then serve the file
    // Use net.fetch with file:// URL to serve the local file
    const aboutPath = path.join(bookDir, 'about.json');
    try {
      const aboutRaw = require('node:fs').readFileSync(aboutPath, 'utf-8');
      const about = JSON.parse(aboutRaw);
      if (about.coverImage) {
        const coverAbsPath = path.join(bookDir, about.coverImage);
        return net.fetch(pathToFileURL(coverAbsPath).href);
      }
    } catch { /* ignore */ }
    return new Response('Not found', { status: 404 });
  }
  return new Response('Not found', { status: 404 });
});
```

This lets the renderer display cover images via `<img src="novel-asset://cover/{bookSlug}" />` without any CSP violations or `file://` access. The protocol reads the `coverImage` field from `about.json` and serves the actual file.

### `initializeApp()` — the composition root

```typescript
async function initializeApp() {
  const userDataPath = app.getPath('userData');
  // In dev mode with Electron Forge + Vite, `__dirname` resolves to the Vite
  // output directory (`.vite/build/`), not the project root. `app.getAppPath()`
  // is more reliable as Forge sets this to the project root during `electron-forge start`.
  const resourcesPath = app.isPackaged
    ? process.resourcesPath
    : app.getAppPath();

  // 1. Bootstrap (first run)
  if (await needsBootstrap(userDataPath)) {
    await bootstrap(userDataPath, resourcesPath);
  }

  // 2. Resolve paths
  const booksDir = path.join(userDataPath, 'books');
  const agentsDir = path.join(userDataPath, 'custom-agents');
  const dbPath = path.join(userDataPath, 'novel-engine.db');
  const pandocPath = resolvePandocPath(resourcesPath);

  // 3. Instantiate infrastructure
  const settings = new SettingsService(userDataPath);
  const db = new DatabaseService(dbPath);
  const agents = new AgentService(agentsDir);
  const fs = new FileSystemService(booksDir, userDataPath);
  const claudeClient = new ClaudeCodeClient();

  // 4. Instantiate application services
  const contextBuilder = new ContextBuilder();
  const usage = new UsageService(db);
  const chat = new ChatService(settings, agents, db, fs, claudeClient, contextBuilder, usage);
  const pipeline = new PipelineService(fs);
  const build = new BuildService(fs, pandocPath, booksDir);

  // 5. Register IPC handlers
  registerIpcHandlers(
    { settings, agents, db, fs, chat, pipeline, build, usage },
    { userDataPath, booksDir }
  );

  // 6. Create the window
  createWindow();
}
```

### App lifecycle

```typescript
app.whenReady().then(initializeApp);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Clean up database connection on quit to prevent WAL corruption
app.on('before-quit', () => {
  db.close();
});
```

**Important:** The `db` variable needs to be accessible from the `before-quit` handler. Either promote it to module scope, or store a reference via a cleanup registry. The simplest approach: declare `let db: DatabaseService;` at module scope and assign it inside `initializeApp()`.

```typescript
let db: DatabaseService; // module-level reference for cleanup

async function initializeApp() {
  // ... same as above, but assign to the module-level db variable
  db = new DatabaseService(dbPath);
  // ...
}
```

---

## Verification

- `npm start` launches the app without errors
- All services are instantiated in the correct dependency order
- IPC handlers are registered before the window loads
- Bootstrap creates directories and copies agent files on first run
- The composition root has NO business logic — just instantiation and wiring
