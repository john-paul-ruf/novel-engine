import { app, BrowserWindow, ipcMain, nativeTheme, protocol, net } from 'electron';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFileCb);

/**
 * On macOS (and Linux), GUI apps launched from the Dock or Finder don't
 * inherit the user's shell PATH. This means binaries installed via npm,
 * nvm, homebrew, etc. are invisible to child_process.spawn/execFile.
 *
 * Fix: run the user's login shell with `-l` to source ~/.bash_profile /
 * ~/.zprofile / etc., grab the resulting PATH, and inject it into
 * process.env before any services try to locate `claude`.
 */
async function fixShellPath(): Promise<void> {
  if (process.platform !== 'darwin' && process.platform !== 'linux') return;
  try {
    const shell = process.env.SHELL ?? '/bin/bash';
    const { stdout } = await execFileAsync(shell, ['-l', '-c', 'echo $PATH'], {
      timeout: 5_000,
    });
    const shellPath = stdout.trim();
    if (shellPath) {
      process.env.PATH = shellPath;
    }
  } catch {
    // Cannot resolve login shell PATH — keep existing process.env.PATH.
    // The app will still work if `claude` is discoverable via the current PATH.
  }
}

// Prevent uncaught errors from crashing the app — log and continue.
// The most common cause is EPIPE when a spawned CLI process dies mid-stream.
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
import squirrelStartup from 'electron-squirrel-startup';
if (squirrelStartup) {
  app.quit();
}

// Infrastructure
import { SettingsService } from '@infra/settings';
import { DatabaseService } from '@infra/database';
import { AgentService } from '@infra/agents';
import { FileSystemService, BookWatcher, BooksDirWatcher } from '@infra/filesystem';
import { ClaudeCodeClient } from '@infra/claude-cli';
import { OllamaCodeClient } from '@infra/ollama-cli';
import { LlamaServerClient } from '@infra/llama-server';
import { ProviderRegistry, OpenAiCompatibleProvider } from '@infra/providers';
import { resolvePandocPath } from '@infra/pandoc';
import { SeriesService } from '@infra/series';
import { BUILT_IN_PROVIDER_CONFIGS, OLLAMA_CLI_PROVIDER_ID, LLAMA_SERVER_PROVIDER_ID } from '@domain/constants';
import type { ModelInfo } from '@domain/types';

// Application
import { AuditService } from '@app/AuditService';
import { ChatService } from '@app/ChatService';
import { HotTakeService } from '@app/HotTakeService';
import { AdhocRevisionService } from '@app/AdhocRevisionService';
import { PitchRoomService } from '@app/PitchRoomService';
import { HelperService } from '@app/HelperService';
import { StreamManager } from '@app/StreamManager';
import { ChapterValidator } from '@app/ChapterValidator';
import { PipelineService } from '@app/PipelineService';
import { BuildService } from '@app/BuildService';
import { UsageService } from '@app/UsageService';
import { RevisionQueueService } from '@app/RevisionQueueService';
import { MotifLedgerService } from '@app/MotifLedgerService';
import { VersionService } from '@app/VersionService';
import { ManuscriptImportService } from '@app/ManuscriptImportService';
import { SourceGenerationService } from '@app/SourceGenerationService';
import { SeriesImportService } from '@app/SeriesImportService';
import { FindReplaceService } from '@app/FindReplaceService';
import { DashboardService } from '@app/DashboardService';
import { StatisticsService } from '@app/StatisticsService';

// IPC
import { registerIpcHandlers } from './ipc/handlers';

// Notifications
import { NotificationManager } from './notifications';

// Bootstrap
import { bootstrap, needsBootstrap, ensureAgents, ensureUserGuide } from './bootstrap';

// Vite globals injected by Electron Forge
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

// Module-level references for lifecycle cleanup
let db: DatabaseService;
let bookWatcher: BookWatcher | null = null;
let booksDirWatcher: BooksDirWatcher | null = null;
let mainWindow: BrowserWindow | null = null;

// Variable captured by the protocol handler (assigned during initializeApp)
let booksDir: string;

