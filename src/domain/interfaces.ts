import type {
  ActiveStreamInfo,
  Agent,
  AgentName,
  AppSettings,
  ApprovalAction,
  AuditResult,
  BookDashboardData,
  BookMeta,
  BookStatistics,
  BookSummary,
  BuildResult,
  ContextDiagnostics,
  Conversation,
  ConversationPurpose,
  FileDiff,
  FileEntry,
  FileTouchMap,
  FileVersion,
  FileVersionSource,
  FileVersionSummary,
  FindReplaceApplyResult,
  FindReplaceOptions,
  FindReplacePreviewResult,
  ImportCommitConfig,
  ImportPreview,
  ImportResult,
  ManuscriptAssembly,
  Message,
  MessageRole,
  ModelInfo,
  MotifLedger,
  PersistedStreamEvent,
  PipelinePhase,
  PipelinePhaseId,
  PitchDraft,
  ProgressStage,
  ProjectManifest,
  ProviderCapability,
  ProviderConfig,
  ProviderId,
  ProviderStatus,
  QueueMode,
  QueueStatus,
  RecentFile,
  RevisionPlan,
  RevisionQueueEvent,
  SeriesImportCommitConfig,
  SeriesImportPreview,
  SeriesImportResult,
  SeriesMeta,
  SeriesSummary,
  ShelvedPitch,
  ShelvedPitchMeta,
  SourceGenerationEvent,
  StreamEvent,
  StreamSessionRecord,
  UsageRecord,
  UsageTimePoint,
  UsageSummary,
  WordCountSnapshot,
} from './types';

export interface ISettingsService {
  load(): Promise<AppSettings>;
  detectClaudeCli(): Promise<boolean>;
  detectOllamaCli(): Promise<boolean>;
  update(partial: Partial<AppSettings>): Promise<void>;
}

export interface IAgentService {
  loadAll(): Promise<Agent[]>;
  load(name: AgentName): Promise<Agent>;

  /**
   * Load a composite agent prompt by concatenating a base file with one or
   * more supplement files. Used for Verity's phase-aware prompt assembly.
   *
   * @param baseFilename  The core prompt file (e.g., 'VERITY-CORE.md')
   * @param supplements   Additional filenames to append (e.g., ['VERITY-DRAFT.md'])
   * @returns The concatenated prompt string
   */
  loadComposite(baseFilename: string, supplements: string[]): Promise<string>;

  /**
   * Load a raw agent file by filename (not by agent name). Returns the file
   * contents as a string. Used for loading non-registry agent files like
   * the audit agent prompt.
   */
  loadRaw(filename: string): Promise<string>;
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

  // Stream event persistence
  persistStreamEvent(event: Omit<PersistedStreamEvent, 'id'>): void;
  persistStreamEventBatch(events: Omit<PersistedStreamEvent, 'id'>[]): void;
  getStreamEvents(sessionId: string): PersistedStreamEvent[];
  deleteStreamEvents(sessionId: string): void;
  pruneStreamEvents(olderThanDays: number): void;

  // Session records
  createStreamSession(session: StreamSessionRecord): void;
  endStreamSession(sessionId: string, finalStage: ProgressStage, filesTouched: FileTouchMap): void;
  getActiveStreamSessions(): StreamSessionRecord[];
  markSessionInterrupted(sessionId: string, lastStage: ProgressStage): void;

  // File Versions
  insertFileVersion(params: {
    bookSlug: string;
    filePath: string;
    content: string;
    contentHash: string;
    byteSize: number;
    source: FileVersionSource;
  }): FileVersion;

  getFileVersion(id: number): FileVersion | null;

  getLatestFileVersion(bookSlug: string, filePath: string): FileVersionSummary | null;

  listFileVersions(bookSlug: string, filePath: string, limit: number, offset: number): FileVersionSummary[];

  countFileVersions(bookSlug: string, filePath: string): number;

  deleteFileVersionsBeyondLimit(bookSlug: string, filePath: string, keepCount: number): number;

  /**
   * Get all distinct file paths that have version history for a book.
   * Used by the pruning job to iterate over all tracked files.
   */
  getVersionedFilePaths(bookSlug: string): string[];

