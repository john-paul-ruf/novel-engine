import type {
  IAdhocRevisionService,
  IAgentService,
  IAuditService,
  IProviderRegistry,
  IDatabaseService,
  IFileSystemService,
} from '@domain/interfaces';
import type { StreamEvent } from '@domain/types';
import { AGENT_REGISTRY } from '@domain/constants';
import { randomPreparingStatus, randomWaitingStatus } from '@domain/statusMessages';
import { StreamManager } from './StreamManager';
import { resolveThinkingBudget } from './thinkingBudget';

/**
 * AdhocRevisionService — Handles ad hoc revision conversations with the Forge agent.
 *
 * Unique concerns:
 * - Runs a motif audit pre-step (non-fatal) to ensure flaggedPhrases are current
 * - Full manuscript context (project manifest) included in system prompt
 * - Generates project-tasks.md and revision-prompts.md
 */
export class AdhocRevisionService implements IAdhocRevisionService {
  constructor(
    private agents: IAgentService,
    private audit: IAuditService,
    private providers: IProviderRegistry,
    private db: IDatabaseService,
    private fs: IFileSystemService,
    private streamManager: StreamManager,
  ) {}

  async handleMessage(params: {
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

    // Pre-step: run a scoped Lumen motif/phrase audit to ensure the motif
    // ledger's flaggedPhrases are accurate before Forge generates the revision
    // plan. Without this, Verity would revise with stale data — the ad hoc path
    // bypasses the formal Lumen assessment that normally rebuilds it.
    try {
      await this.audit.runMotifAudit({ bookSlug, appSettings, onEvent, sessionId });
      onEvent({ type: 'status', message: 'Motif audit complete. Generating revision plan...' });
    } catch (err) {
      console.warn('[adhoc-revision] Motif audit failed, continuing without it:', err);
      onEvent({ type: 'status', message: 'Motif audit skipped. Generating revision plan...' });
    }

    const manifest = await this.fs.getProjectManifest(bookSlug);

    const fileListing = manifest.files
      .map((f) => `- \`${f.path}\` (${f.wordCount.toLocaleString()} words)`)
      .join('\n');

    const adhocRevisionInstructions = await this.agents.loadRaw('ADHOC-REVISION.md');
    let systemPrompt = agent.systemPrompt + '\n\n---\n\n' + adhocRevisionInstructions;
    if (fileListing) {
      systemPrompt += `\n\n## Project Manifest\n\n${fileListing}\n\nTotal chapters: ${manifest.chapterCount}\nTotal words: ${manifest.totalWordCount.toLocaleString()}`;
    }

    const messages = this.db.getMessages(conversationId);
    const conversationMessages = messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const thinkingBudget = resolveThinkingBudget(appSettings, agent.thinkingBudget, params.thinkingBudgetOverride);

    const stream = this.streamManager.startStream({
      conversationId,
      agentName: 'Forge',
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
      maxTurns: AGENT_REGISTRY.Forge.maxTurns,
      bookSlug,
      sessionId,
      conversationId,
      onEvent: stream.onEvent,
    });
  }
}
