import { nanoid } from 'nanoid';
import type {
  IAgentService,
  IProviderRegistry,
  IDatabaseService,
  IFileSystemService,
  IHotTakeService,
} from '@domain/interfaces';
import type { ProjectManifest, StreamEvent } from '@domain/types';
import {
  HOT_TAKE_MODEL,
  AGENT_REGISTRY,
  CLAUDE_CLI_PROVIDER_ID,
  MULTI_CALL_SCRATCH_DIR,
  MULTI_CALL_TARGET_WORDS_PER_BATCH,
} from '@domain/constants';
import { randomPreparingStatus, randomWaitingStatus } from '@domain/statusMessages';
import { StreamManager } from './StreamManager';
import { resolveThinkingBudget } from './thinkingBudget';

/**
 * HotTakeService — Handles Ghostlight "hot take" conversations.
 *
 * Two modes:
 *
 * 1. **Claude CLI** (single call) — Uses Opus (HOT_TAKE_MODEL), reads the
 *    full manuscript in one go via tool calls. Opus's 200K context handles
 *    even large manuscripts without issue.
 *
 * 2. **Ollama / other providers** (multi-call sipping) — Breaks the read
 *    into batches of ~25K words. Each batch reads its chapters and writes
 *    a tracker to source/.scratch/hot-take-batch-N.md. A final synthesis
 *    call reads all trackers and produces the 5-paragraph hot take in chat.
 *    Uses the user's selected model, not Opus.
 */
export class HotTakeService implements IHotTakeService {
  constructor(
    private agents: IAgentService,
    private providers: IProviderRegistry,
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
    const { appSettings } = params;

    // Route based on provider: Claude CLI can gulp the whole manuscript in
    // one call with Opus. Everyone else needs to sip it in batches.
    const activeProvider = this.providers.getProviderForModel(appSettings.model)
      ?? this.providers.getDefaultProvider();
    const isClaudeCli = activeProvider.providerId === CLAUDE_CLI_PROVIDER_ID;

    if (isClaudeCli) {
      await this.handleSingleCall(params);
    } else {
      await this.handleMultiCall(params);
    }
  }

  // ── Single-call mode (Claude CLI + Opus) ──────────────────────────────

