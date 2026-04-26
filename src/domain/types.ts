// === Agent ===

export type AgentName = 'Spark' | 'Verity' | 'Ghostlight' | 'Lumen' | 'Sable' | 'Forge' | 'Quill' | 'Wrangler' | 'Helper';

// The 7 creative agents that the author interacts with
export type CreativeAgentName = Exclude<AgentName, 'Wrangler' | 'Helper'>;

export type AgentMeta = {
  name: AgentName;
  filename: string;        // e.g. "SPARK.md"
  role: string;            // e.g. "Pitch & Scaffold"
  color: string;           // hex color for UI
  thinkingBudget: number;  // default extended thinking token budget
  maxTurns: number;        // max CLI agent-loop turns (tool round-trips)
};

export type Agent = AgentMeta & {
  systemPrompt: string;    // full markdown contents of the .md file
};

// === Book ===

export type BookStatus = 'scaffolded' | 'outlining' | 'first-draft' | 'revision-1' | 'revision-2' | 'copy-edit' | 'final' | 'published';

export type BookMeta = {
  slug: string;
  title: string;
  author: string;
  status: BookStatus;
  created: string;         // ISO date
  coverImage: string;      // relative path to cover image (e.g. "cover.jpg"), empty string if none
};

export type BookSummary = BookMeta & {
  wordCount: number;
  isActive: boolean;
};

// === Series ===

/** A single volume entry within a series — links a book to its position. */
export type SeriesVolume = {
  bookSlug: string;        // slug of the book in books/
  volumeNumber: number;    // 1-based position in the series
};

/** Stored metadata for a series. Persisted as series.json in the series directory. */
export type SeriesMeta = {
  slug: string;            // kebab-case directory name
  name: string;            // display name (e.g. "The Stormlight Archive")
  description: string;     // optional series-level blurb
  volumes: SeriesVolume[]; // ordered list of books in the series
  created: string;         // ISO date
  updated: string;         // ISO date
};

/** Lightweight summary for UI lists — SeriesMeta plus computed fields. */
export type SeriesSummary = SeriesMeta & {
  volumeCount: number;
  totalWordCount: number;
};

// === Shelved Pitches ===

export type ShelvedPitchMeta = {
  slug: string;              // filename without .md extension
  title: string;             // extracted from front matter or first heading
  logline: string;           // one-line description from front matter
  shelvedAt: string;         // ISO date when the pitch was shelved
  shelvedFrom: string;       // book slug it was shelved from (empty if created directly)
};

export type ShelvedPitch = ShelvedPitchMeta & {
  content: string;           // full markdown content (without front matter)
};

export type ChapterData = {
  slug: string;            // e.g. "01-the-beginning"
  draft: string;           // contents of draft.md
  notes: string;           // contents of notes.md
};

// === Project Manifest (lightweight file listing) ===

export type FileManifestItem = {
  path: string;           // relative to book root, e.g. "source/pitch.md"
  wordCount: number;      // approximate word count
};

export type ProjectManifest = {
  meta: BookMeta;
  files: FileManifestItem[];
  chapterCount: number;
  totalWordCount: number;
};

// === Pipeline ===

export type PipelinePhaseId =
  | 'pitch' | 'scaffold' | 'first-draft' | 'first-read' | 'first-assessment'
  | 'revision-plan-1' | 'revision' | 'second-read' | 'second-assessment'
  | 'copy-edit' | 'revision-plan-2' | 'mechanical-fixes' | 'build' | 'publish';

/**
 * A phase is 'pending-completion' when all its detection files exist (the AI
 * finished its work) but the user has not yet explicitly confirmed they are
 * ready to advance the pipeline. The next phase stays 'locked' until the user
 * clicks "Advance →" in the sidebar.
 */
export type PhaseStatus = 'complete' | 'pending-completion' | 'active' | 'locked';

