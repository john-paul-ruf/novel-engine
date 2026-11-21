import { ipcMain, BrowserWindow, dialog, nativeTheme, shell } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { randomUUID } from 'node:crypto';
import * as fsPromises from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import * as path from 'node:path';
import archiver from 'archiver';
import { isTrustedAppUrl } from '../trustedUrl';
import type {
  IAuditService,
  IChatService,
  ISettingsService,
  IAgentService,
  IDatabaseService,
  IFileSystemService,
  IPipelineService,
  IBuildService,
  IRevisionQueueService,
  IMotifLedgerService,
  IUsageService,
  IVersionService,
  IProviderRegistry,
  IManuscriptImportService,
  ISeriesService,
  ISourceGenerationService,
  ISeriesImportService,
  IHelperService,
  IFindReplaceService,
  IDashboardService,
  IStatisticsService,
  IQueryService,
} from '@domain/interfaces';
import type {
  AgentMeta,
  AgentName,
  AppSettings,
  ApprovalAction,
  BookMeta,
  ConversationPurpose,
  MotifLedger,
  PipelinePhaseId,
  QueryStatus,
  QueryTarget,
  QueryTracker,
  QueryLetter,
  QueryFillableField,
  QueueMode,
  SendMessageParams,
  FileVersionSource,
  FindReplaceApplyResult,
  FindReplaceOptions,
  FindReplacePreviewResult,
  StreamEvent,
  StreamEventSource,
  ProviderConfig,
  ProviderId,
  ImportCommitConfig,
  SeriesImportCommitConfig,
  SeriesMeta,
  SourceGenerationEvent,
  BookDashboardData,
  BookStatistics,
} from '@domain/types';
import type { NotificationManager } from '../notifications';

/**
 * Check whether a BrowserWindow's webContents is still alive and sendable.
 * Windows can exist (not destroyed) while their render frame is disposed
 * (e.g. during a renderer refresh or OOM crash). This guard prevents
 * hundreds of "Render frame was disposed" log lines when the main process
 * keeps streaming to a dead renderer.
 */
function isWebContentsAlive(w: BrowserWindow): boolean {
  return !w.isDestroyed() && !w.webContents.isDestroyed();
}

