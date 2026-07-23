import { nanoid } from 'nanoid';
import type {
  IModelProvider,
  IProviderRegistry,
} from '@domain/interfaces';
import type {
  FileTouchMap,
  MessageRole,
  ModelInfo,
  ProviderConfig,
  ProviderId,
  ProviderStatus,
  ResolvedModelSelection,
  StreamEvent,
} from '@domain/types';

/** Extra turns added to the budget on each resume attempt. */
const AUTO_RESUME_EXTRA_TURNS = 10;

/** Instruction appended on resume so the model picks up where it left off. */
const RESUME_INSTRUCTION = 'Continue where you left off. You had more work to do.';

/**
 * AutoTurnResumer — transparent wrapper around IProviderRegistry that
 * auto-resumes CLI calls when the max-turns limit is reached.
 *
 * When a provider emits `done` or `error` with `isMaxTurns: true`, this
 * wrapper suppresses the terminal event, captures the partial assistant
 * text, and re-spawns the call with:
 *   - The original messages + the partial assistant output + a "continue" instruction
 *   - A higher turn budget (original + AUTO_RESUME_EXTRA_TURNS per attempt)
 *   - A fresh sessionId (for DB orphan-recovery tracking)
 *
 * No cap on resume attempts — keeps going until the task finishes naturally.
 *
 * Token usage and file touches are accumulated across all attempts and emitted
 * in a single merged `done` event when the task finally completes.
 */
export class AutoTurnResumer implements IProviderRegistry {
  constructor(
    private inner: IProviderRegistry,
  ) {}

  async sendMessage(params: {
    model: string;
    systemPrompt: string;
    messages: { role: MessageRole; content: string }[];
    maxTokens: number;
    thinkingBudget?: number;
    maxTurns?: number;
    bookSlug?: string;
    workingDir?: string;
    sessionId?: string;
    conversationId?: string;
    onEvent: (event: StreamEvent) => void;
  }): Promise<void> {
    const baseMaxTurns = params.maxTurns ?? 30;
    let currentMessages = [...params.messages];
    let attempt = 0;

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalThinkingTokens = 0;
    let allFilesTouched: FileTouchMap = {};

    let callStartForwarded = false;

    while (true) {
      attempt++;
      const currentMaxTurns = baseMaxTurns + (attempt - 1) * AUTO_RESUME_EXTRA_TURNS;
      const resumeSessionId = nanoid();

      let maxTurnsExhausted = false;
      let partialText = '';
      let partialThinking = '';
      let terminalEvent: StreamEvent | null = null;
      let isTerminalDone = false;
      let attemptInputTokens = 0;
      let attemptOutputTokens = 0;
      let attemptThinkingTokens = 0;
      let attemptFilesTouched: FileTouchMap = {};

      const wrappedOnEvent = (event: StreamEvent): void => {
        if (event.type === 'textDelta') {
          partialText += event.text;
        } else if (event.type === 'thinkingDelta') {
          partialThinking += event.text;
        }

        if (event.type === 'done') {
          terminalEvent = event;
          isTerminalDone = true;
          if (event.isMaxTurns) maxTurnsExhausted = true;
          attemptInputTokens = event.inputTokens;
          attemptOutputTokens = event.outputTokens;
          attemptThinkingTokens = event.thinkingTokens;
          attemptFilesTouched = event.filesTouched;
          return;
        }

        if (event.type === 'error') {
          terminalEvent = event;
          if (event.isMaxTurns) maxTurnsExhausted = true;
          return;
        }

        if (event.type === 'callStart') {
          if (callStartForwarded) return;
          callStartForwarded = true;
        }

        params.onEvent(event);
      };

      try {
        await this.inner.sendMessage({
          ...params,
          messages: currentMessages,
          maxTurns: currentMaxTurns,
          sessionId: resumeSessionId,
          onEvent: wrappedOnEvent,
        });
      } catch (err) {
        if (!maxTurnsExhausted) {
          if (terminalEvent) {
            params.onEvent(terminalEvent);
          }
          throw err;
        }
      }

      if (!maxTurnsExhausted) {
        if (terminalEvent) {
          if (isTerminalDone) {
            totalInputTokens += attemptInputTokens;
            totalOutputTokens += attemptOutputTokens;
            totalThinkingTokens += attemptThinkingTokens;
            allFilesTouched = { ...allFilesTouched, ...attemptFilesTouched };

            params.onEvent({
              type: 'done',
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
              thinkingTokens: totalThinkingTokens,
              filesTouched: allFilesTouched,
            });
          } else {
            params.onEvent(terminalEvent);
          }
        }
        return;
      }

      totalInputTokens += attemptInputTokens;
      totalOutputTokens += attemptOutputTokens;
      totalThinkingTokens += attemptThinkingTokens;
      allFilesTouched = { ...allFilesTouched, ...attemptFilesTouched };

      console.log(
        `[AutoTurnResumer] Max turns exhausted (attempt ${attempt}), ` +
        `re-spawning with ${currentMaxTurns + AUTO_RESUME_EXTRA_TURNS} turns, ` +
        `partialText=${partialText.length} chars`,
      );

      if (partialText.trim()) {
        currentMessages = [
          ...currentMessages,
          { role: 'assistant' as MessageRole, content: partialText },
          { role: 'user' as MessageRole, content: RESUME_INSTRUCTION },
        ];
      } else {
        currentMessages = [
          ...currentMessages,
          { role: 'user' as MessageRole, content: RESUME_INSTRUCTION },
        ];
      }

      const nextMaxTurns = currentMaxTurns + AUTO_RESUME_EXTRA_TURNS;
      params.onEvent({ type: 'maxTurnsResume', attempt, newMaxTurns: nextMaxTurns });
      params.onEvent({
        type: 'warning',
        message: `Max turns reached — auto-resuming (attempt ${attempt}, ${nextMaxTurns} turns)...`,
      });
    }
  }

  registerProvider(provider: IModelProvider, config: ProviderConfig): void {
    this.inner.registerProvider(provider, config);
  }

  removeProvider(providerId: ProviderId): void {
    this.inner.removeProvider(providerId);
  }

  getProvider(providerId: ProviderId): IModelProvider | null {
    return this.inner.getProvider(providerId);
  }

  getDefaultProvider(): IModelProvider {
    return this.inner.getDefaultProvider();
  }

  getProviderForModel(modelId: string): IModelProvider | null {
    return this.inner.getProviderForModel(modelId);
  }

  resolveModelSelection(requestedModel: string, preferredProviderId?: ProviderId): ResolvedModelSelection {
    return this.inner.resolveModelSelection(requestedModel, preferredProviderId);
  }

  listProviders(): ProviderConfig[] {
    return this.inner.listProviders();
  }

  listAllModels(): ModelInfo[] {
    return this.inner.listAllModels();
  }

  async checkProviderStatus(providerId: ProviderId): Promise<ProviderStatus> {
    return this.inner.checkProviderStatus(providerId);
  }

  getProviderConfig(providerId: ProviderId): ProviderConfig | null {
    return this.inner.getProviderConfig(providerId);
  }

  updateProviderConfig(providerId: ProviderId, partial: Partial<ProviderConfig>): void {
    this.inner.updateProviderConfig(providerId, partial);
  }

  abortStream(conversationId: string): void {
    this.inner.abortStream(conversationId);
  }

  hasActiveProcesses(): boolean {
    return this.inner.hasActiveProcesses();
  }

  hasActiveProcessesForBook(bookSlug: string): boolean {
    return this.inner.hasActiveProcessesForBook(bookSlug);
  }
}