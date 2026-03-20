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

export type PhaseStatus = 'complete' | 'active' | 'locked';

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

export type ConversationPurpose = 'pipeline' | 'voice-setup' | 'author-profile';

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

export type StreamEvent =
  | { type: 'callStart'; agentName: AgentName; model: string; bookSlug: string }
  | { type: 'status'; message: string }
  | { type: 'blockStart'; blockType: StreamBlockType }
  | { type: 'thinkingDelta'; text: string }
  | { type: 'textDelta'; text: string }
  | { type: 'blockEnd'; blockType: StreamBlockType }
  | { type: 'toolUse'; tool: ToolUseInfo }
  | { type: 'filesChanged'; paths: string[] }
  | { type: 'done'; inputTokens: number; outputTokens: number; thinkingTokens: number }
  | { type: 'error'; message: string };

// === Settings ===

export type AppSettings = {
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

export type ApprovalAction = 'approve' | 'reject' | 'skip' | 'retry';

export type QueueMode = 'manual' | 'auto-approve' | 'auto-skip' | 'selective';

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
};

export type RevisionQueueEvent =
  | { type: 'session:status'; sessionId: string; status: RevisionSessionStatus }
  | { type: 'session:chunk'; sessionId: string; text: string }
  | { type: 'session:thinking'; sessionId: string; text: string }
  | { type: 'session:done'; sessionId: string; taskNumbers: number[] }
  | { type: 'session:gate'; sessionId: string; gateText: string }
  | { type: 'plan:progress'; completedTasks: number; totalTasks: number }
  | { type: 'queue:done' }
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
