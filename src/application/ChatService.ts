import type {
  IAgentService,
  IAdhocRevisionService,
  IChatService,
  IHotTakeService,
  IPitchRoomService,
  IChapterValidator,
  IProviderRegistry,
  IDatabaseService,
  IFileSystemService,
  ISeriesService,
  ISettingsService,
} from '@domain/interfaces';
import type {
  ActiveStreamInfo,
  AgentName,
  ContextDiagnostics,
  Conversation,
  ConversationPurpose,
  Message,
  PipelinePhaseId,
  StreamEvent,
  StreamSessionRecord,
} from '@domain/types';
import { nanoid } from 'nanoid';
import { VERITY_PHASE_FILES, VERITY_LEDGER_FILE, AGENT_REGISTRY } from '@domain/constants';
import { randomPreparingStatus, randomWaitingStatus } from '@domain/statusMessages';
import { ContextBuilder } from './ContextBuilder';
import { StreamManager } from './StreamManager';
import { resolveThinkingBudget } from './thinkingBudget';

/**
 * ChatService — Central orchestrator for the send→stream→save message flow.
 *
 * Coordinates the full lifecycle of a single agent interaction:
 * 1. Validate CLI availability
 * 2. Save the user message
 * 3. Build a lightweight file manifest and lean system prompt via ContextBuilder
 * 4. Stream the agent response via Claude CLI (full agent mode with tool use)
 * 5. Accumulate and save the assistant response
 * 6. Record token usage
 *
 * Depends entirely on injected interfaces — no concrete infrastructure imports.
 */
export class ChatService implements IChatService {
  private diagnosticsMap: Map<string, ContextDiagnostics> = new Map();
  private static readonly MAX_DIAGNOSTICS_ENTRIES = 20;
  private contextBuilder = new ContextBuilder();
  private recoveredOrphans: StreamSessionRecord[] = [];

  constructor(
    private settings: ISettingsService,
    private agents: IAgentService,
    private db: IDatabaseService,
    private providers: IProviderRegistry,
    private fs: IFileSystemService,
    private chapterValidator: IChapterValidator,
    private pitchRoom: IPitchRoomService,
    private hotTake: IHotTakeService,
    private adhocRevision: IAdhocRevisionService,
    private streamManager: StreamManager,
    private series: ISeriesService,
  ) {}

  isCliIdle(bookSlug?: string): boolean {
    if (bookSlug) {
      return !this.providers.hasActiveProcessesForBook(bookSlug);
    }
    return !this.providers.hasActiveProcesses();
  }

  /**
   * Called once at app startup. Checks for orphaned stream sessions
   * (started but never finished) and marks them as interrupted.
   *
   * Returns the list of interrupted sessions so the UI can display
   * a recovery notice (e.g., "Previous session interrupted during: drafting").
   */
  async recoverOrphanedSessions(): Promise<StreamSessionRecord[]> {
    const orphans = this.db.getActiveStreamSessions();

    for (const session of orphans) {
      this.db.markSessionInterrupted(session.id, session.finalStage);
    }

    this.recoveredOrphans = orphans;
    return orphans;
  }

  /** Returns orphans recovered at startup (cached). */
  getRecoveredOrphans(): StreamSessionRecord[] {
    return this.recoveredOrphans;
  }

