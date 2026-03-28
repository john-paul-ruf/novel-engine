import type {
  IAgentService,
  IProviderRegistry,
  IDatabaseService,
  IFileSystemService,
  IPitchRoomService,
} from '@domain/interfaces';
import type { AgentName, StreamEvent } from '@domain/types';
import { AGENT_REGISTRY } from '@domain/constants';
import { randomPreparingStatus, randomWaitingStatus } from '@domain/statusMessages';
import { StreamManager } from './StreamManager';
import { resolveThinkingBudget } from './thinkingBudget';

/**
 * PitchRoomService — Handles pitch-room conversations with the Spark agent.
 *
 * Unique concerns:
 * - Custom working directory (pitch draft path per conversation)
 * - Author profile loading for context
 * - Books path injection so Spark can scaffold new books directly
 */
export class PitchRoomService implements IPitchRoomService {
  constructor(
    private agents: IAgentService,
    private providers: IProviderRegistry,
    private db: IDatabaseService,
    private fs: IFileSystemService,
    private streamManager: StreamManager,
  ) {}

  async handleMessage(params: {
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
    let pitchRoomTemplate = await this.agents.loadRaw('PITCH-ROOM.md');
    pitchRoomTemplate = pitchRoomTemplate.replace(/\{\{BOOKS_PATH\}\}/g, this.fs.getBooksPath());
    let systemPrompt = agent.systemPrompt + '\n\n---\n\n' + pitchRoomTemplate;
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

    const stream = this.streamManager.startStream({
      conversationId,
      agentName,
      model: appSettings.model,
      bookSlug,
      sessionId,
      callId: params.callId ?? '',
      onEvent,
    });

    onEvent({ type: 'status', message: randomWaitingStatus() });

    await this.providers.sendMessage({
      model: appSettings.model,
      systemPrompt,
      messages: conversationMessages,
      maxTokens: appSettings.maxTokens,
      thinkingBudget,
      maxTurns: AGENT_REGISTRY.Spark.maxTurns,
      workingDir,
      sessionId,
      conversationId,
      onEvent: stream.onEvent,
    });

    // Spark handles book creation entirely via CLI — writes files directly
    // to the books directory. No app-level promotion logic needed.
    // The user navigates to the new book via the sidebar after Spark confirms.
  }
}
