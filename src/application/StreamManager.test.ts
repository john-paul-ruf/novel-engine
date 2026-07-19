import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamEvent } from '@domain/types';
import { StreamManager } from './StreamManager';
import { makeConversation, makeDb } from '../test/db';
import { makeUsageRecorder } from '../test/fakes';

let db: ReturnType<typeof makeDb>;
let manager: StreamManager;
let usageRecords: ReturnType<typeof makeUsageRecorder>['records'];
let forwarded: StreamEvent[];
let conversationId: string;

function start(options: Parameters<StreamManager['startStream']>[1] = {}) {
  return manager.startStream(
    {
      conversationId,
      agentName: 'Verity',
      model: 'test-model',
      bookSlug: 'test-book',
      sessionId: 'session-1',
      callId: 'call-1',
      onEvent: (e) => forwarded.push(e),
    },
    options
  );
}

const doneEvent = (filesTouched: Record<string, number> = {}): StreamEvent => ({
  type: 'done',
  inputTokens: 10,
  outputTokens: 5,
  thinkingTokens: 2,
  filesTouched,
});

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  db = makeDb();
  const recorder = makeUsageRecorder();
  usageRecords = recorder.records;
  manager = new StreamManager(db, recorder.usage);
  forwarded = [];
  conversationId = makeConversation(db).id;
  db.createStreamSession({
    id: 'session-1',
    conversationId,
    agentName: 'Verity',
    model: 'test-model',
    bookSlug: 'test-book',
    startedAt: '2026-01-01 00:00:00',
    endedAt: null,
    finalStage: 'idle',
    filesTouched: {},
    interrupted: false,
  });
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});

describe('stream lifecycle', () => {
  it('registers the stream, emits callStart, and accumulates deltas', () => {
    const stream = start();

    expect(forwarded[0]).toMatchObject({ type: 'callStart', agentName: 'Verity', bookSlug: 'test-book' });
    expect(manager.getActiveStream()).toMatchObject({ conversationId, progressStage: 'idle' });
    expect(manager.getActiveStreamForBook('test-book')?.sessionId).toBe('session-1');
    expect(manager.getActiveStreamForBook('other-book')).toBeNull();

    stream.onEvent({ type: 'thinkingDelta', text: 'hmm ' });
    stream.onEvent({ type: 'textDelta', text: 'Hello' });
    stream.onEvent({ type: 'textDelta', text: ' world' });
    stream.onEvent({ type: 'progressStage', stage: 'drafting' });

    expect(stream.getResponseBuffer()).toBe('Hello world');
    expect(stream.getThinkingBuffer()).toBe('hmm ');
    expect(manager.getActiveStream()).toMatchObject({
      textBuffer: 'Hello world',
      thinkingBuffer: 'hmm ',
      progressStage: 'drafting',
    });
  });

  it('done saves the assistant message, records usage, ends the session, and clears the stream', () => {
    const stream = start();
    stream.onEvent({ type: 'textDelta', text: 'The reply.' });
    stream.onEvent({ type: 'thinkingDelta', text: 'reasoning' });
    stream.onEvent(doneEvent({ 'a.md': 1 }));

    const messages = db.getMessages(conversationId);
    expect(messages.at(-1)).toMatchObject({ role: 'assistant', content: 'The reply.', thinking: 'reasoning' });

    expect(usageRecords).toEqual([
      { conversationId, inputTokens: 10, outputTokens: 5, thinkingTokens: 2, model: 'test-model' },
    ]);

    expect(db.getActiveStreamSessions()).toEqual([]); // session ended
    expect(manager.getActiveStream()).toBeNull();
    expect(forwarded.at(-1)?.type).toBe('done'); // still forwarded to caller
  });

  it('error ends the session without saving a message and invokes onError with the partial buffer', async () => {
    const onError = vi.fn(async () => undefined);
    const stream = start({ onError });

    stream.onEvent({ type: 'textDelta', text: 'partial out' });
    stream.onEvent({ type: 'error', message: 'boom' });
    await stream.awaitPendingHook();

    expect(onError).toHaveBeenCalledWith('partial out');
    expect(db.getMessages(conversationId).some((m) => m.role === 'assistant')).toBe(false);
    expect(usageRecords).toEqual([]);
    expect(manager.getActiveStream()).toBeNull();
    expect(db.getActiveStreamSessions()).toEqual([]);
  });

  it('awaitPendingHook waits for the async onDone hook (and resolves immediately without one)', async () => {
    let hookFinished = false;
    const stream = start({
      onDone: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        hookFinished = true;
      },
    });

    stream.onEvent(doneEvent());
    expect(hookFinished).toBe(false);
    await stream.awaitPendingHook();
    expect(hookFinished).toBe(true);

    const bare = start();
    await expect(bare.awaitPendingHook()).resolves.toBeUndefined();
  });
});

describe('file tracking', () => {
  it('accumulates deduplicated filesChanged paths and tracks Write/Edit tool durations', () => {
    const stream = start();

    stream.onEvent({ type: 'filesChanged', paths: ['a.md', 'b.md'] });
    stream.onEvent({ type: 'filesChanged', paths: ['b.md', 'c.md'] });
    stream.onEvent({
      type: 'toolDuration',
      tool: { toolName: 'Write', toolId: 't1', filePath: 'a.md', status: 'complete', startedAt: 0, endedAt: 1, durationMs: 1 },
    });
    stream.onEvent({
      type: 'toolDuration',
      tool: { toolName: 'Read', toolId: 't2', filePath: 'x.md', status: 'complete', startedAt: 0, endedAt: 1, durationMs: 1 },
    });

    expect(stream.getChangedFiles()).toEqual(['a.md', 'b.md', 'c.md']);
    expect(manager.getActiveStream()?.filesTouched).toEqual({ 'a.md': 1 }); // Read not counted
  });

  it('trackFilesChanged: false disables accumulation', () => {
    const stream = start({ trackFilesChanged: false });
    stream.onEvent({ type: 'filesChanged', paths: ['a.md'] });
    expect(stream.getChangedFiles()).toEqual([]);
  });
});

describe('cleanup paths', () => {
  it('cleanupAbortedStream returns partial state once and removes the stream', () => {
    const stream = start();
    stream.onEvent({ type: 'textDelta', text: 'partial' });
    stream.onEvent({ type: 'thinkingDelta', text: 'thought' });
    stream.onEvent({ type: 'progressStage', stage: 'drafting' });

    const aborted = manager.cleanupAbortedStream(conversationId);
    expect(aborted).toMatchObject({
      textBuffer: 'partial',
      thinkingBuffer: 'thought',
      sessionId: 'session-1',
      progressStage: 'drafting',
    });

    expect(manager.getActiveStream()).toBeNull();
    expect(manager.cleanupAbortedStream(conversationId)).toBeNull(); // already gone
    expect(manager.cleanupAbortedStream('unknown')).toBeNull();
  });

  it('cleanupErroredStream ends the session and clears the entry', () => {
    start();
    manager.cleanupErroredStream(conversationId, 'session-1');

    expect(manager.getActiveStream()).toBeNull();
    expect(db.getActiveStreamSessions()).toEqual([]);
  });
});
