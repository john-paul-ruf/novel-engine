import { describe, it, expect } from 'vitest';
import type { StreamEvent, StreamEventSource } from '@domain/types';
import { createStreamHandler } from './streamHandler';

/** Bridge events arrive enriched with callId/conversationId/source by the IPC layer. */
type EnrichedEvent = StreamEvent & {
  callId?: string;
  conversationId?: string;
  source?: StreamEventSource;
};

type Recorded = { kind: string; args: unknown[] };

function makeRecorder(
  opts: {
    activeCallId?: string | null;
    isStreaming?: boolean;
    activeConversationId?: string | null;
    alwaysCheckConversationId?: boolean;
  } = {},
) {
  const calls: Recorded[] = [];
  const rec =
    (kind: string) =>
    (...args: unknown[]) => {
      calls.push({ kind, args });
    };

  const handler = createStreamHandler({
    getActiveCallId: () => opts.activeCallId ?? null,
    getIsStreaming: () => opts.isStreaming ?? false,
    getActiveConversationId: () => opts.activeConversationId ?? null,
    alwaysCheckConversationId: opts.alwaysCheckConversationId,
    onStatus: rec('status'),
    onWarning: rec('warning'),
    onBlockStart: rec('blockStart'),
    onThinkingDelta: rec('thinkingDelta'),
    onTextDelta: rec('textDelta'),
    onDone: rec('done'),
    onError: rec('error'),
    onToolUse: rec('toolUse'),
    onProgressStage: rec('progressStage'),
    onThinkingSummary: rec('thinkingSummary'),
    onToolDuration: rec('toolDuration'),
    onFilesChanged: rec('filesChanged'),
    onMultiCallProgress: rec('multiCallProgress'),
    onMaxTurnsResume: rec('maxTurnsResume'),
  });

  return { handler, calls, kinds: () => calls.map((c) => c.kind) };
}

function send(handler: (event: StreamEvent) => void, event: EnrichedEvent): void {
  handler(event);
}