  // Dashboard & Statistics queries
  getLastConversation(bookSlug: string): { agentName: string; title: string; updatedAt: string } | null;
  getUsageOverTime(bookSlug?: string): UsageTimePoint[];
  getUsageByAgent(bookSlug?: string): { agentName: string; inputTokens: number; outputTokens: number; thinkingTokens: number; conversationCount: number }[];
  getUsageByPhase(bookSlug?: string): { phase: string; inputTokens: number; outputTokens: number; thinkingTokens: number; conversationCount: number }[];
  recordWordCountSnapshot(bookSlug: string, wordCount: number, chapterCount: number): void;
  getWordCountHistory(bookSlug?: string, limit?: number): WordCountSnapshot[];

  // Lifecycle
  close(): void;
}

export interface IFileSystemService {
  // Paths
  getBooksPath(): string;

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
  deletePath(bookSlug: string, relativePath: string): Promise<void>;
  renameFile(bookSlug: string, oldPath: string, newPath: string): Promise<void>;
  fileExists(bookSlug: string, relativePath: string): Promise<boolean>;
  listDirectory(bookSlug: string, relativePath?: string): Promise<FileEntry[]>;

  // Word count
  countWords(bookSlug: string): Promise<number>;
  countWordsPerChapter(bookSlug: string): Promise<{ slug: string; wordCount: number }[]>;

  getRecentFiles(bookSlug: string, limit?: number): Promise<RecentFile[]>;

  /**
   * Assemble the full manuscript by reading all chapter draft.md files in order
   * and concatenating them with chapter headings.
   * Returns the combined markdown and metadata suitable for the reading mode view.
   */
  assembleManuscript(bookSlug: string): Promise<ManuscriptAssembly>;

  // Cover image
  saveCoverImage(bookSlug: string, sourcePath: string): Promise<string>;
  getCoverImageAbsolutePath(bookSlug: string): Promise<string | null>;

  // Book archiving — moves books to/from _archived/ directory
  archiveBook(slug: string): Promise<void>;
  unarchiveBook(slug: string): Promise<BookMeta>;
  listArchivedBooks(): Promise<BookSummary[]>;

  // Slug reconciliation — renames folders whose name no longer matches the
  // slugified title stored in about.json. Returns every migration performed
  // so callers can update the database accordingly.
  reconcileBookSlugs(): Promise<Array<{ oldSlug: string; newSlug: string }>>;

  // Author profile path — absolute path for the global author-profile.md
  getAuthorProfilePath(): string;

  // Shelved pitches
  listShelvedPitches(): Promise<ShelvedPitchMeta[]>;
  readShelvedPitch(slug: string): Promise<ShelvedPitch>;
  deleteShelvedPitch(slug: string): Promise<void>;
  shelvePitch(bookSlug: string, logline?: string): Promise<ShelvedPitchMeta>;
  restorePitch(pitchSlug: string): Promise<BookMeta>;

  // Pitch Room drafts
  listPitchDrafts(): Promise<PitchDraft[]>;
  getPitchDraft(conversationId: string): Promise<PitchDraft | null>;
  readPitchDraftContent(conversationId: string): Promise<string>;
  deletePitchDraft(conversationId: string): Promise<void>;
  promotePitchToBook(conversationId: string): Promise<BookMeta>;
  shelvePitchDraft(conversationId: string, logline?: string): Promise<ShelvedPitchMeta>;

  /**
   * Returns the absolute path to the pitch room drafts directory for a given
   * conversation. Used by ChatService to set the working directory for Spark
   * when running in pitch-room mode. Creates the directory structure if needed.
   */
  getPitchDraftPath(conversationId: string): string;
}

/**
 * @deprecated Use `IModelProvider` for the provider interface or `IProviderRegistry`
 * for routed access to all providers. This interface is retained during the
 * multi-model migration. ClaudeCodeClient implements both IClaudeClient and
 * IModelProvider (they have the same method signatures). Will be removed
 * after all services migrate to IProviderRegistry.
 */
