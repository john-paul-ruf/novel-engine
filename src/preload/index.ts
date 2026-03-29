import { contextBridge, ipcRenderer } from 'electron';
import type {
  ActiveStreamInfo,
  AgentMeta,
  AgentName,
  AppSettings,
  ApprovalAction,
  AuditResult,
  BookMeta,
  BookSummary,
  BuildResult,
  ContextDiagnostics,
  Conversation,
  ConversationPurpose,
  FileDiff,
  FileEntry,
  FileVersion,
  FileVersionSource,
  FileVersionSummary,
  Message,
  MotifLedger,
  PipelinePhase,
  PipelinePhaseId,
  PitchDraft,
  QueueMode,
  QueueStatus,
  RevisionPlan,
  RevisionQueueEvent,
  SendMessageParams,
  ShelvedPitch,
  ShelvedPitchMeta,
  StreamEvent,
  StreamSessionRecord,
  UsageRecord,
  UsageSummary,
  ModelInfo,
  ProviderConfig,
  ProviderId,
  ProviderStatus,
  ImportPreview,
  ImportCommitConfig,
  ImportResult,
  SeriesImportCommitConfig,
  SeriesImportPreview,
  SeriesImportResult,
  SeriesMeta,
  SeriesSummary,
  SourceGenerationEvent,
  FindReplaceApplyResult,
  FindReplaceOptions,
  FindReplacePreviewResult,
  ManuscriptAssembly,
  BookDashboardData,
} from '@domain/types';