export function registerIpcHandlers(services: {
  settings: ISettingsService;
  agents: IAgentService;
  db: IDatabaseService;
  fs: IFileSystemService;
  chat: IChatService;
  audit: IAuditService;
  pipeline: IPipelineService;
  build: IBuildService;
  usage: IUsageService;
  revisionQueue: IRevisionQueueService;
  motifLedger: IMotifLedgerService;
  notifications: NotificationManager;
  version: IVersionService;
  providerRegistry: IProviderRegistry;
  manuscriptImport: IManuscriptImportService;
  sourceGeneration: ISourceGenerationService;
  series: ISeriesService;
  seriesImport: ISeriesImportService;
  helper: IHelperService;
  findReplace: IFindReplaceService;
  dashboard: IDashboardService;
  statistics: IStatisticsService;
  query: IQueryService;
}, paths: {
  userDataPath: string;
  booksDir: string;
}, hooks?: {
  onActiveBookChanged?: (slug: string) => void;
}): void {

  /**
   * Reject IPC from any frame that isn't the app's own window. In production
   * the renderer loads over `file://`; in dev it's the localhost Vite server.
   * A frame navigated elsewhere (or a webContents with no BrowserWindow) is
   * untrusted and must not reach a handler. Every `handle()` below enforces it.
   */
  const isTrustedSender = (event: IpcMainInvokeEvent): boolean => {
    const frame = event.senderFrame;
    if (!frame || !BrowserWindow.fromWebContents(event.sender)) return false;
    // Exact match against the app's own page (dev origin or packaged index.html).
    // A `file://`/`http://localhost` prefix check would trust any local page,
    // including one the agent writes into the books folder.
    return isTrustedAppUrl(frame.url);
  };

  // Sender-validating wrapper around ipcMain.handle — the `any[]` is the
  // Electron handler shape (the one allowed exception in this file).
  const handle = (channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown) =>
    ipcMain.handle(channel, async (event, ...args) => {
      if (!isTrustedSender(event)) throw new Error(`Untrusted IPC sender for ${channel}`);
      return listener(event, ...args);
    });

  /**
   * Snapshot changed files after a CLI stream completes.
   * Called from chat:send, hot-take, adhoc-revision, and revision queue handlers.
   * Dedup by hash ensures no duplicate versions if the BookWatcher also fires.
   */
  const snapshotChangedFiles = (bookSlug: string, changedPaths: string[], source: FileVersionSource = 'agent') => {
    for (const filePath of changedPaths) {
      services.version.snapshotFile(bookSlug, filePath, source).catch((err) => {
        console.warn('[versions] Auto-snapshot failed for', filePath, err);
      });
    }
  };

  // === Settings ===

  handle('settings:load', () => services.settings.load());

  handle('settings:detectClaudeCli', () => services.settings.detectClaudeCli());

  handle('settings:detectCodexCli', () => services.settings.detectCodexCli());

  handle('settings:detectOllamaCli', () => services.settings.detectOllamaCli());

  handle('settings:update', async (_, partial: Partial<AppSettings>) => {
    await services.settings.update(partial);

    // Sync Electron's native theme when the user changes the appearance setting
    if (partial.theme !== undefined) {
      nativeTheme.themeSource = partial.theme === 'system' ? 'system' : partial.theme;
    }
  });

  handle('settings:getAvailableModels', () =>
    services.providerRegistry.listAllModels()
  );

  // === Providers ===

  handle('providers:list', () =>
    services.providerRegistry.listProviders()
  );

  handle('providers:getConfig', (_, providerId: ProviderId) =>
    services.providerRegistry.getProviderConfig(providerId)
  );

  handle('providers:add', async (_, config: ProviderConfig) => {
    if (config.type === 'openai-compatible') {
      const { OpenAiCompatibleProvider } = await import('@infra/providers');
      const provider = new OpenAiCompatibleProvider(
        config.id, config.baseUrl ?? '', config.apiKey ?? '', config.capabilities,
      );
      services.providerRegistry.registerProvider(provider, config);
    }
  });

  handle('providers:update', (_, providerId: ProviderId, partial: Partial<ProviderConfig>) =>
    services.providerRegistry.updateProviderConfig(providerId, partial)
  );

  handle('providers:remove', (_, providerId: ProviderId) =>
    services.providerRegistry.removeProvider(providerId)
  );

  handle('providers:checkStatus', (_, providerId: ProviderId) =>
    services.providerRegistry.checkProviderStatus(providerId)
  );

  handle('providers:setDefault', async (_, providerId: ProviderId) => {
    const registry = services.providerRegistry as { setDefaultProvider?: (id: string) => void };
    registry.setDefaultProvider?.(providerId);
    await services.settings.update({ activeProviderId: providerId });
  });

  // === Agents ===

  handle('agents:list', async () => {
    const agents = await services.agents.loadAll();
    return agents.map(({ systemPrompt: _prompt, ...meta }): AgentMeta => meta);
  });

  handle('agents:get', async (_, name: AgentName) => {
    const agent = await services.agents.load(name);
    const { systemPrompt: _prompt, ...meta } = agent;
    return meta as AgentMeta;
  });

  // === Books ===

  handle('books:list', () => services.fs.listBooks());

  handle('books:getActiveSlug', () => services.fs.getActiveBookSlug());

  handle('books:setActive', async (_, slug: string) => {
    await services.fs.setActiveBook(slug);
    hooks?.onActiveBookChanged?.(slug);
  });

  handle('books:create', async (_, title: string) => {
    const settings = await services.settings.load();
    const meta = await services.fs.createBook(title, settings.authorName);
    hooks?.onActiveBookChanged?.(meta.slug);
    return meta;
  });

  handle('books:getMeta', (_, slug: string) => services.fs.getBookMeta(slug));

  handle('books:updateMeta', async (_, slug: string, partial: Partial<BookMeta>) => {
    const updated = await services.fs.updateBookMeta(slug, partial);
    if (updated.slug !== slug) {
      services.db.updateBookSlug(slug, updated.slug);
      hooks?.onActiveBookChanged?.(updated.slug);
    }
    return updated;
  });

  handle('books:wordCount', (_, slug: string) => services.fs.countWordsPerChapter(slug));

  handle('books:uploadCover', async (event, bookSlug: string) => {
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

  handle('books:getCoverImagePath', (_, slug: string) =>
    services.fs.getCoverImageAbsolutePath(slug),
  );

  handle('books:getAbsolutePath', (_, bookSlug: string, relativePath: string) =>
    services.fs.getAbsolutePath(bookSlug, relativePath),
  );

  handle('books:archive', async (_, slug: string) => {
    await services.fs.archiveBook(slug);
  });

  handle('books:unarchive', async (_, slug: string) => {
    const meta = await services.fs.unarchiveBook(slug);
    hooks?.onActiveBookChanged?.(meta.slug);
    return meta;
  });

  handle('books:listArchived', () => services.fs.listArchivedBooks());

  handle('books:assembleManuscript', (_e, bookSlug: string) =>
    services.fs.assembleManuscript(bookSlug)
  );

  // === Manuscript Import ===

  handle('import:selectFile', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No window found');

    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Import Manuscript',
      filters: [
        { name: 'Manuscripts', extensions: ['md', 'markdown', 'docx'] },
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: 'Word Document', extensions: ['docx'] },
      ],
      properties: ['openFile'],
    });

    if (canceled || filePaths.length === 0) return null;
    return filePaths[0];
  });

  handle('import:preview', (_, filePath: string) =>
    services.manuscriptImport.preview(filePath),
  );

  handle('import:commit', async (_, config: ImportCommitConfig) => {
    const result = await services.manuscriptImport.commit(config);
    hooks?.onActiveBookChanged?.(result.bookSlug);
    return result;
  });

  handle('import:generateSources', async (_, bookSlug: string) => {
    const broadcastGenProgress = (genEvent: SourceGenerationEvent) => {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!isWebContentsAlive(w)) continue;
        try {
          w.webContents.send('import:generationProgress', genEvent);
        } catch { /* window closing */ }
      }
    };

    const broadcastStreamEvent = (streamEvent: StreamEvent) => {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!isWebContentsAlive(w)) continue;
        try {
          w.webContents.send('chat:streamEvent', {
            ...streamEvent,
            callId: `source-gen:${bookSlug}`,
            conversationId: `source-gen:${bookSlug}`,
            source: 'chat',
          });
        } catch { /* window closing */ }
      }
    };

    await services.sourceGeneration.generate({
      bookSlug,
      onProgress: broadcastGenProgress,
      onStreamEvent: broadcastStreamEvent,
    });
  });

  // ── Series Import ──────────────────────────────────────────────────

  handle('import:selectFiles', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No window found');

    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Import Series — Select Manuscripts',
      filters: [
        { name: 'Manuscripts', extensions: ['md', 'markdown', 'docx'] },
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: 'Word Document', extensions: ['docx'] },
      ],
      properties: ['openFile', 'multiSelections'],
    });

    if (canceled || filePaths.length === 0) return null;
    return filePaths;
  });

  handle('import:seriesPreview', (_, filePaths: string[]) =>
    services.seriesImport.preview(filePaths),
  );

  handle('import:seriesCommit', async (_, config: SeriesImportCommitConfig) => {
    const result = await services.seriesImport.commit(config);

    // Set the first book as active so the user lands somewhere useful
    if (result.volumeResults.length > 0) {
      hooks?.onActiveBookChanged?.(result.volumeResults[0].bookSlug);
    }

    return result;
  });

  // === Files ===

  handle('files:read', (_, bookSlug: string, path: string) =>
    services.fs.readFile(bookSlug, path),
  );

  handle('files:write', async (_, bookSlug: string, path: string, content: string) => {
    await services.fs.writeFile(bookSlug, path, content);
    // Auto-snapshot the written content (dedup by hash — no-op if unchanged)
    await services.version.snapshotContent(bookSlug, path, content, 'user').catch((err) => {
      console.warn('[versions] Auto-snapshot failed:', err);
    });
  });

  handle('files:exists', (_, bookSlug: string, path: string) =>
    services.fs.fileExists(bookSlug, path),
  );

  handle('files:listDir', (_, bookSlug: string, path?: string) =>
    services.fs.listDirectory(bookSlug, path),
  );

  handle('files:delete', (_, bookSlug: string, relativePath: string) =>
    services.fs.deletePath(bookSlug, relativePath),
  );

  // === Versions ===

  handle('versions:getHistory', (_, bookSlug: string, filePath: string, limit?: number, offset?: number) =>
    services.version.getHistory(bookSlug, filePath, limit ?? 50, offset ?? 0),
  );

  handle('versions:getVersion', (_, versionId: number) =>
    services.version.getVersion(versionId),
  );

  handle('versions:getDiff', (_, oldVersionId: number | null, newVersionId: number) =>
    services.version.getDiff(oldVersionId, newVersionId),
  );

  handle('versions:revert', async (_, bookSlug: string, filePath: string, versionId: number) => {
    const result = await services.version.revertToVersion(bookSlug, filePath, versionId);
    // Notify renderer that a file was changed (revert is a write)
    for (const w of BrowserWindow.getAllWindows()) {
      if (!isWebContentsAlive(w)) continue;
      try {
        w.webContents.send('chat:filesChanged', [filePath], bookSlug);
      } catch {
        // Window may be closing
      }
    }
    return result;
  });

  handle('versions:getCount', (_, bookSlug: string, filePath: string) =>
    services.version.getVersionCount(bookSlug, filePath),
  );

  handle('versions:snapshot', (_, bookSlug: string, filePath: string, source: FileVersionSource) =>
    services.version.snapshotFile(bookSlug, filePath, source),
  );

  handle('versions:getUserEdits', (_, bookSlug: string, filePath: string) =>
    services.version.getUserEditsSinceAgentBaseline(bookSlug, filePath),
  );

  handle('versions:getChapterEditStatuses', (_, bookSlug: string) =>
    services.version.getChapterEditStatuses(bookSlug),
  );

  // === Conversations ===

  handle('chat:createConversation', (_, params: {
    bookSlug: string;
    agentName: AgentName;
    pipelinePhase: PipelinePhaseId | null;
    purpose?: ConversationPurpose;
  }) => services.chat.createConversation(params));

  handle('chat:getConversations', (_, bookSlug: string) =>
    services.chat.getConversations(bookSlug),
  );

  handle('chat:getMessages', (_, conversationId: string) =>
    services.chat.getMessages(conversationId),
  );

  handle('chat:deleteConversation', (_, conversationId: string) =>
    services.db.deleteConversation(conversationId),
  );

  // === Chat (abort) ===

  handle('chat:abort', (_, conversationId: string) =>
    services.chat.abortStream(conversationId),
  );

  handle('chat:isCliIdle', (_, bookSlug?: string) => services.chat.isCliIdle(bookSlug));

  // === Chat (streaming) ===

  handle('chat:send', async (event, params: SendMessageParams) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No window found');

    // Use the renderer-provided callId if available, otherwise generate one.
    // Renderer-generated IDs let stores filter events to their own call,
    // preventing cross-book stream bleed when multiple chats run concurrently.
    const callId = params.callId ?? randomUUID();

    // Track whether the call completed successfully or errored for notification
    let hadError = false;
    let errorText = '';

    /**
     * Broadcast a stream event to ALL open windows (not just the sender).
     *
     * After a renderer refresh (Cmd+R / F5), the original BrowserWindow
     * and its webContents are still alive but the old page context is gone.
     * By broadcasting to every window we guarantee the reloaded page's
     * freshly-registered `ipcRenderer.on('chat:streamEvent')` listener
     * receives events — enabling true live re-subscription.
     */
    const broadcastStreamEvent = (streamEvent: StreamEvent & { callId: string; conversationId: string; source?: StreamEventSource }) => {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!isWebContentsAlive(w)) continue;
        try {
          w.webContents.send('chat:streamEvent', streamEvent);
        } catch {
          // Window may be closing or destroyed — skip silently
        }
      }
    };

    const result = await services.chat.sendMessage({
      ...params,
      callId,
      onEvent: (streamEvent) => {
        if (streamEvent.type === 'error') {
          hadError = true;
          errorText = streamEvent.message;
        }
        // Inject callId + conversationId + source so the renderer can scope events
        // to the correct call and conversation, preventing cross-book bleed
        broadcastStreamEvent({ ...streamEvent, callId, conversationId: params.conversationId, source: 'chat' });
      },
    });

    // Fire OS notification (only shows if window is unfocused + setting enabled)
    if (hadError) {
      services.notifications.notifyChatError(params.agentName, errorText).catch(() => {});
    } else {
      // Resolve book title for a richer notification
      const bookTitle = await services.fs.getBookMeta(params.bookSlug)
        .then((meta) => meta.title)
        .catch(() => undefined);
      services.notifications.notifyChatComplete(params.agentName, bookTitle).catch(() => {});
    }

    // If files were changed during this interaction, notify the renderer.
    // Include the bookSlug so the renderer scopes the pipeline refresh
    // to the correct book — prevents cross-book pipeline bleed.
    // Broadcast to all windows so refreshed renderers also receive the notification.
    const changedFiles = result.changedFiles;
    if (changedFiles.length > 0) {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!isWebContentsAlive(w)) continue;
        try {
          w.webContents.send('chat:filesChanged', changedFiles, params.bookSlug);
        } catch {
          // Window may be closing — skip
        }
      }
      // Snapshot agent-written files (uses params.bookSlug — correct for any book, not just active)
      snapshotChangedFiles(params.bookSlug, changedFiles);

      // Record word count snapshot after files changed
      services.statistics.recordWordCountSnapshot(params.bookSlug).catch(() => {});
    }
  });

  // === Pipeline ===

  handle('pipeline:detect', (_, bookSlug: string) =>
    services.pipeline.detectPhases(bookSlug),
  );

  handle('pipeline:getActive', (_, bookSlug: string) =>
    services.pipeline.getActivePhase(bookSlug),
  );

  handle('pipeline:markPhaseComplete', (_, bookSlug: string, phaseId: PipelinePhaseId) =>
    services.pipeline.markPhaseComplete(bookSlug, phaseId),
  );

  handle('pipeline:completeRevision', (_, bookSlug: string) =>
    services.pipeline.completeRevision(bookSlug),
  );

  handle('pipeline:confirmAdvancement', (_, bookSlug: string, phaseId: PipelinePhaseId) =>
    services.pipeline.confirmPhaseAdvancement(bookSlug, phaseId),
  );

  handle('pipeline:revertPhase', (_, bookSlug: string, phaseId: PipelinePhaseId) =>
    services.pipeline.revertPhase(bookSlug, phaseId),
  );

  // === Build ===

  handle('build:run', async (event, bookSlug: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await services.build.build(bookSlug, (message) => {
      win?.webContents.send('build:progress', message);
    });

    // Fire OS notification for build completion
    if (result.success) {
      const bookTitle = await services.fs.getBookMeta(bookSlug)
        .then((meta) => meta.title)
        .catch(() => bookSlug);
      const successFormats = result.formats.filter((f) => !f.error).length;
      services.notifications.notifyBuildComplete(bookTitle, successFormats).catch(() => {});
    }

    return result;
  });

  handle('build:isPandocAvailable', () => services.build.isPandocAvailable());

  handle('build:exportZip', async (event, bookSlug: string) => {
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

  // === Catalog Export ===

  handle('catalog:exportZip', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No window found');

    const dateStr = new Date().toISOString().slice(0, 10);

    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export Book Catalog',
      defaultPath: `novel-engine-catalog-${dateStr}.zip`,
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
    });

    if (canceled || !filePath) return null;

    return new Promise<string>((resolve, reject) => {
      const output = createWriteStream(filePath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve(filePath));
      archive.on('error', reject);

      archive.pipe(output);
      archive.directory(paths.booksDir, 'books');
      archive.finalize();
    });
  });

  // === Usage ===

  handle('usage:summary', (_, bookSlug?: string) => services.usage.getSummary(bookSlug));

  handle('usage:byConversation', (_, conversationId: string) =>
    services.usage.getByConversation(conversationId),
  );

  // === Context Diagnostics ===

  handle('context:getLastDiagnostics', (_, conversationId?: string) =>
    services.chat.getLastDiagnostics(conversationId),
  );

  // === Active Stream (for renderer refresh recovery) ===

  handle('chat:getActiveStream', () => services.chat.getActiveStream());

  handle('chat:getActiveStreamForBook', (_, bookSlug: string) =>
    services.chat.getActiveStreamForBook(bookSlug),
  );

  handle('chat:getOrphanedSessions', () =>
    services.chat.getRecoveredOrphans()
  );

  handle('chat:deepDive', async (event, params: { bookSlug: string; chapterSlug: string; conversationId?: string; callId?: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No window found');
    const callId = params.callId ?? randomUUID();
    const broadcastStreamEvent = (streamEvent: StreamEvent & { callId: string; conversationId?: string; source?: string }) => {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!isWebContentsAlive(w)) continue;
        try { w.webContents.send('chat:streamEvent', streamEvent); } catch { /* skip */ }
      }
    };
    return services.chat.deepDive({
      ...params,
      callId,
      onEvent: (streamEvent) => {
        broadcastStreamEvent({ ...streamEvent, callId, source: 'chat' } as StreamEvent & { callId: string; conversationId?: string; source?: string });
      },
    });
  });

  // === Author Profile ===

  handle('settings:saveAuthorProfile', async (_, content: string) => {
    const profilePath = path.join(paths.userDataPath, 'author-profile.md');
    await fsPromises.writeFile(profilePath, content, 'utf-8');
  });

  handle('settings:loadAuthorProfile', async () => {
    const profilePath = path.join(paths.userDataPath, 'author-profile.md');
    try {
      return await fsPromises.readFile(profilePath, 'utf-8');
    } catch {
      // ENOENT — no author profile yet
      return '';
    }
  });

  // === Shell ===

  handle('shell:openExternal', (_, url: string) => {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'mailto:') throw new Error('Blocked URL scheme');
    return shell.openExternal(url);
  });

  handle('shell:openPath', (_, absolutePath: string) => {
    // Exports open from user-chosen save-dialog paths, so this is NOT confined
    // to the books dir — the sender guard above is the real containment. Reject
    // obviously malformed (non-absolute) input as a minimal sanity check.
    if (!path.isAbsolute(absolutePath)) throw new Error('shell:openPath requires an absolute path');
    return shell.openPath(absolutePath);
  });

  // === Shelved Pitches ===

  handle('pitches:list', () => services.fs.listShelvedPitches());

  handle('pitches:read', (_, slug: string) => services.fs.readShelvedPitch(slug));

  handle('pitches:delete', (_, slug: string) => services.fs.deleteShelvedPitch(slug));

  handle('pitches:shelve', (_, bookSlug: string, logline?: string) =>
    services.fs.shelvePitch(bookSlug, logline),
  );

  handle('pitches:restore', async (_, pitchSlug: string) => {
    const meta = await services.fs.restorePitch(pitchSlug);
    hooks?.onActiveBookChanged?.(meta.slug);
    return meta;
  });

  // === Pitch Room ===

  handle('pitchRoom:listDrafts', () => services.fs.listPitchDrafts());

  handle('pitchRoom:getDraft', (_, convId: string) =>
    services.fs.getPitchDraft(convId),
  );

  handle('pitchRoom:readContent', (_, convId: string) =>
    services.fs.readPitchDraftContent(convId),
  );

  handle('pitchRoom:promote', async (_, convId: string) => {
    const meta = await services.fs.promotePitchToBook(convId);
    hooks?.onActiveBookChanged?.(meta.slug);
    return meta;
  });

  handle('pitchRoom:shelve', (_, convId: string, logline?: string) =>
    services.fs.shelvePitchDraft(convId, logline),
  );

  handle('pitchRoom:discard', async (_, convId: string) => {
    await services.fs.deletePitchDraft(convId);
    services.db.deleteConversation(convId);
  });

  // === Hot Take ===

  handle('hot-take:start', async (event, bookSlug: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No window found');

    const dateStr = new Date().toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });

    const conversation = services.db.createConversation({
      id: randomUUID(),
      bookSlug,
      agentName: 'Ghostlight',
      pipelinePhase: null,
      purpose: 'hot-take',
      title: `Hot Take — ${dateStr}`,
    });

    const callId = randomUUID();

    const broadcastStreamEvent = (streamEvent: StreamEvent & { callId: string; conversationId: string; source?: StreamEventSource }) => {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!isWebContentsAlive(w)) continue;
        try {
          w.webContents.send('chat:streamEvent', streamEvent);
        } catch {
          // Window may be closing
        }
      }
    };

    let hotTakeChangedFiles: string[] = [];
    services.chat.sendMessage({
      agentName: 'Ghostlight',
      message: 'Read the full manuscript and give me your honest reaction.',
      conversationId: conversation.id,
      bookSlug,
      callId,
      onEvent: (streamEvent) => {
        broadcastStreamEvent({ ...streamEvent, callId, conversationId: conversation.id, source: 'hot-take' });

        // Track changed files for version snapshotting
        if (streamEvent.type === 'filesChanged') {
          hotTakeChangedFiles = streamEvent.paths;
        }
        if ((streamEvent.type === 'done' || streamEvent.type === 'error') && hotTakeChangedFiles.length > 0) {
          snapshotChangedFiles(bookSlug, hotTakeChangedFiles);
        }
      },
    }).catch((err) => {
      console.error('[hot-take] Stream error:', err);
    });

    return { conversationId: conversation.id, callId };
  });

  // === Ad Hoc Revision ===

  handle('adhoc-revision:start', async (event, bookSlug: string, description: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No window found');

    const dateStr = new Date().toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });

    const conversation = services.db.createConversation({
      id: randomUUID(),
      bookSlug,
      agentName: 'Forge',
      pipelinePhase: null,
      purpose: 'adhoc-revision',
      title: `Ad Hoc Revision — ${dateStr}`,
    });

    const callId = randomUUID();

    const broadcastStreamEvent = (streamEvent: StreamEvent & { callId: string; conversationId: string; source?: StreamEventSource }) => {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!isWebContentsAlive(w)) continue;
        try {
          w.webContents.send('chat:streamEvent', streamEvent);
        } catch {
          // Window may be closing
        }
      }
    };

    let adhocChangedFiles: string[] = [];
    services.chat.sendMessage({
      agentName: 'Forge',
      message: description,
      conversationId: conversation.id,
      bookSlug,
      callId,
      onEvent: (streamEvent) => {
        broadcastStreamEvent({ ...streamEvent, callId, conversationId: conversation.id, source: 'adhoc-revision' });

        // Track changed files from the stream events directly (per-stream, no singleton)
        if (streamEvent.type === 'filesChanged') {
          adhocChangedFiles = streamEvent.paths;
        }

        if (streamEvent.type === 'done' || streamEvent.type === 'error') {
          if (adhocChangedFiles.length > 0) {
            for (const w of BrowserWindow.getAllWindows()) {
              if (!isWebContentsAlive(w)) continue;
              try {
                w.webContents.send('chat:filesChanged', adhocChangedFiles, bookSlug);
              } catch {
                // Window may be closing
              }
            }
            // Snapshot agent-written files for this book
            snapshotChangedFiles(bookSlug, adhocChangedFiles);
          }
        }
      },
    }).catch((err) => {
      console.error('[adhoc-revision] Stream error:', err);
    });

    return { conversationId: conversation.id, callId };
  });

  // === Verity Pipeline (audit/fix) ===

  /** Broadcast stream events from audit/fix/motif-audit calls to all renderer windows. */
  const broadcastVerityEvent = (callId: string, conversationId: string, source: StreamEventSource) =>
    (streamEvent: StreamEvent) => {
      const tagged = { ...streamEvent, callId, conversationId, source };
      for (const w of BrowserWindow.getAllWindows()) {
        if (!isWebContentsAlive(w)) continue;
        try {
          w.webContents.send('chat:streamEvent', tagged);
        } catch {
          // Window may be closing — skip silently
        }
      }
    };

  /** Emit a synthetic callStart so audit/fix calls appear in the CLI Activity Monitor. */
  const emitVerityCallStart = (callId: string, conversationId: string, bookSlug: string) => {
    const callStartEvent = { type: 'callStart' as const, callId, conversationId, agentName: 'Verity', model: 'unknown', bookSlug };
    for (const w of BrowserWindow.getAllWindows()) {
      if (!isWebContentsAlive(w)) continue;
      try { w.webContents.send('chat:streamEvent', callStartEvent); } catch { /* window closing */ }
    }
  };

  handle('verity:auditChapter', async (_, bookSlug: string, chapterSlug: string, rendererCallId?: string, rendererConversationId?: string) => {
    const callId = rendererCallId ?? `audit:${randomUUID()}`;
    const broadcastConversationId = rendererConversationId ?? `audit-${randomUUID()}`;
    emitVerityCallStart(callId, broadcastConversationId, bookSlug);
    return services.audit.auditChapter({
      bookSlug,
      chapterSlug,
      conversationId: rendererConversationId,
      onEvent: broadcastVerityEvent(callId, broadcastConversationId, 'audit'),
    });
  });

  handle('verity:fixChapter', async (_, bookSlug: string, chapterSlug: string, conversationId: string, rendererCallId?: string) => {
    const sessionId = randomUUID();
    const callId = rendererCallId ?? `fix:${sessionId}`;
    emitVerityCallStart(callId, conversationId, bookSlug);
    await services.audit.fixChapter({
      bookSlug,
      chapterSlug,
      auditResult: { chapter: chapterSlug, violations: [], summary: { total: 0, by_type: {}, severity: 'clean' } },
      conversationId,
      sessionId,
      onEvent: broadcastVerityEvent(callId, conversationId, 'fix'),
    });
  });

  handle('verity:fixChapterWithAudit', async (_, bookSlug: string, chapterSlug: string, conversationId: string, auditResultJson: string, rendererCallId?: string) => {
    const sessionId = randomUUID();
    const callId = rendererCallId ?? `fix:${sessionId}`;
    const auditResult = JSON.parse(auditResultJson);
    emitVerityCallStart(callId, conversationId, bookSlug);
    await services.audit.fixChapter({
      bookSlug,
      chapterSlug,
      auditResult,
      conversationId,
      sessionId,
      onEvent: broadcastVerityEvent(callId, conversationId, 'fix'),
    });
  });

  handle('verity:runMotifAudit', async (_, bookSlug: string, rendererCallId?: string) => {
    const appSettings = await services.settings.load();
    const sessionId = randomUUID();
    const callId = rendererCallId ?? `motif-audit:${sessionId}`;
    emitVerityCallStart(callId, `motif-audit-${sessionId}`, bookSlug);
    await services.audit.runMotifAudit({
      bookSlug,
      appSettings,
      onEvent: broadcastVerityEvent(callId, `motif-audit-${sessionId}`, 'motif-audit'),
      sessionId,
    });
  });

  // === Revision Queue ===

  handle('revision:loadPlan', async (_, bookSlug: string) => {
    return services.revisionQueue.loadPlan(bookSlug);
  });

  handle('revision:clearCache', async (_, bookSlug: string) => {
    await services.revisionQueue.clearCache(bookSlug);
  });

  handle('revision:runSession', async (_, planId: string, sessionId: string) => {
    return services.revisionQueue.runSession(planId, sessionId);
  });

  handle('revision:runAll', async (_, planId: string, selectedSessionIds?: string[]) => {
    return services.revisionQueue.runAll(planId, selectedSessionIds);
  });

  handle('revision:respondToGate', (_, planId: string, sessionId: string, action: string, message?: string) => {
    services.revisionQueue.respondToGate(planId, sessionId, action as ApprovalAction, message);
  });

  handle('revision:approveSession', async (_, planId: string, sessionId: string) => {
    return services.revisionQueue.approveSession(planId, sessionId);
  });

  handle('revision:rejectSession', async (_, planId: string, sessionId: string) => {
    return services.revisionQueue.rejectSession(planId, sessionId);
  });

  handle('revision:skipSession', async (_, planId: string, sessionId: string) => {
    return services.revisionQueue.skipSession(planId, sessionId);
  });

  handle('revision:pause', (_, planId: string) => {
    services.revisionQueue.pause(planId);
  });

  handle('revision:setMode', (_, planId: string, mode: string) => {
    services.revisionQueue.setMode(planId, mode as QueueMode);
  });

  handle('revision:getPlan', (_, planId: string) => {
    return services.revisionQueue.getPlan(planId);
  });

  handle('revision:startVerification', (_, planId: string) =>
    services.revisionQueue.startVerification(planId),
  );


  handle('revision:getQueueStatus', (_, bookSlug: string) => {
    return services.revisionQueue.getQueueStatus(bookSlug);
  });

  // === Motif Ledger ===

  handle('motifLedger:load', (_, bookSlug: string) =>
    services.motifLedger.load(bookSlug),
  );

  handle('motifLedger:save', (_, bookSlug: string, ledger: MotifLedger) =>
    services.motifLedger.save(bookSlug, ledger),
  );

  handle('motifLedger:getUnauditedChapters', (_, bookSlug: string) =>
    services.motifLedger.getUnauditedChapters(bookSlug),
  );

  // Forward revision queue events to all renderer windows + fire OS notifications
  services.revisionQueue.onEvent((event) => {
    const wins = BrowserWindow.getAllWindows();
    for (const win of wins) {
      if (!isWebContentsAlive(win)) continue;
      win.webContents.send('revision:event', event);

      if (event.type === 'session:streamEvent') {
        // Use sessionId as callId so the renderer groups events per revision session
        win.webContents.send('chat:streamEvent', {
          ...event.event,
          callId: `rev:${event.sessionId}`,
          conversationId: event.conversationId ?? event.sessionId,
          source: 'revision' as StreamEventSource,
        });
      }
    }

    // Snapshot files changed during revision sessions
    if (event.type === 'session:streamEvent' && event.event.type === 'filesChanged') {
      services.fs.getActiveBookSlug().then((slug) => {
        if (slug) {
          snapshotChangedFiles(slug, event.event.type === 'filesChanged' ? event.event.paths : []);
        }
      }).catch(() => {});
    }

    // Fire notifications for key revision events
    if (event.type === 'session:done') {
      services.notifications.notifyRevisionSessionComplete(
        `Session finished (tasks ${event.taskNumbers.join(', ')})`,
      ).catch(() => {});
    } else if (event.type === 'queue:done') {
      services.notifications.notifyRevisionQueueDone().catch(() => {});
    }
  });

  // === Series ===

  handle('series:list', () => services.series.listSeries());

  handle('series:get', (_e, slug: string) => services.series.getSeries(slug));

  handle('series:create', (_e, name: string, description?: string) =>
    services.series.createSeries(name, description));

  handle('series:update', (_e, slug: string, partial: Partial<Pick<SeriesMeta, 'name' | 'description'>>) =>
    services.series.updateSeries(slug, partial));

  handle('series:delete', (_e, slug: string) => services.series.deleteSeries(slug));

  handle('series:addVolume', (_e, seriesSlug: string, bookSlug: string, volumeNumber?: number) =>
    services.series.addVolume(seriesSlug, bookSlug, volumeNumber));

  handle('series:removeVolume', (_e, seriesSlug: string, bookSlug: string) =>
    services.series.removeVolume(seriesSlug, bookSlug));

  handle('series:reorderVolumes', (_e, seriesSlug: string, orderedSlugs: string[]) =>
    services.series.reorderVolumes(seriesSlug, orderedSlugs));

  handle('series:getForBook', (_e, bookSlug: string) =>
    services.series.getSeriesForBook(bookSlug));

  handle('series:readBible', (_e, seriesSlug: string) =>
    services.series.readSeriesBible(seriesSlug));

  handle('series:writeBible', (_e, seriesSlug: string, content: string) =>
    services.series.writeSeriesBible(seriesSlug, content));

  // === Helper ===

  handle('helper:getOrCreateConversation', async () => {
    return services.helper.getOrCreateConversation();
  });

  handle('helper:getMessages', async (_e, conversationId: string) => {
    return services.helper.getMessages(conversationId);
  });

  handle('helper:send', async (_e, params: { message: string; conversationId: string; callId?: string }) => {
    const { message, conversationId, callId } = params;
    const resolvedCallId = callId ?? randomUUID();
    await services.helper.sendMessage({
      message,
      conversationId,
      callId: resolvedCallId,
      onEvent: (event) => {
        for (const w of BrowserWindow.getAllWindows()) {
          if (!isWebContentsAlive(w)) continue;
          try {
            w.webContents.send('chat:streamEvent', {
              ...event,
              callId: resolvedCallId,
              conversationId,
              source: 'chat' as StreamEventSource,
            });
          } catch { /* window closing */ }
        }
      },
    });
  });

  handle('helper:abort', async (_e, conversationId: string) => {
    services.helper.abortStream(conversationId);
  });

  handle('helper:reset', async () => {
    await services.helper.resetConversation();
  });

  // === Find & Replace ===

  handle('findReplace:preview', async (_, bookSlug: string, searchTerm: string, options: FindReplaceOptions): Promise<FindReplacePreviewResult> =>
    services.findReplace.preview(bookSlug, searchTerm, options),
  );

  handle('findReplace:apply', async (_, params: {
    bookSlug: string;
    searchTerm: string;
    replacement: string;
    filePaths: string[];
    options: FindReplaceOptions;
  }): Promise<FindReplaceApplyResult> =>
    services.findReplace.apply(params),
  );

  // === Dashboard ===

  handle('dashboard:getData', async (_event, bookSlug: string): Promise<BookDashboardData> =>
    services.dashboard.getDashboardData(bookSlug),
  );

  // === Statistics ===

  handle('statistics:get', async (_event, bookSlug?: string): Promise<BookStatistics> =>
    services.statistics.getStatistics(bookSlug),
  );

  handle('statistics:recordSnapshot', async (_event, bookSlug: string): Promise<void> =>
    services.statistics.recordWordCountSnapshot(bookSlug),
  );

  // === Query Manager ===

  handle('query:loadTracker', (_, bookSlug: string) =>
    services.query.loadTracker(bookSlug),
  );

  handle('query:saveTracker', (_, bookSlug: string, tracker: QueryTracker) =>
    services.query.saveTracker(bookSlug, tracker),
  );

  handle('query:addTarget', (_, bookSlug: string, target: Omit<QueryTarget, 'id' | 'queryLetterPath' | 'submittedDate' | 'responseDate'>) =>
    services.query.addTarget(bookSlug, target),
  );

  handle('query:updateTargetStatus', (_, bookSlug: string, targetId: string, status: QueryStatus, responseDate?: string) =>
    services.query.updateTargetStatus(bookSlug, targetId, status, responseDate),
  );

  handle('query:removeTarget', (_, bookSlug: string, targetId: string) =>
    services.query.removeTarget(bookSlug, targetId),
  );

  const broadcastQueryStreamEvent = (streamEvent: StreamEvent, callId: string) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!isWebContentsAlive(w)) continue;
      try { w.webContents.send('query:onStream', streamEvent); } catch { /* skip */ }
      try { w.webContents.send('chat:streamEvent', { ...streamEvent, callId, conversationId: callId, source: 'query' as StreamEventSource }); } catch { /* skip */ }
    }
  };

  handle('query:generateLetter', async (_event, bookSlug: string, targetId: string) => {
    const callId = `query:generate:${randomUUID().slice(0, 8)}`;
    const result = await services.query.generateQueryLetter(bookSlug, targetId, (streamEvent) => {
      broadcastQueryStreamEvent(streamEvent, callId);
    });
    if (result && result.filePath) {
      snapshotChangedFiles(bookSlug, [result.filePath]);
    }
    return result;
  });

  handle('query:listLetters', (_, bookSlug: string) =>
    services.query.listQueryLetters(bookSlug),
  );

  handle('query:readLetter', (_, bookSlug: string, targetSlug: string) =>
    services.query.readQueryLetter(bookSlug, targetSlug),
  );

  handle('query:saveLetter', (_, bookSlug: string, targetSlug: string, content: string) =>
    services.query.saveQueryLetter(bookSlug, targetSlug, content),
  );

  handle('query:researchTargets', async (_event, bookSlug: string) => {
    const callId = `query:research:${randomUUID().slice(0, 8)}`;
    const result = await services.query.researchTargets(bookSlug, (streamEvent) => {
      broadcastQueryStreamEvent(streamEvent, callId);
    });
    return result;
  });

  handle('query:fillTargetField', async (_event, bookSlug: string, targetId: string, field: QueryFillableField) => {
    const callId = `query:fill:${randomUUID().slice(0, 8)}`;
    const result = await services.query.fillTargetField(bookSlug, targetId, field, (streamEvent) => {
      broadcastQueryStreamEvent(streamEvent, callId);
    });
    return result;
  });
}
