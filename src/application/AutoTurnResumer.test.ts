import { describe, expect, it, vi } from 'vitest';
import type { IModelProvider, IProviderRegistry } from '@domain/interfaces';
import type { ModelInfo, ProviderConfig, ProviderId, ProviderStatus, ResolvedModelSelection, StreamEvent } from '@domain/types';
import { AutoTurnResumer, MAX_RESUME_ATTEMPTS, NO_PROGRESS_LIMIT } from './AutoTurnResumer';

function makeMockRegistry(opts: {
  doneIsMaxTurns?: boolean;
  onSend?: (onEvent: (e: StreamEvent) => void) => Promise<void>;
}): IProviderRegistry {
  return {
    registerProvider: vi.fn(),
    removeProvider: vi.fn(),
    getProvider: vi.fn(() => null),
    getDefaultProvider: vi.fn(() => ({
      providerId: 'test',
      capabilities: ['text-completion', 'streaming'],
      isAvailable: vi.fn(async () => true),
      invalidateAvailabilityCache: vi.fn(),
      sendMessage: vi.fn(),
      abortStream: vi.fn(),
      hasActiveProcesses: vi.fn(() => false),
      hasActiveProcessesForBook: vi.fn(() => false),
    } as unknown as IModelProvider)),
    getProviderForModel: vi.fn(() => null),
    resolveModelSelection: vi.fn((m: string) => ({ requestedModel: m, model: m, providerId: 'test', didFallback: false, reason: 'requested-model-available' }) as ResolvedModelSelection),
    listProviders: vi.fn(() => [] as ProviderConfig[]),
    listAllModels: vi.fn(() => [] as ModelInfo[]),
    checkProviderStatus: vi.fn(async () => 'available' as ProviderStatus),
    getProviderConfig: vi.fn(() => null),
    updateProviderConfig: vi.fn(),
    sendMessage: vi.fn(async (params: { onEvent: (e: StreamEvent) => void }) => {
      if (opts.onSend) return opts.onSend(params.onEvent);
      params.onEvent({ type: 'done', inputTokens: 0, outputTokens: 0, thinkingTokens: 0, filesTouched: {} });
    }),
    abortStream: vi.fn(),
    hasActiveProcesses: vi.fn(() => false),
    hasActiveProcessesForBook: vi.fn(() => false),
  } as unknown as IProviderRegistry;
}

