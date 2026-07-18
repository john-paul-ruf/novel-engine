import { describe, expect, it } from 'vitest';
import { StreamSessionTracker } from './StreamSessionTracker';

function makeTracker(): StreamSessionTracker {
  return new StreamSessionTracker('session-1');
}

describe('file touch tracking', () => {
  it('counts writes per path and classifies first drafts vs revisions', () => {
    const tracker = makeTracker();

    expect(tracker.touchFile('a.md')).toBe(1);
    expect(tracker.touchFile('a.md')).toBe(2);
    expect(tracker.touchFile('b.md')).toBe(1);

    expect(tracker.getFileTouches()).toEqual({ 'a.md': 2, 'b.md': 1 });
    expect(tracker.getFirstDrafts()).toEqual(['b.md']);
    expect(tracker.getRevisedFiles()).toEqual(['a.md']);
  });
});

describe('inferStage state machine', () => {
  it('walks idle → reading → thinking → drafting → editing → complete', () => {
    const tracker = makeTracker();
    expect(tracker.getCurrentStage()).toBe('idle');

    expect(tracker.inferStage('toolUse', 'Read', 'source/pitch.md')).toBe('reading');

    tracker.setCurrentBlockType('thinking');
    expect(tracker.inferStage('blockStart')).toBe('thinking');
    tracker.setCurrentBlockType(null);

    expect(tracker.inferStage('toolUse', 'Write', 'chapters/01/draft.md')).toBe('drafting');

    tracker.touchFile('chapters/01/draft.md');
    expect(tracker.inferStage('toolUse', 'Write', 'chapters/01/draft.md')).toBe('editing');

    expect(tracker.inferStage('result')).toBe('complete');
  });

  it('returns null when the stage does not change', () => {
    const tracker = makeTracker();
    expect(tracker.inferStage('toolUse', 'Read')).toBe('reading');
    expect(tracker.inferStage('toolUse', 'LS')).toBeNull(); // still reading
  });

  it('reading a file the session already wrote means reviewing', () => {
    const tracker = makeTracker();
    tracker.touchFile('chapters/01/draft.md');
    expect(tracker.inferStage('toolUse', 'Read', 'chapters/01/draft.md')).toBe('reviewing');
  });

  it('Read/LS/WebSearch only move to reading from idle or thinking', () => {
    const tracker = makeTracker();
    tracker.inferStage('toolUse', 'Write', 'a.md'); // drafting
    expect(tracker.inferStage('toolUse', 'WebSearch')).toBeNull(); // stays drafting
  });

  it('Edit always means editing', () => {
    const tracker = makeTracker();
    expect(tracker.inferStage('toolUse', 'Edit', 'a.md')).toBe('editing');
  });
});

describe('thinking summary extraction', () => {
  it('returns null for an empty buffer and the full text when short', () => {
    const tracker = makeTracker();
    expect(tracker.extractThinkingSummary()).toBeNull();

    tracker.appendThinkingBuffer('Short thought.');
    expect(tracker.extractThinkingSummary()).toEqual({
      text: 'Short thought.',
      fullLengthChars: 14,
    });
  });

  it('cuts long buffers at the last sentence boundary within 200 chars', () => {
    const tracker = makeTracker();
    const first = 'This is the opening sentence of a very long thought that keeps going.';
    tracker.appendThinkingBuffer(first + ' ' + 'More rambling follows here. '.repeat(20));

    const summary = tracker.extractThinkingSummary();
    expect(summary?.text).toBe(first);
    expect(summary?.fullLengthChars).toBeGreaterThan(200);
  });

  it('truncates at a word boundary with an ellipsis when no sentence boundary exists', () => {
    const tracker = makeTracker();
    tracker.appendThinkingBuffer('word '.repeat(100)); // 500 chars, no punctuation

    const summary = tracker.extractThinkingSummary();
    expect(summary?.text.endsWith('…')).toBe(true);
    expect(summary?.text.length).toBeLessThanOrEqual(201);
  });

  it('resetThinkingBuffer clears accumulated thinking', () => {
    const tracker = makeTracker();
    tracker.appendThinkingBuffer('something');
    tracker.resetThinkingBuffer();
    expect(tracker.getThinkingBuffer()).toBe('');
    expect(tracker.extractThinkingSummary()).toBeNull();
  });
});

describe('tool registration and timing', () => {
  it('registerTool/resolveTool match results to parallel tool calls, one-shot', () => {
    const tracker = makeTracker();
    tracker.registerTool('t1', 'Write', 'a.md');
    tracker.registerTool('t2', 'Read', 'b.md');

    expect(tracker.resolveTool('t2')).toEqual({ toolName: 'Read', filePath: 'b.md' });
    expect(tracker.resolveTool('t2')).toBeUndefined(); // cleared after resolution
    expect(tracker.resolveTool('unknown')).toBeUndefined();

    tracker.registerTool('', 'Ignored'); // empty ids are not registered
    expect(tracker.resolveTool('')).toBeUndefined();
  });

  it('endTool computes a duration from startTool, defaulting to now when unstarted', () => {
    const tracker = makeTracker();
    const started = tracker.startTool('t1');

    const timed = tracker.endTool({ toolName: 'Write', toolId: 't1', status: 'complete' });
    expect(timed.startedAt).toBe(started);
    expect(timed.durationMs).toBeGreaterThanOrEqual(0);

    const untimed = tracker.endTool({ toolName: 'Read', toolId: 'never-started', status: 'complete' });
    expect(untimed.durationMs).toBeGreaterThanOrEqual(0);
    expect(untimed.endedAt).toBeGreaterThanOrEqual(untimed.startedAt);
  });
});

describe('bookkeeping', () => {
  it('nextSequence increments monotonically from 0', () => {
    const tracker = makeTracker();
    expect([tracker.nextSequence(), tracker.nextSequence(), tracker.nextSequence()]).toEqual([0, 1, 2]);
  });

  it('error-result and text-emitted flags latch', () => {
    const tracker = makeTracker();
    expect(tracker.getHasErrorResult()).toBe(false);
    tracker.markErrorResult();
    expect(tracker.getHasErrorResult()).toBe(true);

    expect(tracker.getHasEmittedText()).toBe(false);
    tracker.markTextEmitted();
    expect(tracker.getHasEmittedText()).toBe(true);
  });
});