export type PipelinePhase = {
  id: PipelinePhaseId;
  label: string;
  agent: AgentName | null;   // null for 'build' phase
  status: PhaseStatus;
  description: string;
};

// === Chat / Conversation ===

export type MessageRole = 'user' | 'assistant';

export type Message = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  thinking: string;        // extended thinking content (empty if disabled)
  timestamp: string;       // ISO date
};

export type ConversationPurpose = 'pipeline' | 'voice-setup' | 'author-profile' | 'pitch-room' | 'hot-take' | 'adhoc-revision' | 'helper';

// === Pitch Room ===

export type PitchDraft = {
  conversationId: string;     // the pitch room conversation this belongs to
  title: string;              // extracted from pitch content, or "Untitled Draft"
  hasPitch: boolean;          // true if pitch.md exists in the draft folder
  createdAt: string;          // ISO date (from conversation creation)
  updatedAt: string;          // ISO date (last message timestamp)
};

export type Conversation = {
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

export type StreamBlockType = 'thinking' | 'text' | 'tool_use' | 'tool_result';

export type ToolUseInfo = {
  toolName: string;        // e.g. "Write", "Read", "Edit"
  toolId: string;          // the tool_use_id from the CLI
  filePath?: string;       // resolved file path (for file operations)
  status: 'started' | 'running' | 'complete' | 'error';
};

// === Progress Stage ===
// High-level stage inferred from tool-use patterns during a CLI stream.
// The UI binds a status indicator to this single string.
export type ProgressStage =
  | 'idle'
  | 'reading'      // agent is using Read/LS tools
  | 'thinking'     // extended thinking block is active
  | 'drafting'     // first Write to a file path
  | 'editing'      // Edit tool or second+ Write to a previously-written path
  | 'reviewing'    // Read of a file the agent already wrote in this session
  | 'complete';    // result event received

// === File Touch Tracking ===
export type FileTouchMap = Record<string, number>;  // path → write count

// === Timestamped Tool Use ===
export type TimestampedToolUse = ToolUseInfo & {
  startedAt: number;    // Date.now() when tool_use block started
  endedAt?: number;     // Date.now() when content_block_stop fires
  durationMs?: number;  // endedAt - startedAt
};

// === Thinking Summary ===
// First ~200 chars or last complete sentence of a thinking block.
export type ThinkingSummary = {
  text: string;          // the summary snippet
  fullLengthChars: number;  // total chars in the full thinking block
};

// === Persisted Stream Event ===
// Every event that flows through onEvent is persisted to SQLite for replay.
export type PersistedStreamEvent = {
  id: number;                     // auto-increment PK
  sessionId: string;              // groups events for one CLI call
  conversationId: string;         // the conversation this belongs to
  sequenceNumber: number;         // ordering within the session
  eventType: string;              // StreamEvent.type discriminator
  payload: string;                // JSON-serialized StreamEvent
  timestamp: string;              // ISO date
};

// === Session Record ===
// Tracks a single CLI invocation for orphan detection.
export type StreamSessionRecord = {
  id: string;                     // nanoid
  conversationId: string;
  agentName: AgentName;
  model: string;
  bookSlug: string;
  startedAt: string;              // ISO date
  endedAt: string | null;         // null = still running (or orphaned)
  finalStage: ProgressStage;      // last known stage
  filesTouched: FileTouchMap;     // accumulated file touch map
  interrupted: boolean;           // true if marked as orphaned on startup
};

/** Discriminator for the origin of a stream event — injected by the IPC layer. */
export type StreamEventSource = 'chat' | 'auto-draft' | 'hot-take' | 'adhoc-revision' | 'revision' | 'audit' | 'fix' | 'motif-audit';

export type StreamEvent =
  | { type: 'callStart'; agentName: AgentName; model: string; bookSlug: string }
  | { type: 'status'; message: string }
  | { type: 'blockStart'; blockType: StreamBlockType }
  | { type: 'thinkingDelta'; text: string }
  | { type: 'textDelta'; text: string }
  | { type: 'blockEnd'; blockType: StreamBlockType }
  | { type: 'toolUse'; tool: ToolUseInfo }
  | { type: 'filesChanged'; paths: string[] }
  | { type: 'done'; inputTokens: number; outputTokens: number; thinkingTokens: number; filesTouched: FileTouchMap }
  | { type: 'progressStage'; stage: ProgressStage }
  | { type: 'thinkingSummary'; summary: ThinkingSummary }
  | { type: 'toolDuration'; tool: TimestampedToolUse }
  | { type: 'error'; message: string };

/**
 * Snapshot of an in-progress CLI stream, exposed via IPC so the renderer
 * can recover its streaming UI state after a window refresh.
 */
export type ActiveStreamInfo = {
  conversationId: string;
  agentName: AgentName;
  model: string;
  bookSlug: string;
  startedAt: string;         // ISO date when the stream began
  sessionId: string;              // links to StreamSessionRecord
  callId: string;                 // renderer-generated ID for stream event scoping
  progressStage: ProgressStage;   // current inferred stage
  filesTouched: FileTouchMap;     // accumulated file touches
  thinkingBuffer: string;        // accumulated thinking text so far (for recovery after reload)
  textBuffer: string;            // accumulated response text so far (for recovery after reload)
};

// === Model Providers ===

/** Unique identifier for a provider instance. Stable across sessions. */
export type ProviderId = string;

/** The implementation strategy for a provider. Determines which infrastructure class is instantiated. */
export type ProviderType = 'claude-cli' | 'codex-cli' | 'opencode-cli' | 'openai-compatible';

/** Capabilities a provider may support. Used to gate features in the UI and services. */
export type ProviderCapability =
  | 'text-completion'   // basic chat — all providers
  | 'tool-use'          // can read/write files via agent loop — CLI providers only
  | 'thinking'          // extended thinking / reasoning traces
  | 'streaming';        // real-time token streaming

/** Runtime status of a provider — checked on app startup and on demand. */
export type ProviderStatus = 'available' | 'unavailable' | 'unchecked' | 'error';

/** Stored configuration for a single provider instance. Persisted in settings.json. */
export type ProviderConfig = {
  id: ProviderId;
  type: ProviderType;
  name: string;                          // user-facing display name
  enabled: boolean;
  isBuiltIn: boolean;                    // true for Claude CLI (cannot be deleted)
  apiKey?: string;                       // for BYOK providers (stored in settings)
  baseUrl?: string;                      // custom endpoint for self-hosted / proxied
  models: ModelInfo[];                   // models available through this provider
  defaultModel?: string;                 // preferred model ID from this provider
  capabilities: ProviderCapability[];
};

/** Describes a single model available through a provider. */
export type ModelInfo = {
  id: string;                            // e.g. 'claude-opus-4-20250514', 'gpt-4o'
  label: string;                         // display name
  description: string;
  providerId: ProviderId;                // which provider offers this model
  contextWindow?: number;                // max tokens (informational)
  supportsThinking?: boolean;            // whether extended thinking is available
  supportsToolUse?: boolean;             // whether agent-loop tool use works
};

// === Saved Prompts ===

export type SavedPrompt = {
  id: string;                      // nanoid-generated
  name: string;                    // display label shown in the dropdown
  prompt: string;                  // full text inserted into chat input
  agentName: AgentName | null;     // null = works with any agent
  createdAt: string;               // ISO date
};

// === Settings ===

export type AppSettings = {
  hasClaudeCli: boolean;   // true if `claude` CLI is detected and authenticated
  hasCodexCli: boolean;    // true if `codex` CLI is detected and authenticated
  model: string;
  maxTokens: number;
  enableThinking: boolean;
  thinkingBudget: number;
  overrideThinkingBudget: boolean; // when true, all agents use thinkingBudget instead of per-agent defaults
  autoCollapseThinking: boolean;
  enableNotifications: boolean; // OS notifications when agent calls complete
  theme: 'light' | 'dark' | 'system';
  initialized: boolean;    // false until onboarding is complete
  authorName: string;      // display name for book covers
  // Multi-provider configuration
  providers: ProviderConfig[];           // all configured providers (persisted)
  activeProviderId: ProviderId;          // which provider is currently selected
  // Guided tour completion tracking
  completedTours: TourId[];             // which tours the user has finished
  // Saved prompt library
  savedPrompts: SavedPrompt[];          // user-saved prompt entries
};

// === Token Usage ===

export type UsageRecord = {
  conversationId: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  model: string;
  timestamp: string;
};

export type UsageSummary = {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalThinkingTokens: number;
  conversationCount: number;
};

// === Revision Queue ===

export type RevisionSessionStatus = 'pending' | 'running' | 'awaiting-approval' | 'approved' | 'rejected' | 'skipped';

export type ApprovalAction = 'approve' | 'approve-all' | 'reject' | 'skip' | 'retry';

export type QueueMode = 'manual' | 'auto-approve' | 'auto-skip' | 'selective';

/** Snapshot of a running queue's status — returned by getQueueStatus so the
 *  frontend can re-derive running state after a book switch without caching. */
export type QueueStatus = {
  planId: string | null;
  isRunning: boolean;
  activeSessionId: string | null;
};

export type RevisionSession = {
  id: string;
  index: number;                   // 1-based session order
  title: string;                   // e.g. "Ch 20-26 Thesis Audit"
  chapters: string[];              // chapter slugs referenced
  taskNumbers: number[];           // which project-task numbers this covers
  model: 'opus' | 'sonnet';       // Forge's model assignment
  prompt: string;                  // the full prompt text to send to Verity
  notes: string;                   // Forge's notes (e.g. "Read-only. Produces catalog.")
  status: RevisionSessionStatus;
  conversationId: string | null;   // set when session starts running
  response: string;                // accumulated response text
};

export type RevisionPlanPhase = {
  number: number;
  name: string;
  taskCount: number;
  completedCount: number;
  taskNumbers?: number[];  // task numbers belonging to this phase (used for progress recalculation)
};

export type RevisionPlan = {
  id: string;
  bookSlug: string;
  sessions: RevisionSession[];
  totalTasks: number;
  completedTaskNumbers: number[];  // task numbers already marked [x]
  phases: RevisionPlanPhase[];
  mode: QueueMode;
  createdAt: string;
  verificationConversationId: string | null;
};

export type RevisionQueueEvent =
  | { type: 'session:status'; sessionId: string; status: RevisionSessionStatus; conversationId?: string }
  | { type: 'session:chunk'; sessionId: string; text: string }
  | { type: 'session:thinking'; sessionId: string; text: string }
  | { type: 'session:done'; sessionId: string; taskNumbers: number[] }
  | { type: 'session:gate'; sessionId: string; gateText: string }
  | { type: 'session:streamEvent'; sessionId: string; event: StreamEvent; conversationId?: string }
  | { type: 'plan:progress'; planId: string; completedTasks: number; totalTasks: number }
  | { type: 'plan:loading-step'; step: string }
  | { type: 'queue:done'; planId: string }
  | { type: 'error'; sessionId: string; message: string };

// === Verity Audit ===

export type AuditViolationType =
  | 'editorial-narration'
  | 'flagged-phrase'
  | 'anti-pattern'
  | 'voice-drift'
  | 'continuity-error';

export type AuditViolation = {
  type: AuditViolationType;
  location: string;
  quote: string;
  reason: string;
  pattern?: string;       // for anti-pattern type: which specific pattern
};

export type AuditSeverity = 'clean' | 'minor' | 'moderate' | 'heavy';

export type AuditResult = {
  chapter: string;
  violations: AuditViolation[];
  summary: {
    total: number;
    by_type: Partial<Record<AuditViolationType, number>>;
    severity: AuditSeverity;
  };
};

// === Build ===

export type BuildFormat = 'md' | 'docx' | 'epub' | 'pdf';

export type BuildResult = {
  success: boolean;
  formats: { format: BuildFormat; path: string; error?: string }[];
  wordCount: number;
};

// === File System ===

export type FileEntry = {
  name: string;
  path: string;            // relative to book root
  isDirectory: boolean;
  children?: FileEntry[];
};

// === Version Control ===

export type FileVersionSource = 'user' | 'agent' | 'revert';

export type FileVersion = {
  id: number;                // auto-increment PK
  bookSlug: string;
  filePath: string;          // relative to book root (e.g. "source/pitch.md")
  content: string;           // full file content at this version
  contentHash: string;       // SHA-256 hex digest for dedup
  byteSize: number;          // content.length in bytes
  source: FileVersionSource; // who caused this version
  createdAt: string;         // ISO date
};

export type FileVersionSummary = Omit<FileVersion, 'content'>;

export type DiffLineType = 'add' | 'remove' | 'context';

export type DiffLine = {
  type: DiffLineType;
  content: string;           // the text of this line (without +/- prefix)
  oldLineNumber?: number;    // line number in old version (undefined for additions)
  newLineNumber?: number;    // line number in new version (undefined for deletions)
};

export type DiffHunk = {
  oldStart: number;          // starting line in old version
  oldLines: number;          // number of lines from old version
  newStart: number;          // starting line in new version
  newLines: number;          // number of lines from new version
  lines: DiffLine[];
};

export type FileDiff = {
  oldVersion: FileVersionSummary | null;  // null for the first version (everything is "added")
  newVersion: FileVersionSummary;
  hunks: DiffHunk[];
  totalAdditions: number;
  totalDeletions: number;
};

// === IPC ===
// These define the exact shape of data crossing the IPC bridge.
// The preload and handlers both conform to these.

export type SendMessageParams = {
  agentName: AgentName;
  message: string;
  conversationId: string;
  bookSlug: string;
  thinkingBudgetOverride?: number;  // per-message thinking budget (0 = no thinking)
  callId?: string;                  // renderer-generated ID to scope stream events
};

// === Context Assembly ===

export type AssembledContext = {
  systemPrompt: string;                                    // agent prompt + manifest + guidance
  conversationMessages: { role: MessageRole; content: string }[];
  diagnostics: ContextDiagnostics;
};

export type ContextDiagnostics = {
  filesAvailable: string[];         // files listed in the manifest
  conversationTurnsSent: number;
  conversationTurnsDropped: number;
  manifestTokenEstimate: number;    // how many tokens the manifest section uses
};

// === Motif Ledger ===

export type MotifSystem = {
  id: string;
  name: string;
  description: string;
  components: string[];
  arcTrajectory: string;
};

export type MotifEntry = {
  id: string;
  character: string;
  phrase: string;
  description: string;
  systemId: string | null;
  firstAppearance: string;
  occurrences: string[];
  notes: string;
};

export type StructuralDevice = {
  id: string;
  name: string;
  deviceType: string;
  description: string;
  pattern: string;
  chapters: string[];
  notes: string;
};

export type ForeshadowStatus = 'planted' | 'paid-off' | 'abandoned';

export type ForeshadowEntry = {
  id: string;
  description: string;
  plantedIn: string;
  expectedPayoff: string;
  expectedPayoffIn: string;
  status: ForeshadowStatus;
  notes: string;
};

export type MinorCharacterMotif = {
  id: string;
  character: string;
  motifs: string;
  notes: string;
};

export type FlaggedPhraseCategory = 'retired' | 'limited' | 'crutch' | 'anti-pattern';

export type FlaggedPhrase = {
  id: string;
  phrase: string;
  category: FlaggedPhraseCategory;
  alternatives: string[];
  limit?: number;
  limitChapters?: string[];
  notes: string;
};

export type LedgerAuditRecord = {
  id: string;
  chapterSlug: string;
  auditedAt: string;
  entriesAdded: number;
  entriesUpdated: number;
  notes: string;
};

export type MotifLedger = {
  systems: MotifSystem[];
  entries: MotifEntry[];
  structuralDevices: StructuralDevice[];
  foreshadows: ForeshadowEntry[];
  minorCharacters: MinorCharacterMotif[];
  flaggedPhrases: FlaggedPhrase[];
  auditLog: LedgerAuditRecord[];
};

// === Manuscript Import ===

export type ImportSourceFormat = 'markdown' | 'docx';

export type DetectedChapter = {
  index: number;
  title: string;
  startLine: number;
  endLine: number;
  wordCount: number;
  content: string;
};

export type ImportPreview = {
  sourceFile: string;
  sourceFormat: ImportSourceFormat;
  markdownContent: string;
  chapters: DetectedChapter[];
  totalWordCount: number;
  detectedTitle: string;
  detectedAuthor: string;
  ambiguous: boolean;
};

export type ImportCommitConfig = {
  title: string;
  author: string;
  chapters: DetectedChapter[];
};

export type ImportResult = {
  bookSlug: string;
  title: string;
  chapterCount: number;
  totalWordCount: number;
};

// === Series Import ===

/** A single volume in a series import — wraps an ImportPreview with ordering. */
export type SeriesImportVolume = {
  /** Index in the import order (0-based). */
  index: number;
  /** The manuscript preview for this volume. */
  preview: ImportPreview;
  /** Volume number in the series (1-based). User can reorder. */
  volumeNumber: number;
  /** Whether the user has opted to skip importing this volume. */
  skipped: boolean;
};

/** Result of analyzing multiple files for series import. */
export type SeriesImportPreview = {
  /** Detected or user-provided series name. */
  seriesName: string;
  /** All volumes detected from the selected files. */
  volumes: SeriesImportVolume[];
  /** Total word count across all non-skipped volumes. */
  totalWordCount: number;
  /** Total chapter count across all non-skipped volumes. */
  totalChapterCount: number;
};

/** Configuration for committing a series import. User may have edited titles, reordered, etc. */
export type SeriesImportCommitConfig = {
  /** Series name (new series will be created, or existing slug to add to). */
  seriesName: string;
  /** Existing series slug — if set, volumes are added to this series instead of creating new. */
  existingSeriesSlug: string | null;
  /** Author name applied to all volumes. */
  author: string;
  /** The volumes to import (skipped volumes excluded by caller). */
  volumes: Array<{
    volumeNumber: number;
    title: string;
    chapters: DetectedChapter[];
  }>;
};

/** Result of committing a series import. */
export type SeriesImportResult = {
  /** The series slug (created or existing). */
  seriesSlug: string;
  /** The series display name. */
  seriesName: string;
  /** Results for each imported volume. */
  volumeResults: ImportResult[];
  /** Total books imported. */
  totalBooks: number;
  /** Total chapters across all books. */
  totalChapters: number;
  /** Total words across all books. */
  totalWordCount: number;
};

// === Source Document Generation ===

export type SourceGenerationStep = {
  index: number;
  label: string;
  agentName: AgentName;
  status: 'pending' | 'running' | 'done' | 'error';
  error?: string;
};

export type SourceGenerationEvent =
  | { type: 'started'; steps: SourceGenerationStep[] }
  | { type: 'step-started'; index: number }
  | { type: 'step-done'; index: number }
  | { type: 'step-error'; index: number; message: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

// === Guided Tour ===

export type TourId = 'welcome' | 'first-book' | 'pipeline-intro';

export type TourStepPlacement = 'top' | 'bottom' | 'left' | 'right';

export type TourStep = {
  /** Unique step identifier within the tour. */
  id: string;
  /** CSS selector to anchor to (e.g. '[data-tour="sidebar-pipeline"]'). */
  targetSelector: string;
  /** Main heading for the popover. */
  title: string;
  /** Explanation text — 1-3 sentences. */
  body: string;
  /** Preferred popover placement relative to the target. */
  placement: TourStepPlacement;
  /** If set, navigate to this view before highlighting the target. */
  requiredView?: string;
};

export type TourState = {
  /** Which tours the user has completed. Persisted to settings. */
  completedTours: TourId[];
};

// === Find & Replace ===

/**
 * Options controlling matching behaviour for a find-replace operation.
 */
export type FindReplaceOptions = {
  caseSensitive: boolean;
  useRegex: boolean;
};

/**
 * One occurrence of the search term within a file.
 * Line numbers are 1-based. Column offsets are 0-based within lineText.
 */
export type FindReplaceMatchLocation = {
  lineNumber: number;
  lineText: string;   // the full line containing the match
  matchStart: number; // 0-based column of match start within lineText
  matchEnd: number;   // 0-based column of match end (exclusive) within lineText
};

/**
 * Per-file summary returned by the preview call.
 * `matches` is capped at 20 entries for UI display; `matchCount` is the
 * exact total (may be higher than matches.length).
 */
export type FindReplacePreviewItem = {
  filePath: string;                    // relative to book root, e.g. "chapters/01-foo/draft.md"
  matchCount: number;
  matches: FindReplaceMatchLocation[]; // up to 20 sample locations
};

/**
 * Full result of a preview scan across all chapter drafts.
 */
export type FindReplacePreviewResult = {
  items: FindReplacePreviewItem[];
  totalMatchCount: number;
  searchTerm: string;
  options: FindReplaceOptions;
};

/**
 * Summary returned after applying replacements.
 */
export type FindReplaceApplyResult = {
  filesChanged: number;
  totalReplacements: number;
  details: { filePath: string; replacements: number }[];
};

// === Manuscript Assembly ===

export type ManuscriptAssembly = {
  /** Full markdown — all chapters concatenated in order with chapter headings. */
  content: string;
  chapterCount: number;
  wordCount: number;
  chapters: { slug: string; title: string; wordCount: number }[];
};

// === Book Overview Dashboard ===

export type RecentFile = {
  path: string;
  modifiedAt: string;
  wordCount: number;
};

export type RevisionTaskItem = {
  text: string;
  isCompleted: boolean;
  taskNumber: number;
};

export type BookDashboardData = {
  bookSlug: string;
  pipeline: {
    currentPhase: PipelinePhase | null;
    completedCount: number;
    totalCount: number;
  };
  wordCount: {
    current: number;
    target: number | null;
    perChapter: { slug: string; wordCount: number }[];
  };
  lastInteraction: {
    agentName: AgentName;
    timestamp: string;
    conversationTitle: string;
  } | null;
  revisionTasks: {
    total: number;
    completed: number;
    items: RevisionTaskItem[];
  };
  recentFiles: RecentFile[];
  daysInProgress: number;
  bookTitle: string;
  bookStatus: BookStatus;
};

// === Writing Statistics ===

export type UsageTimePoint = {
  date: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
};

export type AgentUsageBreakdown = {
  agentName: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  conversationCount: number;
  estimatedCost: number;
};

export type PhaseUsageBreakdown = {
  phase: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  conversationCount: number;
  estimatedCost: number;
};

export type WordCountSnapshot = {
  bookSlug: string;
  wordCount: number;
  chapterCount: number;
  recordedAt: string;
};

export type BookStatistics = {
  usageOverTime: UsageTimePoint[];
  perAgent: AgentUsageBreakdown[];
  perPhase: PhaseUsageBreakdown[];
  wordCountHistory: WordCountSnapshot[];
  totalCostEstimate: number;
  wordsPerChapter: { slug: string; wordCount: number }[];
  totalTokens: {
    input: number;
    output: number;
    thinking: number;
  };
  conversationCount: number;
};
