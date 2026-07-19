/**
 * Hand-rolled typed fakes for application-layer tests (Phase D, S13–S20).
 *
 * Application services depend only on injected domain interfaces, so these
 * fakes satisfy the `I*` contracts with in-memory state — no module mocking.
 * Partial fakes are cast through `unknown` and expose only the surface the
 * services under test actually call; grow them as later sessions need more.
 *
 * For IDatabaseService, prefer the REAL service on `:memory:` via
 * `makeDb()` from `src/test/db.ts` (Design Decision #3).
 */
import { vi } from 'vitest';
import type {
  IAdhocRevisionService,
  IAgentService,
  IChapterValidator,
  IFileSystemService,
  IHotTakeService,
  IModelProvider,
  IPitchRoomService,
  IProviderRegistry,
  ISeriesService,
  ISettingsService,
  IUsageService,
  IVersionService,
} from '@domain/interfaces';
import type {
  Agent,
  AgentName,
  AppSettings,
  ModelInfo,
  ProjectManifest,
  StreamEvent,
} from '@domain/types';
import { AGENT_REGISTRY, DEFAULT_SETTINGS } from '@domain/constants';

// ── Settings ─────────────────────────────────────────────────────────

export type FakeSettings = ISettingsService & { current: AppSettings };

export function makeFakeSettings(overrides: Partial<AppSettings> = {}): FakeSettings {
  const state = { current: { ...DEFAULT_SETTINGS, ...overrides } };
  return {
    get current() {
      return state.current;
    },
    load: async () => state.current,
    update: async (partial: Partial<AppSettings>) => {
      state.current = { ...state.current, ...partial };
    },
    detectClaudeCli: async () => true,
    detectCodexCli: async () => false,
    detectOllamaCli: async () => false,
  };
}

// ── Agents ───────────────────────────────────────────────────────────

/**
 * Agent fake backed by AGENT_REGISTRY metadata. `prompts` overrides file
 * contents by filename (system prompts, loadRaw targets).
 */
export function makeFakeAgents(prompts: Record<string, string> = {}): IAgentService {
  const agentFor = (name: AgentName): Agent => {
    const meta = AGENT_REGISTRY[name];
    return {
      name,
      ...meta,
      systemPrompt: prompts[meta.filename] ?? `${name} system prompt`,
    };
  };
  return {
    loadAll: async () => (Object.keys(AGENT_REGISTRY) as AgentName[]).map(agentFor),
    load: async (name: AgentName) => agentFor(name),
    loadComposite: async (base: string, supplements: string[]) =>
      [prompts[base] ?? `[${base}]`, ...supplements.map((s) => prompts[s] ?? `[${s}]`)].join('\n\n---\n\n'),
    loadRaw: async (filename: string) => prompts[filename] ?? `[raw:${filename}]`,
  };
}

// ── Scripted model provider ──────────────────────────────────────────

export type ProviderSendParams = Parameters<IModelProvider['sendMessage']>[0];

export type ScriptedProvider = IModelProvider & {
  /** Every sendMessage params object, in call order. */
  calls: ProviderSendParams[];
  /** Queue one event script per upcoming sendMessage call. */
  scriptNext: (events: StreamEvent[]) => void;
  /** Replace sendMessage behavior entirely (e.g. hang, reject). */
  setImpl: (impl: (params: ProviderSendParams) => Promise<void>) => void;
};

/**
 * Provider whose sendMessage replays scripted StreamEvents synchronously.
 * Default script when the queue is empty: a single zero-usage `done`.
 */
export function makeScriptedProvider(opts: { providerId?: string; capabilities?: IModelProvider['capabilities'] } = {}): ScriptedProvider {
  const calls: ProviderSendParams[] = [];
  const queue: StreamEvent[][] = [];
  let impl: ((params: ProviderSendParams) => Promise<void>) | null = null;

  return {
    providerId: opts.providerId ?? 'fake-provider',
    capabilities: opts.capabilities ?? ['text-completion', 'streaming', 'tool-use'],
    calls,
    scriptNext: (events: StreamEvent[]) => {
      queue.push(events);
    },
    setImpl: (custom) => {
      impl = custom;
    },
    isAvailable: async () => true,
    invalidateAvailabilityCache: vi.fn(),
    abortStream: vi.fn(),
    hasActiveProcesses: () => false,
    hasActiveProcessesForBook: () => false,
    sendMessage: async (params: ProviderSendParams) => {
      calls.push(params);
      if (impl) return impl(params);
      const events = queue.shift() ?? [
        { type: 'done', inputTokens: 0, outputTokens: 0, thinkingTokens: 0, filesTouched: {} },
      ];
      for (const event of events) params.onEvent(event);
    },
  } as ScriptedProvider;
}