export interface IClaudeClient {
  sendMessage(params: {
    model: string;
    systemPrompt: string;
    messages: { role: MessageRole; content: string }[];
    maxTokens: number;
    thinkingBudget?: number;
    maxTurns?: number;           // CLI --max-turns (default 30)
    bookSlug?: string;
    workingDir?: string;
    sessionId?: string;          // caller-provided session ID for tracking
    conversationId?: string;     // needed for event persistence
    onEvent: (event: StreamEvent) => void;
  }): Promise<void>;

  /**
   * Immediately kill the CLI child process for the given conversation.
   *
   * Sends SIGTERM first, then SIGKILL after a 2-second grace period if
   * the process hasn't exited. No-op if no process is active for the
   * given conversationId.
   */
  abortStream(conversationId: string): void;

  isAvailable(): Promise<boolean>;
  invalidateAvailabilityCache(): void;

  hasActiveProcesses(): boolean;
  hasActiveProcessesForBook(bookSlug: string): boolean;
}

/**
 * A model provider that can send messages and stream responses.
 *
 * This is the core abstraction for all AI backends. Claude CLI, OpenCode CLI,
 * and OpenAI-compatible API providers all implement this interface.
 *
 * Providers declare their capabilities (tool-use, thinking, streaming) so
 * services can adapt their behavior based on what the backend supports.
 */
export interface IModelProvider {
  /** Stable identifier matching the ProviderConfig.id this provider was created from. */
  readonly providerId: ProviderId;

  /** What this provider can do. Checked by services to gate features. */
  readonly capabilities: ProviderCapability[];

  /**
   * Send a message and stream the response via onEvent callbacks.
   * The provider translates its native streaming format into StreamEvent.
   */
  sendMessage(params: {
    model: string;
    systemPrompt: string;
    messages: { role: MessageRole; content: string }[];
    maxTokens: number;
    thinkingBudget?: number;
    maxTurns?: number;
    bookSlug?: string;
    workingDir?: string;
    sessionId?: string;
    conversationId?: string;
    onEvent: (event: StreamEvent) => void;
  }): Promise<void>;

  /** Kill an active stream for the given conversation. No-op if nothing is active. */
  abortStream(conversationId: string): void;

  /** Check if this provider's backend is reachable and authenticated. */
  isAvailable(): Promise<boolean>;

  /** Force re-check on next isAvailable() call. */
  invalidateAvailabilityCache(): void;

  /** Whether this provider has any active (in-flight) requests. */
  hasActiveProcesses(): boolean;

  /** Whether this provider has active requests for a specific book. */
  hasActiveProcessesForBook(bookSlug: string): boolean;
}

/**
 * Registry that manages all configured model providers.
 *
 * Acts as a router — services call it with a model ID, and it resolves
 * which provider handles that model. Also provides CRUD for provider configs.
 */
export interface IProviderRegistry {
  /** Register a provider instance. Called during app initialization. */
  registerProvider(provider: IModelProvider, config: ProviderConfig): void;

  /** Remove a provider. No-op for built-in providers. */
  removeProvider(providerId: ProviderId): void;

  /** Get a specific provider by ID. Returns null if not registered. */
  getProvider(providerId: ProviderId): IModelProvider | null;

  /** Get the provider designated as default (Claude CLI initially). */
  getDefaultProvider(): IModelProvider;

  /** Resolve which provider handles a given model ID. Returns null if no provider claims it. */
  getProviderForModel(modelId: string): IModelProvider | null;

  /** List all registered provider configs. */
  listProviders(): ProviderConfig[];

  /** List all models from all enabled providers. */
  listAllModels(): ModelInfo[];

  /** Check availability of a specific provider. */
  checkProviderStatus(providerId: ProviderId): Promise<ProviderStatus>;

  /** Get the current config for a provider. */
  getProviderConfig(providerId: ProviderId): ProviderConfig | null;

  /** Update a provider's config (e.g. API key, base URL, enabled state, model list). */
  updateProviderConfig(providerId: ProviderId, partial: Partial<ProviderConfig>): void;

  // === Convenience delegates (route to the appropriate provider) ===

