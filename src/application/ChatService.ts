import type {
  IAgentService,
  IClaudeClient,
  IDatabaseService,
  IFileSystemService,
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
} from '@domain/types';
import { nanoid } from 'nanoid';
import { VOICE_SETUP_INSTRUCTIONS, AUTHOR_PROFILE_INSTRUCTIONS, randomPreparingStatus, randomWaitingStatus } from '@domain/constants';
import type { UsageService } from './UsageService';
import { ContextBuilder } from './ContextBuilder';

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
  private activeStream: ActiveStreamInfo | null = null;

  constructor(
    private settings: ISettingsService,
    private agents: IAgentService,
    private db: IDatabaseService,
    private claude: IClaudeClient,
    private fs: IFileSystemService,
    private usage: UsageService,
  ) {}

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

    // Steps 5–9: Context assembly → CLI call → response capture
    // Wrapped in try/catch so errors are always forwarded as events
    try {
      // Step 5: Retrieve conversation to check purpose
      const conversation = this.db.getConversation(conversationId);

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
        purposeInstructions = AUTHOR_PROFILE_INSTRUCTIONS;
      }

      // Step 7b: Build context using the lean ContextBuilder
      const assembled = this.contextBuilder.build({
        agentName,
        agentSystemPrompt: agent.systemPrompt,
        manifest,
        messages,
        purposeInstructions,
      });

      // Step 8: Store diagnostics
      this.lastDiagnostics = assembled.diagnostics;

      // Step 8b: Determine thinking budget
      const thinkingBudget = appSettings.enableThinking ? agent.thinkingBudget : undefined;

      // Step 8c: Track active stream so renderer can recover after refresh
      this.activeStream = {
        conversationId,
        agentName,
        model: appSettings.model,
        bookSlug,
        startedAt: new Date().toISOString(),
      };

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
        onEvent: (event: StreamEvent) => {
          // Accumulate response content
          if (event.type === 'textDelta') {
            responseBuffer += event.text;
          } else if (event.type === 'thinkingDelta') {
            thinkingBuffer += event.text;
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

            // Clear active stream — the CLI call is complete
            this.activeStream = null;
          } else if (event.type === 'error') {
            // Clear active stream on error as well
            this.activeStream = null;
          }

          // Forward ALL events to the caller (including toolUse and filesChanged)
          onEvent(event);
        },
      });
    } catch (err) {
      this.activeStream = null;
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
   * Returns info about the currently active CLI stream, or null if idle.
   * Used by the renderer to restore streaming UI state after a window refresh.
   */
  getActiveStream(): ActiveStreamInfo | null {
    return this.activeStream;
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
}