  private async handleSingleCall(params: {
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

    await this.providers.sendMessage({
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

  // ── Multi-call sipping mode (Ollama / non-Claude-CLI) ─────────────────

  private async handleMultiCall(params: {
    conversationId: string;
    bookSlug: string;
    appSettings: { model: string; maxTokens: number; enableThinking: boolean; thinkingBudget: number; overrideThinkingBudget: boolean };
    agent: { systemPrompt: string; thinkingBudget: number };
    onEvent: (event: StreamEvent) => void;
    sessionId: string;
    thinkingBudgetOverride?: number;
    callId?: string;
  }): Promise<void> {
    const { conversationId, bookSlug, appSettings, agent, onEvent } = params;
    const model = appSettings.model;

    onEvent({ type: 'status', message: randomPreparingStatus() });

    const manifest = await this.fs.getProjectManifest(bookSlug);
    const hotTakeInstructions = await this.agents.loadRaw('HOT-TAKE.md');

    // Build chapter batches by word count
    const chapters = manifest.files
      .filter((f) => f.path.startsWith('chapters/') && f.path.endsWith('/draft.md'))
      .sort((a, b) => a.path.localeCompare(b.path));

    if (chapters.length === 0) {
      onEvent({ type: 'error', message: 'No chapter drafts found to read.' });
      return;
    }

    const batches = this.computeBatches(chapters);
    const totalSteps = batches.length + 1; // N read batches + 1 synthesis

    console.log(
      `[HotTakeService] Multi-call sipping: ${batches.length} read batch(es) + synthesis ` +
      `for ${chapters.length} chapters, model=${model}`,
    );

    const thinkingBudget = resolveThinkingBudget(appSettings, agent.thinkingBudget, params.thinkingBudgetOverride);
    const scratchFiles: string[] = [];

    // ── Read batches ──────────────────────────────────────────────────

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      const stepNum = batchIdx + 1;
      const scratchFile = `${MULTI_CALL_SCRATCH_DIR}/hot-take-batch-${stepNum}.md`;
      scratchFiles.push(scratchFile);

      const batchLabel = batches.length === 1
        ? 'Reading manuscript'
        : `Reading batch ${stepNum}/${batches.length}`;

      // Emit progress
      onEvent({
        type: 'multiCallProgress',
        step: stepNum,
        totalSteps,
        label: batchLabel,
      });
      onEvent({ type: 'status', message: `Step ${stepNum}/${totalSteps}: ${batchLabel}` });

      const chapterListing = batch
        .map((ch) => {
          const name = ch.path.replace('chapters/', '').replace('/draft.md', '');
          return `- \`${ch.path}\` — ${name} (${ch.wordCount.toLocaleString()} words)`;
        })
        .join('\n');

      // Prior batch context: only read the immediately preceding tracker
      const prevScratchFile = batchIdx > 0 ? scratchFiles[batchIdx - 1] : null;
      const priorContext = prevScratchFile
        ? `\n2. Use the **Read** tool on \`${prevScratchFile}\` to carry forward your running impressions from the previous batch.\n`
        : '';

      const stepAfterPrior = prevScratchFile ? '3' : '2';

      const batchPrompt = `Read ${batches.length === 1 ? 'the' : `batch ${stepNum} of ${batches.length} of the`} manuscript chapters as a first-time reader${batchIdx > 0 ? ', continuing from where you left off' : ''}.

${chapterListing}

**Instructions:**
1. Use the **Read** tool on each chapter file listed above, one at a time, in order.${priorContext}
${stepAfterPrior}. After reading ALL chapters in this batch, use the **Write** tool to create \`${scratchFile}\`.

Track your real-time, gut-level experience for each chapter:
- Engagement level (1–5) — did it grab you or did you zone out?
- Emotional beat — what did you feel?
- What's working — strongest moments, lines, images
- What's not working — weakest moments, confusion, drag
- Running questions — what are you wondering about?${batchIdx > 0 ? ' (note which earlier questions got answered)' : ''}

**IMPORTANT: You MUST use the Write tool to create \`${scratchFile}\` before finishing.** Do not end without writing the file.

${batches.length > 1 ? `Do NOT give your final hot take yet — this is batch ${stepNum} of ${batches.length}.` : 'Do NOT give your final hot take yet — that comes in the next step.'}`;

      // Save sub-prompt as user message
      this.db.saveMessage({
        conversationId,
        role: 'user',
        content: batchPrompt,
        thinking: '',
      });

      // System prompt: Ghostlight base + HOT-TAKE tone instructions (but NOT
      // the "respond with at most five paragraphs" format — that's for synthesis)
      const batchSystemPrompt = agent.systemPrompt + '\n\n---\n\n' +
        'You are doing a HOT TAKE — an informal, off-the-record cold read of a manuscript.\n' +
        'This is a batch read step. Read like a reader would, tracking your genuine reactions.\n' +
        'Be honest. Have opinions. Do NOT hedge.';

      const batchSessionId = nanoid();
      this.db.createStreamSession({
        id: batchSessionId,
        conversationId,
        agentName: 'Ghostlight',
        model,
        bookSlug,
        startedAt: new Date().toISOString(),
        endedAt: null,
        finalStage: 'idle',
        filesTouched: {},
        interrupted: false,
      });

      // Intermediate steps must NOT emit done/error to the caller (same
      // pattern as MultiCallOrchestrator — prevents chatStore teardown)
      const wrappedOnEvent = (event: StreamEvent) => {
        if (event.type === 'done') {
          console.log(`[HotTakeService] Intercepted intermediate done (batch ${stepNum}/${batches.length})`);
          return;
        }
        if (event.type === 'error') {
          console.warn(`[HotTakeService] Batch ${stepNum} error: ${event.message}`);
          onEvent({ type: 'status', message: `Batch ${stepNum} warning: ${event.message}` });
          return;
        }
        onEvent(event);
      };

      const stream = this.streamManager.startStream({
        conversationId,
        agentName: 'Ghostlight',
        model,
        bookSlug,
        sessionId: batchSessionId,
        callId: params.callId ?? '',
        onEvent: wrappedOnEvent,
      });

      try {
        await this.providers.sendMessage({
          model,
          systemPrompt: batchSystemPrompt,
          messages: [{ role: 'user', content: batchPrompt }],
          maxTokens: appSettings.maxTokens,
          thinkingBudget,
          maxTurns: 15, // Enough for: N chapter reads + 1 prior-tracker read + 1 write + buffer
          bookSlug,
          sessionId: batchSessionId,
          conversationId,
          onEvent: stream.onEvent,
        });

        await stream.awaitPendingHook();

        console.log(`[HotTakeService] Batch ${stepNum}/${batches.length} complete`);
      } catch (err) {
        console.error(`[HotTakeService] Batch ${stepNum} failed:`, err);
        onEvent({
          type: 'error',
          message: `Hot take batch ${stepNum}/${batches.length} failed: ` +
            `${err instanceof Error ? err.message : String(err)}. ` +
            `Batch notes saved in ${MULTI_CALL_SCRATCH_DIR}/. You can retry.`,
        });
        return;
      }
    }

    // ── Synthesis step ────────────────────────────────────────────────

    const synthLabel = 'Delivering hot take';
    onEvent({
      type: 'multiCallProgress',
      step: totalSteps,
      totalSteps,
      label: synthLabel,
    });
    onEvent({ type: 'status', message: `Step ${totalSteps}/${totalSteps}: ${synthLabel}` });

    const scratchFileList = scratchFiles
      .map((f) => `- \`${f}\``)
      .join('\n');

    const synthPrompt = `Now deliver your hot take.

Read your batch notes (use the Read tool on each file):
${scratchFileList}

Then respond with your honest, gut-level reaction to the manuscript. AT MOST five paragraphs:

1. **Gut reaction** — Your immediate emotional response. Did it grab you? Where did you zone out?
2. **What's working** — The strongest elements. Be specific: name scenes, characters, lines.
3. **What's not working** — The weakest elements. Don't soften it. Name the problems.
4. **The big question** — The single most important thing the author needs to address.
5. **Verdict** — One sentence. Would you keep reading? Would you recommend it?

Write like a smart friend who just read the draft, not like an editor writing a letter. Be human about it. Do NOT hedge with "it depends on your goals" or "this is subjective." Have an opinion.

Do NOT write any files. Your response lives in chat only.`;

    this.db.saveMessage({
      conversationId,
      role: 'user',
      content: synthPrompt,
      thinking: '',
    });

    const synthSessionId = nanoid();
    this.db.createStreamSession({
      id: synthSessionId,
      conversationId,
      agentName: 'Ghostlight',
      model,
      bookSlug,
      startedAt: new Date().toISOString(),
      endedAt: null,
      finalStage: 'idle',
      filesTouched: {},
      interrupted: false,
    });

    const synthSystemPrompt = agent.systemPrompt + '\n\n---\n\n' + hotTakeInstructions;

    const synthStream = this.streamManager.startStream(
      {
        conversationId,
        agentName: 'Ghostlight',
        model,
        bookSlug,
        sessionId: synthSessionId,
        callId: params.callId ?? '',
        onEvent, // Final step — let done/error through
      },
      { trackFilesChanged: false },
    );

    try {
      await this.providers.sendMessage({
        model,
        systemPrompt: synthSystemPrompt,
        messages: [{ role: 'user', content: synthPrompt }],
        maxTokens: appSettings.maxTokens,
        thinkingBudget,
        maxTurns: scratchFiles.length + 3, // reads + response + buffer
        bookSlug,
        sessionId: synthSessionId,
        conversationId,
        onEvent: synthStream.onEvent,
      });

      await synthStream.awaitPendingHook();

      // Clean up scratch files after successful synthesis
      await this.cleanupScratchFiles(bookSlug, scratchFiles);
    } catch (err) {
      console.error('[HotTakeService] Synthesis failed:', err);
      onEvent({
        type: 'error',
        message: `Hot take synthesis failed: ${err instanceof Error ? err.message : String(err)}. ` +
          `Batch notes preserved in ${MULTI_CALL_SCRATCH_DIR}/ — you can ask for the hot take again.`,
      });
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  /**
   * Split chapters into word-count-balanced batches.
   * Targets ~MULTI_CALL_TARGET_WORDS_PER_BATCH words per batch.
   */
  private computeBatches(
    chapters: { path: string; wordCount: number }[],
  ): { path: string; wordCount: number }[][] {
    const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
    const batchCount = Math.max(1, Math.min(8, Math.ceil(totalWords / MULTI_CALL_TARGET_WORDS_PER_BATCH)));

    if (batchCount === 1) return [chapters];

    const targetPerBatch = Math.ceil(totalWords / batchCount);
    const batches: typeof chapters[] = [];
    let current: typeof chapters = [];
    let currentWords = 0;

    for (const ch of chapters) {
      current.push(ch);
      currentWords += ch.wordCount;

      if (currentWords >= targetPerBatch && batches.length < batchCount - 1) {
        batches.push(current);
        current = [];
        currentWords = 0;
      }
    }

    if (current.length > 0) {
      batches.push(current);
    }

    return batches;
  }

  /**
   * Delete hot-take scratch files after successful synthesis.
   */
  private async cleanupScratchFiles(bookSlug: string, scratchFiles: string[]): Promise<void> {
    for (const file of scratchFiles) {
      try {
        const exists = await this.fs.fileExists(bookSlug, file);
        if (exists) {
          await this.fs.deleteFile(bookSlug, file);
          console.log(`[HotTakeService] Cleaned up ${file}`);
        }
      } catch (err) {
        console.warn(`[HotTakeService] Failed to clean up ${file}:`, err);
      }
    }

    // Remove scratch dir if empty
    try {
      const entries = await this.fs.listDirectory(bookSlug, MULTI_CALL_SCRATCH_DIR);
      if (entries.length === 0) {
        await this.fs.deletePath(bookSlug, MULTI_CALL_SCRATCH_DIR);
        console.log(`[HotTakeService] Removed empty ${MULTI_CALL_SCRATCH_DIR}/`);
      }
    } catch {
      // Directory may not exist — fine
    }
  }
}