  /** Send a message using whichever provider owns the specified model. */
  sendMessage(params: {
    model: string;
    systemPrompt: string;
    messages: { role: MessageRole; content: string }[];
    maxTokens: number;
    thinkingBudget?: number;
    maxTurns?: number;
    bookSlug?: string;
    workingDir?: string;
    sessionId?: string;
    conversationId?: string;
    onEvent: (event: StreamEvent) => void;
  }): Promise<void>;

  /** Abort a stream — checks all providers since the caller may not know which is active. */
  abortStream(conversationId: string): void;

  /** Whether any provider has active requests. */
  hasActiveProcesses(): boolean;

  /** Whether any provider has active requests for a specific book. */
  hasActiveProcessesForBook(bookSlug: string): boolean;
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
   * that a phase is done. Also auto-confirms the phase (no separate
   * `confirmPhaseAdvancement` call needed).
   */
  markPhaseComplete(bookSlug: string, phaseId: PipelinePhaseId): Promise<void>;

  /**
   * Confirm that a phase's work is accepted and the pipeline should advance.
   *
   * When an agent writes a pipeline-gating file, the phase transitions to
   * 'pending-completion' rather than immediately advancing. The next phase
   * remains locked until the user calls this method, signalling they have
   * reviewed the output and are ready to proceed.
   *
   * Idempotent — calling it on an already-confirmed phase is a no-op.
   */
  confirmPhaseAdvancement(bookSlug: string, phaseId: PipelinePhaseId): Promise<void>;

  /**
   * Archive the revision reports to signal the revision phase is complete.
   *
   * Copies source/reader-report.md → source/reader-report-v1.md and
   * source/dev-report.md → source/dev-report-v1.md (if it exists).
   * Once these versioned files exist, the pipeline auto-advances:
   * the `revision` phase completes and `second-read` unlocks.
   */
  completeRevision(bookSlug: string): Promise<void>;

  /**
   * Revert a pipeline phase, moving it back to an un-confirmed state.
   *
   * Removes the phase (and all subsequent phases) from the confirmed list
   * in `pipeline-state.json`. This makes the target phase the new "current"
   * phase — it will show as 'pending-completion' if its detection files
   * still exist, or 'active' if they don't.
   *
   * For phases that depend on book status or archived files, the revert
   * also undoes those side-effects:
   * - `first-draft`: reverts book status to 'first-draft'
   * - `mechanical-fixes`: reverts book status to 'copy-edit'
   * - `revision`: removes the archived v1 report files
   *
   * This is a non-destructive operation for file-existence phases — the
   * agent's output files remain on disk. The user can re-confirm them
   * with "Advance →" or delete them manually to redo the phase.
   */
  revertPhase(bookSlug: string, phaseId: PipelinePhaseId): Promise<void>;
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
   * Return the live running status for a book's queue.
   * Used by the frontend to re-derive isRunning / activeSessionId after a
   * book switch, since the singleton store loses that state when swapping plans.
   */
  getQueueStatus(bookSlug: string): QueueStatus;

  startVerification(planId: string): Promise<string>;

  // Register event listener
  onEvent(callback: (event: RevisionQueueEvent) => void): () => void;
}

export interface IMotifLedgerService {
  load(bookSlug: string): Promise<MotifLedger>;
  save(bookSlug: string, ledger: MotifLedger): Promise<void>;
  getUnauditedChapters(bookSlug: string): Promise<string[]>;
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

export interface IUsageService {
  recordUsage(params: {
    conversationId: string;
    inputTokens: number;
    outputTokens: number;
    thinkingTokens: number;
    model: string;
  }): void;
  getSummary(bookSlug?: string): UsageSummary;
  getByConversation(conversationId: string): UsageRecord[];
}

export interface IChatService {
  sendMessage(params: {
    agentName: AgentName;
    message: string;
    conversationId: string;
    bookSlug: string;
    thinkingBudgetOverride?: number;
    callId?: string;
    onEvent: (event: StreamEvent) => void;
  }): Promise<{ changedFiles: string[] }>;

  createConversation(params: {
    bookSlug: string;
    agentName: AgentName;
    pipelinePhase: PipelinePhaseId | null;
    purpose?: ConversationPurpose;
  }): Promise<Conversation>;