  /**
   * Send a message to an agent and stream the response.
   *
   * This is the primary entry point for all agent interactions. It orchestrates
   * the full flow: context assembly via the lean ContextBuilder, CLI call,
   * response capture, and usage tracking. Agents run in full agent mode with
   * tool use — they can read and write files directly in the book directory.
   *
   * All stream events are forwarded to the caller's onEvent callback, including
   * thinking deltas, text deltas, tool use events, and the final done/error events.
   */
  async sendMessage(params: {
    agentName: AgentName;
    message: string;
    conversationId: string;
    bookSlug: string;
    thinkingBudgetOverride?: number;
    callId?: string;
    onEvent: (event: StreamEvent) => void;
  }): Promise<{ changedFiles: string[] }> {
    const { agentName, message, conversationId, bookSlug, onEvent } = params;

    // Step 1: Check Claude CLI availability
    const available = await this.providers.getDefaultProvider().isAvailable();
    if (!available) {
      onEvent({
        type: 'error',
        message: 'Claude Code CLI not found or not authenticated. Run `claude login` to set up.',
      });
      return { changedFiles: [] };
    }

    // Step 2: Load settings for model, maxTokens, thinking config
    const appSettings = await this.settings.load();

    // Step 3: Load the agent metadata and system prompt
    const agent = await this.agents.load(agentName);

    // Step 4: Save the user message
    this.db.saveMessage({
      conversationId,
      role: 'user',
      content: message,
      thinking: '',
    });

    // Create a session record for orphan detection
    const sessionId = nanoid();
    this.db.createStreamSession({
      id: sessionId,
      conversationId,
      agentName,
      model: appSettings.model,
      bookSlug,
      startedAt: new Date().toISOString(),
      endedAt: null,
      finalStage: 'idle',
      filesTouched: {},
      interrupted: false,
    });

    // Steps 5–9: Context assembly → CLI call → response capture
    // Wrapped in try/catch so errors are always forwarded as events
    try {
      // Step 5: Retrieve conversation to check purpose
      const conversation = this.db.getConversation(conversationId);

      // Pitch Room branch — skip wrangler, minimal context, custom working dir
      if (conversation?.purpose === 'pitch-room') {
        await this.pitchRoom.handleMessage({
          conversationId, agentName, bookSlug, appSettings, agent, onEvent, sessionId,
          thinkingBudgetOverride: params.thinkingBudgetOverride,
          callId: params.callId,
        });
        return { changedFiles: [] };
      }

      // Hot Take branch — Ghostlight reads full manuscript in agent mode, no files written
      if (conversation?.purpose === 'hot-take') {
        await this.hotTake.handleMessage({
          conversationId, bookSlug, appSettings, agent, onEvent, sessionId,
          thinkingBudgetOverride: params.thinkingBudgetOverride,
          callId: params.callId,
        });
        return { changedFiles: [] };
      }

      // Ad Hoc Revision branch — Forge generates project-tasks.md and revision-prompts.md
      if (conversation?.purpose === 'adhoc-revision') {
        await this.adhocRevision.handleMessage({
          conversationId, bookSlug, message, appSettings, agent, onEvent, sessionId,
          thinkingBudgetOverride: params.thinkingBudgetOverride,
          callId: params.callId,
        });
        return { changedFiles: [] };
      }

      // Step 5b: Build lightweight manifest (fast — just file listing)
      onEvent({ type: 'status', message: randomPreparingStatus() });
      const manifest = await this.fs.getProjectManifest(bookSlug);

      // Step 6: Get conversation messages from DB
      const messages = this.db.getMessages(conversationId);

      // Step 7: Determine purpose-specific instructions (loaded from agent files)
      let purposeInstructions: string | undefined;
      if (conversation?.purpose === 'voice-setup') {
        purposeInstructions = await this.agents.loadRaw('VOICE-SETUP.md');
      } else if (conversation?.purpose === 'author-profile') {
        const authorProfilePath = this.fs.getAuthorProfilePath();
        const authorProfileTemplate = await this.agents.loadRaw('AUTHOR-PROFILE.md');
        purposeInstructions = authorProfileTemplate.replace(
          'author-profile.md',
          authorProfilePath,
        );
      } else if (conversation?.agentName === 'Verity' && conversation?.title === 'Revision Verification') {
        purposeInstructions = await this.agents.loadRaw('REVISION-VERIFICATION.md');
      }

      // Step 7b: Determine thinking budget (needed for both context and CLI call)
      const thinkingBudget = resolveThinkingBudget(appSettings, agent.thinkingBudget, params.thinkingBudgetOverride);

      // Step 7c: Phase-aware system prompt assembly for Verity
      let effectiveSystemPrompt = agent.systemPrompt;

      if (agentName === 'Verity' && conversation?.purpose === 'pipeline') {
        const supplements: string[] = [];
        if (conversation.pipelinePhase) {
          const phaseFile = VERITY_PHASE_FILES[conversation.pipelinePhase];
          if (phaseFile) {
            supplements.push(phaseFile);
          }
        }
        supplements.push(VERITY_LEDGER_FILE);
        effectiveSystemPrompt = await this.agents.loadComposite(
          AGENT_REGISTRY.Verity.filename,
          supplements,
        );
      }

      // Step 7d: Resolve series bible path (if book is part of a series)
      const seriesBiblePath = await this.series.getSeriesBiblePath(bookSlug);

      // Step 7e: Build context using the lean ContextBuilder (budget-aware compaction)
      const authorProfileAbsPath = this.fs.getAuthorProfilePath();
      const assembled = this.contextBuilder.build({
        agentName,
        agentSystemPrompt: effectiveSystemPrompt,
        manifest,
        messages,
        purposeInstructions,
        authorProfilePath: authorProfileAbsPath,
        seriesBiblePath: seriesBiblePath ?? undefined,
        thinkingBudget,
      });

      // Step 8: Store diagnostics keyed by conversationId
      this.diagnosticsMap.set(conversationId, assembled.diagnostics);

      // Prune old entries to prevent unbounded growth
      if (this.diagnosticsMap.size > ChatService.MAX_DIAGNOSTICS_ENTRIES) {
        const oldest = this.diagnosticsMap.keys().next().value;
        if (oldest) this.diagnosticsMap.delete(oldest);
      }

      // Step 8c–9: Start managed stream and call the agent
      const stream = this.streamManager.startStream({
        conversationId,
        agentName,
        model: appSettings.model,
        bookSlug,
        sessionId,
        callId: params.callId ?? '',
        onEvent,
      }, {
        onDone: async () => {
          // Validate and correct chapter file placement (Verity sometimes misplaces files)
          try {
            const correctedChapters = await this.chapterValidator.validateAndCorrect(bookSlug);
            if (correctedChapters.length > 0) {
              console.log('Corrected chapter placement:', correctedChapters);
              onEvent({
                type: 'status',
                message: `Fixed ${correctedChapters.length} chapter file placement issue(s)`,
              });
            }
          } catch (err) {
            console.error('Chapter validation error:', err);
          }
        },
      });

      onEvent({ type: 'status', message: randomWaitingStatus() });

      await this.providers.sendMessage({
        model: appSettings.model,
        systemPrompt: assembled.systemPrompt,
        messages: assembled.conversationMessages,
        maxTokens: appSettings.maxTokens,
        thinkingBudget,
        maxTurns: agent.maxTurns,
        bookSlug,
        sessionId,
        conversationId,
        onEvent: stream.onEvent,
      });

      return { changedFiles: stream.getChangedFiles() };
    } catch (err) {
      this.streamManager.cleanupErroredStream(conversationId, sessionId);
      const errorMessage = err instanceof Error ? err.message : String(err);
      onEvent({ type: 'error', message: errorMessage });
      return { changedFiles: [] };
    }
  }

