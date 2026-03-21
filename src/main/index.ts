import { app, BrowserWindow, ipcMain, protocol, net } from 'electron';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
import squirrelStartup from 'electron-squirrel-startup';
if (squirrelStartup) {
  app.quit();
}

// Infrastructure
import { SettingsService } from '@infra/settings';
import { DatabaseService } from '@infra/database';
import { AgentService } from '@infra/agents';
import { FileSystemService, BookWatcher } from '@infra/filesystem';
import { ClaudeCodeClient } from '@infra/claude-cli';
import { resolvePandocPath } from '@infra/pandoc';

// Application
import { ChatService } from '@app/ChatService';
import { ChapterValidator } from '@app/ChapterValidator';
import { PipelineService } from '@app/PipelineService';
import { BuildService } from '@app/BuildService';
import { UsageService } from '@app/UsageService';
import { RevisionQueueService } from '@app/RevisionQueueService';

// IPC
import { registerIpcHandlers } from './ipc/handlers';

// Notifications
import { NotificationManager } from './notifications';

// Bootstrap
import { bootstrap, needsBootstrap } from './bootstrap';

// Vite globals injected by Electron Forge
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

// Module-level references for lifecycle cleanup
let db: DatabaseService;
let bookWatcher: BookWatcher | null = null;
let mainWindow: BrowserWindow | null = null;

// Variable captured by the protocol handler (assigned during initializeApp)
let booksDir: string;

// ── Custom Protocol ────────────────────────────────────────────────
// Register before app.whenReady() per Electron docs
protocol.registerSchemesAsPrivileged([
  { scheme: 'novel-asset', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// ── Window ─────────────────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#09090b', // zinc-950 — prevents white flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Forward maximize/unmaximize events to renderer for title bar button state
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized');
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:unmaximized');
  });

  // Vite dev server or production file
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

// ── Window Controls (for custom title bar on Windows/Linux) ───────

function registerWindowControlHandlers(): void {
  ipcMain.on('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.on('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.isMaximized() ? win.unmaximize() : win.maximize();
    }
  });

  ipcMain.on('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle('window:isMaximized', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  });
}

// ── Composition Root ───────────────────────────────────────────────

async function initializeApp(): Promise<void> {
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
  booksDir = path.join(userDataPath, 'books');
  const agentsDir = path.join(userDataPath, 'custom-agents');
  const dbPath = path.join(userDataPath, 'novel-engine.db');
  const pandocPath = resolvePandocPath(resourcesPath);

  // 3. Instantiate infrastructure
  const settings = new SettingsService(userDataPath);
  db = new DatabaseService(dbPath);
  const agents = new AgentService(agentsDir);
  const fs = new FileSystemService(booksDir, userDataPath);
  const claudeClient = new ClaudeCodeClient(booksDir);

  // 4. Instantiate application services
  const usage = new UsageService(db);
  const chapterValidator = new ChapterValidator(booksDir);
  const chat = new ChatService(settings, agents, db, claudeClient, fs, usage, chapterValidator);
  const pipeline = new PipelineService(fs);
  const build = new BuildService(fs, pandocPath, booksDir);
  const revisionQueue = new RevisionQueueService(fs, claudeClient, agents, db, settings);
  const notifications = new NotificationManager(settings);

  // 5. Register custom protocol handler for serving local assets to renderer
  protocol.handle('novel-asset', (request) => {
    const url = new URL(request.url);

    if (url.hostname === 'cover') {
      const bookSlug = url.pathname.replace(/^\//, '');
      const bookDir = path.join(booksDir, bookSlug);
      const aboutPath = path.join(bookDir, 'about.json');

      try {
        const aboutRaw = readFileSync(aboutPath, 'utf-8');
        const about = JSON.parse(aboutRaw) as { coverImage?: string };

        if (about.coverImage) {
          const coverAbsPath = path.join(bookDir, about.coverImage);
          return net.fetch(pathToFileURL(coverAbsPath).href);
        }
      } catch {
        // about.json doesn't exist or is malformed — fall through to 404
      }

      return new Response('Not found', { status: 404 });
    }

    return new Response('Not found', { status: 404 });
  });

  // 6. Set up file system watcher — notifies the renderer when book files change on disk
  bookWatcher = new BookWatcher(booksDir, (changedPaths) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('chat:filesChanged', changedPaths);
    }
  });

  // Start watching the active book (if one is set)
  fs.getActiveBookSlug().then((activeSlug) => {
    if (activeSlug) {
      bookWatcher?.watch(activeSlug);
    }
  }).catch(() => {
    // No active book yet — watcher will start when user selects one
  });

  // 7. Register IPC handlers (with hook to switch watcher on book change)
  registerIpcHandlers(
    { settings, agents, db, fs, chat, pipeline, build, usage, revisionQueue, notifications },
    { userDataPath, booksDir },
    {
      onActiveBookChanged: (slug: string) => {
        bookWatcher?.watch(slug);
      },
    },
  );

  // 8. Register window control handlers (custom title bar)
  registerWindowControlHandlers();

  // 9. Create the window
  createWindow();
}

// ── App Lifecycle ──────────────────────────────────────────────────

app.whenReady().then(initializeApp);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Clean up database connection and file watcher on quit
app.on('before-quit', () => {
  if (bookWatcher) {
    bookWatcher.stop();
  }
  if (db) {
    db.close();
  }
});
