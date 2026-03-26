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
  ContextDiagnostics,
  Conversation,
  ConversationPurpose,
  Message,
  PipelinePhaseId,
  StreamEvent,
  StreamSessionRecord,
} from '@domain/types';
import { nanoid } from 'nanoid';
import { VOICE_SETUP_INSTRUCTIONS, AUTHOR_PROFILE_INSTRUCTIONS, PITCH_ROOM_INSTRUCTIONS, REVISION_VERIFICATION_PROMPT, HOT_TAKE_INSTRUCTIONS, HOT_TAKE_MODEL, ADHOC_REVISION_INSTRUCTIONS, PITCH_ROOM_SLUG, randomPreparingStatus, randomWaitingStatus } from '@domain/constants';
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

      // Step 7c: Build context using the lean ContextBuilder (budget-aware compaction)
      const authorProfileAbsPath = this.fs.getAuthorProfilePath();
      const assembled = this.contextBuilder.build({
        agentName,
        agentSystemPrompt: agent.systemPrompt,
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

    // Build the system prompt with Pitch Room instructions
    let systemPrompt = agent.systemPrompt + PITCH_ROOM_INSTRUCTIONS;
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

    // After the stream completes, check for an _action.json signal from Spark
    if (streamSucceeded) {
      await this.processPitchAction(conversationId, workingDir, onEvent);
    }
  }

  /**
   * Check for and execute a pitch action signal written by Spark.
   *
   * Spark writes `_action.json` to its draft directory to signal what should
   * happen with the pitch: make it a book, shelve it, or discard it. The app
   * executes the action and emits a `pitchOutcome` stream event so the
   * renderer can react (switch to the new book, refresh the draft list, etc.).
   */
  private async processPitchAction(
    conversationId: string,
    workingDir: string,
    onEvent: (event: StreamEvent) => void,
  ): Promise<void> {
    const { readFile, unlink } = await import('node:fs/promises');
    const { join } = await import('node:path');

    const actionPath = join(workingDir, '_action.json');

    let raw: string;
    try {
      raw = await readFile(actionPath, 'utf-8');
    } catch {
      // No action file — Spark didn't signal an outcome. That's normal.
      return;
    }

    // Parse the action — be defensive about malformed JSON
    let action: { action: string; logline?: string };
    try {
      action = JSON.parse(raw) as { action: string; logline?: string };
    } catch {
      console.warn('[ChatService] Malformed _action.json in pitch draft, ignoring:', raw);
      await unlink(actionPath).catch(() => {});
      return;
    }

    // Remove the signal file before executing (idempotency)
    await unlink(actionPath).catch(() => {});

    try {
      switch (action.action) {
        case 'make-book': {
          const bookMeta = await this.fs.promotePitchToBook(conversationId);
          this.db.deleteConversation(conversationId);
          onEvent({
            type: 'pitchOutcome',
            action: 'make-book',
            bookSlug: bookMeta.slug,
            title: bookMeta.title,
          });
          break;
        }

        case 'shelve': {
          const pitchMeta = await this.fs.shelvePitchDraft(conversationId, action.logline);
          this.db.deleteConversation(conversationId);
          onEvent({
            type: 'pitchOutcome',
            action: 'shelve',
            pitchSlug: pitchMeta.slug,
            title: pitchMeta.title,
          });
          break;
        }

        case 'discard': {
          await this.fs.deletePitchDraft(conversationId);
          this.db.deleteConversation(conversationId);
          onEvent({
            type: 'pitchOutcome',
            action: 'discard',
          });
          break;
        }

        default:
          console.warn('[ChatService] Unknown pitch action:', action.action);
      }
    } catch (err) {
      console.error('[ChatService] Failed to execute pitch action:', err);
      onEvent({
        type: 'error',
        message: `Pitch action "${action.action}" failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
}