  /**
   * Create a new conversation for a book and agent.
   *
   * Generates a unique ID via nanoid and delegates to the database service.
   * The title is left empty — the DB service sets it from the first user message.
   */
  async createConversation(params: {
    bookSlug: string;
    agentName: AgentName;
    pipelinePhase: PipelinePhaseId | null;
    purpose?: ConversationPurpose;
  }): Promise<Conversation> {
    const { bookSlug, agentName, pipelinePhase, purpose } = params;

    return this.db.createConversation({
      id: nanoid(),
      bookSlug,
      agentName,
      pipelinePhase,
      purpose: purpose ?? 'pipeline',
      title: '',
    });
  }

  /**
   * List all conversations for a book, ordered by most recent.
   */
  async getConversations(bookSlug: string): Promise<Conversation[]> {
    return this.db.listConversations(bookSlug);
  }

  /**
   * Get all messages in a conversation, ordered chronologically.
   */
  async getMessages(conversationId: string): Promise<Message[]> {
    return this.db.getMessages(conversationId);
  }

  /**
   * Returns info about any active CLI stream, or null if idle.
   * Used by the renderer to restore streaming UI state after a window refresh.
   * Returns the first active stream found (for backward compat).
   */
  getActiveStream(): ActiveStreamInfo | null {
    return this.streamManager.getActiveStream();
  }

  /**
   * Returns the active CLI stream for a specific book, or null if that book
   * has no active stream. Used when switching books to recover an in-flight
   * stream without interfering with other books' streams.
   */
  getActiveStreamForBook(bookSlug: string): ActiveStreamInfo | null {
    return this.streamManager.getActiveStreamForBook(bookSlug);
  }

  /**
   * Immediately abort an active CLI stream for the given conversation.
   *
   * Kills the child process, saves any partial response accumulated so far,
   * marks the stream session as interrupted, and cleans up active stream state.
   * No-op if no active stream exists for the given conversationId.
   */
  abortStream(conversationId: string): void {
    // Kill the CLI child process
    this.providers.abortStream(conversationId);

    // Clean up active stream state and save partial response
    const aborted = this.streamManager.cleanupAbortedStream(conversationId);
    if (aborted) {
      // Save whatever was accumulated so far (if anything)
      if (aborted.textBuffer || aborted.thinkingBuffer) {
        this.db.saveMessage({
          conversationId,
          role: 'assistant',
          content: aborted.textBuffer
            ? aborted.textBuffer + '\n\n---\n*[Aborted by user]*'
            : '*[Aborted by user — no response received]*',
          thinking: aborted.thinkingBuffer,
        });
      }

      // Mark the session as interrupted
      this.db.endStreamSession(aborted.sessionId, aborted.progressStage, aborted.filesTouched);
    }
  }

  /**
   * Returns the ContextDiagnostics from the most recent sendMessage call.
   *
   * Used by the IPC layer to expose context assembly diagnostics to the UI,
   * showing what files are available, conversation turns, and manifest token cost.
   */
  getLastDiagnostics(conversationId?: string): ContextDiagnostics | null {
    if (conversationId) {
      return this.diagnosticsMap.get(conversationId) ?? null;
    }
    // Fallback: return the most recently added entry
    let last: ContextDiagnostics | null = null;
    for (const diag of this.diagnosticsMap.values()) {
      last = diag;
    }
    return last;
  }

