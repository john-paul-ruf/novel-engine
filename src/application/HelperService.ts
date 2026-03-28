import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type {
  IHelperService,
  IAgentService,
  ISettingsService,
  IDatabaseService,
  IFileSystemService,
  IProviderRegistry,
} from '@domain/interfaces';
import type { Conversation, Message, StreamEvent } from '@domain/types';
import { AGENT_REGISTRY, HELPER_SLUG } from '@domain/constants';
import { randomPreparingStatus, randomWaitingStatus } from '@domain/statusMessages';
import { nanoid } from 'nanoid';
import { StreamManager } from './StreamManager';
import { resolveThinkingBudget } from './thinkingBudget';

/**
 * HelperService — Implements the in-app help assistant.
 *
 * Architecturally simple compared to ChatService:
 * - No context wrangling (the user guide IS the context)
 * - No pipeline awareness
 * - No file watching or chapter validation
 * - Single persistent conversation (not per-book)
 * - Read-only tool permissions (helper should never modify files)
 */
export class HelperService implements IHelperService {
  private userDataPath: string;

  constructor(
    private settings: ISettingsService,
    private agents: IAgentService,
    private db: IDatabaseService,
    private fs: IFileSystemService,
    private providerRegistry: IProviderRegistry,
    private streamManager: StreamManager,
    userDataPath: string,
  ) {
    this.userDataPath = userDataPath;
  }

  async getOrCreateConversation(): Promise<Conversation> {
    const conversations = this.db.listConversations(HELPER_SLUG);
    const existing = conversations.find(c => c.purpose === 'helper');
    if (existing) return existing;

    return this.db.createConversation({
      id: nanoid(),
      bookSlug: HELPER_SLUG,
      agentName: 'Helper',
      pipelinePhase: null,
      purpose: 'helper',
      title: 'Help & FAQ',
    });
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    return this.db.getMessages(conversationId);
  }

  async sendMessage(params: {
    message: string;
    conversationId: string;
    onEvent: (event: StreamEvent) => void;
    sessionId?: string;
    callId?: string;
  }): Promise<void> {
    const { message, conversationId, onEvent, sessionId } = params;

    onEvent({ type: 'status', message: randomPreparingStatus() });

    // 1. Save the user message
    this.db.saveMessage({
      conversationId,
      role: 'user',
      content: message,
      thinking: '',
    });

    // 2. Load the agent prompt
    const agent = await this.agents.load('Helper');

    // 3. Load the user guide
    let userGuide = '';
    try {
      const guidePath = path.join(this.userDataPath, 'USER_GUIDE.md');
      userGuide = await readFile(guidePath, 'utf-8');
    } catch {
      // Guide not found — helper works without it (degraded)
      userGuide = '(User guide not available. Answer based on your general knowledge of the application.)';
    }

    // 4. Build system prompt: agent instructions + user guide
    const systemPrompt = agent.systemPrompt + '\n\n' + userGuide;

    // 5. Load conversation history
    const messages = this.db.getMessages(conversationId);
    const conversationMessages = messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // 6. Get settings for model config
    const appSettings = await this.settings.load();

    // 7. Determine working directory — use active book if one exists, else userData
    let workingDir = this.userDataPath;
    try {
      const activeSlug = await this.fs.getActiveBookSlug();
      if (activeSlug && activeSlug !== HELPER_SLUG) {
        const booksPath = this.fs.getBooksPath();
        workingDir = path.join(booksPath, activeSlug);
      }
    } catch {
      // No active book — use userData
    }

    const thinkingBudget = resolveThinkingBudget(
      appSettings,
      AGENT_REGISTRY.Helper.thinkingBudget,
      undefined,
    );

    // 8. Start managed stream (handles accumulation, saving, usage recording)
    const stream = this.streamManager.startStream({
      conversationId,
      agentName: 'Helper',
      model: appSettings.model,
      bookSlug: HELPER_SLUG,
      sessionId: sessionId ?? nanoid(),
      callId: params.callId ?? '',
      onEvent,
    });

    onEvent({ type: 'status', message: randomWaitingStatus() });

    // 9. Send via provider registry
    await this.providerRegistry.sendMessage({
      model: appSettings.model,
      systemPrompt,
      messages: conversationMessages,
      maxTokens: appSettings.maxTokens,
      thinkingBudget,
      maxTurns: AGENT_REGISTRY.Helper.maxTurns,
      workingDir,
      sessionId: sessionId ?? nanoid(),
      conversationId,
      onEvent: stream.onEvent,
    });
  }

  abortStream(conversationId: string): void {
    this.providerRegistry.abortStream(conversationId);
  }

  async resetConversation(): Promise<void> {
    const conversations = this.db.listConversations(HELPER_SLUG);
    const existing = conversations.find(c => c.purpose === 'helper');
    if (existing) {
      this.db.deleteConversation(existing.id);
    }
  }
}
