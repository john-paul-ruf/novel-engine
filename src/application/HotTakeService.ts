import type {
  IAgentService,
  IClaudeClient,
  IDatabaseService,
  IFileSystemService,
  IHotTakeService,
} from '@domain/interfaces';
import type { StreamEvent } from '@domain/types';
import { HOT_TAKE_MODEL, AGENT_REGISTRY } from '@domain/constants';
import { randomPreparingStatus, randomWaitingStatus } from '@domain/statusMessages';
import { StreamManager } from './StreamManager';
import { resolveThinkingBudget } from './thinkingBudget';

/**
 * HotTakeService — Handles Ghostlight "hot take" conversations.
 *
 * Unique concerns:
 * - Always uses Opus (HOT_TAKE_MODEL) regardless of global model setting
 * - Cold read of the full manuscript — no files written
 * - Synthetic first message if conversation is empty
 */
export class HotTakeService implements IHotTakeService {
  constructor(
    private agents: IAgentService,
    private claude: IClaudeClient,
    private db: IDatabaseService,
    private fs: IFileSystemService,
    private streamManager: StreamManager,
  ) {}

  async handleMessage(params: {
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

    const hotTakeInstructions = await this.agents.loadRaw('HOT-TAKE.md');
    let systemPrompt = agent.systemPrompt + '\n\n---\n\n' + hotTakeInstructions;
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

    const stream = this.streamManager.startStream(
      {
        conversationId,
        agentName: 'Ghostlight',
        model: HOT_TAKE_MODEL,
        bookSlug,
        sessionId,
        callId: params.callId ?? '',
        onEvent,
      },
      { trackFilesChanged: false },
    );

    onEvent({ type: 'status', message: randomWaitingStatus() });

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
      onEvent: stream.onEvent,
    });
  }
}
