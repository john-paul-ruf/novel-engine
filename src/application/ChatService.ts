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
import { VERITY_PHASE_FILES, VERITY_LEDGER_FILE, AGENT_REGISTRY, PHASE_OUTPUT_FILES, CLAUDE_CLI_PROVIDER_ID } from '@domain/constants';
import { randomPreparingStatus, randomWaitingStatus } from '@domain/statusMessages';
import { ContextBuilder } from './ContextBuilder';
import { MultiCallOrchestrator } from './MultiCallOrchestrator';
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
  private multiCallOrchestrator: MultiCallOrchestrator;

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
  ) {
    this.multiCallOrchestrator = new MultiCallOrchestrator(
      settings, agents, db, providers, fs, streamManager, series,
    );
  }

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

    // Step 1: Check provider availability
    const available = await this.providers.getDefaultProvider().isAvailable();
    if (!available) {
      onEvent({
        type: 'error',
        message: 'No model provider is available. Check your provider settings.',
      });
      return { changedFiles: [] };
    }

    // Step 2: Load settings for model, maxTokens, thinking config
    const appSettings = await this.settings.load();

    // Step 2b: Check provider capabilities for pipeline conversations
    const activeProvider = this.providers.getProviderForModel(appSettings.model)
      ?? this.providers.getDefaultProvider();
    const providerHasToolUse = activeProvider.capabilities.includes('tool-use');

    console.log(
      `[ChatService] Routing: model=${appSettings.model}, ` +
      `provider=${activeProvider.providerId}, ` +
      `toolUse=${providerHasToolUse}, agent=${agentName}`,
    );

    // Claude CLI is the only provider with a proven, reliable agent loop.
    // All other providers (Ollama, OpenAI-compatible) may or may not actually
    // use tools depending on the specific model. For these providers, we
    // pre-load manuscript content into the context as a safety net.
    const isClaudeCli = activeProvider.providerId === CLAUDE_CLI_PROVIDER_ID;

    // Look up model's context window for budget-aware context building
    const modelInfo = this.providers.listAllModels().find(m => m.id === appSettings.model);
    const modelContextWindow = modelInfo?.contextWindow;

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

      // Multi-call orchestration branch — break heavy pipeline agents into
      // sequential smaller calls (Sable, Lumen, Ghostlight). Only triggers
      // for pipeline conversations whose agent has multi-call steps defined.
      // Freeform chat messages and agents without steps bypass this entirely.
      // Note: <= 1 because the user message was already saved above (Step 4).
      if (
        conversation?.purpose === 'pipeline' &&
        MultiCallOrchestrator.hasMultiCallSteps(agentName) &&
        this.db.getMessages(conversationId).length <= 1  // First message (just saved above)
      ) {
        const result = await this.multiCallOrchestrator.runMultiCall({
          agentName,
          conversationId,
          bookSlug,
          thinkingBudgetOverride: params.thinkingBudgetOverride,
          callId: params.callId,
          onEvent,
        });
        return result;
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
        maxContextTokens: modelContextWindow,
      });

      // Step 7f: For non-Claude-CLI providers, add explicit file-path guidance
      // so the model knows where to find content using its Read/Write/Edit/LS
      // tools. Unlike Claude CLI (which discovers files via its own agent loop),
      // Ollama and other providers benefit from being told exactly which files
      // to read. This keeps the context small — the model loads content on
      // demand rather than having the entire manuscript pre-loaded.
      if (!isClaudeCli && conversation?.purpose === 'pipeline') {
        const fileGuidance = this.buildFileGuidance(manifest);
        if (fileGuidance) {
          assembled.systemPrompt += '\n\n' + fileGuidance;
        }
      }

      // Step 8: Store diagnostics keyed by conversationId
      this.diagnosticsMap.set(conversationId, assembled.diagnostics);

      // Prune old entries to prevent unbounded growth
      if (this.diagnosticsMap.size > ChatService.MAX_DIAGNOSTICS_ENTRIES) {
        const oldest = this.diagnosticsMap.keys().next().value;
        if (oldest) this.diagnosticsMap.delete(oldest);
      }

      // Step 8b: Determine pipeline context for post-stream extraction
      const isPipelineConversation = conversation?.purpose === 'pipeline';
      const pipelinePhase = conversation?.pipelinePhase ?? null;
      const phaseOutputFiles = pipelinePhase ? PHASE_OUTPUT_FILES[pipelinePhase] : undefined;

      // Warn upfront for non-Claude-CLI pipeline conversations: the model
      // has file tools available but may or may not use them. If it doesn't
      // write the expected output file, the post-stream extraction fallback
      // will auto-save the response text.
      if (isPipelineConversation && !isClaudeCli && phaseOutputFiles) {
        onEvent({
          type: 'warning',
          message: `File locations provided. If the model doesn't write to ${phaseOutputFiles.join(' and ')}, the response will be auto-saved there when complete.`,
        });
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
        onDone: async (doneEvent) => {
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

          // Post-stream file extraction: when the agent finishes a pipeline
          // conversation WITHOUT writing any files, extract the response text
          // and write it to the expected output file(s).
          //
          // This handles three cases:
          // 1. Provider has no tool-use at all (e.g. OpenAI-compatible HTTP)
          // 2. Provider offers tools but the model ignores them (e.g. Ollama
          //    model that doesn't support function calling — generates text
          //    describing what it would do instead of actually calling tools)
          // 3. Claude CLI agent that failed to write the expected file
          //
          // Use filesTouched from the done event (populated during the stream
          // via tracker.touchFile) rather than stream.getChangedFiles(), which
          // relies on filesChanged events that may arrive AFTER the done event
          // for Claude CLI (filesChanged is emitted from the process close
          // handler, which fires after the result event that triggers done).
          const noFilesWritten = Object.keys(doneEvent.filesTouched).length === 0;
          if (isPipelineConversation && phaseOutputFiles && noFilesWritten) {
            console.log(
              `[ChatService] Post-stream extraction: phase=${pipelinePhase}, ` +
              `files=${phaseOutputFiles.join(', ')}, bufferLen=${stream.getResponseBuffer().length}`,
            );
            await this.extractResponseToFiles(bookSlug, stream.getResponseBuffer(), phaseOutputFiles, onEvent);
          }
        },

        // Error fallback: if the stream errors but the response buffer has
        // content, still attempt to extract the output file. This covers
        // cases where the model streamed a valid response but then errored
        // (e.g. context window overflow mid-stream, connection drop after
        // the model finished generating but before the done event).
        onError: async (errorResponseBuffer: string) => {
          if (isPipelineConversation && phaseOutputFiles && errorResponseBuffer.trim()) {
            console.log(
              `[ChatService] Post-stream extraction (error fallback): phase=${pipelinePhase}, ` +
              `files=${phaseOutputFiles.join(', ')}, bufferLen=${errorResponseBuffer.length}`,
            );
            await this.extractResponseToFiles(bookSlug, errorResponseBuffer, phaseOutputFiles, onEvent);
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

      // Await any pending async hooks (onDone/onError) to ensure post-stream
      // file extraction completes before we return. Without this, the file
      // write is fire-and-forget and can be interrupted by HMR or process exit.
      await stream.awaitPendingHook();

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
   * Extract the agent's response text and write it to the expected pipeline output file(s).
   *
   * Called after a non-tool-use provider (e.g. Ollama without function calling) finishes
   * a pipeline conversation. The provider streamed the response as chat text but could not
   * write files. This method takes the accumulated response buffer and writes it to the
   * file(s) that the pipeline phase expects.
   *
   * For single-file phases (Ghostlight → reader-report.md, Lumen → dev-report.md),
   * the entire response is written as-is.
   *
   * For multi-file phases (Forge → project-tasks.md + revision-prompts.md), the response
   * is split at a well-known delimiter. The system prompt already instructs agents to write
   * content for each file in sequence. We look for the second file's path as a markdown
   * heading to split. If no delimiter is found, the full response goes to the primary file.
   */

  /**
   * Build inline manuscript content for non-tool-use providers.
   *
   * When the model can't use Read/LS tools, it needs the manuscript content
   * pre-loaded in the system prompt. This method reads all chapter drafts and
   * key source files, assembling them into a single context section.
   *
   * Follows the same pattern as HotTakeService's manuscript assembly but is
   * more general — includes source files that pipeline agents need beyond
   * just chapter content.
   */

  /**
   * Build a compact file-path guide for non-Claude-CLI providers.
   *
   * Instead of inlining the entire manuscript into the system prompt (which
   * blows out context windows on smaller models), this gives the model a
   * directory listing with word counts so it knows what's available and
   * can use its Read tool to load files on demand.
   */
  private buildFileGuidance(
    manifest: { files: { path: string; wordCount: number }[] },
  ): string | null {
    if (manifest.files.length === 0) return null;

    const sourceFiles = manifest.files.filter(
      (f) => f.path.startsWith('source/') && f.wordCount > 0,
    );
    const chapterFiles = manifest.files
      .filter((f) => f.path.startsWith('chapters/') && f.path.endsWith('/draft.md'))
      .sort((a, b) => a.path.localeCompare(b.path));

    const lines: string[] = [
      '---',
      '',
      '## Available Project Files',
      '',
      'You have Read, Write, Edit, and LS tools available. Use them to read files,',
      'produce your analysis, and write your output to the expected file.',
      '',
    ];

    if (sourceFiles.length > 0) {
      lines.push('### Source Files');
      for (const f of sourceFiles) {
        lines.push(`- \`${f.path}\` (${f.wordCount.toLocaleString()} words)`);
      }
      lines.push('');
    }

    if (chapterFiles.length > 0) {
      const totalWords = chapterFiles.reduce((sum, f) => sum + f.wordCount, 0);
      lines.push(`### Manuscript Chapters (${chapterFiles.length} chapters, ~${totalWords.toLocaleString()} words total)`);
      for (const f of chapterFiles) {
        const chapterName = f.path.replace('chapters/', '').replace('/draft.md', '');
        lines.push(`- \`${f.path}\` — ${chapterName} (${f.wordCount.toLocaleString()} words)`);
      }
      lines.push('');
    }

    lines.push(
      'Read each chapter in order using the Read tool before producing your output.',
      'Write your final output using the Write tool to the file specified in the task.',
      'If you cannot use tools, produce your output as text and it will be auto-saved.',
    );

    console.log(
      `[ChatService] File guidance: ${sourceFiles.length} source files, ` +
      `${chapterFiles.length} chapters listed`,
    );

    return lines.join('\n');
  }

  private async extractResponseToFiles(
    bookSlug: string,
    responseBuffer: string,
    outputFiles: string[],
    onEvent: (event: StreamEvent) => void,
  ): Promise<void> {
    if (!responseBuffer.trim()) {
      console.warn('[ChatService] Post-stream extraction skipped — empty response buffer');
      return;
    }

    try {
      if (outputFiles.length === 1) {
        // Single-file phase — write the full response
        await this.fs.writeFile(bookSlug, outputFiles[0], responseBuffer);
        onEvent({ type: 'filesChanged', paths: [outputFiles[0]] });
        onEvent({
          type: 'status',
          message: `Auto-saved response to ${outputFiles[0]}`,
        });
      } else {
        // Multi-file phase — attempt to split at the second file's path
        const [primaryFile, ...secondaryFiles] = outputFiles;
        const segments = this.splitResponseByFiles(responseBuffer, secondaryFiles);

        // Write primary file
        await this.fs.writeFile(bookSlug, primaryFile, segments.primary);

        // Write secondary files
        for (const [filePath, content] of segments.secondary) {
          await this.fs.writeFile(bookSlug, filePath, content);
        }

        const writtenPaths = [primaryFile, ...segments.secondary.map(([p]) => p)];
        onEvent({ type: 'filesChanged', paths: writtenPaths });
        onEvent({
          type: 'status',
          message: `Auto-saved response to ${writtenPaths.join(' and ')}`,
        });
      }
    } catch (err) {
      console.error('[ChatService] Post-stream file extraction failed:', err);
      onEvent({
        type: 'status',
        message: 'Warning: Could not auto-save agent response to file. The response is preserved in the conversation.',
      });
    }
  }

  /**
   * Split a multi-file response into segments keyed by file path.
   *
   * Looks for markdown headings or path references that match secondary file
   * names. For example, Forge typically writes:
   *
   *   ## project-tasks.md
   *   ...tasks content...
   *   ## revision-prompts.md
   *   ...prompts content...
   *
   * Returns the primary segment (everything before the first secondary heading)
   * and an array of [filePath, content] pairs for each secondary file found.
   */
  private splitResponseByFiles(
    response: string,
    secondaryFiles: string[],
  ): { primary: string; secondary: [string, string][] } {
    const secondary: [string, string][] = [];

    // Build regex patterns for each secondary file — match common heading styles
    // e.g. "## revision-prompts.md", "# source/revision-prompts.md", "---\nrevision-prompts.md"
    for (const filePath of secondaryFiles) {
      const fileName = filePath.split('/').pop() ?? filePath;
      const fileNameNoExt = fileName.replace(/\.md$/, '');

      // Match: heading with filename, or a line that is just the filename/path
      const pattern = new RegExp(
        `^(?:#{1,4}\\s+(?:source\\/)?(?:${this.escapeRegex(fileName)}|${this.escapeRegex(fileNameNoExt)})\\s*$|^---\\s*\\n\\s*(?:source\\/)?${this.escapeRegex(fileName)})`,
        'im',
      );

      const match = response.match(pattern);
      if (match && match.index !== undefined) {
        const splitIndex = match.index;
        const beforeSplit = response.slice(0, splitIndex);
        const afterSplit = response.slice(splitIndex + match[0].length).trim();

        response = beforeSplit;
        secondary.push([filePath, afterSplit]);
      }
    }

    return { primary: response.trim(), secondary };
  }

  /** Escape special regex characters in a string. */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