// ── Provider registry ────────────────────────────────────────────────

export function makeModelInfo(id: string, providerId = 'fake-provider'): ModelInfo {
  return { id, label: id, description: id, providerId, supportsThinking: true, supportsToolUse: true };
}

/**
 * Minimal registry routing everything to one provider. Requests for a model
 * not in `models` fall back to `defaultModel` with didFallback=true.
 */
export function makeFakeRegistry(
  provider: IModelProvider,
  opts: { models?: ModelInfo[]; defaultModel?: string } = {}
): IProviderRegistry {
  const models = opts.models ?? [makeModelInfo(DEFAULT_SETTINGS.model, provider.providerId)];
  const defaultModel = opts.defaultModel ?? models[0].id;

  return {
    registerProvider: vi.fn(),
    removeProvider: vi.fn(),
    getProvider: (id: string) => (id === provider.providerId ? provider : null),
    getDefaultProvider: () => provider,
    getProviderForModel: (modelId: string) =>
      models.some((m) => m.id === modelId) ? provider : null,
    resolveModelSelection: (requestedModel: string) =>
      models.some((m) => m.id === requestedModel)
        ? {
            requestedModel,
            model: requestedModel,
            providerId: provider.providerId,
            didFallback: false,
            reason: 'requested-model-available',
          }
        : {
            requestedModel,
            model: defaultModel,
            providerId: provider.providerId,
            didFallback: true,
            reason: 'active-provider-default',
          },
    listProviders: () => [],
    listAllModels: () => models,
    checkProviderStatus: async () => 'available',
    getProviderConfig: () => null,
    updateProviderConfig: vi.fn(),
    setDefaultProvider: vi.fn(),
    sendMessage: (params: ProviderSendParams) => provider.sendMessage(params),
    abortStream: (conversationId: string) => provider.abortStream(conversationId),
    hasActiveProcesses: () => provider.hasActiveProcesses(),
    hasActiveProcessesForBook: (slug: string) => provider.hasActiveProcessesForBook(slug),
  } as unknown as IProviderRegistry;
}

// ── Filesystem ───────────────────────────────────────────────────────

export type FakeFileSystem = IFileSystemService & {
  /** `${bookSlug}/${relativePath}` → content */
  files: Map<string, string>;
  /** Every writeFile call, in order. */
  writes: { bookSlug: string; path: string; content: string }[];
  /** Mutable book meta returned by getBookMeta. */
  meta: { slug: string; title: string; author: string; status: string; created: string; coverImage: string };
  /** Absolute cover path returned by getCoverImageAbsolutePath (default null). */
  coverPath: string | null;
  /** Active book slug returned by getActiveBookSlug (default ''). */
  activeBookSlug: string;
};

/**
 * In-memory filesystem fake covering the surface application services use:
 * read/write/exists + manifest assembly from the seeded files.
 */
