import { ipcMain, BrowserWindow, dialog, shell } from 'electron';
import * as fsPromises from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import * as path from 'node:path';
import archiver from 'archiver';
import type {
  ISettingsService,
  IAgentService,
  IDatabaseService,
  IFileSystemService,
  IPipelineService,
  IBuildService,
} from '@domain/interfaces';
import type {
  AgentMeta,
  AgentName,
  AppSettings,
  BookMeta,
  PipelinePhaseId,
  SendMessageParams,
} from '@domain/types';
import { AVAILABLE_MODELS } from '@domain/constants';
import type { ChatService } from '@app/ChatService';
import type { UsageService } from '@app/UsageService';
import type { FilePersistenceService } from '@app/FilePersistenceService';

export function registerIpcHandlers(services: {
  settings: ISettingsService;
  agents: IAgentService;
  db: IDatabaseService;
  fs: IFileSystemService;
  chat: ChatService;
  pipeline: IPipelineService;
  build: IBuildService;
  usage: UsageService;
  filePersistence: FilePersistenceService;
}, paths: {
  userDataPath: string;
  booksDir: string;
}): void {

  // === Settings ===

  ipcMain.handle('settings:load', () => services.settings.load());

  ipcMain.handle('settings:detectClaudeCli', () => services.settings.detectClaudeCli());

  ipcMain.handle('settings:update', (_, partial: Partial<AppSettings>) =>
    services.settings.update(partial),
  );

  ipcMain.handle('settings:getAvailableModels', () => AVAILABLE_MODELS);

  // === Agents ===

  ipcMain.handle('agents:list', async () => {
    const agents = await services.agents.loadAll();
    return agents.map(({ systemPrompt: _prompt, ...meta }): AgentMeta => meta);
  });

  ipcMain.handle('agents:get', async (_, name: AgentName) => {
    const agent = await services.agents.load(name);
    const { systemPrompt: _prompt, ...meta } = agent;
    return meta as AgentMeta;
  });

  // === Books ===

  ipcMain.handle('books:list', () => services.fs.listBooks());

  ipcMain.handle('books:getActiveSlug', () => services.fs.getActiveBookSlug());

  ipcMain.handle('books:setActive', (_, slug: string) => services.fs.setActiveBook(slug));

  ipcMain.handle('books:create', async (_, title: string) => {
    const settings = await services.settings.load();
    return services.fs.createBook(title, settings.authorName);
  });

  ipcMain.handle('books:getMeta', (_, slug: string) => services.fs.getBookMeta(slug));

  ipcMain.handle('books:updateMeta', (_, slug: string, partial: Partial<BookMeta>) =>
    services.fs.updateBookMeta(slug, partial),
  );

  ipcMain.handle('books:wordCount', (_, slug: string) => services.fs.countWordsPerChapter(slug));

  ipcMain.handle('books:uploadCover', async (event, bookSlug: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No window found');
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Select Cover Image',
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return null;
    return services.fs.saveCoverImage(bookSlug, filePaths[0]);
  });

  ipcMain.handle('books:getCoverImagePath', (_, slug: string) =>
    services.fs.getCoverImageAbsolutePath(slug),
  );

  ipcMain.handle('books:getAbsolutePath', (_, bookSlug: string, relativePath: string) =>
    path.join(paths.booksDir, bookSlug, relativePath),
  );

  // === Files ===

  ipcMain.handle('files:read', (_, bookSlug: string, path: string) =>
    services.fs.readFile(bookSlug, path),
  );

  ipcMain.handle('files:write', (_, bookSlug: string, path: string, content: string) =>
    services.fs.writeFile(bookSlug, path, content),
  );

  ipcMain.handle('files:exists', (_, bookSlug: string, path: string) =>
    services.fs.fileExists(bookSlug, path),
  );

  ipcMain.handle('files:listDir', (_, bookSlug: string, path?: string) =>
    services.fs.listDirectory(bookSlug, path),
  );

  // === Conversations ===

  ipcMain.handle('chat:createConversation', (_, params: {
    bookSlug: string;
    agentName: AgentName;
    pipelinePhase: PipelinePhaseId | null;
  }) => services.chat.createConversation(params));

  ipcMain.handle('chat:getConversations', (_, bookSlug: string) =>
    services.chat.getConversations(bookSlug),
  );

  ipcMain.handle('chat:getMessages', (_, conversationId: string) =>
    services.chat.getMessages(conversationId),
  );

  ipcMain.handle('chat:deleteConversation', (_, conversationId: string) =>
    services.db.deleteConversation(conversationId),
  );

  // === Chat (streaming) ===

  ipcMain.handle('chat:send', async (event, params: SendMessageParams) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No window found');

    await services.chat.sendMessage({
      ...params,
      onEvent: (streamEvent) => {
        win.webContents.send('chat:streamEvent', streamEvent);
      },
    });
  });

  // === Chat (save to file) ===

  ipcMain.handle('chat:saveToFile', async (_, params: {
    bookSlug: string;
    pipelinePhase: string;
    targetPath: string;
    content: string;
    chapterSlug?: string;
  }) => services.filePersistence.saveAgentOutput(params as Parameters<typeof services.filePersistence.saveAgentOutput>[0]));

  // === Pipeline ===

  ipcMain.handle('pipeline:detect', (_, bookSlug: string) =>
    services.pipeline.detectPhases(bookSlug),
  );

  ipcMain.handle('pipeline:getActive', (_, bookSlug: string) =>
    services.pipeline.getActivePhase(bookSlug),
  );

  // === Build ===

  ipcMain.handle('build:run', async (event, bookSlug: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return services.build.build(bookSlug, (message) => {
      win?.webContents.send('build:progress', message);
    });
  });

  ipcMain.handle('build:isPandocAvailable', () => services.build.isPandocAvailable());

  ipcMain.handle('build:exportZip', async (event, bookSlug: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No window found');

    const distDir = path.join(paths.booksDir, bookSlug, 'dist');
    const meta = await services.fs.getBookMeta(bookSlug);
    const slug = meta.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export Build Artifacts',
      defaultPath: `${slug}-build.zip`,
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
    });

    if (canceled || !filePath) return null;

    return new Promise<string>((resolve, reject) => {
      const output = createWriteStream(filePath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve(filePath));
      archive.on('error', reject);

      archive.pipe(output);
      archive.directory(distDir, false);
      archive.finalize();
    });
  });

  // === Usage ===

  ipcMain.handle('usage:summary', (_, bookSlug?: string) => services.usage.getSummary(bookSlug));

  ipcMain.handle('usage:byConversation', (_, conversationId: string) =>
    services.usage.getByConversation(conversationId),
  );

  // === Context Diagnostics ===

  ipcMain.handle('context:getLastDiagnostics', () => services.chat.getLastDiagnostics());

  // === Author Profile ===

  ipcMain.handle('settings:saveAuthorProfile', async (_, content: string) => {
    const profilePath = path.join(paths.userDataPath, 'author-profile.md');
    await fsPromises.writeFile(profilePath, content, 'utf-8');
  });

  ipcMain.handle('settings:loadAuthorProfile', async () => {
    const profilePath = path.join(paths.userDataPath, 'author-profile.md');
    try {
      return await fsPromises.readFile(profilePath, 'utf-8');
    } catch {
      return '';
    }
  });

  // === Shell ===

  ipcMain.handle('shell:openExternal', (_, url: string) => shell.openExternal(url));

  ipcMain.handle('shell:openPath', (_, absolutePath: string) => shell.openPath(absolutePath));
}
