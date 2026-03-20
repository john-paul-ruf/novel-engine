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

export type BookContext = {
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

// === Context Wrangler ===
// The Wrangler is an AI-powered context planner that runs a cheap CLI call
// before every agent call to decide what context to load.

export type WranglerInput = {
  agent: AgentName;
  userMessage: string;
  bookStatus: BookStatus;
  pipelinePhase: PipelinePhaseId | null;
  purpose?: ConversationPurpose;
  fileManifest: FileManifestEntry[];
  chapters: ChapterManifestEntry[];
  conversation: ConversationManifest;
  budget: ContextBudget;
};

export type FileManifestEntry = {
  key: string;               // e.g. 'voiceProfile', 'sceneOutline'
  path: string;              // relative to book root
  tokens: number;            // 0 means file does not exist
};

export type ChapterManifestEntry = {
  number: number;
  slug: string;
  draftTokens: number;
  notesTokens: number;
};

export type ConversationManifest = {
  turnCount: number;
  totalTokens: number;
  recentTurns: number;       // count of recent turns
  recentTokens: number;
  oldTurns: number;
  oldTokens: number;
  hasThinkingBlocks: boolean;
};

export type ContextBudget = {
  totalContextWindow: number;
  systemPromptTokens: number;
  thinkingBudget: number;
  responseBuffer: number;
  availableForContext: number;  // totalContextWindow - systemPromptTokens - thinkingBudget - responseBuffer
};

export type ChapterStrategy = 'none' | 'sliding-window' | 'target-neighbors' | 'full-read';
export type ConversationStrategy = 'keep-all' | 'summarize-old' | 'keep-recent-only';

export type WranglerFileDirective = {
  key: string;
  path: string;
};

export type WranglerSummarizeDirective = {
  key: string;
  path: string;
  targetTokens: number;
  focus: string;             // instructions for the summarization call
};

export type WranglerExcludeDirective = {
  key: string;
  reason: string;
};

export type WranglerChapterDirective = {
  number: number;
  slug: string;
  includeDraft: boolean;
  includeNotes: boolean;
};

export type WranglerChapterExclude = {
  range: string;             // e.g. "1-4"
  reason: string;
};

export type WranglerPlan = {
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
export type AssembledContext = {
  projectContext: string;    // all project files + chapters, formatted and joined
  conversationMessages: { role: MessageRole; content: string }[];  // compacted conversation
  diagnostics: ContextDiagnostics;
};

export type ContextDiagnostics = {
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