  /**
   * Run a chapter deep dive — a scoped Lumen craft analysis of a single chapter.
   *
   * Assembles context inline (chapter draft + optional notes + scene outline) and
   * streams Lumen's surgical assessment back via onEvent. Output is chat-only;
   * no files are written.
   */
  async deepDive(params: {
    bookSlug: string;
    chapterSlug: string;
    conversationId?: string;
    callId?: string;
    onEvent: (event: StreamEvent) => void;
  }): Promise<{ conversationId: string }> {
    const { bookSlug, chapterSlug, callId, onEvent } = params;

    // Check CLI availability first
    const available = await this.providers.getDefaultProvider().isAvailable();
    if (!available) {
      onEvent({
        type: 'error',
        message: 'Claude Code CLI not found or not authenticated. Run `claude login` to set up.',
      });
      return { conversationId: params.conversationId ?? '' };
    }

    const appSettings = await this.settings.load();
    const agent = await this.agents.load('Lumen');

    // Use the pre-created conversationId if provided, otherwise create a new conversation
    let conversationId = params.conversationId;
    if (!conversationId) {
      const conversation = await this.createConversation({
        bookSlug,
        agentName: 'Lumen',
        pipelinePhase: null,
        purpose: 'pipeline',
      });
      conversationId = conversation.id;
    }

    // Assemble context inline — no Wrangler
    let chapterContent = '';
    try {
      chapterContent = await this.fs.readFile(bookSlug, `chapters/${chapterSlug}/draft.md`);
    } catch { /* chapter not found — proceed without */ }

    let notesContent = '';
    try {
      notesContent = await this.fs.readFile(bookSlug, `chapters/${chapterSlug}/notes.md`);
    } catch { /* no notes — that is fine */ }

    let sceneOutline = '';
    try {
      sceneOutline = await this.fs.readFile(bookSlug, 'source/scene-outline.md');
    } catch { /* no outline — proceed */ }

    const chapterNumber = chapterSlug.match(/^(\d+)/)?.[1] ?? '?';
    const userMessage = [
      `## Chapter Deep Dive Request`,
      ``,
      `**Chapter:** ${chapterSlug} (Chapter ${chapterNumber})`,
      ``,
      `### Chapter Draft`,
      ``,
      chapterContent || '*(draft not found)*',
      ``,
      notesContent ? `### Author Notes\n\n${notesContent}` : '',
      sceneOutline ? `### Scene Outline (full — find the relevant entry)\n\n${sceneOutline}` : '',
      ``,
      `---`,
      ``,
      `Conduct a surgical craft assessment of this single chapter only. Evaluate:`,
      `- Opening line — does it earn attention?`,
      `- Tension arc — where does tension spike, where does it go flat?`,
      `- Scene change — does the chapter open and close on different emotional territory?`,
      `- Proportion — action vs interiority vs dialogue balance for this scene's purpose`,
      `- Specific actionable notes — quote the text when identifying issues`,
      ``,
      `Do not read or reference any other chapters. Do not write any files.`,
    ].filter(Boolean).join('\n');

    this.db.saveMessage({
      conversationId,
      role: 'user',
      content: userMessage,
      thinking: '',
    });

    const sessionId = nanoid();
    this.db.createStreamSession({
      id: sessionId,
      conversationId,
      agentName: 'Lumen',
      model: appSettings.model,
      bookSlug,
      startedAt: new Date().toISOString(),
      endedAt: null,
      finalStage: 'idle',
      filesTouched: {},
      interrupted: false,
    });

    try {
      const thinkingBudget = resolveThinkingBudget(appSettings, agent.thinkingBudget, undefined);

      const stream = this.streamManager.startStream({
        conversationId,
        agentName: 'Lumen',
        model: appSettings.model,
        bookSlug,
        sessionId,
        callId: callId ?? '',
        onEvent,
      });

      onEvent({ type: 'status', message: randomWaitingStatus() });

      await this.providers.sendMessage({
        model: appSettings.model,
        systemPrompt: agent.systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        maxTokens: appSettings.maxTokens,
        thinkingBudget,
        maxTurns: 3,
        bookSlug,
        sessionId,
        conversationId,
        onEvent: stream.onEvent,
      });
    } catch (err) {
      this.streamManager.cleanupErroredStream(conversationId, sessionId);
      const errorMessage = err instanceof Error ? err.message : String(err);
      onEvent({ type: 'error', message: errorMessage });
    }

    return { conversationId };
  }

}
