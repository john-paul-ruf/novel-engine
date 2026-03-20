# Session 02 — Domain Layer

## Context

I'm building an Electron app called "Novel Engine" — a multi-agent AI writing tool that converts the `zencoder-based-novel-engine` GitHub repo into a standalone desktop app. Session 01 created the project scaffold. Now I need the **domain layer** — all the types, interfaces, and constants that every other layer depends on.

## Architecture Rule

**The domain layer has ZERO imports from any other module in this project, from Electron, from React, or from any infrastructure library.** It is pure TypeScript types and constants. Everything else in the app imports FROM domain. Domain imports from NOTHING.

## Task

Create three files in `src/domain/`:

### File 1: `src/domain/types.ts`

Define these types. Use `type` not `interface` for data shapes. Use `interface` only for service contracts (those go in interfaces.ts).

```typescript
// === Agent ===

type AgentName = 'Spark' | 'Verity' | 'Ghostlight' | 'Lumen' | 'Sable' | 'Forge' | 'Quill' | 'Wrangler';

// The 7 creative agents that the author interacts with
type CreativeAgentName = Exclude<AgentName, 'Wrangler'>;

type AgentMeta = {
  name: AgentName;
  filename: string;        // e.g. "SPARK.md"
  role: string;            // e.g. "Pitch & Scaffold"
  color: string;           // hex color for UI
  thinkingBudget: number;  // default extended thinking token budget
};

type Agent = AgentMeta & {
  systemPrompt: string;    // full markdown contents of the .md file
};

// === Book ===

type BookStatus = 'scaffolded' | 'outlining' | 'first-draft' | 'revision-1' | 'revision-2' | 'copy-edit' | 'final' | 'published';

type BookMeta = {
  slug: string;
  title: string;
  author: string;
  status: BookStatus;
  created: string;         // ISO date
  coverImage: string;      // relative path to cover image (e.g. "cover.jpg"), empty string if none
};

type BookSummary = BookMeta & {
  wordCount: number;
  isActive: boolean;
};

type ChapterData = {
  slug: string;            // e.g. "01-the-beginning"
  draft: string;           // contents of draft.md
  notes: string;           // contents of notes.md
};

type BookContext = {
  meta: BookMeta;
  authorProfile: string;
  pitch: string;
  voiceProfile: string;
  sceneOutline: string;
  storyBible: string;
  readerReport: string;
  devReport: string;
  auditReport: string;
  styleSheet: string;
  projectTasks: string;
  revisionPrompts: string;
  metadata: string;
  chapters: ChapterData[];
};

// === Pipeline ===

type PipelinePhaseId =
  | 'pitch' | 'scaffold' | 'first-draft' | 'first-read' | 'first-assessment'
  | 'revision-plan-1' | 'revision' | 'second-read' | 'second-assessment'
  | 'copy-edit' | 'revision-plan-2' | 'mechanical-fixes' | 'build' | 'publish';

type PhaseStatus = 'complete' | 'active' | 'locked';

type PipelinePhase = {
  id: PipelinePhaseId;
  label: string;
  agent: AgentName | null;   // null for 'build' phase
  status: PhaseStatus;
  description: string;
};

// === Chat / Conversation ===

type MessageRole = 'user' | 'assistant';

type Message = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  thinking: string;        // extended thinking content (empty if disabled)
  timestamp: string;       // ISO date
};

type ConversationPurpose = 'pipeline' | 'voice-setup' | 'author-profile';

type Conversation = {
  id: string;
  bookSlug: string;
  agentName: AgentName;
  pipelinePhase: PipelinePhaseId | null;
  purpose: ConversationPurpose;  // defaults to 'pipeline'
  title: string;           // derived from first user message
  createdAt: string;
  updatedAt: string;
};

// === Streaming ===

type StreamBlockType = 'thinking' | 'text';

type StreamEvent =
  | { type: 'blockStart'; blockType: StreamBlockType }
  | { type: 'thinkingDelta'; text: string }
  | { type: 'textDelta'; text: string }
  | { type: 'blockEnd'; blockType: StreamBlockType }
  | { type: 'done'; inputTokens: number; outputTokens: number; thinkingTokens: number }
  | { type: 'error'; message: string };

// === Settings ===

type AppSettings = {
  hasClaudeCli: boolean;   // true if `claude` CLI is detected and authenticated
  model: string;
  maxTokens: number;
  enableThinking: boolean;
  thinkingBudget: number;
  autoCollapseThinking: boolean;
  theme: 'light' | 'dark' | 'system';
  initialized: boolean;    // false until onboarding is complete
  authorName: string;      // display name for book covers
};

// === Token Usage ===

type UsageRecord = {
  conversationId: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  model: string;
  estimatedCost: number;
  timestamp: string;
};

type UsageSummary = {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalThinkingTokens: number;
  totalCost: number;
  conversationCount: number;
};

// === Build ===

type BuildFormat = 'md' | 'docx' | 'epub' | 'pdf';

type BuildResult = {
  success: boolean;
  formats: { format: BuildFormat; path: string; error?: string }[];
  wordCount: number;
};

// === File System ===

type FileEntry = {
  name: string;
  path: string;            // relative to book root
  isDirectory: boolean;
  children?: FileEntry[];
};

// === IPC ===
// These define the exact shape of data crossing the IPC bridge.
// The preload and handlers both conform to these.

type SendMessageParams = {
  agentName: AgentName;
  message: string;
  conversationId: string;
  bookSlug: string;
};

// === Context Wrangler ===
// The Wrangler is an AI-powered context planner that runs a cheap CLI call
// before every agent call to decide what context to load.

type WranglerInput = {
  agent: AgentName;
  userMessage: string;
  bookStatus: BookStatus;
  pipelinePhase: PipelinePhaseId | null;
  fileManifest: FileManifestEntry[];
  chapters: ChapterManifestEntry[];
  conversation: ConversationManifest;
  budget: ContextBudget;
};

type FileManifestEntry = {
  key: string;               // e.g. 'voiceProfile', 'sceneOutline'
  path: string;              // relative to book root
  tokens: number;            // 0 means file does not exist
};

type ChapterManifestEntry = {
  number: number;
  slug: string;
  draftTokens: number;
  notesTokens: number;
};

type ConversationManifest = {
  turnCount: number;
  totalTokens: number;
  recentTurns: number;       // count of recent turns
  recentTokens: number;
  oldTurns: number;
  oldTokens: number;
  hasThinkingBlocks: boolean;
};

type ContextBudget = {
  totalContextWindow: number;
  systemPromptTokens: number;
  thinkingBudget: number;
  responseBuffer: number;
  availableForContext: number;  // totalContextWindow - systemPromptTokens - thinkingBudget - responseBuffer
};

type ChapterStrategy = 'none' | 'sliding-window' | 'target-neighbors' | 'full-read';
type ConversationStrategy = 'keep-all' | 'summarize-old' | 'keep-recent-only';

type WranglerFileDirective = {
  key: string;
  path: string;
};

type WranglerSummarizeDirective = {
  key: string;
  path: string;
  targetTokens: number;
  focus: string;             // instructions for the summarization call
};

type WranglerExcludeDirective = {
  key: string;
  reason: string;
};

type WranglerChapterDirective = {
  number: number;
  slug: string;
  includeDraft: boolean;
  includeNotes: boolean;
};

type WranglerChapterExclude = {
  range: string;             // e.g. "1-4"
  reason: string;
};

type WranglerPlan = {
  files: {
    include: WranglerFileDirective[];
    summarize: WranglerSummarizeDirective[];
    exclude: WranglerExcludeDirective[];
  };
  chapters: {
    strategy: ChapterStrategy;
    include: WranglerChapterDirective[];
    exclude: WranglerChapterExclude[];
    batchRequired: boolean;
    batchInstructions?: string;
  };
  conversation: {
    strategy: ConversationStrategy;
    keepRecentTurns: number;
    dropThinkingOlderThan: number;
    summarizeOld: boolean;
    summaryFocus: string;    // instructions for the conversation summary call
  };
  reasoning: string;
  tokenEstimate: {
    files: number;
    chapters: number;
    conversation: number;
    total: number;
    budgetRemaining: number;
  };
};

// The assembled context after executing the wrangler plan
type AssembledContext = {
  projectContext: string;    // all project files + chapters, formatted and joined
  conversationMessages: { role: MessageRole; content: string }[];  // compacted conversation
  diagnostics: ContextDiagnostics;
};

type ContextDiagnostics = {
  totalTokensUsed: number;
  budgetRemaining: number;
  filesIncluded: string[];
  filesExcluded: string[];
  filesSummarized: string[];
  chapterStrategy: ChapterStrategy;
  chaptersIncluded: number[];
  chaptersExcluded: string;  // range description
  conversationStrategy: ConversationStrategy;
  conversationTurnsSent: number;
  conversationTurnsDropped: number;
  wranglerReasoning: string;
  wranglerCostTokens: number;  // tokens consumed by the wrangler call itself
};
```

