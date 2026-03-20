import type {
  IAgentService,
  IClaudeClient,
  IContextWrangler,
  IDatabaseService,
  ISettingsService,
} from '@domain/interfaces';
import type {
  AgentName,
  ContextDiagnostics,
  Conversation,
  ConversationPurpose,
  Message,
  PipelinePhaseId,
  StreamEvent,
} from '@domain/types';
import { nanoid } from 'nanoid';
import type { UsageService } from './UsageService';

/**
 * ChatService — Central orchestrator for the send→stream→save message flow.
 *
 * Coordinates the full lifecycle of a single agent interaction:
 * 1. Validate CLI availability
 * 2. Save the user message
 * 3. Delegate context assembly to the ContextWrangler (two-call pattern)
 * 4. Build the system prompt with assembled context
 * 5. Stream the agent response via Claude CLI
 * 6. Accumulate and save the assistant response
 * 7. Record token usage
 *
 * Depends entirely on injected interfaces — no concrete infrastructure imports.
 */
export class ChatService {
  private lastDiagnostics: ContextDiagnostics | null = null;

  constructor(
    private settings: ISettingsService,
    private agents: IAgentService,
    private db: IDatabaseService,
    private claude: IClaudeClient,
    private contextWrangler: IContextWrangler,
    private usage: UsageService,
  ) {}

  /**
   * Send a message to an agent and stream the response.
   *
   * This is the primary entry point for all agent interactions. It orchestrates
   * the full flow: context assembly via the Wrangler, CLI call, response capture,
   * and usage tracking.
   *
   * All stream events are forwarded to the caller's onEvent callback, including
   * thinking deltas, text deltas, and the final done/error events.
   */
  async sendMessage(params: {
    agentName: AgentName;
    message: string;
    conversationId: string;
    bookSlug: string;
    onEvent: (event: StreamEvent) => void;
  }): Promise<void> {
    const { agentName, message, conversationId, bookSlug, onEvent } = params;

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

    // Step 4: Save the user message BEFORE context assembly
    // This ensures the Wrangler sees the full conversation including this message
    this.db.saveMessage({
      conversationId,
      role: 'user',
      content: message,
      thinking: '',
    });

    // Steps 5–9: Context assembly → CLI call → response capture
    // Wrapped in try/catch so errors are always forwarded as events
    try {
      // Step 5: Assemble context via the Wrangler (two-call pattern)
      const assembled = await this.contextWrangler.assemble({
        agentName,
        userMessage: message,
        conversationId,
        bookSlug,
      });

      // Step 6: Store diagnostics for later retrieval by the IPC layer
      this.lastDiagnostics = assembled.diagnostics;

      // Step 7: Build the full system prompt with project context
      const systemPrompt = `${agent.systemPrompt}\n\n---\n\n# Current Book Context\n\n${assembled.projectContext}`;

      // Step 8: Determine thinking budget
      // Use the agent's default thinking budget, but only if thinking is globally enabled
      const thinkingBudget = appSettings.enableThinking ? agent.thinkingBudget : undefined;

      // Step 9: Call the Claude CLI with response capture
      let responseBuffer = '';
      let thinkingBuffer = '';

      await this.claude.sendMessage({
        model: appSettings.model,
        systemPrompt,
        messages: assembled.conversationMessages,
        maxTokens: appSettings.maxTokens,
        thinkingBudget,
        onEvent: (event: StreamEvent) => {
          // Accumulate response content
          if (event.type === 'textDelta') {
            responseBuffer += event.text;
          } else if (event.type === 'thinkingDelta') {
            thinkingBuffer += event.text;
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
          }

          // Forward ALL events to the caller
          onEvent(event);
        },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      onEvent({ type: 'error', message: errorMessage });
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
   * Returns the ContextDiagnostics from the most recent sendMessage call.
   *
   * Used by the IPC layer to expose context assembly diagnostics to the UI,
   * showing what files were included/excluded, chapter strategy, conversation
   * compaction, and the Wrangler's reasoning.
   */
  getLastDiagnostics(): ContextDiagnostics | null {
    return this.lastDiagnostics;
  }
}
