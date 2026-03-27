import type {
  IAgentService,
  IChapterValidator,
  IClaudeClient,
  IDatabaseService,
  IFileSystemService,
  ISettingsService,
} from '@domain/interfaces';
import type {
  ActiveStreamInfo,
  AgentName,
  AppSettings,
  AuditResult,
  ContextDiagnostics,
  Conversation,
  ConversationPurpose,
  Message,
  PipelinePhaseId,
  StreamEvent,
  StreamSessionRecord,
} from '@domain/types';
import { nanoid } from 'nanoid';
import { VOICE_SETUP_INSTRUCTIONS, AUTHOR_PROFILE_INSTRUCTIONS, buildPitchRoomInstructions, REVISION_VERIFICATION_PROMPT, HOT_TAKE_INSTRUCTIONS, HOT_TAKE_MODEL, ADHOC_REVISION_INSTRUCTIONS, PHRASE_AUDIT_INSTRUCTIONS, PITCH_ROOM_SLUG, randomPreparingStatus, randomWaitingStatus, VERITY_PHASE_FILES, VERITY_AUDIT_AGENT_FILE, VERITY_AUDIT_MODEL, VERITY_AUDIT_MAX_TOKENS, VERITY_FIX_INSTRUCTIONS, AGENT_REGISTRY } from '@domain/constants';
import type { UsageService } from './UsageService';
import { ContextBuilder } from './ContextBuilder';

/**
 * Resolve the effective thinking budget for a CLI call.
 *
 * Priority:
 * 1. Per-message override (from the chat input slider)
 * 2. Global override (settings.overrideThinkingBudget + settings.thinkingBudget)
 * 3. Per-agent default (agent.thinkingBudget)
 * 4. undefined (thinking disabled)
 */
function resolveThinkingBudget(
  settings: Pick<AppSettings, 'enableThinking' | 'thinkingBudget' | 'overrideThinkingBudget'>,
  agentThinkingBudget: number,
  perMessageOverride?: number,
): number | undefined {
  // Per-message override takes highest priority
  if (perMessageOverride !== undefined) {
    return perMessageOverride > 0 ? perMessageOverride : undefined;
  }
  // Thinking disabled globally → no budget
  if (!settings.enableThinking) return undefined;
  // Global override → use settings slider value for all agents
  if (settings.overrideThinkingBudget) return settings.thinkingBudget;
  // Default → per-agent budget
  return agentThinkingBudget;
}

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
export class ChatService {
  private lastDiagnostics: ContextDiagnostics | null = null;
  private lastChangedFiles: string[] = [];
  private contextBuilder = new ContextBuilder();
  /** Active CLI streams keyed by conversationId — supports concurrent streams across books. */
  private activeStreams: Map<string, ActiveStreamInfo> = new Map();
  private recoveredOrphans: StreamSessionRecord[] = [];

