import { contextBridge, ipcRenderer } from 'electron';
import type {
  ActiveStreamInfo,
  AgentMeta,
  AgentName,
  AppSettings,
  ApprovalAction,
  BookMeta,
  BookSummary,
  BuildResult,
  ContextDiagnostics,
  Conversation,
  ConversationPurpose,
  FileEntry,
  Message,
  PipelinePhase,
  PipelinePhaseId,
  QueueMode,
  RevisionPlan,
  RevisionQueueEvent,
  SendMessageParams,
  ShelvedPitch,
  ShelvedPitchMeta,
  StreamEvent,
  UsageRecord,
  UsageSummary,
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
    getActiveStream: (): Promise<ActiveStreamInfo | null> =>
      ipcRenderer.invoke('chat:getActiveStream'),
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
    completeQueue: (planId: string): Promise<void> =>
      ipcRenderer.invoke('revision:completeQueue', planId),
    onEvent: (callback: (event: RevisionQueueEvent) => void) => {
      const handler = (_: Electron.IpcRendererEvent, event: RevisionQueueEvent) => callback(event);
      ipcRenderer.on('revision:event', handler);
      return () => { ipcRenderer.removeListener('revision:event', handler); };
    },
  },

  // Context Diagnostics
  context: {
    getLastDiagnostics: (): Promise<ContextDiagnostics | null> =>
      ipcRenderer.invoke('context:getLastDiagnostics'),
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

  // Models (static data from domain, exposed to renderer via IPC)
  models: {
    getAvailable: (): Promise<{ id: string; label: string; description: string }[]> =>
      ipcRenderer.invoke('settings:getAvailableModels'),
  },
};

contextBridge.exposeInMainWorld('novelEngine', api);

type NovelEngineAPI = typeof api;

declare global {
  interface Window {
    novelEngine: NovelEngineAPI;
  }
}