const api = {
  // Settings
  settings: {
    load: (): Promise<AppSettings> => ipcRenderer.invoke('settings:load'),
    detectClaudeCli: (): Promise<boolean> => ipcRenderer.invoke('settings:detectClaudeCli'),
    update: (partial: Partial<AppSettings>): Promise<void> => ipcRenderer.invoke('settings:update', partial),
    saveAuthorProfile: (content: string): Promise<void> =>
      ipcRenderer.invoke('settings:saveAuthorProfile', content),
    loadAuthorProfile: (): Promise<string> =>
      ipcRenderer.invoke('settings:loadAuthorProfile'),
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
    updateMeta: (slug: string, partial: Partial<BookMeta>): Promise<BookMeta> =>
      ipcRenderer.invoke('books:updateMeta', slug, partial),
    wordCount: (slug: string): Promise<{ slug: string; wordCount: number }[]> =>
      ipcRenderer.invoke('books:wordCount', slug),
    uploadCover: (bookSlug: string): Promise<string | null> =>
      ipcRenderer.invoke('books:uploadCover', bookSlug),
    getCoverImagePath: (bookSlug: string): Promise<string | null> =>
      ipcRenderer.invoke('books:getCoverImagePath', bookSlug),
    getAbsolutePath: (bookSlug: string, relativePath: string): Promise<string> =>
      ipcRenderer.invoke('books:getAbsolutePath', bookSlug, relativePath),

    archive: (slug: string): Promise<void> =>
      ipcRenderer.invoke('books:archive', slug),
    unarchive: (slug: string): Promise<BookMeta> =>
      ipcRenderer.invoke('books:unarchive', slug),
    listArchived: (): Promise<BookSummary[]> =>
      ipcRenderer.invoke('books:listArchived'),
    assembleManuscript: (bookSlug: string): Promise<ManuscriptAssembly> =>
      ipcRenderer.invoke('books:assembleManuscript', bookSlug),

    /**
     * Subscribe to `books:changed` — fired by the main process when a new
     * book directory is detected in (or removed from) the books folder at runtime.
     * Returns a cleanup function; call it in useEffect's return to unsubscribe.
     */
    onChanged: (callback: () => void): (() => void) => {
      const handler = () => callback();
      ipcRenderer.on('books:changed', handler);
      return () => ipcRenderer.removeListener('books:changed', handler);
    },
  },

  // Manuscript Import
  import: {
    selectFile: (): Promise<string | null> =>
      ipcRenderer.invoke('import:selectFile'),
    preview: (filePath: string): Promise<ImportPreview> =>
      ipcRenderer.invoke('import:preview', filePath),
    commit: (config: ImportCommitConfig): Promise<ImportResult> =>
      ipcRenderer.invoke('import:commit', config),
    generateSources: (bookSlug: string): Promise<void> =>
      ipcRenderer.invoke('import:generateSources', bookSlug),
    onGenerationProgress: (callback: (event: SourceGenerationEvent) => void) => {
      const handler = (_: Electron.IpcRendererEvent, event: SourceGenerationEvent) => callback(event);
      ipcRenderer.on('import:generationProgress', handler);
      return () => ipcRenderer.removeListener('import:generationProgress', handler);
    },
  },

  // Series Import
  seriesImport: {
    selectFiles: (): Promise<string[] | null> =>
      ipcRenderer.invoke('import:selectFiles'),
    preview: (filePaths: string[]): Promise<SeriesImportPreview> =>
      ipcRenderer.invoke('import:seriesPreview', filePaths),
    commit: (config: SeriesImportCommitConfig): Promise<SeriesImportResult> =>
      ipcRenderer.invoke('import:seriesCommit', config),
  },

  // Files
  files: {
    read: (bookSlug: string, path: string): Promise<string> =>
      ipcRenderer.invoke('files:read', bookSlug, path),
    write: (bookSlug: string, path: string, content: string): Promise<void> =>
      ipcRenderer.invoke('files:write', bookSlug, path, content),
    exists: (bookSlug: string, path: string): Promise<boolean> =>
      ipcRenderer.invoke('files:exists', bookSlug, path),
    listDir: (bookSlug: string, path?: string): Promise<FileEntry[]> =>
      ipcRenderer.invoke('files:listDir', bookSlug, path),
    delete: (bookSlug: string, relativePath: string): Promise<void> =>
      ipcRenderer.invoke('files:delete', bookSlug, relativePath),
  },

  // Versions (file history)
  versions: {
    getHistory: (bookSlug: string, filePath: string, limit?: number, offset?: number): Promise<FileVersionSummary[]> =>
      ipcRenderer.invoke('versions:getHistory', bookSlug, filePath, limit, offset),
    getVersion: (versionId: number): Promise<FileVersion | null> =>
      ipcRenderer.invoke('versions:getVersion', versionId),
    getDiff: (oldVersionId: number | null, newVersionId: number): Promise<FileDiff> =>
      ipcRenderer.invoke('versions:getDiff', oldVersionId, newVersionId),
    revert: (bookSlug: string, filePath: string, versionId: number): Promise<FileVersion> =>
      ipcRenderer.invoke('versions:revert', bookSlug, filePath, versionId),
    getCount: (bookSlug: string, filePath: string): Promise<number> =>
      ipcRenderer.invoke('versions:getCount', bookSlug, filePath),
    snapshot: (bookSlug: string, filePath: string, source: FileVersionSource): Promise<FileVersion | null> =>
      ipcRenderer.invoke('versions:snapshot', bookSlug, filePath, source),
  },

  // Chat
  chat: {
    createConversation: (params: {
      bookSlug: string;
      agentName: AgentName;
      pipelinePhase: PipelinePhaseId | null;
      purpose?: ConversationPurpose;
    }): Promise<Conversation> =>
      ipcRenderer.invoke('chat:createConversation', params),
    getConversations: (bookSlug: string): Promise<Conversation[]> =>
      ipcRenderer.invoke('chat:getConversations', bookSlug),
    getMessages: (conversationId: string): Promise<Message[]> =>
      ipcRenderer.invoke('chat:getMessages', conversationId),
    deleteConversation: (conversationId: string): Promise<void> =>
      ipcRenderer.invoke('chat:deleteConversation', conversationId),
    send: (params: SendMessageParams): Promise<void> =>
      ipcRenderer.invoke('chat:send', params),
    abort: (conversationId: string): Promise<void> =>
      ipcRenderer.invoke('chat:abort', conversationId),
    isCliIdle: (bookSlug?: string): Promise<boolean> =>
      ipcRenderer.invoke('chat:isCliIdle', bookSlug),
    getActiveStream: (): Promise<ActiveStreamInfo | null> =>
      ipcRenderer.invoke('chat:getActiveStream'),
    getActiveStreamForBook: (bookSlug: string): Promise<ActiveStreamInfo | null> =>
      ipcRenderer.invoke('chat:getActiveStreamForBook', bookSlug),
    getOrphanedSessions: (): Promise<StreamSessionRecord[]> =>
      ipcRenderer.invoke('chat:getOrphanedSessions'),
    deepDive: (params: { bookSlug: string; chapterSlug: string; conversationId?: string; callId?: string }): Promise<{ conversationId: string }> =>
      ipcRenderer.invoke('chat:deepDive', params),
    onStreamEvent: (callback: (event: StreamEvent) => void) => {
      const handler = (_: Electron.IpcRendererEvent, event: StreamEvent) => callback(event);
      ipcRenderer.on('chat:streamEvent', handler);
      return () => ipcRenderer.removeListener('chat:streamEvent', handler);
    },
    onFilesChanged: (callback: (paths: string[], bookSlug?: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, paths: string[], bookSlug?: string) => callback(paths, bookSlug);
      ipcRenderer.on('chat:filesChanged', handler);
      return () => ipcRenderer.removeListener('chat:filesChanged', handler);
    },
  },

  // Pipeline
  pipeline: {
    detect: (bookSlug: string): Promise<PipelinePhase[]> =>
      ipcRenderer.invoke('pipeline:detect', bookSlug),
    getActive: (bookSlug: string): Promise<PipelinePhase | null> =>
      ipcRenderer.invoke('pipeline:getActive', bookSlug),
    markPhaseComplete: (bookSlug: string, phaseId: PipelinePhaseId): Promise<void> =>
      ipcRenderer.invoke('pipeline:markPhaseComplete', bookSlug, phaseId),
    completeRevision: (bookSlug: string): Promise<void> =>
      ipcRenderer.invoke('pipeline:completeRevision', bookSlug),
    /**
     * Confirm that a phase's work is accepted and the pipeline should advance.
     * Transitions a 'pending-completion' phase to 'complete' and unlocks the
     * next phase. Idempotent — safe to call on already-confirmed phases.
     */
    confirmAdvancement: (bookSlug: string, phaseId: PipelinePhaseId): Promise<void> =>
      ipcRenderer.invoke('pipeline:confirmAdvancement', bookSlug, phaseId),
    /**
     * Revert a completed phase, moving it back to pending-completion or active.
     * Also reverts all subsequent phases to locked. Non-destructive for
     * file-existence phases — agent output files remain on disk.
     */
    revertPhase: (bookSlug: string, phaseId: PipelinePhaseId): Promise<void> =>
      ipcRenderer.invoke('pipeline:revertPhase', bookSlug, phaseId),
  },

  // Build
  build: {
    run: (bookSlug: string): Promise<BuildResult> =>
      ipcRenderer.invoke('build:run', bookSlug),
    isPandocAvailable: (): Promise<boolean> =>
      ipcRenderer.invoke('build:isPandocAvailable'),
    onProgress: (callback: (message: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, msg: string) => callback(msg);
      ipcRenderer.on('build:progress', handler);
      return () => ipcRenderer.removeListener('build:progress', handler);
    },
    exportZip: (bookSlug: string): Promise<string | null> =>
      ipcRenderer.invoke('build:exportZip', bookSlug),
  },

  // Catalog Export
  catalog: {
    exportZip: (): Promise<string | null> =>
      ipcRenderer.invoke('catalog:exportZip'),
  },

  // Shelved Pitches
  pitches: {
    list: (): Promise<ShelvedPitchMeta[]> => ipcRenderer.invoke('pitches:list'),
    read: (slug: string): Promise<ShelvedPitch> => ipcRenderer.invoke('pitches:read', slug),
    delete: (slug: string): Promise<void> => ipcRenderer.invoke('pitches:delete', slug),
    shelve: (bookSlug: string, logline?: string): Promise<ShelvedPitchMeta> =>
      ipcRenderer.invoke('pitches:shelve', bookSlug, logline),
    restore: (pitchSlug: string): Promise<BookMeta> =>
      ipcRenderer.invoke('pitches:restore', pitchSlug),
  },

  // Pitch Room
  pitchRoom: {
    listDrafts: (): Promise<PitchDraft[]> =>
      ipcRenderer.invoke('pitchRoom:listDrafts'),
    getDraft: (conversationId: string): Promise<PitchDraft | null> =>
      ipcRenderer.invoke('pitchRoom:getDraft', conversationId),
    readContent: (conversationId: string): Promise<string> =>
      ipcRenderer.invoke('pitchRoom:readContent', conversationId),
    promote: (conversationId: string): Promise<BookMeta> =>
      ipcRenderer.invoke('pitchRoom:promote', conversationId),
    shelve: (conversationId: string, logline?: string): Promise<ShelvedPitchMeta> =>
      ipcRenderer.invoke('pitchRoom:shelve', conversationId, logline),
    discard: (conversationId: string): Promise<void> =>
      ipcRenderer.invoke('pitchRoom:discard', conversationId),
  },

  // Verity Pipeline (audit/fix)
  verity: {
    auditChapter: (bookSlug: string, chapterSlug: string, opts?: { callId?: string; conversationId?: string }): Promise<AuditResult | null> =>
      ipcRenderer.invoke('verity:auditChapter', bookSlug, chapterSlug, opts?.callId, opts?.conversationId),
    fixChapter: (bookSlug: string, chapterSlug: string, conversationId: string, auditResult?: AuditResult, callId?: string): Promise<void> =>
      auditResult
        ? ipcRenderer.invoke('verity:fixChapterWithAudit', bookSlug, chapterSlug, conversationId, JSON.stringify(auditResult), callId)
        : ipcRenderer.invoke('verity:fixChapter', bookSlug, chapterSlug, conversationId, callId),
    runMotifAudit: (bookSlug: string, callId?: string): Promise<void> =>
      ipcRenderer.invoke('verity:runMotifAudit', bookSlug, callId),
  },

  // Hot Take
  hotTake: {
    start: (bookSlug: string): Promise<{ conversationId: string; callId: string }> =>
      ipcRenderer.invoke('hot-take:start', bookSlug),
  },

  // Ad Hoc Revision
  adhocRevision: {
    start: (bookSlug: string, description: string): Promise<{ conversationId: string; callId: string }> =>
      ipcRenderer.invoke('adhoc-revision:start', bookSlug, description),
  },

  // Usage
  usage: {
    summary: (bookSlug?: string): Promise<UsageSummary> =>
      ipcRenderer.invoke('usage:summary', bookSlug),
    byConversation: (conversationId: string): Promise<UsageRecord[]> =>
      ipcRenderer.invoke('usage:byConversation', conversationId),
  },

  // Revision Queue
  revision: {
    loadPlan: (bookSlug: string): Promise<RevisionPlan> =>
      ipcRenderer.invoke('revision:loadPlan', bookSlug),
    clearCache: (bookSlug: string): Promise<void> =>
      ipcRenderer.invoke('revision:clearCache', bookSlug),
    runSession: (planId: string, sessionId: string): Promise<void> =>
      ipcRenderer.invoke('revision:runSession', planId, sessionId),
    runAll: (planId: string, selectedSessionIds?: string[]): Promise<void> =>
      ipcRenderer.invoke('revision:runAll', planId, selectedSessionIds),
    respondToGate: (planId: string, sessionId: string, action: ApprovalAction, message?: string): Promise<void> =>
      ipcRenderer.invoke('revision:respondToGate', planId, sessionId, action, message),
    approveSession: (planId: string, sessionId: string): Promise<void> =>
      ipcRenderer.invoke('revision:approveSession', planId, sessionId),
    rejectSession: (planId: string, sessionId: string): Promise<void> =>
      ipcRenderer.invoke('revision:rejectSession', planId, sessionId),
    skipSession: (planId: string, sessionId: string): Promise<void> =>
      ipcRenderer.invoke('revision:skipSession', planId, sessionId),
    pause: (planId: string): Promise<void> =>
      ipcRenderer.invoke('revision:pause', planId),
    setMode: (planId: string, mode: QueueMode): Promise<void> =>
      ipcRenderer.invoke('revision:setMode', planId, mode),
    getPlan: (planId: string): Promise<RevisionPlan | null> =>
      ipcRenderer.invoke('revision:getPlan', planId),
    getQueueStatus: (bookSlug: string): Promise<QueueStatus> =>
      ipcRenderer.invoke('revision:getQueueStatus', bookSlug),
    startVerification: (planId: string): Promise<string> =>
      ipcRenderer.invoke('revision:startVerification', planId),
    onEvent: (callback: (event: RevisionQueueEvent) => void) => {
      const handler = (_: Electron.IpcRendererEvent, event: RevisionQueueEvent) => callback(event);
      ipcRenderer.on('revision:event', handler);
      return () => { ipcRenderer.removeListener('revision:event', handler); };
    },
  },

  // Motif Ledger
  motifLedger: {
    load: (bookSlug: string): Promise<MotifLedger> =>
      ipcRenderer.invoke('motifLedger:load', bookSlug),
    save: (bookSlug: string, ledger: MotifLedger): Promise<void> =>
      ipcRenderer.invoke('motifLedger:save', bookSlug, ledger),
    getUnauditedChapters: (bookSlug: string): Promise<string[]> =>
      ipcRenderer.invoke('motifLedger:getUnauditedChapters', bookSlug),
    onNormalizing: (callback: (status: 'started' | 'done' | 'error', error?: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, status: 'started' | 'done' | 'error', error?: string) =>
        callback(status, error);
      ipcRenderer.on('motifLedger:normalizing', handler);
      return () => ipcRenderer.removeListener('motifLedger:normalizing', handler);
    },
  },

  // Context Diagnostics
  context: {
    getLastDiagnostics: (conversationId?: string): Promise<ContextDiagnostics | null> =>
      ipcRenderer.invoke('context:getLastDiagnostics', conversationId),
  },

  // Shell (external links, file opening)
  shell: {
    openPath: (absolutePath: string): Promise<string> =>
      ipcRenderer.invoke('shell:openPath', absolutePath),
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke('shell:openExternal', url),
  },

  // Window controls (custom title bar on Windows/Linux)
  window: {
    minimize: (): void => ipcRenderer.send('window:minimize'),
    maximize: (): void => ipcRenderer.send('window:maximize'),
    close: (): void => ipcRenderer.send('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChange: (callback: (isMaximized: boolean) => void) => {
      const onMaximize = () => callback(true);
      const onUnmaximize = () => callback(false);
      ipcRenderer.on('window:maximized', onMaximize);
      ipcRenderer.on('window:unmaximized', onUnmaximize);
      return () => {
        ipcRenderer.removeListener('window:maximized', onMaximize);
        ipcRenderer.removeListener('window:unmaximized', onUnmaximize);
      };
    },
  },

  // Models (from all enabled providers via registry)
  models: {
    getAvailable: (): Promise<ModelInfo[]> =>
      ipcRenderer.invoke('settings:getAvailableModels'),
  },

  // Providers
  providers: {
    list: (): Promise<ProviderConfig[]> => ipcRenderer.invoke('providers:list'),
    getConfig: (providerId: ProviderId): Promise<ProviderConfig | null> =>
      ipcRenderer.invoke('providers:getConfig', providerId),
    add: (config: ProviderConfig): Promise<void> => ipcRenderer.invoke('providers:add', config),
    update: (providerId: ProviderId, partial: Partial<ProviderConfig>): Promise<void> =>
      ipcRenderer.invoke('providers:update', providerId, partial),
    remove: (providerId: ProviderId): Promise<void> => ipcRenderer.invoke('providers:remove', providerId),
    checkStatus: (providerId: ProviderId): Promise<ProviderStatus> =>
      ipcRenderer.invoke('providers:checkStatus', providerId),
    setDefault: (providerId: ProviderId): Promise<void> =>
      ipcRenderer.invoke('providers:setDefault', providerId),
  },

  // Series
  series: {
    list: (): Promise<SeriesSummary[]> => ipcRenderer.invoke('series:list'),
    get: (slug: string): Promise<SeriesMeta | null> => ipcRenderer.invoke('series:get', slug),
    create: (name: string, description?: string): Promise<SeriesMeta> =>
      ipcRenderer.invoke('series:create', name, description),
    update: (slug: string, partial: Partial<Pick<SeriesMeta, 'name' | 'description'>>): Promise<SeriesMeta> =>
      ipcRenderer.invoke('series:update', slug, partial),
    delete: (slug: string): Promise<void> => ipcRenderer.invoke('series:delete', slug),
    addVolume: (seriesSlug: string, bookSlug: string, volumeNumber?: number): Promise<SeriesMeta> =>
      ipcRenderer.invoke('series:addVolume', seriesSlug, bookSlug, volumeNumber),
    removeVolume: (seriesSlug: string, bookSlug: string): Promise<SeriesMeta> =>
      ipcRenderer.invoke('series:removeVolume', seriesSlug, bookSlug),
    reorderVolumes: (seriesSlug: string, orderedSlugs: string[]): Promise<SeriesMeta> =>
      ipcRenderer.invoke('series:reorderVolumes', seriesSlug, orderedSlugs),
    getForBook: (bookSlug: string): Promise<SeriesMeta | null> =>
      ipcRenderer.invoke('series:getForBook', bookSlug),
    readBible: (seriesSlug: string): Promise<string> =>
      ipcRenderer.invoke('series:readBible', seriesSlug),
    writeBible: (seriesSlug: string, content: string): Promise<void> =>
      ipcRenderer.invoke('series:writeBible', seriesSlug, content),
  },

  // Find & Replace
  findReplace: {
    preview: (
      bookSlug: string,
      searchTerm: string,
      options: FindReplaceOptions,
    ): Promise<FindReplacePreviewResult> =>
      ipcRenderer.invoke('findReplace:preview', bookSlug, searchTerm, options),

    apply: (params: {
      bookSlug: string;
      searchTerm: string;
      replacement: string;
      filePaths: string[];
      options: FindReplaceOptions;
    }): Promise<FindReplaceApplyResult> =>
      ipcRenderer.invoke('findReplace:apply', params),
  },

  // Dashboard
  dashboard: {
    getData: (bookSlug: string): Promise<BookDashboardData> =>
      ipcRenderer.invoke('dashboard:getData', bookSlug),
  },

  // Helper Agent
  helper: {
    getOrCreateConversation: (): Promise<Conversation> =>
      ipcRenderer.invoke('helper:getOrCreateConversation'),
    getMessages: (conversationId: string): Promise<Message[]> =>
      ipcRenderer.invoke('helper:getMessages', conversationId),
    send: (params: { message: string; conversationId: string; callId?: string }): Promise<void> =>
      ipcRenderer.invoke('helper:send', params),
    abort: (conversationId: string): Promise<void> =>
      ipcRenderer.invoke('helper:abort', conversationId),
    reset: (): Promise<void> =>
      ipcRenderer.invoke('helper:reset'),
  },
};

contextBridge.exposeInMainWorld('novelEngine', api);

type NovelEngineAPI = typeof api;

declare global {
  interface Window {
    novelEngine: NovelEngineAPI;
  }
}
