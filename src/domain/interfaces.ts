import type {
  Agent,
  AgentName,
  AppSettings,
  ApprovalAction,
  BookMeta,
  BookSummary,
  BuildResult,
  Conversation,
  FileEntry,
  Message,
  MessageRole,
  PipelinePhase,
  PipelinePhaseId,
  ProjectManifest,
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

  // Book slug migration
  updateBookSlug(oldSlug: string, newSlug: string): void;

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
  updateBookMeta(slug: string, partial: Partial<BookMeta>): Promise<BookMeta>;

  // Project manifest (lightweight file listing with word counts)
  getProjectManifest(slug: string): Promise<ProjectManifest>;

  // File operations
  readFile(bookSlug: string, relativePath: string): Promise<string>;
  writeFile(bookSlug: string, relativePath: string, content: string): Promise<void>;
  deleteFile(bookSlug: string, relativePath: string): Promise<void>;
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
    bookSlug?: string;
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

export interface IPipelineService {
  detectPhases(bookSlug: string): Promise<PipelinePhase[]>;
  getActivePhase(bookSlug: string): Promise<PipelinePhase | null>;
  getAgentForPhase(phaseId: PipelinePhaseId): AgentName | null;

  /**
   * Manually mark a pipeline phase as complete by advancing the book status.
   *
   * Some phases (like `first-draft` and `mechanical-fixes`) depend on the
   * book's status field in about.json, not just file existence. Since nothing
   * auto-advances the status, this method lets the user explicitly signal
   * that a phase is done.
   */
  markPhaseComplete(bookSlug: string, phaseId: PipelinePhaseId): Promise<void>;

  /**
   * Archive the revision reports to signal the revision phase is complete.
   *
   * Copies source/reader-report.md → source/reader-report-v1.md and
   * source/dev-report.md → source/dev-report-v1.md (if it exists).
   * Once these versioned files exist, the pipeline auto-advances:
   * the `revision` phase completes and `second-read` unlocks.
   */
  completeRevision(bookSlug: string): Promise<void>;
}

export interface IBuildService {
  build(bookSlug: string, onProgress: (message: string) => void): Promise<BuildResult>;
  isPandocAvailable(): Promise<boolean>;
}

export interface IRevisionQueueService {
  // Parse Forge's output into a structured plan using Wrangler CLI
  loadPlan(bookSlug: string): Promise<RevisionPlan>;

  // Clear the on-disk parse cache for a book (forces re-parse on next loadPlan)
  clearCache(bookSlug: string): Promise<void>;

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

  /**
   * Archive the revision plan files to signal the queue is fully done.
   *
   * Moves source/project-tasks.md → source/project-tasks-v1.md and
   * source/revision-prompts.md → source/revision-prompts-v1.md.
   * This clears the way for Forge to generate new revision files for
   * the mechanical-fixes phase (revision-plan-2).
   *
   * Emits 'queue:archived' on completion.
   * Throws if any sessions are still pending, running, or awaiting approval.
   */
  completeQueue(planId: string): Promise<void>;

  // Register event listener
  onEvent(callback: (event: RevisionQueueEvent) => void): () => void;
}

export interface IChapterValidator {
  /**
   * Validate and correct chapter file placement in a book.
   *
   * Scans the chapters directory and detects misplaced chapter files (e.g., files
   * written to the wrong path by agents), then automatically moves them to the
   * correct `chapters/NN-slug/{draft.md|notes.md}` structure.
   *
   * Returns a list of corrected file paths.
   *
   * Common patterns detected:
   * - Files in chapters root instead of chapter subdirectories
   * - Files with wrong extensions (.md directly instead of in folder)
   * - Nested chapter directories with incorrect structure
   */
  validateAndCorrect(bookSlug: string): Promise<string[]>;
}
