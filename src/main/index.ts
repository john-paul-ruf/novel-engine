import { app, BrowserWindow, protocol, net } from 'electron';
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
import { FileSystemService } from '@infra/filesystem';
import { ClaudeCodeClient } from '@infra/claude-cli';
import { resolvePandocPath } from '@infra/pandoc';

// Application
import { ContextWrangler } from '@app/ContextWrangler';
import { ChatService } from '@app/ChatService';
import { PipelineService } from '@app/PipelineService';
import { BuildService } from '@app/BuildService';
import { UsageService } from '@app/UsageService';
import { RevisionQueueService } from '@app/RevisionQueueService';

// IPC
import { registerIpcHandlers } from './ipc/handlers';

// Bootstrap
import { bootstrap, needsBootstrap } from './bootstrap';

// Vite globals injected by Electron Forge
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

// Module-level references for lifecycle cleanup
let db: DatabaseService;
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
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#09090b', // zinc-950 — prevents white flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
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
  const contextWrangler = new ContextWrangler(settings, agents, db, fs, claudeClient);
  const usage = new UsageService(db);
  const chat = new ChatService(settings, agents, db, claudeClient, contextWrangler, usage);
  const pipeline = new PipelineService(fs);
  const build = new BuildService(fs, pandocPath, booksDir);
  const revisionQueue = new RevisionQueueService(fs, claudeClient, agents, contextWrangler, db, settings);

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

  // 6. Register IPC handlers
  registerIpcHandlers(
    { settings, agents, db, fs, chat, pipeline, build, usage, revisionQueue },
    { userDataPath, booksDir },
  );

  // 7. Create the window
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

// Clean up database connection on quit to prevent WAL corruption
app.on('before-quit', () => {
  if (db) {
    db.close();
  }
});
