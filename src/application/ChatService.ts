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
import { VOICE_SETUP_INSTRUCTIONS, AUTHOR_PROFILE_INSTRUCTIONS } from '@domain/constants';
import type { UsageService } from './UsageService';

/**
 * ChatService — Central orchestrator for the send→stream→save message flow.
 *
 * Coordinates the full lifecycle of a single agent interaction:
 * 1. Validate CLI availability
 * 2. Save the user message
 * 3. Delegate context assembly to the ContextWrangler (two-call pattern)
 * 4. Build the system prompt with assembled context + file-writing instructions
 * 5. Stream the agent response via Claude CLI (full agent mode with tool use)
 * 6. Accumulate and save the assistant response
 * 7. Record token usage
 *
 * Depends entirely on injected interfaces — no concrete infrastructure imports.
 */
export class ChatService {
  private lastDiagnostics: ContextDiagnostics | null = null;
  private lastChangedFiles: string[] = [];

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
   * and usage tracking. Agents run in full agent mode with tool use — they can
   * read and write files directly in the book directory.
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
      // Step 5: Retrieve conversation to check purpose
      const conversation = this.db.getConversation(conversationId);

      // Step 5b: Assemble context via the Wrangler (two-call pattern)
      onEvent({ type: 'status', message: 'Assembling context…' });
      const assembled = await this.contextWrangler.assemble({
        agentName,
        userMessage: message,
        conversationId,
        bookSlug,
        purpose: conversation?.purpose,
      });

      // Step 6: Store diagnostics for later retrieval by the IPC layer
      this.lastDiagnostics = assembled.diagnostics;

      // Step 7: Build the full system prompt with project context
      let systemPrompt = `${agent.systemPrompt}\n\n---\n\n# Current Book Context\n\n${assembled.projectContext}`;

      // Step 7b: Append purpose-specific instructions
      if (conversation?.purpose === 'voice-setup') {
        systemPrompt += VOICE_SETUP_INSTRUCTIONS;
      } else if (conversation?.purpose === 'author-profile') {
        systemPrompt += AUTHOR_PROFILE_INSTRUCTIONS;
      }

      // Step 7c: Append file-writing instructions for pipeline conversations
      const pipelinePhase = conversation?.pipelinePhase ?? null;
      const fileInstructions = this.buildFileInstructions(pipelinePhase);
      if (fileInstructions) {
        systemPrompt += fileInstructions;
      }

      // Step 8: Determine thinking budget
      // Use the agent's default thinking budget, but only if thinking is globally enabled
      const thinkingBudget = appSettings.enableThinking ? agent.thinkingBudget : undefined;

      // Step 9: Call the Claude CLI with response capture (full agent mode)
      onEvent({ type: 'status', message: 'Waiting for response…' });
      let responseBuffer = '';
      let thinkingBuffer = '';

      await this.claude.sendMessage({
        model: appSettings.model,
        systemPrompt,
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
          }

          // Forward ALL events to the caller (including toolUse and filesChanged)
          onEvent(event);
        },
      });
    } catch (err) {
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
   * Returns the ContextDiagnostics from the most recent sendMessage call.
   *
   * Used by the IPC layer to expose context assembly diagnostics to the UI,
   * showing what files were included/excluded, chapter strategy, conversation
   * compaction, and the Wrangler's reasoning.
   */
  getLastDiagnostics(): ContextDiagnostics | null {
    return this.lastDiagnostics;
  }

  /**
   * Build file-writing instructions to append to the agent system prompt.
   * Tells agents they can (and should) write files directly to the book directory.
   */
  private buildFileInstructions(pipelinePhase: PipelinePhaseId | null): string {
    // Only add file instructions for pipeline conversations
    if (!pipelinePhase) return '';

    return `

---

## File Writing

You have direct access to read and write files in this book's directory. When the author approves your output, **write it to the appropriate file** — do not just display it in chat.

Use the Write tool to save files. All paths are relative to the book root directory.

Key file paths:
- \`source/pitch.md\` — the approved pitch document
- \`source/voice-profile.md\` — the voice profile
- \`source/scene-outline.md\` — the scene-by-scene outline
- \`source/story-bible.md\` — characters, world, lore
- \`source/reader-report.md\` — Ghostlight's reader report
- \`source/dev-report.md\` — Lumen's development report
- \`source/audit-report.md\` — Sable's copy-edit audit
- \`source/project-tasks.md\` — Forge's revision task breakdown
- \`source/revision-prompts.md\` — Forge's per-chapter revision prompts
- \`source/style-sheet.md\` — Sable's style consistency rules
- \`source/metadata.md\` — Quill's publication metadata
- \`chapters/NN-slug/draft.md\` — chapter prose (Verity writes these)
- \`chapters/NN-slug/notes.md\` — chapter notes
- \`about.json\` — book metadata (title, author, status, etc.)

**Important rules:**
- Always ask for explicit approval before writing/overwriting a file
- When writing a new version of an existing file, confirm with the author first
- For chapters, use the format \`chapters/NN-slug-name/draft.md\` (e.g. \`chapters/01-the-awakening/draft.md\`)
- Write complete files — never partial updates unless using the Edit tool for targeted fixes
`;
  }
}
