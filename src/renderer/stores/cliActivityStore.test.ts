import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AgentName, StreamEvent } from '@domain/types';
import { AGENT_REGISTRY } from '@domain/constants';
import { useCliActivityStore } from './cliActivityStore';
import {
  installNovelEngineMock,
  makeActiveStreamInfo,
  type NovelEngineMock,
} from '../../test/novelEngineMock';
import { resetStoresBeforeEach } from '../../test/resetStores';

resetStoresBeforeEach(useCliActivityStore);

type TaggedEvent = StreamEvent & { callId?: string; conversationId?: string };

let mock: NovelEngineMock;

beforeEach(() => {
  mock = installNovelEngineMock();
});

afterEach(() => {
  useCliActivityStore.getState().destroyListener();
  vi.useRealTimers();
});

function handle(event: TaggedEvent): void {
  useCliActivityStore.getState().handleStreamEvent(event);
}

function startCall(callId: string, overrides: Partial<{ agentName: AgentName; model: string; bookSlug: string; conversationId: string }> = {}): void {
  handle({
    type: 'callStart',
    agentName: overrides.agentName ?? 'Spark',
    model: overrides.model ?? 'claude-opus-4-20250514',
    bookSlug: overrides.bookSlug ?? 'book-a',
    callId,
    conversationId: overrides.conversationId ?? 'conv-1',
  });
}