  getConversations(bookSlug: string): Promise<Conversation[]>;
  getMessages(conversationId: string): Promise<Message[]>;

  abortStream(conversationId: string): void;
  getActiveStream(): ActiveStreamInfo | null;
  getActiveStreamForBook(bookSlug: string): ActiveStreamInfo | null;

  getLastDiagnostics(conversationId?: string): ContextDiagnostics | null;

  isCliIdle(bookSlug?: string): boolean;

  recoverOrphanedSessions(): Promise<StreamSessionRecord[]>;
  getRecoveredOrphans(): StreamSessionRecord[];

  /**
   * Run a chapter deep dive — a scoped Lumen craft analysis of a single chapter.
   *
   * Loads the target chapter draft, its notes.md (if present), and the scene
   * outline. Creates a new Lumen conversation, sends the assembled prompt, and
   * streams Lumen's analysis back via onEvent.
   *
   * Does NOT use Wrangler context assembly — context is built inline.
   * Does NOT write files — output is chat-only.
   *
   * Returns the conversationId so the UI can navigate to it.
   */
  deepDive(params: {
    bookSlug: string;
    chapterSlug: string;
    /** Pre-created conversationId. If omitted the service creates one. */
    conversationId?: string;
    callId?: string;
    onEvent: (event: StreamEvent) => void;
  }): Promise<{ conversationId: string }>;

}

export interface IAuditService {
  auditChapter(params: {
    bookSlug: string;
    chapterSlug: string;
    conversationId?: string;
    onEvent?: (event: StreamEvent) => void;
  }): Promise<AuditResult | null>;

  fixChapter(params: {
    bookSlug: string;
    chapterSlug: string;
    auditResult: AuditResult;
    conversationId: string;
    sessionId: string;
    onEvent: (event: StreamEvent) => void;
  }): Promise<void>;

  runMotifAudit(params: {
    bookSlug: string;
    appSettings: { model: string; maxTokens: number; enableThinking: boolean; thinkingBudget: number; overrideThinkingBudget: boolean };
    onEvent: (event: StreamEvent) => void;
    sessionId: string;
  }): Promise<void>;
}

export interface IPitchRoomService {
  handleMessage(params: {
    conversationId: string;
    agentName: AgentName;
    bookSlug: string;
    appSettings: { model: string; maxTokens: number; enableThinking: boolean; thinkingBudget: number; overrideThinkingBudget: boolean };
    agent: { systemPrompt: string; thinkingBudget: number };
    onEvent: (event: StreamEvent) => void;
    sessionId: string;
    thinkingBudgetOverride?: number;
    callId?: string;
  }): Promise<void>;
}

export interface IHotTakeService {
  handleMessage(params: {
    conversationId: string;
    bookSlug: string;
    appSettings: { model: string; maxTokens: number; enableThinking: boolean; thinkingBudget: number; overrideThinkingBudget: boolean };
    agent: { systemPrompt: string; thinkingBudget: number };
    onEvent: (event: StreamEvent) => void;
    sessionId: string;
    thinkingBudgetOverride?: number;
    callId?: string;
  }): Promise<void>;
}

export interface IAdhocRevisionService {
  handleMessage(params: {
    conversationId: string;
    bookSlug: string;
    message: string;
    appSettings: { model: string; maxTokens: number; enableThinking: boolean; thinkingBudget: number; overrideThinkingBudget: boolean };
    agent: { systemPrompt: string; thinkingBudget: number };
    onEvent: (event: StreamEvent) => void;
    sessionId: string;
    thinkingBudgetOverride?: number;
    callId?: string;
  }): Promise<void>;
}

export interface IVersionService {
  /**
   * Create a snapshot of a file's current content.
   *
   * Reads the file from disk, hashes it, and stores it in the version
   * history if the content differs from the most recent snapshot.
   * Returns the new version, or null if the content was unchanged
   * (dedup by hash).
   */
  snapshotFile(bookSlug: string, filePath: string, source: FileVersionSource): Promise<FileVersion | null>;

