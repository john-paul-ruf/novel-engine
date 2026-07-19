import { vi, type Mock } from 'vitest';
import type {
  ActiveStreamInfo,
  AgentMeta,
  AppSettings,
  BookMeta,
  BookSummary,
  Conversation,
  Message,
  UsageRecord,
} from '@domain/types';

/**
 * Typed mock factory for the `window.novelEngine` preload bridge.
 *
 * `installNovelEngineMock()` replaces the placeholder installed by
 * `setup.renderer.ts` with a fully-typed mock where every method is a
 * `vi.fn()`. Methods with an obvious empty value resolve to it ([], null,
 * '', false, 0, undefined); methods returning complex domain objects reject
 * with a descriptive error until a test overrides them.
 *
 * Push channels (`on*` subscriptions) register callbacks in an internal
 * registry — use `mock.emit(channel, ...args)` to deliver events to
 * subscribers, and `mock.listenerCount(channel)` to assert cleanup.
 */

type NovelEngineApi = Window['novelEngine'];

/** Push channels exposed by the bridge, one per `on*` subscription method. */
export type BridgeChannel =
  | 'books:changed'
  | 'import:generationProgress'
  | 'chat:streamEvent'
  | 'chat:filesChanged'
  | 'build:progress'
  | 'revision:event'
  | 'motifLedger:normalizing'
  | 'window:maximizeChange'
  | 'query:onStream';

type MockedMethods<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R ? Mock<(...args: A) => R> : T[K];
};

export type MockedBridge = { [N in keyof NovelEngineApi]: MockedMethods<NovelEngineApi[N]> };

export type BridgeOverrides = { [N in keyof NovelEngineApi]?: Partial<NovelEngineApi[N]> };

export type NovelEngineMock = MockedBridge & {
  /** Deliver a push event to every subscriber registered on the channel. */
  emit: (channel: BridgeChannel, ...args: unknown[]) => void;
  /** Number of live subscribers on a channel — for asserting unsubscribe. */
  listenerCount: (channel: BridgeChannel) => number;
};

// ── Fixture factories ────────────────────────────────────────────────────────

const ISO = '2026-01-01T00:00:00.000Z';

export function makeAppSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    hasClaudeCli: true,
    hasOllamaCli: false,
    hasCodexCli: false,
    model: 'test-model',
    secondaryModel: 'test-secondary-model',
    maxTokens: 32000,
    enableThinking: true,
    thinkingBudget: 10000,
    overrideThinkingBudget: false,
    autoCollapseThinking: false,
    enableNotifications: false,
    theme: 'system',
    initialized: true,
    authorName: 'Test Author',
    providers: [],
    activeProviderId: 'claude-cli',
    completedTours: [],
    savedPrompts: [],
    ...overrides,
  };
}

export function makeBookMeta(overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    slug: 'test-book',
    title: 'Test Book',
    author: 'Test Author',
    status: 'first-draft',
    created: ISO,
    coverImage: '',
    ...overrides,
  };
}

export function makeBookSummary(overrides: Partial<BookSummary> = {}): BookSummary {
  return { ...makeBookMeta(), wordCount: 0, isActive: false, ...overrides };
}

export function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv-1',
    bookSlug: 'test-book',
    agentName: 'Spark',
    pipelinePhase: null,
    purpose: 'pipeline',
    title: 'Test Conversation',
    createdAt: ISO,
    updatedAt: ISO,
    ...overrides,
  };
}

export function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    conversationId: 'conv-1',
    role: 'assistant',
    content: 'Hello.',
    thinking: '',
    timestamp: ISO,
    ...overrides,
  };
}

export function makeAgentMeta(overrides: Partial<AgentMeta> = {}): AgentMeta {
  return {
    name: 'Spark',
    filename: 'SPARK.md',
    role: 'Pitch & Scaffold',
    color: '#ffffff',
    thinkingBudget: 4000,
    maxTurns: 10,
    ...overrides,
  };
}

export function makeActiveStreamInfo(overrides: Partial<ActiveStreamInfo> = {}): ActiveStreamInfo {
  return {
    conversationId: 'conv-1',
    agentName: 'Spark',
    model: 'test-model',
    bookSlug: 'test-book',
    startedAt: ISO,
    sessionId: 'session-1',
    callId: 'call-1',
    progressStage: 'drafting',
    filesTouched: {},
    thinkingBuffer: '',
    textBuffer: '',
    ...overrides,
  };
}

export function makeUsageRecord(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    conversationId: 'conv-1',
    inputTokens: 100,
    outputTokens: 200,
    thinkingTokens: 0,
    model: 'test-model',
    timestamp: ISO,
    ...overrides,
  };
}

// ── Mock factory ─────────────────────────────────────────────────────────────

function notStubbed(name: string): () => Promise<never> {
  return vi.fn(async () => {
    throw new Error(
      `novelEngineMock: ${name} has no sensible empty default — pass an override or use mockResolvedValue`,
    );
  });
}