describe('AutoTurnResumer', () => {
  it('forwards done normally when isMaxTurns is not set', async () => {
    const events: StreamEvent[] = [];
    const inner = makeMockRegistry({});
    const resumer = new AutoTurnResumer(inner);

    await resumer.sendMessage({
      model: 'test-model',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'hello' }],
      maxTokens: 4096,
      maxTurns: 10,
      conversationId: 'conv-1',
      onEvent: (e) => events.push(e),
    });

    const done = events.find(e => e.type === 'done');
    expect(done).toBeDefined();
    expect(events.filter(e => e.type === 'error')).toHaveLength(0);
  });

  it('auto-resumes when error has isMaxTurns: true, then forwards done', async () => {
    const events: StreamEvent[] = [];
    let callCount = 0;
    const inner = makeMockRegistry({
      onSend: (onEvent) => {
        callCount++;
        if (callCount === 1) {
          onEvent({ type: 'textDelta', text: 'partial work' });
          onEvent({ type: 'error', message: 'max turns', isMaxTurns: true });
          return Promise.reject(new Error('max turns'));
        }
        onEvent({ type: 'textDelta', text: ' finished' });
        onEvent({ type: 'done', inputTokens: 10, outputTokens: 20, thinkingTokens: 0, filesTouched: {} });
        return Promise.resolve();
      },
    });
    const resumer = new AutoTurnResumer(inner);

    await resumer.sendMessage({
      model: 'test-model',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'do work' }],
      maxTokens: 4096,
      maxTurns: 30,
      conversationId: 'conv-1',
      onEvent: (e) => events.push(e),
    });

    expect(callCount).toBe(2);
    const resumeEvents = events.filter(e => e.type === 'maxTurnsResume');
    expect(resumeEvents).toHaveLength(1);
    expect(resumeEvents[0]).toMatchObject({ type: 'maxTurnsResume', attempt: 1, newMaxTurns: 40 });
    const done = events.find(e => e.type === 'done');
    expect(done).toBeDefined();
    expect(events.filter(e => e.type === 'error')).toHaveLength(0);
  });

  it('auto-resumes when done has isMaxTurns: true (Ollama/Llama pattern)', async () => {
    const events: StreamEvent[] = [];
    let callCount = 0;
    const inner = makeMockRegistry({
      onSend: (onEvent) => {
        callCount++;
        if (callCount === 1) {
          onEvent({ type: 'textDelta', text: 'partial' });
          onEvent({ type: 'done', inputTokens: 5, outputTokens: 10, thinkingTokens: 0, filesTouched: {}, isMaxTurns: true });
          return Promise.resolve();
        }
        onEvent({ type: 'done', inputTokens: 5, outputTokens: 15, thinkingTokens: 0, filesTouched: {} });
        return Promise.resolve();
      },
    });
    const resumer = new AutoTurnResumer(inner);

    await resumer.sendMessage({
      model: 'test-model',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'do work' }],
      maxTokens: 4096,
      maxTurns: 30,
      conversationId: 'conv-1',
      onEvent: (e) => events.push(e),
    });

    expect(callCount).toBe(2);
    expect(events.filter(e => e.type === 'maxTurnsResume')).toHaveLength(1);
    const done = events.find(e => e.type === 'done');
    expect(done).toBeDefined();
    if (done?.type === 'done') {
      expect(done.inputTokens).toBe(10);
      expect(done.outputTokens).toBe(25);
    }
  });

  it('forwards genuine errors (non-maxTurns) without resuming', async () => {
    const events: StreamEvent[] = [];
    const inner = makeMockRegistry({
      onSend: (onEvent) => {
        onEvent({ type: 'error', message: 'CLI crashed' });
        return Promise.reject(new Error('CLI crashed'));
      },
    });
    const resumer = new AutoTurnResumer(inner);

    await expect(resumer.sendMessage({
      model: 'test-model',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'hello' }],
      maxTokens: 4096,
      maxTurns: 30,
      conversationId: 'conv-1',
      onEvent: (e) => events.push(e),
    })).rejects.toThrow('CLI crashed');

    expect(events.filter(e => e.type === 'error')).toHaveLength(1);
    expect(events.filter(e => e.type === 'maxTurnsResume')).toHaveLength(0);
  });

  it('delegates abortStream to the inner registry', () => {
    const inner = makeMockRegistry({});
    const resumer = new AutoTurnResumer(inner);
    resumer.abortStream('conv-1');
    expect(inner.abortStream).toHaveBeenCalledWith('conv-1');
  });

  it('forwards callStart only from the first attempt', async () => {
    const events: StreamEvent[] = [];
    let callCount = 0;
    const inner = makeMockRegistry({
      onSend: (onEvent) => {
        callCount++;
        if (callCount <= 2) {
          onEvent({ type: 'callStart', agentName: 'Spark', model: 'test', bookSlug: 'book-1' });
          onEvent({ type: 'textDelta', text: 'work' });
          onEvent({ type: 'done', inputTokens: 0, outputTokens: 0, thinkingTokens: 0, filesTouched: {}, isMaxTurns: true });
          return Promise.resolve();
        }
        onEvent({ type: 'callStart', agentName: 'Spark', model: 'test', bookSlug: 'book-1' });
        onEvent({ type: 'done', inputTokens: 0, outputTokens: 0, thinkingTokens: 0, filesTouched: {} });
        return Promise.resolve();
      },
    });
    const resumer = new AutoTurnResumer(inner);

    await resumer.sendMessage({
      model: 'test-model',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'do work' }],
      maxTokens: 4096,
      maxTurns: 30,
      conversationId: 'conv-1',
      onEvent: (e) => events.push(e),
    });

    const callStarts = events.filter(e => e.type === 'callStart');
    expect(callStarts).toHaveLength(1);
  });

  it('stops after MAX_RESUME_ATTEMPTS resume attempts and emits a merged done (isMaxTurns: true)', async () => {
    const events: StreamEvent[] = [];
    let callCount = 0;
    const inner = makeMockRegistry({
      onSend: (onEvent) => {
        callCount++;
        // Strictly longer text each attempt so the no-progress guard
        // never fires — only the hard cap should stop the loop.
        onEvent({ type: 'textDelta', text: 'x'.repeat(callCount * 10) });
        onEvent({ type: 'done', inputTokens: 1, outputTokens: 1, thinkingTokens: 0, filesTouched: {}, isMaxTurns: true });
        return Promise.resolve();
      },
    });
    const resumer = new AutoTurnResumer(inner);

    await resumer.sendMessage({
      model: 'test-model',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'do work' }],
      maxTokens: 4096,
      maxTurns: 30,
      conversationId: 'conv-1',
      onEvent: (e) => events.push(e),
    });

    // Five attempts that hit max-turns; the sixth attempt entry triggers
    // the hard cap. Total inner sendMessage calls = MAX_RESUME_ATTEMPTS.
    expect(callCount).toBe(MAX_RESUME_ATTEMPTS);
    const warnings = events.filter((e) => e.type === 'warning');
    expect(warnings.some((w) => /max resume attempts/.test(w.message))).toBe(true);
    const done = events.find((e) => e.type === 'done');
    expect(done).toBeDefined();
    expect((done as { isMaxTurns?: boolean }).isMaxTurns).toBe(true);
    // One maxTurnsResume per attempt that re-spawned = MAX_RESUME_ATTEMPTS
    const resumeEvents = events.filter((e) => e.type === 'maxTurnsResume');
    expect(resumeEvents.length).toBe(MAX_RESUME_ATTEMPTS);
  });

  it('aborts after NO_PROGRESS_LIMIT consecutive attempts with no new text or files', async () => {
    const events: StreamEvent[] = [];
    let callCount = 0;
    const inner = makeMockRegistry({
      onSend: (onEvent) => {
        callCount++;
        onEvent({ type: 'done', inputTokens: 1, outputTokens: 0, thinkingTokens: 0, filesTouched: {}, isMaxTurns: true });
        return Promise.resolve();
      },
    });
    const resumer = new AutoTurnResumer(inner);

    await resumer.sendMessage({
      model: 'test-model',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'do work' }],
      maxTokens: 4096,
      maxTurns: 30,
      conversationId: 'conv-1',
      onEvent: (e) => events.push(e),
    });

    // Initial attempt + one resume, then the second no-progress attempt
    // triggers the NO_PROGRESS_LIMIT abort. Total = NO_PROGRESS_LIMIT.
    expect(callCount).toBe(NO_PROGRESS_LIMIT);
    const warnings = events.filter((e) => e.type === 'warning');
    expect(warnings.some((w) => /No progress across 2/.test(w.message))).toBe(true);
    const done = events.find((e) => e.type === 'done');
    expect(done).toBeDefined();
    expect((done as { isMaxTurns?: boolean }).isMaxTurns).toBe(true);
  });
});