describe('streamHandler', () => {
  it('routes every event type to its callback in order', () => {
    const { handler, calls, kinds } = makeRecorder({ activeCallId: 'call-1', isStreaming: true });
    const id = { callId: 'call-1' };

    send(handler, { type: 'status', message: 'Working…', ...id });
    send(handler, { type: 'warning', message: 'context tight', ...id });
    send(handler, { type: 'blockStart', blockType: 'thinking', ...id });
    send(handler, { type: 'thinkingDelta', text: 'hmm', ...id });
    send(handler, { type: 'blockEnd', blockType: 'thinking', ...id });
    send(handler, { type: 'blockStart', blockType: 'text', ...id });
    send(handler, { type: 'textDelta', text: 'Once', ...id });
    send(handler, {
      type: 'toolUse',
      tool: { toolName: 'Write', toolId: 't1', status: 'complete', filePath: 'a.md' },
      ...id,
    });
    send(handler, { type: 'progressStage', stage: 'drafting', ...id });
    send(handler, { type: 'thinkingSummary', summary: { text: 'plan…', fullLengthChars: 300 }, ...id });
    send(handler, {
      type: 'toolDuration',
      tool: { toolName: 'Write', toolId: 't1', status: 'complete', startedAt: 1, endedAt: 5, durationMs: 4 },
      ...id,
    });
    send(handler, { type: 'filesChanged', paths: ['a.md', 'b.md'], ...id });
    send(handler, { type: 'multiCallProgress', step: 2, totalSteps: 5, label: 'Pass 2', ...id });
    send(handler, { type: 'done', inputTokens: 1, outputTokens: 2, thinkingTokens: 3, filesTouched: {}, ...id });
    send(handler, { type: 'error', message: 'boom', ...id });

    // blockEnd is a pinned no-op — everything else dispatches
    expect(kinds()).toEqual([
      'status', 'warning', 'blockStart', 'thinkingDelta', 'blockStart', 'textDelta',
      'toolUse', 'progressStage', 'thinkingSummary', 'toolDuration', 'filesChanged',
      'multiCallProgress', 'done', 'error',
    ]);
    expect(calls[0].args).toEqual(['Working…']);
    expect(calls[10].args).toEqual([['a.md', 'b.md']]);
    expect(calls[11].args).toEqual([2, 5, 'Pass 2']);
  });

  it('interleaved events from two concurrent streams stay separated by callId', () => {
    const a = makeRecorder({ activeCallId: 'call-a', isStreaming: true });
    const b = makeRecorder({ activeCallId: 'call-b', isStreaming: true });

    const feed: EnrichedEvent[] = [
      { type: 'textDelta', text: 'A1', callId: 'call-a' },
      { type: 'textDelta', text: 'B1', callId: 'call-b' },
      { type: 'textDelta', text: 'A2', callId: 'call-a' },
      { type: 'done', inputTokens: 0, outputTokens: 0, thinkingTokens: 0, filesTouched: {}, callId: 'call-b' },
      { type: 'textDelta', text: 'A3', callId: 'call-a' },
    ];
    for (const event of feed) {
      send(a.handler, event);
      send(b.handler, event);
    }

    expect(a.calls.map((c) => c.args[0])).toEqual(['A1', 'A2', 'A3']);
    expect(b.kinds()).toEqual(['textDelta', 'done']);
    expect(b.calls[0].args).toEqual(['B1']);
  });

  it('skips revision events by source, and by rev: callId prefix only when source is absent', () => {
    const { handler, kinds } = makeRecorder({ activeCallId: null, isStreaming: true });

    send(handler, { type: 'textDelta', text: 'x', callId: 'call-1', source: 'revision' });
    send(handler, { type: 'textDelta', text: 'x', callId: 'rev:session-1' });
    expect(kinds()).toEqual([]);

    // A rev:-prefixed callId WITH an explicit non-revision source passes the skip
    send(handler, { type: 'textDelta', text: 'kept', callId: 'rev:weird', source: 'chat' });
    expect(kinds()).toEqual(['textDelta']);
  });

  it('rejects events from a different call and stale events when idle', () => {
    const active = makeRecorder({ activeCallId: 'call-1', isStreaming: true });
    send(active.handler, { type: 'textDelta', text: 'x', callId: 'call-2' });
    expect(active.calls).toEqual([]);

    const idle = makeRecorder({ activeCallId: null, isStreaming: false });
    send(idle.handler, { type: 'textDelta', text: 'stale' });
    expect(idle.calls).toEqual([]);
  });

  it('recovery mode (streaming, no callId) accepts only the active conversation', () => {
    const { handler, calls } = makeRecorder({
      activeCallId: null,
      isStreaming: true,
      activeConversationId: 'conv-1',
    });

    send(handler, { type: 'textDelta', text: 'wrong', conversationId: 'conv-2' });
    expect(calls).toEqual([]);

    send(handler, { type: 'textDelta', text: 'right', conversationId: 'conv-1' });
    // Events without a conversationId are also allowed through in recovery mode
    send(handler, { type: 'textDelta', text: 'untagged' });
    expect(calls.map((c) => c.args[0])).toEqual(['right', 'untagged']);
  });

  it('alwaysCheckConversationId enforces the conversation guard even with a matching callId', () => {
    const strict = makeRecorder({
      activeCallId: 'call-1',
      isStreaming: true,
      activeConversationId: 'conv-1',
      alwaysCheckConversationId: true,
    });
    send(strict.handler, { type: 'textDelta', text: 'x', callId: 'call-1', conversationId: 'conv-2' });
    expect(strict.calls).toEqual([]);
    send(strict.handler, { type: 'textDelta', text: 'ok', callId: 'call-1', conversationId: 'conv-1' });
    expect(strict.calls.map((c) => c.args[0])).toEqual(['ok']);

    // chatStore-style (false): mid-stream conversation switches are allowed
    const loose = makeRecorder({
      activeCallId: 'call-1',
      isStreaming: true,
      activeConversationId: 'conv-1',
      alwaysCheckConversationId: false,
    });
    send(loose.handler, { type: 'textDelta', text: 'kept', callId: 'call-1', conversationId: 'conv-2' });
    expect(loose.calls.map((c) => c.args[0])).toEqual(['kept']);
  });

  it('unknown event types are silently ignored (pinned)', () => {
    const { handler, calls } = makeRecorder({ activeCallId: 'call-1', isStreaming: true });
    send(handler, { type: 'mystery', callId: 'call-1' } as unknown as EnrichedEvent);
    expect(calls).toEqual([]);
  });

  it('dispatches maxTurnsResume to onMaxTurnsResume', () => {
    const { handler, calls } = makeRecorder({ activeCallId: 'call-1', isStreaming: true });
    send(handler, { type: 'maxTurnsResume', attempt: 2, newMaxTurns: 50, callId: 'call-1' });
    expect(calls[0].args).toEqual([2, 50]);
  });
});