export function installNovelEngineMock(overrides: BridgeOverrides = {}): NovelEngineMock {
  const listeners = new Map<BridgeChannel, Set<(...args: unknown[]) => void>>();

  // Some preload cleanups return the chained IpcRenderer, others void — this
  // return type satisfies both (`() => IpcRenderer` is assignable to `() => void`).
  function subscribe(
    channel: BridgeChannel,
    callback: (...args: never[]) => void,
  ): () => Electron.IpcRenderer {
    let set = listeners.get(channel);
    if (!set) {
      set = new Set();
      listeners.set(channel, set);
    }
    const cb = callback as (...args: unknown[]) => void;
    set.add(cb);
    return () => {
      set.delete(cb);
      return undefined as unknown as Electron.IpcRenderer;
    };
  }

  function emit(channel: BridgeChannel, ...args: unknown[]): void {
    for (const cb of [...(listeners.get(channel) ?? [])]) {
      cb(...args);
    }
  }

  function listenerCount(channel: BridgeChannel): number {
    return listeners.get(channel)?.size ?? 0;
  }

  const api: NovelEngineApi = {
    settings: {
      load: vi.fn(async () => makeAppSettings()),
      detectClaudeCli: vi.fn(async () => false),
      detectCodexCli: vi.fn(async () => false),
      detectOllamaCli: vi.fn(async () => false),
      update: vi.fn(async () => undefined),
      saveAuthorProfile: vi.fn(async () => undefined),
      loadAuthorProfile: vi.fn(async () => ''),
    },
    agents: {
      list: vi.fn(async () => []),
      get: vi.fn(async () => makeAgentMeta()),
    },
    books: {
      list: vi.fn(async () => []),
      getActiveSlug: vi.fn(async () => ''),
      setActive: vi.fn(async () => undefined),
      create: vi.fn(async () => makeBookMeta()),
      getMeta: vi.fn(async () => makeBookMeta()),
      updateMeta: vi.fn(async () => makeBookMeta()),
      wordCount: vi.fn(async () => []),
      uploadCover: vi.fn(async () => null),
      getCoverImagePath: vi.fn(async () => null),
      getAbsolutePath: vi.fn(async () => ''),
      archive: vi.fn(async () => undefined),
      unarchive: vi.fn(async () => makeBookMeta()),
      listArchived: vi.fn(async () => []),
      assembleManuscript: notStubbed('books.assembleManuscript'),
      onChanged: vi.fn((callback: () => void) => subscribe('books:changed', callback)),
    },
    import: {
      selectFile: vi.fn(async () => null),
      preview: notStubbed('import.preview'),
      commit: notStubbed('import.commit'),
      generateSources: vi.fn(async () => undefined),
      onGenerationProgress: vi.fn((callback: (event: never) => void) =>
        subscribe('import:generationProgress', callback),
      ),
    },
    seriesImport: {
      selectFiles: vi.fn(async () => null),
      preview: notStubbed('seriesImport.preview'),
      commit: notStubbed('seriesImport.commit'),
    },
    files: {
      read: vi.fn(async () => ''),
      write: vi.fn(async () => undefined),
      exists: vi.fn(async () => false),
      listDir: vi.fn(async () => []),
      delete: vi.fn(async () => undefined),
    },
    versions: {
      getHistory: vi.fn(async () => []),
      getVersion: vi.fn(async () => null),
      getDiff: notStubbed('versions.getDiff'),
      revert: notStubbed('versions.revert'),
      getCount: vi.fn(async () => 0),
      snapshot: vi.fn(async () => null),
      getUserEdits: vi.fn(async () => null),
      getChapterEditStatuses: vi.fn(async () => []),
    },
    chat: {
      createConversation: vi.fn(async () => makeConversation()),
      getConversations: vi.fn(async () => []),
      getMessages: vi.fn(async () => []),
      deleteConversation: vi.fn(async () => undefined),
      send: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
      isCliIdle: vi.fn(async () => true),
      getActiveStream: vi.fn(async () => null),
      getActiveStreamForBook: vi.fn(async () => null),
      getOrphanedSessions: vi.fn(async () => []),
      deepDive: vi.fn(async () => ({ conversationId: '' })),
      onStreamEvent: vi.fn((callback: (event: never) => void) =>
        subscribe('chat:streamEvent', callback),
      ),
      onFilesChanged: vi.fn((callback: (paths: string[], bookSlug?: string) => void) =>
        subscribe('chat:filesChanged', callback),
      ),
    },
    pipeline: {
      detect: vi.fn(async () => []),
      getActive: vi.fn(async () => null),
      markPhaseComplete: vi.fn(async () => undefined),
      completeRevision: vi.fn(async () => undefined),
      confirmAdvancement: vi.fn(async () => undefined),
      revertPhase: vi.fn(async () => undefined),
    },
    build: {
      run: notStubbed('build.run'),
      isPandocAvailable: vi.fn(async () => false),
      onProgress: vi.fn((callback: (message: string) => void) =>
        subscribe('build:progress', callback),
      ),
      exportZip: vi.fn(async () => null),
    },
    catalog: {
      exportZip: vi.fn(async () => null),
    },
    pitches: {
      list: vi.fn(async () => []),
      read: notStubbed('pitches.read'),
      delete: vi.fn(async () => undefined),
      shelve: notStubbed('pitches.shelve'),
      restore: vi.fn(async () => makeBookMeta()),
    },
    pitchRoom: {
      listDrafts: vi.fn(async () => []),
      getDraft: vi.fn(async () => null),
      readContent: vi.fn(async () => ''),
      promote: vi.fn(async () => makeBookMeta()),
      shelve: notStubbed('pitchRoom.shelve'),
      discard: vi.fn(async () => undefined),
    },
    verity: {
      auditChapter: vi.fn(async () => null),
      fixChapter: vi.fn(async () => undefined),
      runMotifAudit: vi.fn(async () => undefined),
    },
    hotTake: {
      start: vi.fn(async () => ({ conversationId: '', callId: '' })),
    },
    adhocRevision: {
      start: vi.fn(async () => ({ conversationId: '', callId: '' })),
    },
    usage: {
      summary: vi.fn(async () => ({
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalThinkingTokens: 0,
        conversationCount: 0,
      })),
      byConversation: vi.fn(async () => []),
    },
    revision: {
      loadPlan: notStubbed('revision.loadPlan'),
      clearCache: vi.fn(async () => undefined),
      runSession: vi.fn(async () => undefined),
      runAll: vi.fn(async () => undefined),
      respondToGate: vi.fn(async () => undefined),
      approveSession: vi.fn(async () => undefined),
      rejectSession: vi.fn(async () => undefined),
      skipSession: vi.fn(async () => undefined),
      pause: vi.fn(async () => undefined),
      setMode: vi.fn(async () => undefined),
      getPlan: vi.fn(async () => null),
      getQueueStatus: notStubbed('revision.getQueueStatus'),
      startVerification: vi.fn(async () => ''),
      onEvent: vi.fn((callback: (event: never) => void) => subscribe('revision:event', callback)),
    },
    motifLedger: {
      load: notStubbed('motifLedger.load'),
      save: vi.fn(async () => undefined),
      getUnauditedChapters: vi.fn(async () => []),
      onNormalizing: vi.fn(
        (callback: (status: 'started' | 'done' | 'error', error?: string) => void) =>
          subscribe('motifLedger:normalizing', callback),
      ),
    },
    context: {
      getLastDiagnostics: vi.fn(async () => null),
    },
    shell: {
      openPath: vi.fn(async () => ''),
      openExternal: vi.fn(async () => undefined),
    },
    window: {
      minimize: vi.fn(() => undefined),
      maximize: vi.fn(() => undefined),
      close: vi.fn(() => undefined),
      isMaximized: vi.fn(async () => false),
      onMaximizeChange: vi.fn((callback: (isMaximized: boolean) => void) =>
        subscribe('window:maximizeChange', callback),
      ),
    },
    models: {
      getAvailable: vi.fn(async () => []),
    },
    providers: {
      list: vi.fn(async () => []),
      getConfig: vi.fn(async () => null),
      add: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
      checkStatus: notStubbed('providers.checkStatus'),
      setDefault: vi.fn(async () => undefined),
    },
    series: {
      list: vi.fn(async () => []),
      get: vi.fn(async () => null),
      create: notStubbed('series.create'),
      update: notStubbed('series.update'),
      delete: vi.fn(async () => undefined),
      addVolume: notStubbed('series.addVolume'),
      removeVolume: notStubbed('series.removeVolume'),
      reorderVolumes: notStubbed('series.reorderVolumes'),
      getForBook: vi.fn(async () => null),
      readBible: vi.fn(async () => ''),
      writeBible: vi.fn(async () => undefined),
    },
    findReplace: {
      preview: notStubbed('findReplace.preview'),
      apply: notStubbed('findReplace.apply'),
    },
    dashboard: {
      getData: notStubbed('dashboard.getData'),
    },
    statistics: {
      get: notStubbed('statistics.get'),
      recordSnapshot: vi.fn(async () => undefined),
    },
    helper: {
      getOrCreateConversation: vi.fn(async () => makeConversation()),
      getMessages: vi.fn(async () => []),
      send: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
      reset: vi.fn(async () => undefined),
    },
    query: {
      loadTracker: notStubbed('query.loadTracker'),
      saveTracker: vi.fn(async () => undefined),
      addTarget: notStubbed('query.addTarget'),
      updateTargetStatus: vi.fn(async () => undefined),
      removeTarget: vi.fn(async () => undefined),
      generateLetter: notStubbed('query.generateLetter'),
      listLetters: vi.fn(async () => []),
      readLetter: vi.fn(async () => ''),
      saveLetter: vi.fn(async () => undefined),
      researchTargets: notStubbed('query.researchTargets'),
      fillTargetField: notStubbed('query.fillTargetField'),
      onStream: vi.fn((callback: (event: never) => void) => subscribe('query:onStream', callback)),
    },
  };

  for (const key of Object.keys(overrides) as Array<keyof NovelEngineApi>) {
    Object.assign(api[key], overrides[key]);
  }

  window.novelEngine = api;

  return Object.assign(api as unknown as MockedBridge, { emit, listenerCount });
}