  /**
   * Create a snapshot from provided content (when content is already in memory).
   * Same dedup behavior as snapshotFile.
   */
  snapshotContent(bookSlug: string, filePath: string, content: string, source: FileVersionSource): Promise<FileVersion | null>;

  /**
   * List version history for a file, newest first.
   * Returns lightweight summaries (no content).
   */
  getHistory(bookSlug: string, filePath: string, limit?: number, offset?: number): Promise<FileVersionSummary[]>;

  /**
   * Get a single version with its full content.
   */
  getVersion(versionId: number): Promise<FileVersion | null>;

  /**
   * Compute a structured diff between two versions.
   * If oldVersionId is null, diffs against an empty string (shows full content as additions).
   */
  getDiff(oldVersionId: number | null, newVersionId: number): Promise<FileDiff>;

  /**
   * Revert a file to a previous version.
   * Reads the target version's content, writes it to disk, and creates
   * a new snapshot with source='revert'.
   */
  revertToVersion(bookSlug: string, filePath: string, versionId: number): Promise<FileVersion>;

  /**
   * Count total versions for a file.
   */
  getVersionCount(bookSlug: string, filePath: string): Promise<number>;

  /**
   * Delete old versions beyond a retention limit per file.
   * Keeps the most recent `keepCount` versions. Returns the number deleted.
   */
  pruneVersions(bookSlug: string, keepCount?: number): Promise<number>;
}

export interface IManuscriptImportService {
  /**
   * Read a manuscript file, convert from DOCX if needed, detect chapter
   * boundaries, and return a preview for user review before committing.
   *
   * @param filePath Absolute path to the source file (.md or .docx)
   */
  preview(filePath: string): Promise<ImportPreview>;

  /**
   * Commit the import: create the book directory structure, write each
   * chapter as a separate draft.md file, populate about.json, and set
   * the book status to 'first-draft'.
   *
   * The chapters array may have been edited by the user (renamed, merged,
   * reordered) compared to what preview() originally returned.
   */
  commit(config: ImportCommitConfig): Promise<ImportResult>;
}

export interface ISourceGenerationService {
  /**
   * Generate source documents for an imported book by running sequential
   * agent calls: Spark for pitch, Verity for outline/bible/voice/motif.
   *
   * Emits SourceGenerationEvent progress updates and StreamEvent for
   * individual agent streams. Resolves when all steps are complete
   * (or rejects on unrecoverable error).
   */
  generate(params: {
    bookSlug: string;
    onProgress: (event: SourceGenerationEvent) => void;
    onStreamEvent: (event: StreamEvent) => void;
  }): Promise<void>;
}

export interface ISeriesService {
  /** List all series with computed summary fields. */
  listSeries(): Promise<SeriesSummary[]>;

  /** Get a single series by slug. Returns null if not found. */
  getSeries(slug: string): Promise<SeriesMeta | null>;

  /** Create a new series. Returns the created metadata. */
  createSeries(name: string, description?: string): Promise<SeriesMeta>;

  /** Update series metadata (name, description). Does not modify volumes. */
  updateSeries(slug: string, partial: Partial<Pick<SeriesMeta, 'name' | 'description'>>): Promise<SeriesMeta>;

  /** Delete a series. Does not delete the books — only removes the grouping. */
  deleteSeries(slug: string): Promise<void>;

  /** Add a book to a series at a specific position. Shifts existing volumes. */
  addVolume(seriesSlug: string, bookSlug: string, volumeNumber?: number): Promise<SeriesMeta>;

  /** Remove a book from a series. Renumbers remaining volumes. */
  removeVolume(seriesSlug: string, bookSlug: string): Promise<SeriesMeta>;

  /** Reorder volumes within a series. `orderedSlugs` is the new order. */
  reorderVolumes(seriesSlug: string, orderedSlugs: string[]): Promise<SeriesMeta>;

  /**
   * Find which series a book belongs to (if any).
   * Uses an in-memory reverse-lookup cache rebuilt on mutation.
   */
  getSeriesForBook(bookSlug: string): Promise<SeriesMeta | null>;