describe('cliActivityStore', () => {
  it('callStart creates a call with agent/model metadata, prepends it, and auto-selects it', () => {
    startCall('call-1');

    const state = useCliActivityStore.getState();
    const call = state.calls['call-1'];
    expect(state.callOrder).toEqual(['call-1']);
    expect(state.selectedCallId).toBe('call-1');
    expect(call.isActive).toBe(true);
    expect(call.callMeta.agentColor).toBe(AGENT_REGISTRY.Spark.color);
    expect(call.callMeta.agentRole).toBe(AGENT_REGISTRY.Spark.role);
    expect(call.callMeta.modelLabel).toBe('Opus 4'); // date + vendor prefix stripped
    expect(call.entries).toHaveLength(1);
    expect(call.entries[0]).toMatchObject({ kind: 'spawn', message: 'Spark call started (Opus 4)' });
  });

  it('tracks a full call lifecycle: phases, deltas, tools, files, done + diagnostics', async () => {
    mock.context.getLastDiagnostics.mockResolvedValue({
      filesAvailable: ['source/pitch.md'],
      conversationTurnsSent: 4,
      conversationTurnsDropped: 1,
      manifestTokenEstimate: 1234,
    });
    startCall('call-1');
    const id = { callId: 'call-1' };

    handle({ type: 'blockStart', blockType: 'thinking', ...id });
    handle({ type: 'thinkingDelta', text: 'x'.repeat(400), ...id });
    handle({ type: 'blockEnd', blockType: 'thinking', ...id });
    handle({ type: 'blockStart', blockType: 'text', ...id });
    handle({ type: 'textDelta', text: 'y'.repeat(80), ...id });
    handle({ type: 'blockEnd', blockType: 'text', ...id });
    handle({
      type: 'toolUse',
      tool: { toolName: 'Write', toolId: 't1', status: 'started', filePath: 'chapters/01/draft.md' },
      ...id,
    });
    handle({
      type: 'toolUse',
      tool: { toolName: 'Write', toolId: 't1', status: 'complete', filePath: 'chapters/01/draft.md' },
      ...id,
    });
    handle({ type: 'filesChanged', paths: ['chapters/01/draft.md'], ...id });
    handle({ type: 'done', inputTokens: 100, outputTokens: 200, thinkingTokens: 50, filesTouched: {}, ...id });

    const call = useCliActivityStore.getState().calls['call-1'];
    expect(call.isActive).toBe(false);
    expect(call.streamingThinkingChars).toBe(400);
    expect(call.streamingTextChars).toBe(80);
    expect(call.entries.map((e) => e.kind)).toEqual([
      'spawn', 'thinking-start', 'thinking-end', 'text-start', 'text-end',
      'tool-start', 'tool-complete', 'files-changed', 'done',
    ]);
    // CHARS_PER_TOKEN = 4 → 400 chars ≈ 100 tokens
    expect(call.entries[2].message).toContain('~100');
    expect(call.phases.map((p) => p.label)).toEqual(['Thinking', 'Generating', 'Tool: Write']);
    expect(call.phases.every((p) => p.endedAt !== null && p.durationMs !== null)).toBe(true);
    expect(call.toolUseCount).toBe(1);
    expect(call.toolUseBreakdown).toEqual({ Write: 1 });
    expect(call.currentToolName).toBeNull();
    expect(call.sessionInputTokens).toBe(100);
    expect(call.sessionOutputTokens).toBe(200);
    expect(call.sessionThinkingTokens).toBe(50);

    // done auto-loads diagnostics (scoped by conversationId)
    await vi.waitFor(() =>
      expect(useCliActivityStore.getState().calls['call-1'].diagnostics).not.toBeNull(),
    );
    expect(mock.context.getLastDiagnostics).toHaveBeenCalledWith('conv-1');
    const final = useCliActivityStore.getState().calls['call-1'];
    expect(final.entries.at(-1)?.kind).toBe('context-loaded');
  });

  it('tool errors close the phase and record a tool-error entry', () => {
    startCall('call-1');
    handle({ type: 'toolUse', tool: { toolName: 'Bash', toolId: 't1', status: 'started' }, callId: 'call-1' });
    handle({ type: 'toolUse', tool: { toolName: 'Bash', toolId: 't1', status: 'error' }, callId: 'call-1' });

    const call = useCliActivityStore.getState().calls['call-1'];
    expect(call.entries.at(-1)).toMatchObject({ kind: 'tool-error', message: 'Bash failed' });
    expect(call.currentToolName).toBeNull();
    expect(call.phases[0].endedAt).not.toBeNull();
  });

  it('error events deactivate the call with an error entry', () => {
    startCall('call-1');
    handle({ type: 'error', message: 'CLI crashed', callId: 'call-1' });

    const call = useCliActivityStore.getState().calls['call-1'];
    expect(call.isActive).toBe(false);
    expect(call.entries.at(-1)).toMatchObject({ kind: 'error', message: 'CLI crashed' });
  });

  it('events without a callId fall back to the most recent active call', () => {
    startCall('call-1');
    handle({ type: 'status', message: 'untagged status' });

    const call = useCliActivityStore.getState().calls['call-1'];
    expect(call.entries.at(-1)).toMatchObject({ kind: 'status', message: 'untagged status' });
  });

  it('a status event with no tracked calls creates a default Wrangler call (pinned)', () => {
    handle({ type: 'status', message: 'orphan status' });

    const state = useCliActivityStore.getState();
    expect(state.callOrder).toEqual(['_default']);
    expect(state.calls['_default'].callMeta.agentName).toBe('Wrangler');
    expect(state.calls['_default'].entries[0].message).toBe('orphan status');
  });

  it('unhandled event types (progressStage, warning, …) leave the call unchanged (pinned)', () => {
    startCall('call-1');
    const before = useCliActivityStore.getState().calls['call-1'];

    handle({ type: 'progressStage', stage: 'reading', callId: 'call-1' });
    handle({ type: 'warning', message: 'ignored', callId: 'call-1' });

    const after = useCliActivityStore.getState().calls['call-1'];
    expect(after.entries).toEqual(before.entries);
  });

  it('caps entries per call at 500, dropping the oldest (pinned)', () => {
    startCall('call-1');
    for (let i = 0; i < 550; i++) {
      handle({ type: 'status', message: `status ${i}`, callId: 'call-1' });
    }

    const call = useCliActivityStore.getState().calls['call-1'];
    expect(call.entries).toHaveLength(500);
    // spawn (id 0) + 550 statuses (ids 1..550) → last 500 kept
    expect(call.entries[0].id).toBe(51);
    expect(call.entries.at(-1)?.id).toBe(550);
  });

  it('prunes completed calls beyond 10 on the next callStart, oldest first (pinned)', () => {
    for (let i = 1; i <= 12; i++) {
      startCall(`call-${i}`);
      handle({ type: 'done', inputTokens: 0, outputTokens: 0, thinkingTokens: 0, filesTouched: {}, callId: `call-${i}` });
    }

    // Pruning runs only inside callStart: starting call-12 saw 11 completed
    // calls and dropped the oldest (call-1). call-12's own completion does
    // not re-prune, so 11 calls remain until the next callStart.
    let state = useCliActivityStore.getState();
    expect(state.callOrder).toHaveLength(11);
    expect(state.calls['call-1']).toBeUndefined();
    expect(state.calls['call-2']).toBeDefined();
    expect(state.callOrder[0]).toBe('call-12');

    startCall('call-13');
    state = useCliActivityStore.getState();
    expect(state.calls['call-2']).toBeUndefined();
    expect(state.callOrder).toHaveLength(11); // 10 completed + call-13 active
  });

  it('filters calls by agent and book, moving the selection to the first visible call', () => {
    startCall('call-spark', { agentName: 'Spark', bookSlug: 'book-a' });
    startCall('call-verity', { agentName: 'Verity', bookSlug: 'book-b' });
    useCliActivityStore.getState().selectCall('call-verity');

    useCliActivityStore.getState().setFilterAgent('Spark');
    expect(useCliActivityStore.getState().getFilteredCallOrder()).toEqual(['call-spark']);
    expect(useCliActivityStore.getState().selectedCallId).toBe('call-spark');

    useCliActivityStore.getState().setFilterAgent(null);
    useCliActivityStore.getState().setFilterBook('book-b');
    expect(useCliActivityStore.getState().getFilteredCallOrder()).toEqual(['call-verity']);

    expect(useCliActivityStore.getState().getBookSlugs()).toEqual(['book-a', 'book-b']);
    expect(useCliActivityStore.getState().getAgentNames()).toEqual(['Spark', 'Verity']);
  });

  it('clearCall reassigns the selection; clear wipes everything', () => {
    startCall('call-1');
    startCall('call-2');
    useCliActivityStore.getState().selectCall('call-2');

    useCliActivityStore.getState().clearCall('call-2');
    expect(useCliActivityStore.getState().selectedCallId).toBe('call-1');
    expect(useCliActivityStore.getState().callOrder).toEqual(['call-1']);

    useCliActivityStore.getState().clear();
    expect(useCliActivityStore.getState().calls).toEqual({});
    expect(useCliActivityStore.getState().callOrder).toEqual([]);
    expect(useCliActivityStore.getState().selectedCallId).toBeNull();
  });

  it('activeCallCount and updateElapsed only consider active calls', () => {
    vi.useFakeTimers();
    startCall('call-1');
    startCall('call-2');
    handle({ type: 'done', inputTokens: 0, outputTokens: 0, thinkingTokens: 0, filesTouched: {}, callId: 'call-2' });

    expect(useCliActivityStore.getState().activeCallCount()).toBe(1);

    vi.advanceTimersByTime(1500);
    useCliActivityStore.getState().updateElapsed();
    expect(useCliActivityStore.getState().calls['call-1'].callElapsedMs).toBe(1500);
  });

  it('initListener wires the bridge channel once; destroyListener detaches it', () => {
    useCliActivityStore.getState().initListener();
    useCliActivityStore.getState().initListener();
    expect(mock.listenerCount('chat:streamEvent')).toBe(1);

    mock.emit('chat:streamEvent', {
      type: 'callStart',
      agentName: 'Spark',
      model: 'claude-opus-4-20250514',
      bookSlug: 'book-a',
      callId: 'call-live',
      conversationId: 'conv-1',
    });
    expect(useCliActivityStore.getState().calls['call-live']).toBeDefined();

    useCliActivityStore.getState().destroyListener();
    expect(mock.listenerCount('chat:streamEvent')).toBe(0);
  });

  it('recoverActiveStream creates a recovered call and the poll marks it done when the stream ends', async () => {
    vi.useFakeTimers();
    mock.chat.getActiveStream.mockResolvedValue(
      makeActiveStreamInfo({
        conversationId: 'conv-9',
        agentName: 'Verity',
        thinkingBuffer: 'abcd',
        textBuffer: 'xyz',
      }),
    );

    await useCliActivityStore.getState().recoverActiveStream();

    const callId = 'recovered:conv-9';
    const call = useCliActivityStore.getState().calls[callId];
    expect(call.isActive).toBe(true);
    expect(call.streamingThinkingChars).toBe(4);
    expect(call.streamingTextChars).toBe(3);
    expect(call.entries[0].message).toContain('Reconnected to active Verity call');

    // Stream ends — the 2s poll notices and closes the call
    mock.chat.getActiveStream.mockResolvedValue(null);
    await vi.advanceTimersByTimeAsync(2000);

    const finished = useCliActivityStore.getState().calls[callId];
    expect(finished.isActive).toBe(false);
    expect(finished.entries.at(-1)).toMatchObject({
      kind: 'done',
      message: 'Stream completed (detected via poll)',
    });

    // Poll cleared itself
    const calls = mock.chat.getActiveStream.mock.calls.length;
    await vi.advanceTimersByTimeAsync(4000);
    expect(mock.chat.getActiveStream.mock.calls.length).toBe(calls);
  });
});