Export every type.

### File 2: `src/domain/interfaces.ts`

Define service interfaces (ports). These are the contracts that infrastructure implements and application depends on.

```typescript
// Import only from ./types.ts

interface ISettingsService {
  load(): Promise<AppSettings>;
  detectClaudeCli(): Promise<boolean>;  // checks if `claude` CLI is installed and authenticated
  update(partial: Partial<AppSettings>): Promise<void>;
}

interface IAgentService {
  loadAll(): Promise<Agent[]>;
  load(name: AgentName): Promise<Agent>;
}

interface IDatabaseService {
  // Conversations
  createConversation(conv: Omit<Conversation, 'createdAt' | 'updatedAt'>): Conversation;
  getConversation(id: string): Conversation | null;
  listConversations(bookSlug: string): Conversation[];
  deleteConversation(id: string): void;

  // Messages
  saveMessage(msg: Omit<Message, 'id' | 'timestamp'>): Message;
  getMessages(conversationId: string): Message[];

  // Usage
  recordUsage(record: Omit<UsageRecord, 'timestamp'>): void;
  getUsageSummary(bookSlug?: string): UsageSummary;
  getUsageByConversation(conversationId: string): UsageRecord[];

  // Lifecycle
  close(): void;
}

interface IFileSystemService {
  // Books
  listBooks(): Promise<BookSummary[]>;
  getActiveBookSlug(): Promise<string>;
  setActiveBook(slug: string): Promise<void>;
  createBook(title: string, author?: string): Promise<BookMeta>;
  getBookMeta(slug: string): Promise<BookMeta>;
  updateBookMeta(slug: string, partial: Partial<BookMeta>): Promise<void>;

  // Book context (reads all source files)
  loadBookContext(slug: string): Promise<BookContext>;

  // File operations
  readFile(bookSlug: string, relativePath: string): Promise<string>;
  writeFile(bookSlug: string, relativePath: string, content: string): Promise<void>;
  renameFile(bookSlug: string, oldPath: string, newPath: string): Promise<void>;
  fileExists(bookSlug: string, relativePath: string): Promise<boolean>;
  listDirectory(bookSlug: string, relativePath?: string): Promise<FileEntry[]>;

  // Word count
  countWords(bookSlug: string): Promise<number>;
  countWordsPerChapter(bookSlug: string): Promise<{ slug: string; wordCount: number }[]>;

  // Cover image
  saveCoverImage(bookSlug: string, sourcePath: string): Promise<string>;  // copies image, returns relative path (e.g. "cover.jpg")
  getCoverImageAbsolutePath(bookSlug: string): Promise<string | null>;    // returns absolute path if cover exists, null otherwise
}

interface IClaudeClient {
  sendMessage(params: {
    model: string;
    systemPrompt: string;
    messages: { role: MessageRole; content: string }[];
    maxTokens: number;
    thinkingBudget?: number;
    onEvent: (event: StreamEvent) => void;
  }): Promise<void>;

  // One-shot JSON call for the Wrangler and summarization tasks.
  // Returns the raw text response (expected to be JSON).
  sendOneShot(params: {
    model: string;
    systemPrompt: string;
    userMessage: string;
    maxTokens: number;
  }): Promise<string>;

  isAvailable(): Promise<boolean>;  // checks if `claude` CLI is installed
}

interface IContextWrangler {
  // The main entry point. Called before every agent CLI call.
  // Runs a cheap Wrangler CLI call to plan context, then executes the plan.
  assemble(params: {
    agentName: AgentName;
    userMessage: string;
    conversationId: string;
    bookSlug: string;
  }): Promise<AssembledContext>;

  // Token estimation utility
  estimateTokens(text: string): number;
}

interface IPipelineService {
  detectPhases(bookSlug: string): Promise<PipelinePhase[]>;
  getActivePhase(bookSlug: string): Promise<PipelinePhase | null>;
  getAgentForPhase(phaseId: PipelinePhaseId): AgentName | null;
}

interface IBuildService {
  build(bookSlug: string, onProgress: (message: string) => void): Promise<BuildResult>;
  isPandocAvailable(): Promise<boolean>;
}
```