  /**
   * Read the series bible markdown content.
   * Returns empty string if the file doesn't exist yet.
   */
  readSeriesBible(seriesSlug: string): Promise<string>;

  /** Write (create or overwrite) the series bible markdown. */
  writeSeriesBible(seriesSlug: string, content: string): Promise<void>;

  /**
   * Get the absolute path to the series bible file.
   * Used by ContextBuilder to include in read guidance.
   * Returns null if the book is not part of a series.
   */
  getSeriesBiblePath(bookSlug: string): Promise<string | null>;

  /**
   * Invalidate the in-memory cache. Called when books are created/deleted/renamed
   * to ensure the reverse lookup stays consistent.
   */
  invalidateCache(): void;
}

export interface ISeriesImportService {
  /**
   * Preview multiple manuscript files for series import.
   *
   * Runs the single-book preview for each file, wraps results as
   * SeriesImportVolume entries, and attempts to detect a common series
   * name from the file names or detected titles.
   *
   * @param filePaths Absolute paths to the source files (.md or .docx)
   */
  preview(filePaths: string[]): Promise<SeriesImportPreview>;

  /**
   * Commit the series import: create each book, create or attach to a
   * series, and link all books as volumes.
   *
   * Books are created in volume order. If any individual book import
   * fails, previously imported books remain (no rollback) and the error
   * is reported in the result.
   */
  commit(config: SeriesImportCommitConfig): Promise<SeriesImportResult>;
}

export interface IHelperService {
  /**
   * Send a message to the helper agent.
   *
   * Creates a conversation on first use. Subsequent messages reuse the
   * same conversation. The helper's system prompt includes the full
   * user guide so it can answer questions about the application.
   *
   * Working directory: the active book's directory if one exists,
   * otherwise the userData root. This lets the helper reference book
   * files when relevant.
   */
  sendMessage(params: {
    message: string;
    conversationId: string;
    onEvent: (event: StreamEvent) => void;
    sessionId?: string;
    callId?: string;
  }): Promise<void>;

  /**
   * Get or create the persistent helper conversation.
   * Returns the existing conversation if one exists, otherwise creates a new one.
   */
  getOrCreateConversation(): Promise<Conversation>;

  /**
   * Get all messages in the helper conversation.
   */
  getMessages(conversationId: string): Promise<Message[]>;

  /**
   * Abort the active helper stream. No-op if nothing is active.
   */
  abortStream(conversationId: string): void;

  /**
   * Delete the helper conversation and start fresh.
   */
  resetConversation(): Promise<void>;
}

export interface IFindReplaceService {
  /**
   * Scan all chapter draft.md files in a book for occurrences of `searchTerm`.
   *
   * Scopes exclusively to `chapters/<slug>/draft.md` files. Returns a per-file
   * summary with exact match counts and up to 20 sample match locations per
   * file (for UI display).
   *
   * Throws if `searchTerm` is empty, or if `useRegex` is true and the
   * pattern is syntactically invalid.
   */
  preview(
    bookSlug: string,
    searchTerm: string,
    options: FindReplaceOptions,
  ): Promise<FindReplacePreviewResult>;

  /**
   * Apply find-replace to the specified files.
   *
   * For each file in `filePaths`:
   * 1. Read current content from disk.
   * 2. Snapshot the pre-replace content via IVersionService (source='user').
   * 3. Apply all replacements using the same regex built from `searchTerm` + `options`.
   * 4. Write the updated content.
   *
   * Files where no matches are found are silently skipped (not counted in
   * `filesChanged`, not included in `details`).
   *
   * Throws if `searchTerm` is empty or if `useRegex` is true and the pattern
   * is syntactically invalid.
   */
  apply(params: {
    bookSlug: string;
    searchTerm: string;
    replacement: string;
    filePaths: string[];
    options: FindReplaceOptions;
  }): Promise<FindReplaceApplyResult>;
}

export interface IDashboardService {
  getDashboardData(bookSlug: string): Promise<BookDashboardData>;
}

export interface IStatisticsService {
  getStatistics(bookSlug?: string): Promise<BookStatistics>;
  recordWordCountSnapshot(bookSlug: string): Promise<void>;
}
