import type {
  Agent,
  AgentName,
  AppSettings,
  ApprovalAction,
  AssembledContext,
  BookContext,
  BookMeta,
  BookSummary,
  BuildResult,
  Conversation,
  ConversationPurpose,
  FileEntry,
  Message,
  MessageRole,
  PipelinePhase,
  PipelinePhaseId,
  QueueMode,
  RevisionPlan,
  RevisionQueueEvent,
  StreamEvent,
  UsageRecord,
  UsageSummary,
} from './types';

export interface ISettingsService {
  load(): Promise<AppSettings>;
  detectClaudeCli(): Promise<boolean>;
  update(partial: Partial<AppSettings>): Promise<void>;
}

export interface IAgentService {
  loadAll(): Promise<Agent[]>;
  load(name: AgentName): Promise<Agent>;
}

export interface IDatabaseService {
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

export interface IFileSystemService {
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
  saveCoverImage(bookSlug: string, sourcePath: string): Promise<string>;
  getCoverImageAbsolutePath(bookSlug: string): Promise<string | null>;
}

export interface IClaudeClient {
  sendMessage(params: {
    model: string;
    systemPrompt: string;
    messages: { role: MessageRole; content: string }[];
    maxTokens: number;
    thinkingBudget?: number;
    onEvent: (event: StreamEvent) => void;
  }): Promise<void>;

  sendOneShot(params: {
    model: string;
    systemPrompt: string;
    userMessage: string;
    maxTokens: number;
  }): Promise<string>;

  isAvailable(): Promise<boolean>;
}

export interface IContextWrangler {
  assemble(params: {
    agentName: AgentName;
    userMessage: string;
    conversationId: string;
    bookSlug: string;
    purpose?: ConversationPurpose;
  }): Promise<AssembledContext>;

  estimateTokens(text: string): number;
}

export interface IPipelineService {
  detectPhases(bookSlug: string): Promise<PipelinePhase[]>;
  getActivePhase(bookSlug: string): Promise<PipelinePhase | null>;
  getAgentForPhase(phaseId: PipelinePhaseId): AgentName | null;
}

export interface IBuildService {
  build(bookSlug: string, onProgress: (message: string) => void): Promise<BuildResult>;
  isPandocAvailable(): Promise<boolean>;
}

export interface IRevisionQueueService {
  // Parse Forge's output into a structured plan using Wrangler CLI
  loadPlan(bookSlug: string): Promise<RevisionPlan>;

  // Execute a single session — sends prompt to Verity, streams response
  runSession(planId: string, sessionId: string): Promise<void>;

  // Run all remaining pending sessions sequentially (selective mode filters by selectedSessionIds)
  runAll(planId: string, selectedSessionIds?: string[]): Promise<void>;

  // Author decision on a session at an approval gate
  respondToGate(planId: string, sessionId: string, action: ApprovalAction, message?: string): void;

  // Approve a completed session — marks tasks [x] in project-tasks.md
  approveSession(planId: string, sessionId: string): Promise<void>;

  // Reject a session — allows re-run
  rejectSession(planId: string, sessionId: string): Promise<void>;

  // Skip a session — tasks stay [ ]
  skipSession(planId: string, sessionId: string): Promise<void>;

  // Pause auto-run after current session completes
  pause(planId: string): void;

  // Set queue execution mode
  setMode(planId: string, mode: QueueMode): void;

  // Get the current plan (in-memory)
  getPlan(planId: string): RevisionPlan | null;

  // Register event listener
  onEvent(callback: (event: RevisionQueueEvent) => void): () => void;
}