Export every interface.

### File 3: `src/domain/constants.ts`

```typescript
import type { AgentName, AgentMeta, CreativeAgentName, PipelinePhaseId, AppSettings } from './types';

// Agent metadata (everything except the systemPrompt, which comes from files)
// IMPORTANT: Filenames MUST match the actual files in the agents/ directory.
// The AgentService (Session 05) does case-insensitive matching, but the canonical
// filenames here should reflect the real files on disk.
// Actual files: SPARK.md, VERITY.md, GHOSTLIGHT.md, LUMEN.md, SABLE.md, FORGE.MD, Quill.md, WRANGLER.md
const AGENT_REGISTRY: Record<AgentName, Omit<AgentMeta, 'name'>> = {
  Spark:      { filename: 'SPARK.md',      role: 'Story Pitch',           color: '#F59E0B', thinkingBudget: 8000 },
  Verity:     { filename: 'VERITY.md',     role: 'Ghostwriter',           color: '#8B5CF6', thinkingBudget: 10000 },
  Ghostlight: { filename: 'GHOSTLIGHT.md', role: 'First Reader',          color: '#06B6D4', thinkingBudget: 6000 },
  Lumen:      { filename: 'LUMEN.md',      role: 'Developmental Editor',  color: '#10B981', thinkingBudget: 16000 },
  Sable:      { filename: 'SABLE.md',      role: 'Copy Editor',           color: '#EF4444', thinkingBudget: 4000 },
  Forge:      { filename: 'FORGE.MD',      role: 'Task Master',           color: '#F97316', thinkingBudget: 8000 },
  Quill:      { filename: 'Quill.md',      role: 'Publisher',             color: '#6366F1', thinkingBudget: 4000 },
  Wrangler:   { filename: 'WRANGLER.md',   role: 'Context Planner',       color: '#71717A', thinkingBudget: 0 },
};

// Creative agents only — excludes Wrangler (used for UI agent lists)
const CREATIVE_AGENT_NAMES: CreativeAgentName[] = ['Spark', 'Verity', 'Ghostlight', 'Lumen', 'Sable', 'Forge', 'Quill'];

// Pipeline phase definitions (order matters — it IS the pipeline)
const PIPELINE_PHASES: { id: PipelinePhaseId; label: string; agent: AgentName | null; description: string }[] = [
  { id: 'pitch',              label: 'Story Pitch',           agent: 'Spark',      description: 'Discover and pitch your story concept' },
  { id: 'scaffold',           label: 'Story Scaffold',        agent: 'Verity',     description: 'Build the scene outline and story bible from the pitch' },
  { id: 'first-draft',        label: 'First Draft',           agent: 'Verity',     description: 'Write the complete first draft chapter by chapter' },
  { id: 'first-read',         label: 'First Read',            agent: 'Ghostlight', description: 'Cold read for reader experience feedback' },
  { id: 'first-assessment',   label: 'Structural Assessment', agent: 'Lumen',      description: 'Diagnose structural strengths and weaknesses' },
  { id: 'revision-plan-1',    label: 'Revision Plan',         agent: 'Forge',      description: 'Synthesize feedback into a revision task list' },
  { id: 'revision',           label: 'Revision',              agent: 'Verity',     description: 'Implement structural changes' },
  { id: 'second-read',        label: 'Second Read',           agent: 'Ghostlight', description: 'Read the revised manuscript' },
  { id: 'second-assessment',  label: 'Second Assessment',     agent: 'Lumen',      description: 'Verify revisions and assess readiness' },
  { id: 'copy-edit',          label: 'Copy Edit',             agent: 'Sable',      description: 'Grammar, consistency, and mechanical polish' },
  { id: 'revision-plan-2',    label: 'Fix Planning',          agent: 'Forge',      description: 'Plan copy-level fixes' },
  { id: 'mechanical-fixes',   label: 'Mechanical Fixes',      agent: 'Verity',     description: 'Implement copy-level fixes' },
  { id: 'build',              label: 'Build',                 agent: null,          description: 'Generate DOCX, EPUB, and PDF' },
  { id: 'publish',            label: 'Publish & Audit',       agent: 'Quill',      description: 'Audit outputs and prepare metadata' },
];

// Default settings
const DEFAULT_SETTINGS: AppSettings = {
  hasClaudeCli: false,
  model: 'claude-opus-4-20250514',
  maxTokens: 8192,
  enableThinking: true,
  thinkingBudget: 10000,
  autoCollapseThinking: true,
  theme: 'dark',
  initialized: false,
  authorName: '',
};

// Model pricing (per million tokens)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-20250514':   { input: 15, output: 75 },
  'claude-sonnet-4-20250514': { input: 3,  output: 15 },
};

// Available models for the settings dropdown
const AVAILABLE_MODELS = [
  { id: 'claude-opus-4-20250514',   label: 'Claude Opus 4',   description: 'Best quality — recommended for all agents' },
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', description: 'Faster and cheaper — good for copy editing' },
];

// Token estimation: ~4 chars per token for English
const CHARS_PER_TOKEN = 4;
// Opus context window
const MAX_CONTEXT_TOKENS = 200_000;
// Reserve for response + system prompt overhead
const CONTEXT_RESERVE_TOKENS = 14_000;

// === Context Wrangler Configuration ===

// The model used for the Wrangler's planning call (cheap and fast)
const WRANGLER_MODEL = 'claude-sonnet-4-20250514';
// Max tokens for the Wrangler's response (JSON plan)
const WRANGLER_MAX_TOKENS = 2048;
// Max tokens for summarization calls
const SUMMARIZATION_MAX_TOKENS = 4096;

// How many recent conversation turns to always count as "recent"
const WRANGLER_RECENT_TURN_COUNT = 4;

// Per-agent expected response sizes (tokens) — used for response buffer calculation
const AGENT_RESPONSE_BUFFER: Record<AgentName, number> = {
  Spark:      4000,   // conversational, shorter responses
  Verity:     10000,  // writes full chapters — needs the most room
  Ghostlight: 12000,  // writes full reader reports
  Lumen:      12000,  // writes full dev reports
  Sable:      10000,  // writes full audit reports
  Forge:      8000,   // writes revision task lists
  Quill:      6000,   // writes metadata + descriptions
};

// Canonical file manifest keys — maps to book context file paths
const FILE_MANIFEST_KEYS: { key: string; path: string }[] = [
  { key: 'voiceProfile',    path: 'source/voice-profile.md' },
  { key: 'sceneOutline',    path: 'source/scene-outline.md' },
  { key: 'storyBible',      path: 'source/story-bible.md' },
  { key: 'pitch',           path: 'source/pitch.md' },
  { key: 'authorProfile',   path: 'author-profile.md' },
  { key: 'readerReport',    path: 'source/reader-report.md' },
  { key: 'devReport',       path: 'source/dev-report.md' },
  { key: 'auditReport',     path: 'source/audit-report.md' },
  { key: 'revisionPrompts', path: 'source/revision-prompts.md' },
  { key: 'styleSheet',      path: 'source/style-sheet.md' },
  { key: 'projectTasks',    path: 'source/project-tasks.md' },
  { key: 'metadata',        path: 'source/metadata.md' },
];
```

Export every constant.

### File 4: `src/domain/index.ts`

Barrel export that re-exports everything from all three files:
```typescript
export * from './types';
export * from './interfaces';
export * from './constants';
```

## Verification

- `src/domain/` contains `types.ts`, `interfaces.ts`, `constants.ts`, `index.ts`
- `constants.ts` imports ONLY from `./types`
- `interfaces.ts` imports ONLY from `./types`
- `types.ts` has ZERO imports
- The project still compiles: `npx tsc --noEmit`
