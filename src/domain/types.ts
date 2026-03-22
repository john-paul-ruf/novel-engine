// === Agent ===

export type AgentName = 'Spark' | 'Verity' | 'Ghostlight' | 'Lumen' | 'Sable' | 'Forge' | 'Quill' | 'Wrangler';

// The 7 creative agents that the author interacts with
export type CreativeAgentName = Exclude<AgentName, 'Wrangler'>;

export type AgentMeta = {
  name: AgentName;
  filename: string;        // e.g. "SPARK.md"
  role: string;            // e.g. "Pitch & Scaffold"
  color: string;           // hex color for UI
  thinkingBudget: number;  // default extended thinking token budget
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

export type ConversationPurpose = 'pipeline' | 'voice-setup' | 'author-profile' | 'pitch-room';

// === Pitch Room ===

export type PitchDraft = {
  conversationId: string;     // the pitch room conversation this belongs to
  title: string;              // extracted from pitch content, or "Untitled Draft"
  hasPitch: boolean;          // true if pitch.md exists in the draft folder
  createdAt: string;          // ISO date (from conversation creation)
  updatedAt: string;          // ISO date (last message timestamp)
};

export type PitchOutcome = 'make-book' | 'shelve' | 'discard';

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
  | { type: 'pitchOutcome'; action: PitchOutcome; bookSlug?: string; pitchSlug?: string; title?: string }
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
  progressStage: ProgressStage;   // current inferred stage
  filesTouched: FileTouchMap;     // accumulated file touches
  thinkingBuffer: string;        // accumulated thinking text so far (for recovery after reload)
  textBuffer: string;            // accumulated response text so far (for recovery after reload)
};

// === Settings ===

export type AppSettings = {
  hasClaudeCli: boolean;   // true if `claude` CLI is detected and authenticated
  model: string;
  maxTokens: number;
  enableThinking: boolean;
  thinkingBudget: number;
  autoCollapseThinking: boolean;
  enableNotifications: boolean; // OS notifications when agent calls complete
  theme: 'light' | 'dark' | 'system';
  initialized: boolean;    // false until onboarding is complete
  authorName: string;      // display name for book covers
};

// === Token Usage ===

export type UsageRecord = {
  conversationId: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  model: string;
  estimatedCost: number;
  timestamp: string;
};

export type UsageSummary = {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalThinkingTokens: number;
  totalCost: number;
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
  | { type: 'session:streamEvent'; sessionId: string; event: StreamEvent }
  | { type: 'plan:progress'; planId: string; completedTasks: number; totalTasks: number }
  | { type: 'plan:loading-step'; step: string }
  | { type: 'queue:done'; planId: string }
  | { type: 'error'; sessionId: string; message: string };

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

// === IPC ===
// These define the exact shape of data crossing the IPC bridge.
// The preload and handlers both conform to these.

export type SendMessageParams = {
  agentName: AgentName;
  message: string;
  conversationId: string;
  bookSlug: string;
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