export function makeFakeFs(
  initialFiles: Record<string, string> = {},
  opts: { bookSlug?: string; title?: string } = {}
): FakeFileSystem {
  const bookSlug = opts.bookSlug ?? 'test-book';
  const files = new Map<string, string>(
    Object.entries(initialFiles).map(([p, c]) => [`${bookSlug}/${p}`, c])
  );
  const writes: { bookSlug: string; path: string; content: string }[] = [];
  const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

  /** Mirror FileSystemService.chapterSortKey: 00-N front matter → body → zN back matter. */
  const chapterSortKey = (name: string): number => {
    if (name.toLowerCase().startsWith('z')) {
      const n = parseInt(name.slice(1), 10);
      return 10_000 + (isNaN(n) ? 0 : n);
    }
    const fm = name.match(/^00-(\d+)-/);
    if (fm) return parseInt(fm[1], 10) * 0.01;
    const n = parseInt(name, 10);
    return isNaN(n) ? 5000 : n;
  };

  const meta = {
    slug: bookSlug,
    title: opts.title ?? 'Test Book',
    author: 'Test Author',
    status: 'first-draft',
    created: '2026-01-01T00:00:00.000Z',
    coverImage: '',
  };

  const fake = {
    files,
    writes,
    meta,
    coverPath: null as string | null,
    activeBookSlug: '',
    getBooksPath: () => '/fake/books',
    getActiveBookSlug: async () => fake.activeBookSlug,
    setActiveBook: async (slug: string) => {
      fake.activeBookSlug = slug;
    },
    getAuthorProfilePath: () => '/fake/userdata/author-profile.md',
    readFile: async (slug: string, path: string) => {
      const content = files.get(`${slug}/${path}`);
      if (content === undefined) throw new Error(`File not found: ${path} in book "${slug}"`);
      return content;
    },
    writeFile: async (slug: string, path: string, content: string) => {
      files.set(`${slug}/${path}`, content);
      writes.push({ bookSlug: slug, path, content });
    },
    fileExists: async (slug: string, path: string) => files.has(`${slug}/${path}`),
    deleteFile: async (slug: string, path: string) => {
      files.delete(`${slug}/${path}`);
    },
    deletePath: async (slug: string, path: string) => {
      const prefix = `${slug}/${path}`;
      for (const key of [...files.keys()]) {
        if (key === prefix || key.startsWith(`${prefix}/`)) files.delete(key);
      }
    },
    listDirectory: async (slug: string, relativePath?: string) => {
      const prefix = `${slug}/${relativePath ? `${relativePath}/` : ''}`;
      const names = new Set<string>();
      for (const key of files.keys()) {
        if (key.startsWith(prefix)) names.add(key.slice(prefix.length).split('/')[0]);
      }
      return [...names].sort().map((name) => ({
        name,
        path: relativePath ? `${relativePath}/${name}` : name,
        isDirectory: !files.has(`${prefix}${name}`),
      }));
    },
    createBook: async (title: string, author?: string) => {
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      Object.assign(meta, { slug, title, author: author ?? '', status: 'scaffolded' });
      return { ...meta };
    },
    getBookMeta: async () => ({ ...meta }),
    updateBookMeta: async (_slug: string, partial: Partial<typeof meta>) => {
      Object.assign(meta, partial);
      return { ...meta };
    },
    getCoverImageAbsolutePath: async () => fake.coverPath,
    countWordsPerChapter: async (slug: string) => {
      const chapters = [...files.entries()]
        .filter(([key]) => key.startsWith(`${slug}/chapters/`) && key.endsWith('/draft.md'))
        .map(([key, content]) => {
          const chapterSlug = key.slice(`${slug}/chapters/`.length).replace(/\/draft\.md$/, '');
          const isFrontMatter = /^00-\d+-/.test(chapterSlug);
          return { slug: chapterSlug, wordCount: isFrontMatter ? 0 : wordCount(content) };
        });
      return chapters.sort((a, b) => chapterSortKey(a.slug) - chapterSortKey(b.slug));
    },
    getProjectManifest: async (slug: string): Promise<ProjectManifest> => {
      const bookFiles = [...files.entries()]
        .filter(([key]) => key.startsWith(`${slug}/`))
        .map(([key, content]) => ({ path: key.slice(slug.length + 1), wordCount: wordCount(content) }));
      const drafts = bookFiles.filter((f) => f.path.startsWith('chapters/') && f.path.endsWith('/draft.md'));
      return {
        meta: {
          slug,
          title: opts.title ?? 'Test Book',
          author: 'Test Author',
          status: 'first-draft',
          created: '2026-01-01T00:00:00.000Z',
          coverImage: '',
        },
        files: bookFiles,
        chapterCount: drafts.length,
        totalWordCount: drafts.reduce((sum, f) => sum + f.wordCount, 0),
      };
    },
  };

  return fake as unknown as FakeFileSystem;
}

// ── Small collaborator fakes ─────────────────────────────────────────

export function makeUsageRecorder(): { usage: IUsageService; records: Parameters<IUsageService['recordUsage']>[0][] } {
  const records: Parameters<IUsageService['recordUsage']>[0][] = [];
  const usage = {
    recordUsage: (params: Parameters<IUsageService['recordUsage']>[0]) => {
      records.push(params);
    },
    getSummary: () => ({ totalInputTokens: 0, totalOutputTokens: 0, totalThinkingTokens: 0, conversationCount: 0 }),
    getByConversation: () => [],
  } as IUsageService;
  return { usage, records };
}

export function makeNoopChapterValidator(): IChapterValidator {
  return { validateAndCorrect: vi.fn(async () => []) };
}

type HandlerFake<T> = T & { handleMessage: ReturnType<typeof vi.fn> };

export function makeFakePitchRoom(): HandlerFake<IPitchRoomService> {
  return { handleMessage: vi.fn(async () => undefined) } as HandlerFake<IPitchRoomService>;
}

export function makeFakeHotTake(): HandlerFake<IHotTakeService> {
  return { handleMessage: vi.fn(async () => undefined) } as HandlerFake<IHotTakeService>;
}

export function makeFakeAdhocRevision(): HandlerFake<IAdhocRevisionService> {
  return { handleMessage: vi.fn(async () => undefined) } as HandlerFake<IAdhocRevisionService>;
}

export function makeFakeSeries(biblePath: string | null = null): ISeriesService {
  return { getSeriesBiblePath: vi.fn(async () => biblePath) } as unknown as ISeriesService;
}

export function makeFakeVersion(authorEdits: string | null = null): IVersionService {
  return { buildAuthorEditsSection: vi.fn(async () => authorEdits) } as unknown as IVersionService;
}