// ── Custom Protocol ────────────────────────────────────────────────
// Register before app.whenReady() per Electron docs
protocol.registerSchemesAsPrivileged([
  { scheme: 'novel-asset', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// ── Ollama Model Discovery ────────────────────────────────────────

/**
 * Run `ollama list` and parse the output into ModelInfo entries.
 * Returns an empty array if the command fails or produces no models.
 */
async function fetchOllamaModels(ollamaBaseUrl: string): Promise<ModelInfo[]> {
  try {
    // First try the HTTP API (works for remote Ollama instances)
    let models: ModelInfo[] = [];
    try {
      const resp = await fetch(`${ollamaBaseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5_000),
      });
      if (resp.ok) {
        const data = await resp.json() as { models?: { name: string }[] };
        models = (data.models ?? []).map((m) => ({
          id: m.name,
          label: m.name.replace(/:latest$/, ''),
          description: `Ollama model — ${m.name}`,
          providerId: OLLAMA_CLI_PROVIDER_ID,
          supportsThinking: false,
          supportsToolUse: false,
        }));
      }
    } catch { /* API not reachable — fall back to CLI */ }

    // Fallback: try local `ollama list` CLI
    if (models.length === 0) {
      const { stdout } = await execFileAsync('ollama', ['list'], { timeout: 10_000 });
      const lines = stdout.trim().split('\n');
      // First line is the header: "NAME    ID    SIZE    MODIFIED"
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].trim().split(/\s+/);
        if (!cols[0]) continue;
        const name = cols[0]; // e.g. "llama3.1:latest"
        const label = name.replace(/:latest$/, '');
        models.push({
          id: name,
          label,
          description: `Ollama model — ${name}`,
          providerId: OLLAMA_CLI_PROVIDER_ID,
          supportsThinking: false,
          supportsToolUse: false,
        });
      }
    }

    // Enrich with context window sizes via /api/show (best-effort)
    await Promise.allSettled(models.map(async (m) => {
      try {
        const r = await fetch(`${ollamaBaseUrl}/api/show`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: m.id }),
          signal: AbortSignal.timeout(5_000),
        });
        if (!r.ok) return;
        const d = await r.json() as Record<string, unknown>;
        const mi = d.model_info as Record<string, unknown> | undefined;
        if (!mi) return;
        for (const [k, v] of Object.entries(mi)) {
          if (k.endsWith('.context_length') && typeof v === 'number') {
            m.contextWindow = v;
            break;
          }
        }
      } catch { /* contextWindow stays undefined */ }
    }));
    return models;
  } catch {
    console.warn('[startup] Failed to fetch Ollama models');
    return [];
  }
}

// ── llama-server Model Discovery ─────────────────────────────────

/**
 * Fetch models from a llama-server instance via `/v1/models`.
 * llama-server typically serves a single model, but the endpoint
 * returns it in OpenAI format.
 */
async function fetchLlamaServerModels(baseUrl: string): Promise<ModelInfo[]> {
  try {
    const resp = await fetch(`${baseUrl}/v1/models`, {
      method: 'GET',
      signal: AbortSignal.timeout(5_000),
    });
    if (!resp.ok) return [];
    const data = await resp.json() as { data?: Array<{ id: string; owned_by?: string }> };
    const models: ModelInfo[] = (data.data ?? []).map((m) => ({
      id: m.id,
      label: m.id.split('/').pop() ?? m.id,
      description: `llama-server model — ${m.id}`,
      providerId: LLAMA_SERVER_PROVIDER_ID,
      supportsThinking: true,  // assume reasoning model per user
      supportsToolUse: true,
    }));
    return models;
  } catch {
    console.warn('[startup] Failed to fetch llama-server models');
    return [];
  }
}

// ── Window ─────────────────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#09090b' : '#ffffff',
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
  // Expand PATH before anything else so child processes can find `claude`
  // and other user-installed binaries (nvm node, homebrew tools, etc.)
  await fixShellPath();

  const userDataPath = app.getPath('userData');

  // In dev mode with Electron Forge + Vite, `__dirname` resolves to the Vite
  // output directory (`.vite/build/`), not the project root. `app.getAppPath()`
  // is more reliable as Forge sets this to the project root during `electron-forge start`.
  //
  // In production, `process.resourcesPath` already points to the `resources/` folder
  // inside the app bundle. In development, the binary lives in `{projectRoot}/resources/`,
  // so we append that segment manually to match what `resolvePandocPath` expects.
  const resourcesPath = app.isPackaged
    ? process.resourcesPath
    : path.join(app.getAppPath(), 'resources');

  // Agent source directory resolution:
  //   - Production: `extraResource: ['./agents']` bundles the agents directory
  //     directly into `process.resourcesPath/agents/`.
  //   - Dev: the agents directory lives at the project root (`{appPath}/agents/`),
  //     NOT inside `resources/`. Using `path.join(resourcesPath, 'agents')` in dev
  //     would look for `resources/agents/` which does not exist.
  const agentsSourceDir = app.isPackaged
    ? path.join(process.resourcesPath, 'agents')
    : path.join(app.getAppPath(), 'agents');

  // 1a. Bootstrap (first run only)
  if (await needsBootstrap(userDataPath)) {
    await bootstrap(userDataPath, agentsSourceDir);
  }

  // 1b. Always ensure agent files are present — recovers installations where
  //     bootstrap ran before the source directory was correctly populated.
  //     Idempotent: COPYFILE_EXCL never overwrites user customisations.
  await ensureAgents(path.join(userDataPath, 'custom-agents'), agentsSourceDir);

  // 1c. Copy user guide for the Helper agent (always overwrite to keep current)
  const guideSourcePath = app.isPackaged
    ? path.join(process.resourcesPath, 'docs', 'USER_GUIDE.md')
    : path.join(app.getAppPath(), 'docs', 'USER_GUIDE.md');
  await ensureUserGuide(userDataPath, guideSourcePath);

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
  const claudeClient = new ClaudeCodeClient(booksDir, db);

  // 3b. Initialize provider registry
  const providerRegistry = new ProviderRegistry(settings);

  // Register the built-in Claude CLI provider
  const appSettings = await settings.load();
  const claudeConfig = appSettings.providers.find(p => p.id === 'claude-cli');
  providerRegistry.registerProvider(
    claudeClient,
    claudeConfig ?? BUILT_IN_PROVIDER_CONFIGS[0],
  );

  // Register the built-in Ollama CLI provider (always registered so the user
  // can configure the endpoint in Settings even if Ollama isn't reachable yet)
  const savedOllamaConfig = appSettings.providers.find(p => p.id === OLLAMA_CLI_PROVIDER_ID);
  const ollamaClient = new OllamaCodeClient(booksDir, db, savedOllamaConfig?.baseUrl);
  const ollamaBaseConfig = savedOllamaConfig
    ?? BUILT_IN_PROVIDER_CONFIGS.find(p => p.id === OLLAMA_CLI_PROVIDER_ID)!;

  const ollamaAvailable = await ollamaClient.isAvailable();
  let ollamaModels: ModelInfo[] = [];
  if (ollamaAvailable) {
    ollamaModels = await fetchOllamaModels(ollamaClient.getBaseUrl());
    await settings.update({ hasOllamaCli: true });
    console.log(`[startup] Ollama detected at ${ollamaClient.getBaseUrl()} — ${ollamaModels.length} models available`);
  } else {
    console.log(`[startup] Ollama not reachable at ${ollamaClient.getBaseUrl()} — provider registered for configuration`);
  }

  providerRegistry.registerProvider(ollamaClient, {
    ...ollamaBaseConfig,
    enabled: ollamaAvailable,
    models: ollamaModels,
    defaultModel: ollamaModels[0]?.id,
  });

  // Register the built-in llama-server provider (always registered so the user
  // can configure the endpoint in Settings even if llama-server isn't running yet)
  const savedLlamaConfig = appSettings.providers.find(p => p.id === LLAMA_SERVER_PROVIDER_ID);
  const llamaClient = new LlamaServerClient(booksDir, db, savedLlamaConfig?.baseUrl);
  const llamaBaseConfig = savedLlamaConfig
    ?? BUILT_IN_PROVIDER_CONFIGS.find(p => p.id === LLAMA_SERVER_PROVIDER_ID)!;

  const llamaAvailable = await llamaClient.isAvailable();
  let llamaModels: ModelInfo[] = [];
  if (llamaAvailable) {
    llamaModels = await fetchLlamaServerModels(llamaClient.getBaseUrl());
    console.log(`[startup] llama-server detected at ${llamaClient.getBaseUrl()} — ${llamaModels.length} model(s) available`);
  } else {
    console.log(`[startup] llama-server not reachable at ${llamaClient.getBaseUrl()} — provider registered for configuration`);
  }

  providerRegistry.registerProvider(llamaClient, {
    ...llamaBaseConfig,
    enabled: llamaAvailable,
    models: llamaModels,
    defaultModel: llamaModels[0]?.id,
  });

  // Initialize user-configured providers from settings
  for (const config of appSettings.providers) {
    if (config.id === 'claude-cli') continue;
    if (config.id === OLLAMA_CLI_PROVIDER_ID) continue; // already registered above
    if (config.id === LLAMA_SERVER_PROVIDER_ID) continue; // already registered above
    if (!config.enabled) continue;

    if (config.type === 'openai-compatible') {
      const provider = new OpenAiCompatibleProvider(
        config.id,
        config.baseUrl ?? 'http://localhost:11434',
        config.apiKey ?? '',
        config.capabilities,
      );
      providerRegistry.registerProvider(provider, config);
    }
  }

  providerRegistry.setDefaultProvider(appSettings.activeProviderId);

  // 3.5 Auto-reconcile any book folders whose name diverged from the
  //      title stored in about.json (e.g. after a direct on-disk edit).
  //      This runs once at startup before the window opens, so it is
  //      transparent to the user.
  try {
    const slugMigrations = await fs.reconcileBookSlugs();
    for (const { oldSlug, newSlug } of slugMigrations) {
      db.updateBookSlug(oldSlug, newSlug);
    }
  } catch (err) {
    console.warn('[startup] reconcileBookSlugs failed:', err);
  }

  // 4. Instantiate application services
  const usage = new UsageService(db);
  const chapterValidator = new ChapterValidator(booksDir);
  const streamManager = new StreamManager(db, usage);
  const audit = new AuditService(settings, agents, providerRegistry, db, fs, usage);
  const pitchRoom = new PitchRoomService(agents, providerRegistry, db, fs, streamManager);
  const hotTake = new HotTakeService(agents, providerRegistry, db, fs, streamManager);
  const adhocRevision = new AdhocRevisionService(agents, audit, providerRegistry, db, fs, streamManager);
  const series = new SeriesService(userDataPath);
  const chat = new ChatService(settings, agents, db, providerRegistry, fs, chapterValidator, pitchRoom, hotTake, adhocRevision, streamManager, series);
  const pipeline = new PipelineService(fs);
  const build = new BuildService(fs, pandocPath, booksDir);
  const revisionQueue = new RevisionQueueService(fs, providerRegistry, agents, db, settings);
  const motifLedger = new MotifLedgerService(fs, providerRegistry);
  motifLedger.setNormalizationCallback((status, error) => {
    for (const w of BrowserWindow.getAllWindows()) {
      try {
        w.webContents.send('motifLedger:normalizing', status, error);
      } catch { /* window closing */ }
    }
  });
  const version = new VersionService(db, fs);
  const findReplace = new FindReplaceService(fs, version);
  const manuscriptImport = new ManuscriptImportService(fs, pandocPath);
  const seriesImport = new SeriesImportService(manuscriptImport, series);
  const sourceGeneration = new SourceGenerationService(settings, agents, db, fs, providerRegistry);
  const helper = new HelperService(settings, agents, db, fs, providerRegistry, streamManager, userDataPath);
  const dashboard = new DashboardService(db, fs, pipeline);
  const statistics = new StatisticsService(db, fs);
  const notifications = new NotificationManager(settings);

  // 4b. Recover orphaned stream sessions and prune old event data
  try {
    await chat.recoverOrphanedSessions();
  } catch (err) {
    console.warn('[startup] recoverOrphanedSessions failed:', err);
  }
  try {
    db.pruneStreamEvents(7);
  } catch (err) {
    console.warn('[startup] pruneStreamEvents failed:', err);
  }

  // Prune old file versions (keep last 50 per file per book)
  try {
    const books = await fs.listBooks();
    for (const book of books) {
      await version.pruneVersions(book.slug, 50);
    }
  } catch (err) {
    console.warn('[startup] pruneFileVersions failed:', err);
  }

  // 5. Sync Electron native theme with user preference (affects window frame color)
  nativeTheme.themeSource = appSettings.theme === 'system' ? 'system' : appSettings.theme;

  // 6. Register custom protocol handler for serving local assets to renderer
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

  // 7. Set up file system watchers
  //    a) Active-book watcher — notifies renderer when files change inside the open book
  bookWatcher = new BookWatcher(booksDir, async (changedPaths) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('chat:filesChanged', changedPaths);
    }

    // Fallback snapshot: catches external edits and manual file drops for active book.
    // Primary agent-write capture is in the IPC handlers (chat:send, hot-take, etc.)
    // which have the correct bookSlug for any book, not just the active one.
    const activeSlug = await fs.getActiveBookSlug().catch(() => '');
    if (activeSlug) {
      for (const changedPath of changedPaths) {
        version.snapshotFile(activeSlug, changedPath, 'agent').catch(() => {
          // Snapshot failure is non-critical
        });
      }
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

  //    b) Books-dir watcher — notifies renderer when a new book directory is
  //       added or removed while the app is running (e.g. manual folder copy)
  booksDirWatcher = new BooksDirWatcher(booksDir, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('books:changed');
    }
    // Invalidate series reverse-lookup cache when books change
    series.invalidateCache();
  });
  await booksDirWatcher.start();

  // 8. Register IPC handlers (with hook to switch watcher on book change)
  registerIpcHandlers(
    { settings, agents, db, fs, chat, audit, pipeline, build, usage, revisionQueue, motifLedger, notifications, version, providerRegistry, manuscriptImport, sourceGeneration, series, seriesImport, helper, findReplace, dashboard, statistics },
    { userDataPath, booksDir },
    {
      onActiveBookChanged: (slug: string) => {
        bookWatcher?.watch(slug);
      },
    },
  );

  // 9. Register window control handlers (custom title bar)
  registerWindowControlHandlers();

  // 10. Create the window
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

// Clean up database connection and file watchers on quit
app.on('before-quit', () => {
  if (bookWatcher) {
    bookWatcher.stop();
  }
  if (booksDirWatcher) {
    booksDirWatcher.stop();
  }
  if (db) {
    db.close();
  }
});