  constructor(
    private settings: ISettingsService,
    private agents: IAgentService,
    private db: IDatabaseService,
    private claude: IClaudeClient,
    private fs: IFileSystemService,
    private usage: UsageService,
    private chapterValidator: IChapterValidator,
  ) {}

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
  }): Promise<void> {
    const { agentName, message, conversationId, bookSlug, onEvent } = params;

    // Reset changed files for this interaction
    this.lastChangedFiles = [];

    // Step 1: Check Claude CLI availability
    const available = await this.claude.isAvailable();
    if (!available) {
      onEvent({
        type: 'error',
        message: 'Claude Code CLI not found or not authenticated. Run `claude login` to set up.',
      });
      return;
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
        await this.handlePitchRoomMessage({
          conversationId, agentName, bookSlug, appSettings, agent, onEvent, sessionId,
          thinkingBudgetOverride: params.thinkingBudgetOverride,
          callId: params.callId,
        });
        return;
      }

      // Hot Take branch — Ghostlight reads full manuscript in agent mode, no files written
      if (conversation?.purpose === 'hot-take') {
        await this.handleHotTake({
          conversationId, bookSlug, appSettings, agent, onEvent, sessionId,
          thinkingBudgetOverride: params.thinkingBudgetOverride,
          callId: params.callId,
        });
        return;
      }

      // Ad Hoc Revision branch — Forge generates project-tasks.md and revision-prompts.md
      if (conversation?.purpose === 'adhoc-revision') {
        await this.handleAdhocRevision({
          conversationId, bookSlug, message, appSettings, agent, onEvent, sessionId,
          thinkingBudgetOverride: params.thinkingBudgetOverride,
          callId: params.callId,
        });
        return;
      }

      // Step 5b: Build lightweight manifest (fast — just file listing)
      onEvent({ type: 'status', message: randomPreparingStatus() });
      const manifest = await this.fs.getProjectManifest(bookSlug);

      // Step 6: Get conversation messages from DB
      const messages = this.db.getMessages(conversationId);

      // Step 7: Determine purpose-specific instructions
      let purposeInstructions: string | undefined;
      if (conversation?.purpose === 'voice-setup') {
        purposeInstructions = VOICE_SETUP_INSTRUCTIONS;
      } else if (conversation?.purpose === 'author-profile') {
        const authorProfilePath = this.fs.getAuthorProfilePath();
        purposeInstructions = AUTHOR_PROFILE_INSTRUCTIONS.replace(
          'author-profile.md',
          authorProfilePath,
        );
      } else if (conversation?.agentName === 'Verity' && conversation?.title === 'Revision Verification') {
        purposeInstructions = REVISION_VERIFICATION_PROMPT;
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
        effectiveSystemPrompt = await this.agents.loadComposite(
          AGENT_REGISTRY.Verity.filename,
          supplements,
        );
      }

      // Step 7d: Build context using the lean ContextBuilder (budget-aware compaction)
      const authorProfileAbsPath = this.fs.getAuthorProfilePath();
      const assembled = this.contextBuilder.build({
        agentName,
        agentSystemPrompt: effectiveSystemPrompt,
        manifest,
        messages,
        purposeInstructions,
        authorProfilePath: authorProfileAbsPath,
        thinkingBudget,
      });

      // Step 8: Store diagnostics
      this.lastDiagnostics = assembled.diagnostics;

      // Step 8c: Track active stream so renderer can recover after refresh.
      // Uses a Map so concurrent streams across books don't clobber each other.
      this.activeStreams.set(conversationId, {
        conversationId,
        agentName,
        model: appSettings.model,
        bookSlug,
        startedAt: new Date().toISOString(),
        sessionId,
        callId: params.callId ?? '',
        progressStage: 'idle',
        filesTouched: {},
        thinkingBuffer: '',
        textBuffer: '',
      });

      // Step 8d: Emit callStart metadata so the activity monitor knows what's happening
      onEvent({ type: 'callStart', agentName, model: appSettings.model, bookSlug });

      // Step 9: Call the agent — ONE call, no Wrangler pre-call
      onEvent({ type: 'status', message: randomWaitingStatus() });
      let responseBuffer = '';
      let thinkingBuffer = '';

      await this.claude.sendMessage({
        model: appSettings.model,
        systemPrompt: assembled.systemPrompt,
        messages: assembled.conversationMessages,
        maxTokens: appSettings.maxTokens,
        thinkingBudget,
        maxTurns: agent.maxTurns,
        bookSlug,
        sessionId,
        conversationId,
        onEvent: async (event: StreamEvent) => {
          // Update activeStream with live progress data (Session E).
          // Look up by conversationId so we only touch OUR entry.
          const stream = this.activeStreams.get(conversationId);
          if (stream) {
            if (event.type === 'progressStage') {
              stream.progressStage = event.stage;
            }
            if (event.type === 'toolDuration') {
              if (event.tool.filePath && (event.tool.toolName === 'Write' || event.tool.toolName === 'Edit')) {
                const current = stream.filesTouched[event.tool.filePath] ?? 0;
                stream.filesTouched[event.tool.filePath] = current + 1;
              }
            }
            if (event.type === 'done') {
              stream.filesTouched = event.filesTouched;
            }
          }

          // Accumulate response content (both local buffers and activeStream for recovery)
          if (event.type === 'textDelta') {
            responseBuffer += event.text;
            if (stream) stream.textBuffer = responseBuffer;
          } else if (event.type === 'thinkingDelta') {
            thinkingBuffer += event.text;
            if (stream) stream.thinkingBuffer = thinkingBuffer;
          } else if (event.type === 'filesChanged') {
            // Capture files changed during this interaction
            this.lastChangedFiles = event.paths;
          } else if (event.type === 'done') {
            // Save the assistant message with accumulated content
            this.db.saveMessage({
              conversationId,
              role: 'assistant',
              content: responseBuffer,
              thinking: thinkingBuffer,
            });

            // Record token usage via UsageService (handles cost calculation)
            this.usage.recordUsage({
              conversationId,
              inputTokens: event.inputTokens,
              outputTokens: event.outputTokens,
              thinkingTokens: event.thinkingTokens,
              model: appSettings.model,
            });

            // End the stream session record
            this.db.endStreamSession(sessionId, 'complete', event.filesTouched);

            // Validate and correct chapter file placement (Verity sometimes misplaces files)
            try {
              const correctedChapters = await this.chapterValidator.validateAndCorrect(bookSlug);
              if (correctedChapters.length > 0) {
                // Log chapter corrections for diagnostics
                console.log('Corrected chapter placement:', correctedChapters);
                // Optionally emit a status event to notify the UI of corrections
                onEvent({
                  type: 'status',
                  message: `Fixed ${correctedChapters.length} chapter file placement issue(s)`,
                });
              }
            } catch (err) {
              // Log validation errors but don't fail the workflow
              console.error('Chapter validation error:', err);
            }

            // Clear THIS stream only — don't nuke other books' active streams
            this.activeStreams.delete(conversationId);
          } else if (event.type === 'error') {
            // End session on error
            this.db.endStreamSession(sessionId, 'idle', {});
            this.activeStreams.delete(conversationId);
          }

          // Forward ALL events to the caller (including toolUse and filesChanged)
          onEvent(event);
        },
      });
    } catch (err) {
      this.db.endStreamSession(sessionId, 'idle', {});
      this.activeStreams.delete(conversationId);
      const errorMessage = err instanceof Error ? err.message : String(err);
      onEvent({ type: 'error', message: errorMessage });
    }
  }

  /**
   * Returns the file paths that were changed during the last sendMessage interaction.
   * Used by the IPC layer to notify the renderer of file changes for pipeline refresh.
   */
  getLastChangedFiles(): string[] {
    return this.lastChangedFiles;
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
    for (const stream of this.activeStreams.values()) {
      return stream;
    }
    return null;
  }

  /**
   * Returns the active CLI stream for a specific book, or null if that book
   * has no active stream. Used when switching books to recover an in-flight
   * stream without interfering with other books' streams.
   */
  getActiveStreamForBook(bookSlug: string): ActiveStreamInfo | null {
    for (const stream of this.activeStreams.values()) {
      if (stream.bookSlug === bookSlug) return stream;
    }
    return null;
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
    this.claude.abortStream(conversationId);

    // Clean up active stream state and save partial response
    const stream = this.activeStreams.get(conversationId);
    if (stream) {
      // Save whatever was accumulated so far (if anything)
      if (stream.textBuffer || stream.thinkingBuffer) {
        this.db.saveMessage({
          conversationId,
          role: 'assistant',
          content: stream.textBuffer
            ? stream.textBuffer + '\n\n---\n*[Aborted by user]*'
            : '*[Aborted by user — no response received]*',
          thinking: stream.thinkingBuffer,
        });
      }

      // Mark the session as interrupted
      this.db.endStreamSession(stream.sessionId, stream.progressStage, stream.filesTouched);

      this.activeStreams.delete(conversationId);
    }
  }

  /**
   * Returns the ContextDiagnostics from the most recent sendMessage call.
   *
   * Used by the IPC layer to expose context assembly diagnostics to the UI,
   * showing what files are available, conversation turns, and manifest token cost.
   */
  getLastDiagnostics(): ContextDiagnostics | null {
    return this.lastDiagnostics;
  }

  /**
   * Handle a hot-take conversation: Ghostlight reads full manuscript via tool use,
   * delivers a ~5 paragraph gut reaction. No files written. No pipeline state affected.
   * Always uses Opus regardless of global model setting.
   */
  private async handleHotTake(params: {
    conversationId: string;
    bookSlug: string;
    appSettings: { model: string; maxTokens: number; enableThinking: boolean; thinkingBudget: number; overrideThinkingBudget: boolean };
    agent: { systemPrompt: string; thinkingBudget: number };
    onEvent: (event: StreamEvent) => void;
    sessionId: string;
    thinkingBudgetOverride?: number;
    callId?: string;
  }): Promise<void> {
    const { conversationId, bookSlug, appSettings, agent, onEvent, sessionId } = params;

    onEvent({ type: 'status', message: randomPreparingStatus() });

    const manifest = await this.fs.getProjectManifest(bookSlug);

    const chapterListing = manifest.files
      .filter((f) => f.path.startsWith('chapters/') && f.path.endsWith('/draft.md'))
      .map((f) => `- \`${f.path}\` (${f.wordCount.toLocaleString()} words)`)
      .join('\n');

    let systemPrompt = agent.systemPrompt + '\n\n---\n\n' + HOT_TAKE_INSTRUCTIONS;
    if (chapterListing) {
      systemPrompt += `\n\n## Chapters to Read (in order)\n\n${chapterListing}`;
    }

    const syntheticMessage = 'Read the full manuscript and give me your honest reaction.';

    const messages = this.db.getMessages(conversationId);
    const conversationMessages = messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const thinkingBudget = resolveThinkingBudget(appSettings, agent.thinkingBudget, params.thinkingBudgetOverride);

    this.activeStreams.set(conversationId, {
      conversationId,
      agentName: 'Ghostlight',
      model: HOT_TAKE_MODEL,
      bookSlug,
      startedAt: new Date().toISOString(),
      sessionId,
      callId: params.callId ?? '',
      progressStage: 'idle',
      filesTouched: {},
      thinkingBuffer: '',
      textBuffer: '',
    });

    onEvent({ type: 'callStart', agentName: 'Ghostlight', model: HOT_TAKE_MODEL, bookSlug });
    onEvent({ type: 'status', message: randomWaitingStatus() });

    let responseBuffer = '';
    let thinkingBuffer = '';

    await this.claude.sendMessage({
      model: HOT_TAKE_MODEL,
      systemPrompt,
      messages: conversationMessages.length > 0
        ? conversationMessages
        : [{ role: 'user' as const, content: syntheticMessage }],
      maxTokens: appSettings.maxTokens,
      thinkingBudget,
      maxTurns: AGENT_REGISTRY.Ghostlight.maxTurns,
      bookSlug,
      sessionId,
      conversationId,
      onEvent: (event: StreamEvent) => {
        const stream = this.activeStreams.get(conversationId);
        if (stream) {
          if (event.type === 'progressStage') {
            stream.progressStage = event.stage;
          }
          if (event.type === 'done') {
            stream.filesTouched = event.filesTouched;
          }
        }

        if (event.type === 'textDelta') {
          responseBuffer += event.text;
          if (stream) stream.textBuffer = responseBuffer;
        } else if (event.type === 'thinkingDelta') {
          thinkingBuffer += event.text;
          if (stream) stream.thinkingBuffer = thinkingBuffer;
        } else if (event.type === 'done') {
          this.db.saveMessage({
            conversationId,
            role: 'assistant',
            content: responseBuffer,
            thinking: thinkingBuffer,
          });

          this.usage.recordUsage({
            conversationId,
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
            thinkingTokens: event.thinkingTokens,
            model: HOT_TAKE_MODEL,
          });

          this.db.endStreamSession(sessionId, 'complete', event.filesTouched);
          this.activeStreams.delete(conversationId);
        } else if (event.type === 'error') {
          this.db.endStreamSession(sessionId, 'idle', {});
          this.activeStreams.delete(conversationId);
        }

        onEvent(event);
      },
    });
  }

  /**
   * Run the audit pass on a chapter draft. Returns the parsed audit result.
   * Uses Sonnet for speed and cost. Returns null if the audit call fails.
   */
  async auditChapter(params: {
    bookSlug: string;
    chapterSlug: string;
  }): Promise<AuditResult | null> {
    const { bookSlug, chapterSlug } = params;

    // Read the chapter draft
    let draft: string;
    try {
      draft = await this.fs.readFile(bookSlug, `chapters/${chapterSlug}/draft.md`);
    } catch {
      console.warn(`[ChatService] Cannot read draft for ${chapterSlug}, skipping audit`);
      return null;
    }

    // Read supporting context (non-fatal if missing)
    let voiceProfile = '';
    try {
      voiceProfile = await this.fs.readFile(bookSlug, 'source/voice-profile.md');
    } catch { /* no voice profile yet */ }

    let phraseLedger = '';
    try {
      phraseLedger = await this.fs.readFile(bookSlug, 'source/phrase-ledger.md');
    } catch { /* no phrase ledger yet */ }

    // Load the auditor prompt
    let auditorPrompt: string;
    try {
      auditorPrompt = await this.agents.loadRaw(VERITY_AUDIT_AGENT_FILE);
    } catch {
      console.warn('[ChatService] Audit agent file not found, skipping audit');
      return null;
    }

    // Assemble the user message with all context
    const userMessageParts = [
      `## Chapter Draft (${chapterSlug})\n\n${draft}`,
    ];
    if (voiceProfile) {
      userMessageParts.push(`## Voice Profile\n\n${voiceProfile}`);
    }
    if (phraseLedger) {
      userMessageParts.push(`## Phrase Ledger\n\n${phraseLedger}`);
    }
    const userMessage = userMessageParts.join('\n\n---\n\n');

    try {
      // Use sendMessage and collect the response text
      let responseText = '';
      const sessionId = nanoid();

      await this.claude.sendMessage({
        model: VERITY_AUDIT_MODEL,
        systemPrompt: auditorPrompt,
        messages: [{ role: 'user' as const, content: userMessage }],
        maxTokens: VERITY_AUDIT_MAX_TOKENS,
        maxTurns: 3,
        bookSlug,
        sessionId,
        conversationId: `audit-${sessionId}`,
        onEvent: (event: StreamEvent) => {
          if (event.type === 'textDelta') {
            responseText += event.text;
          }
          if (event.type === 'done') {
            this.usage.recordUsage({
              conversationId: `audit-${sessionId}`,
              inputTokens: event.inputTokens,
              outputTokens: event.outputTokens,
              thinkingTokens: event.thinkingTokens,
              model: VERITY_AUDIT_MODEL,
            });
          }
        },
      });

      // Parse JSON from response — strip markdown fences if present
      const clean = responseText.replace(/```json\s*|```/g, '').trim();
      return JSON.parse(clean) as AuditResult;
    } catch (err) {
      console.warn(`[ChatService] Audit failed for ${chapterSlug}:`, err);
      return null;
    }
  }

  /**
   * Run the fix pass on a chapter using audit findings. Verity edits the
   * draft in-place to address each violation.
   */
  async fixChapter(params: {
    bookSlug: string;
    chapterSlug: string;
    auditResult: AuditResult;
    conversationId: string;
    sessionId: string;
    onEvent: (event: StreamEvent) => void;
  }): Promise<void> {
    const { bookSlug, chapterSlug, auditResult, conversationId, sessionId, onEvent } = params;

    const appSettings = await this.settings.load();
    const thinkingBudget = resolveThinkingBudget(appSettings, AGENT_REGISTRY.Verity.thinkingBudget);

    // Build the fix prompt with audit findings
    const auditJson = JSON.stringify(auditResult.violations, null, 2);
    const fixInstructions = VERITY_FIX_INSTRUCTIONS + '\n```json\n' + auditJson + '\n```';

    // Load Verity core + the fix instructions
    const corePrompt = await this.agents.loadComposite(AGENT_REGISTRY.Verity.filename, []);
    const systemPrompt = corePrompt + '\n\n---\n\n' + fixInstructions;

    const userMessage = `Fix the ${auditResult.violations.length} violations identified by the audit in chapters/${chapterSlug}/draft.md. Edit the file in place. Do not rewrite unflagged prose.`;

    // Save synthetic user message
    this.db.saveMessage({
      conversationId,
      role: 'user',
      content: `[Auto-fix: ${auditResult.violations.length} violations in ${chapterSlug}]`,
      thinking: '',
    });

    let responseBuffer = '';
    let thinkingBuffer = '';

    await this.claude.sendMessage({
      model: appSettings.model, // Opus for fix pass — needs creative judgment
      systemPrompt,
      messages: [{ role: 'user' as const, content: userMessage }],
      maxTokens: appSettings.maxTokens,
      thinkingBudget,
      maxTurns: 10,
      bookSlug,
      sessionId,
      conversationId: `${conversationId}-fix`,
      onEvent: (event: StreamEvent) => {
        if (event.type === 'textDelta') {
          responseBuffer += event.text;
        } else if (event.type === 'thinkingDelta') {
          thinkingBuffer += event.text;
        }

        if (event.type === 'status' || event.type === 'progressStage' || event.type === 'filesChanged') {
          onEvent(event);
        }
        if (event.type === 'done') {
          // Save the fix response
          this.db.saveMessage({
            conversationId,
            role: 'assistant',
            content: responseBuffer || '[Fix pass completed]',
            thinking: thinkingBuffer,
          });

          this.usage.recordUsage({
            conversationId,
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
            thinkingTokens: event.thinkingTokens,
            model: appSettings.model,
          });
        }
      },
    });
  }

  /**
   * Run a scoped Lumen phrase audit — Lens 8 only.
   * Reads the full manuscript, identifies repeated phrases and editorial intrusions,
   * and writes an authoritative phrase-ledger.md.
   *
   * This is a silent pre-step: it runs to completion before the main agent call,
   * emitting status events but not saving a conversation (it's infrastructure, not a chat).
   * Uses Sonnet for speed and cost — this is a mechanical pattern-detection task.
   */
  async runPhraseAudit(params: {
    bookSlug: string;
    appSettings: { model: string; maxTokens: number; enableThinking: boolean; thinkingBudget: number; overrideThinkingBudget: boolean };
    onEvent: (event: StreamEvent) => void;
    sessionId: string;
  }): Promise<void> {
    const { bookSlug, appSettings, onEvent, sessionId } = params;

    let lumenAgent;
    try {
      lumenAgent = await this.agents.load('Lumen');
    } catch {
      console.warn('[phrase-audit] Lumen agent not found, skipping phrase audit');
      return;
    }

    const manifest = await this.fs.getProjectManifest(bookSlug);
    if (manifest.chapterCount === 0) {
      return;
    }

    const chapterListing = manifest.files
      .filter((f) => f.path.startsWith('chapters/') && f.path.endsWith('/draft.md'))
      .map((f) => `- \`${f.path}\` (${f.wordCount.toLocaleString()} words)`)
      .join('\n');

    const otherFiles = manifest.files
      .filter((f) => !f.path.startsWith('chapters/'))
      .map((f) => `- \`${f.path}\` (${f.wordCount.toLocaleString()} words)`)
      .join('\n');

    let systemPrompt = lumenAgent.systemPrompt + '\n\n---\n\n' + PHRASE_AUDIT_INSTRUCTIONS;
    systemPrompt += `\n\n## Chapters to Audit (in order)\n\n${chapterListing}`;
    if (otherFiles) {
      systemPrompt += `\n\n## Other Files\n\n${otherFiles}`;
    }

    onEvent({ type: 'status', message: 'Auditing phrase patterns across manuscript...' });

    const thinkingBudget = resolveThinkingBudget(appSettings, lumenAgent.thinkingBudget);

    await this.claude.sendMessage({
      model: appSettings.model,
      systemPrompt,
      messages: [{ role: 'user' as const, content: 'Run the phrase audit now. Read every chapter, build the inventory, and write the phrase ledger.' }],
      maxTokens: appSettings.maxTokens,
      thinkingBudget,
      maxTurns: AGENT_REGISTRY.Lumen.maxTurns,
      bookSlug,
      sessionId,
      conversationId: `phrase-audit-${sessionId}`,
      onEvent: (event: StreamEvent) => {
        if (event.type === 'status' || event.type === 'progressStage') {
          onEvent(event);
        } else if (event.type === 'filesChanged') {
          this.lastChangedFiles = event.paths;
        } else if (event.type === 'done') {
          this.usage.recordUsage({
            conversationId: `phrase-audit-${sessionId}`,
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
            thinkingTokens: event.thinkingTokens,
            model: appSettings.model,
          });
        }
        // Swallow textDelta/thinkingDelta — this is a background task, not a chat
      },
    });
  }

  /**
   * Handle an ad hoc revision conversation: Forge reads the manuscript and generates
   * project-tasks.md and revision-prompts.md based on the author's description.
   * Uses the global model setting (Forge works well on Sonnet for planning).
   * Runs in full agent mode with tool use so Forge can read chapters and write plan files.
   */
  private async handleAdhocRevision(params: {
    conversationId: string;
    bookSlug: string;
    message: string;
    appSettings: { model: string; maxTokens: number; enableThinking: boolean; thinkingBudget: number; overrideThinkingBudget: boolean };
    agent: { systemPrompt: string; thinkingBudget: number };
    onEvent: (event: StreamEvent) => void;
    sessionId: string;
    thinkingBudgetOverride?: number;
    callId?: string;
  }): Promise<void> {
    const { conversationId, bookSlug, appSettings, agent, onEvent, sessionId } = params;

    onEvent({ type: 'status', message: randomPreparingStatus() });

    // Pre-step: run a scoped Lumen phrase audit to ensure the phrase ledger
    // is accurate before Forge generates the revision plan. Without this,
    // Verity would revise with a stale self-reported ledger — the ad hoc path
    // bypasses the formal Lumen assessment that normally rebuilds it.
    try {
      await this.runPhraseAudit({ bookSlug, appSettings, onEvent, sessionId });
      onEvent({ type: 'status', message: 'Phrase audit complete. Generating revision plan...' });
    } catch (err) {
      console.warn('[adhoc-revision] Phrase audit failed, continuing without it:', err);
      onEvent({ type: 'status', message: 'Phrase audit skipped. Generating revision plan...' });
    }

    const manifest = await this.fs.getProjectManifest(bookSlug);

    const fileListing = manifest.files
      .map((f) => `- \`${f.path}\` (${f.wordCount.toLocaleString()} words)`)
      .join('\n');

    let systemPrompt = agent.systemPrompt + '\n\n---\n\n' + ADHOC_REVISION_INSTRUCTIONS;
    if (fileListing) {
      systemPrompt += `\n\n## Project Manifest\n\n${fileListing}\n\nTotal chapters: ${manifest.chapterCount}\nTotal words: ${manifest.totalWordCount.toLocaleString()}`;
    }

    const messages = this.db.getMessages(conversationId);
    const conversationMessages = messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const thinkingBudget = resolveThinkingBudget(appSettings, agent.thinkingBudget, params.thinkingBudgetOverride);

    this.activeStreams.set(conversationId, {
      conversationId,
      agentName: 'Forge',
      model: appSettings.model,
      bookSlug,
      startedAt: new Date().toISOString(),
      sessionId,
      callId: params.callId ?? '',
      progressStage: 'idle',
      filesTouched: {},
      thinkingBuffer: '',
      textBuffer: '',
    });

    onEvent({ type: 'callStart', agentName: 'Forge', model: appSettings.model, bookSlug });
    onEvent({ type: 'status', message: randomWaitingStatus() });

    let responseBuffer = '';
    let thinkingBuffer = '';

    await this.claude.sendMessage({
      model: appSettings.model,
      systemPrompt,
      messages: conversationMessages,
      maxTokens: appSettings.maxTokens,
      thinkingBudget,
      maxTurns: AGENT_REGISTRY.Forge.maxTurns,
      bookSlug,
      sessionId,
      conversationId,
      onEvent: (event: StreamEvent) => {
        const stream = this.activeStreams.get(conversationId);
        if (stream) {
          if (event.type === 'progressStage') {
            stream.progressStage = event.stage;
          }
          if (event.type === 'toolDuration') {
            if (event.tool.filePath && (event.tool.toolName === 'Write' || event.tool.toolName === 'Edit')) {
              const current = stream.filesTouched[event.tool.filePath] ?? 0;
              stream.filesTouched[event.tool.filePath] = current + 1;
            }
          }
          if (event.type === 'done') {
            stream.filesTouched = event.filesTouched;
          }
        }

        if (event.type === 'textDelta') {
          responseBuffer += event.text;
          if (stream) stream.textBuffer = responseBuffer;
        } else if (event.type === 'thinkingDelta') {
          thinkingBuffer += event.text;
          if (stream) stream.thinkingBuffer = thinkingBuffer;
        } else if (event.type === 'filesChanged') {
          this.lastChangedFiles = event.paths;
        } else if (event.type === 'done') {
          this.db.saveMessage({
            conversationId,
            role: 'assistant',
            content: responseBuffer,
            thinking: thinkingBuffer,
          });

          this.usage.recordUsage({
            conversationId,
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
            thinkingTokens: event.thinkingTokens,
            model: appSettings.model,
          });

          this.db.endStreamSession(sessionId, 'complete', event.filesTouched);
          this.activeStreams.delete(conversationId);
        } else if (event.type === 'error') {
          this.db.endStreamSession(sessionId, 'idle', {});
          this.activeStreams.delete(conversationId);
        }

        onEvent(event);
      },
    });
  }

  /**
   * Handle a pitch-room conversation: skip wrangler, load minimal context,
   * route file writes to the draft directory.
   */
  private async handlePitchRoomMessage(params: {
    conversationId: string;
    agentName: AgentName;
    bookSlug: string;
    appSettings: { model: string; maxTokens: number; enableThinking: boolean; thinkingBudget: number; overrideThinkingBudget: boolean };
    agent: { systemPrompt: string; thinkingBudget: number };
    onEvent: (event: StreamEvent) => void;
    sessionId: string;
    thinkingBudgetOverride?: number;
    callId?: string;
  }): Promise<void> {
    const { conversationId, agentName, bookSlug, appSettings, agent, onEvent, sessionId } = params;

    onEvent({ type: 'status', message: randomPreparingStatus() });

    // Load author profile if it exists (minimal context)
    let authorProfile = '';
    try {
      const profilePath = this.fs.getAuthorProfilePath();
      const { readFile } = await import('node:fs/promises');
      authorProfile = await readFile(profilePath, 'utf-8');
    } catch {
      // No author profile yet — that's fine
    }

    // Build the system prompt with Pitch Room instructions (includes books path so Spark can scaffold directly)
    let systemPrompt = agent.systemPrompt + buildPitchRoomInstructions(this.fs.getBooksPath());
    if (authorProfile.trim()) {
      systemPrompt += `\n\n---\n\n## Author Profile\n\n${authorProfile}`;
    }

    // Get conversation messages from DB
    const messages = this.db.getMessages(conversationId);
    const conversationMessages = messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const thinkingBudget = resolveThinkingBudget(appSettings, agent.thinkingBudget, params.thinkingBudgetOverride);

    // Get the draft directory path — this is where Spark will write files
    const workingDir = this.fs.getPitchDraftPath(conversationId);

    // Ensure the draft directory exists before spawning the CLI
    const { mkdir } = await import('node:fs/promises');
    await mkdir(workingDir, { recursive: true });

    // Track active stream (Map — supports concurrent streams across books)
    this.activeStreams.set(conversationId, {
      conversationId,
      agentName,
      model: appSettings.model,
      bookSlug,
      startedAt: new Date().toISOString(),
      sessionId,
      callId: params.callId ?? '',
      progressStage: 'idle',
      filesTouched: {},
      thinkingBuffer: '',
      textBuffer: '',
    });

    onEvent({ type: 'callStart', agentName, model: appSettings.model, bookSlug });
    onEvent({ type: 'status', message: randomWaitingStatus() });

    let responseBuffer = '';
    let thinkingBuffer = '';
    let streamSucceeded = false;

    await this.claude.sendMessage({
      model: appSettings.model,
      systemPrompt,
      messages: conversationMessages,
      maxTokens: appSettings.maxTokens,
      thinkingBudget,
      maxTurns: AGENT_REGISTRY.Spark.maxTurns,
      workingDir,
      sessionId,
      conversationId,
      onEvent: (event: StreamEvent) => {
        const stream = this.activeStreams.get(conversationId);
        if (stream) {
          if (event.type === 'progressStage') {
            stream.progressStage = event.stage;
          }
          if (event.type === 'toolDuration') {
            if (event.tool.filePath && (event.tool.toolName === 'Write' || event.tool.toolName === 'Edit')) {
              const current = stream.filesTouched[event.tool.filePath] ?? 0;
              stream.filesTouched[event.tool.filePath] = current + 1;
            }
          }
          if (event.type === 'done') {
            stream.filesTouched = event.filesTouched;
          }
        }

        if (event.type === 'textDelta') {
          responseBuffer += event.text;
          if (stream) stream.textBuffer = responseBuffer;
        } else if (event.type === 'thinkingDelta') {
          thinkingBuffer += event.text;
          if (stream) stream.thinkingBuffer = thinkingBuffer;
        } else if (event.type === 'filesChanged') {
          this.lastChangedFiles = event.paths;
        } else if (event.type === 'done') {
          streamSucceeded = true;

          this.db.saveMessage({
            conversationId,
            role: 'assistant',
            content: responseBuffer,
            thinking: thinkingBuffer,
          });

          this.usage.recordUsage({
            conversationId,
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
            thinkingTokens: event.thinkingTokens,
            model: appSettings.model,
          });

          this.db.endStreamSession(sessionId, 'complete', event.filesTouched);
          this.activeStreams.delete(conversationId);
        } else if (event.type === 'error') {
          this.db.endStreamSession(sessionId, 'idle', {});
          this.activeStreams.delete(conversationId);
        }

        onEvent(event);
      },
    });

    // Spark handles book creation entirely via CLI — writes files directly
    // to the books directory. No app-level promotion logic needed.
    // The user navigates to the new book via the sidebar after Spark confirms.
  }
}
