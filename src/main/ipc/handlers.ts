import { ipcMain, BrowserWindow, dialog, nativeTheme, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import * as fsPromises from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import * as path from 'node:path';
import archiver from 'archiver';
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
  QueueMode,
  SendMessageParams,
  StreamEvent,
} from '@domain/types';
import { AVAILABLE_MODELS } from '@domain/constants';
import type { NotificationManager } from '../notifications';

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
}, paths: {
  userDataPath: string;
  booksDir: string;
}, hooks?: {
  onActiveBookChanged?: (slug: string) => void;
}): void {

  // === Settings ===

  ipcMain.handle('settings:load', () => services.settings.load());

  ipcMain.handle('settings:detectClaudeCli', () => services.settings.detectClaudeCli());

  ipcMain.handle('settings:update', async (_, partial: Partial<AppSettings>) => {
    await services.settings.update(partial);

    // Sync Electron's native theme when the user changes the appearance setting
    if (partial.theme !== undefined) {
      nativeTheme.themeSource = partial.theme === 'system' ? 'system' : partial.theme;
    }
  });

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

  ipcMain.handle('books:setActive', async (_, slug: string) => {
    await services.fs.setActiveBook(slug);
    hooks?.onActiveBookChanged?.(slug);
  });

  ipcMain.handle('books:create', async (_, title: string) => {
    const settings = await services.settings.load();
    const meta = await services.fs.createBook(title, settings.authorName);
    hooks?.onActiveBookChanged?.(meta.slug);
    return meta;
  });

  ipcMain.handle('books:getMeta', (_, slug: string) => services.fs.getBookMeta(slug));

  ipcMain.handle('books:updateMeta', async (_, slug: string, partial: Partial<BookMeta>) => {
    const updated = await services.fs.updateBookMeta(slug, partial);
    if (updated.slug !== slug) {
      services.db.updateBookSlug(slug, updated.slug);
      hooks?.onActiveBookChanged?.(updated.slug);
    }
    return updated;
  });

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

  ipcMain.handle('books:archive', async (_, slug: string) => {
    await services.fs.archiveBook(slug);
  });

  ipcMain.handle('books:unarchive', async (_, slug: string) => {
    const meta = await services.fs.unarchiveBook(slug);
    hooks?.onActiveBookChanged?.(meta.slug);
    return meta;
  });

  ipcMain.handle('books:listArchived', () => services.fs.listArchivedBooks());

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

  ipcMain.handle('files:delete', (_, bookSlug: string, relativePath: string) =>
    services.fs.deletePath(bookSlug, relativePath),
  );

  // === Conversations ===

  ipcMain.handle('chat:createConversation', (_, params: {
    bookSlug: string;
    agentName: AgentName;
    pipelinePhase: PipelinePhaseId | null;
    purpose?: ConversationPurpose;
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

  // === Chat (abort) ===

  ipcMain.handle('chat:abort', (_, conversationId: string) =>
    services.chat.abortStream(conversationId),
  );

  ipcMain.handle('chat:isCliIdle', (_, bookSlug?: string) => services.chat.isCliIdle(bookSlug));

  // === Chat (streaming) ===

  ipcMain.handle('chat:send', async (event, params: SendMessageParams) => {
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
    const broadcastStreamEvent = (streamEvent: StreamEvent & { callId: string; conversationId: string }) => {
      for (const w of BrowserWindow.getAllWindows()) {
        try {
          w.webContents.send('chat:streamEvent', streamEvent);
        } catch {
          // Window may be closing or destroyed — skip silently
        }
      }
    };

    await services.chat.sendMessage({
      ...params,
      callId,
      onEvent: (streamEvent) => {
        if (streamEvent.type === 'error') {
          hadError = true;
          errorText = streamEvent.message;
        }
        // Inject callId + conversationId so the renderer can scope events
        // to the correct call and conversation, preventing cross-book bleed
        broadcastStreamEvent({ ...streamEvent, callId, conversationId: params.conversationId });
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
    const changedFiles = services.chat.getLastChangedFiles();
    if (changedFiles.length > 0) {
      for (const w of BrowserWindow.getAllWindows()) {
        try {
          w.webContents.send('chat:filesChanged', changedFiles, params.bookSlug);
        } catch {
          // Window may be closing — skip
        }
      }
    }
  });

  // === Pipeline ===

  ipcMain.handle('pipeline:detect', (_, bookSlug: string) =>
    services.pipeline.detectPhases(bookSlug),
  );

  ipcMain.handle('pipeline:getActive', (_, bookSlug: string) =>
    services.pipeline.getActivePhase(bookSlug),
  );

  ipcMain.handle('pipeline:markPhaseComplete', (_, bookSlug: string, phaseId: PipelinePhaseId) =>
    services.pipeline.markPhaseComplete(bookSlug, phaseId),
  );

  ipcMain.handle('pipeline:completeRevision', (_, bookSlug: string) =>
    services.pipeline.completeRevision(bookSlug),
  );

  ipcMain.handle('pipeline:confirmAdvancement', (_, bookSlug: string, phaseId: PipelinePhaseId) =>
    services.pipeline.confirmPhaseAdvancement(bookSlug, phaseId),
  );

  ipcMain.handle('pipeline:revertPhase', (_, bookSlug: string, phaseId: PipelinePhaseId) =>
    services.pipeline.revertPhase(bookSlug, phaseId),
  );

  // === Build ===

  ipcMain.handle('build:run', async (event, bookSlug: string) => {
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

  // === Active Stream (for renderer refresh recovery) ===

  ipcMain.handle('chat:getActiveStream', () => services.chat.getActiveStream());

  ipcMain.handle('chat:getActiveStreamForBook', (_, bookSlug: string) =>
    services.chat.getActiveStreamForBook(bookSlug),
  );

  ipcMain.handle('chat:getOrphanedSessions', () =>
    services.chat.getRecoveredOrphans()
  );

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
      // ENOENT — no author profile yet
      return '';
    }
  });

  // === Shell ===

  ipcMain.handle('shell:openExternal', (_, url: string) => shell.openExternal(url));

  ipcMain.handle('shell:openPath', (_, absolutePath: string) => shell.openPath(absolutePath));

  // === Shelved Pitches ===

  ipcMain.handle('pitches:list', () => services.fs.listShelvedPitches());

  ipcMain.handle('pitches:read', (_, slug: string) => services.fs.readShelvedPitch(slug));

  ipcMain.handle('pitches:delete', (_, slug: string) => services.fs.deleteShelvedPitch(slug));

  ipcMain.handle('pitches:shelve', (_, bookSlug: string, logline?: string) =>
    services.fs.shelvePitch(bookSlug, logline),
  );

  ipcMain.handle('pitches:restore', async (_, pitchSlug: string) => {
    const meta = await services.fs.restorePitch(pitchSlug);
    hooks?.onActiveBookChanged?.(meta.slug);
    return meta;
  });

  // === Pitch Room ===

  ipcMain.handle('pitchRoom:listDrafts', () => services.fs.listPitchDrafts());

  ipcMain.handle('pitchRoom:getDraft', (_, convId: string) =>
    services.fs.getPitchDraft(convId),
  );

  ipcMain.handle('pitchRoom:readContent', (_, convId: string) =>
    services.fs.readPitchDraftContent(convId),
  );

  ipcMain.handle('pitchRoom:promote', async (_, convId: string) => {
    const meta = await services.fs.promotePitchToBook(convId);
    hooks?.onActiveBookChanged?.(meta.slug);
    return meta;
  });

  ipcMain.handle('pitchRoom:shelve', (_, convId: string, logline?: string) =>
    services.fs.shelvePitchDraft(convId, logline),
  );

  ipcMain.handle('pitchRoom:discard', async (_, convId: string) => {
    await services.fs.deletePitchDraft(convId);
    services.db.deleteConversation(convId);
  });

  // === Hot Take ===

  ipcMain.handle('hot-take:start', async (event, bookSlug: string) => {
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

    const broadcastStreamEvent = (streamEvent: StreamEvent & { callId: string; conversationId: string }) => {
      for (const w of BrowserWindow.getAllWindows()) {
        try {
          w.webContents.send('chat:streamEvent', streamEvent);
        } catch {
          // Window may be closing
        }
      }
    };

    services.chat.sendMessage({
      agentName: 'Ghostlight',
      message: 'Read the full manuscript and give me your honest reaction.',
      conversationId: conversation.id,
      bookSlug,
      callId,
      onEvent: (streamEvent) => {
        broadcastStreamEvent({ ...streamEvent, callId, conversationId: conversation.id });
      },
    }).catch((err) => {
      console.error('[hot-take] Stream error:', err);
    });

    return { conversationId: conversation.id, callId };
  });

  // === Ad Hoc Revision ===

  ipcMain.handle('adhoc-revision:start', async (event, bookSlug: string, description: string) => {
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

    const broadcastStreamEvent = (streamEvent: StreamEvent & { callId: string; conversationId: string }) => {
      for (const w of BrowserWindow.getAllWindows()) {
        try {
          w.webContents.send('chat:streamEvent', streamEvent);
        } catch {
          // Window may be closing
        }
      }
    };

    services.chat.sendMessage({
      agentName: 'Forge',
      message: description,
      conversationId: conversation.id,
      bookSlug,
      callId,
      onEvent: (streamEvent) => {
        broadcastStreamEvent({ ...streamEvent, callId, conversationId: conversation.id });

        if (streamEvent.type === 'done' || streamEvent.type === 'error') {
          const changedFiles = services.chat.getLastChangedFiles();
          if (changedFiles.length > 0) {
            for (const w of BrowserWindow.getAllWindows()) {
              try {
                w.webContents.send('chat:filesChanged', changedFiles, bookSlug);
              } catch {
                // Window may be closing
              }
            }
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
  const broadcastVerityEvent = (callId: string, conversationId: string) =>
    (streamEvent: StreamEvent) => {
      const tagged = { ...streamEvent, callId, conversationId };
      for (const w of BrowserWindow.getAllWindows()) {
        try {
          w.webContents.send('chat:streamEvent', tagged);
        } catch {
          // Window may be closing — skip silently
        }
      }
    };

  ipcMain.handle('verity:auditChapter', async (_, bookSlug: string, chapterSlug: string, rendererCallId?: string, rendererConversationId?: string) => {
    const callId = rendererCallId ?? `audit:${randomUUID()}`;
    const broadcastConversationId = rendererConversationId ?? `audit-${randomUUID()}`;
    return services.audit.auditChapter({
      bookSlug,
      chapterSlug,
      conversationId: rendererConversationId,
      onEvent: broadcastVerityEvent(callId, broadcastConversationId),
    });
  });

  ipcMain.handle('verity:fixChapter', async (_, bookSlug: string, chapterSlug: string, conversationId: string, rendererCallId?: string) => {
    const sessionId = randomUUID();
    const callId = rendererCallId ?? `fix:${sessionId}`;
    await services.audit.fixChapter({
      bookSlug,
      chapterSlug,
      auditResult: { chapter: chapterSlug, violations: [], summary: { total: 0, by_type: {}, severity: 'clean' } },
      conversationId,
      sessionId,
      onEvent: broadcastVerityEvent(callId, conversationId),
    });
  });

  ipcMain.handle('verity:fixChapterWithAudit', async (_, bookSlug: string, chapterSlug: string, conversationId: string, auditResultJson: string, rendererCallId?: string) => {
    const sessionId = randomUUID();
    const callId = rendererCallId ?? `fix:${sessionId}`;
    const auditResult = JSON.parse(auditResultJson);
    await services.audit.fixChapter({
      bookSlug,
      chapterSlug,
      auditResult,
      conversationId,
      sessionId,
      onEvent: broadcastVerityEvent(callId, conversationId),
    });
  });

  ipcMain.handle('verity:runMotifAudit', async (_, bookSlug: string, rendererCallId?: string) => {
    const appSettings = await services.settings.load();
    const sessionId = randomUUID();
    const callId = rendererCallId ?? `motif-audit:${sessionId}`;
    await services.audit.runMotifAudit({
      bookSlug,
      appSettings,
      onEvent: broadcastVerityEvent(callId, `motif-audit-${sessionId}`),
      sessionId,
    });
  });

  // === Revision Queue ===

  ipcMain.handle('revision:loadPlan', async (_, bookSlug: string) => {
    return services.revisionQueue.loadPlan(bookSlug);
  });

  ipcMain.handle('revision:clearCache', async (_, bookSlug: string) => {
    await services.revisionQueue.clearCache(bookSlug);
  });

  ipcMain.handle('revision:runSession', async (_, planId: string, sessionId: string) => {
    return services.revisionQueue.runSession(planId, sessionId);
  });

  ipcMain.handle('revision:runAll', async (_, planId: string, selectedSessionIds?: string[]) => {
    return services.revisionQueue.runAll(planId, selectedSessionIds);
  });

  ipcMain.handle('revision:respondToGate', (_, planId: string, sessionId: string, action: string, message?: string) => {
    services.revisionQueue.respondToGate(planId, sessionId, action as ApprovalAction, message);
  });

  ipcMain.handle('revision:approveSession', async (_, planId: string, sessionId: string) => {
    return services.revisionQueue.approveSession(planId, sessionId);
  });

  ipcMain.handle('revision:rejectSession', async (_, planId: string, sessionId: string) => {
    return services.revisionQueue.rejectSession(planId, sessionId);
  });

  ipcMain.handle('revision:skipSession', async (_, planId: string, sessionId: string) => {
    return services.revisionQueue.skipSession(planId, sessionId);
  });

  ipcMain.handle('revision:pause', (_, planId: string) => {
    services.revisionQueue.pause(planId);
  });

  ipcMain.handle('revision:setMode', (_, planId: string, mode: string) => {
    services.revisionQueue.setMode(planId, mode as QueueMode);
  });

  ipcMain.handle('revision:getPlan', (_, planId: string) => {
    return services.revisionQueue.getPlan(planId);
  });

  ipcMain.handle('revision:startVerification', (_, planId: string) =>
    services.revisionQueue.startVerification(planId),
  );


  ipcMain.handle('revision:getQueueStatus', (_, bookSlug: string) => {
    return services.revisionQueue.getQueueStatus(bookSlug);
  });

  // === Motif Ledger ===

  ipcMain.handle('motifLedger:load', (_, bookSlug: string) =>
    services.motifLedger.load(bookSlug),
  );

  ipcMain.handle('motifLedger:save', (_, bookSlug: string, ledger: MotifLedger) =>
    services.motifLedger.save(bookSlug, ledger),
  );

  ipcMain.handle('motifLedger:getUnauditedChapters', (_, bookSlug: string) =>
    services.motifLedger.getUnauditedChapters(bookSlug),
  );

  // Forward revision queue events to all renderer windows + fire OS notifications
  services.revisionQueue.onEvent((event) => {
    const wins = BrowserWindow.getAllWindows();
    for (const win of wins) {
      win.webContents.send('revision:event', event);

      if (event.type === 'session:streamEvent') {
        // Use sessionId as callId so the renderer groups events per revision session
        win.webContents.send('chat:streamEvent', { ...event.event, callId: `rev:${event.sessionId}` });
      }
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
}
