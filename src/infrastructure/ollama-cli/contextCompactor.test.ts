import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compactToolHistory, estimateMessageTokens } from './contextCompactor';

type Msg = { role: string; content?: string | null; tool_calls?: unknown[] };

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('estimateMessageTokens', () => {
  it('counts content chars at 4 chars/token, rounded up', () => {
    expect(estimateMessageTokens([{ role: 'user', content: 'abcd' }])).toBe(1);
    expect(estimateMessageTokens([{ role: 'user', content: 'abcde' }])).toBe(2);
    expect(estimateMessageTokens([{ role: 'user', content: null }])).toBe(0);
  });

  it('includes tool_call arguments, stringifying objects', () => {
    const messages: Msg[] = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { function: { arguments: 'x'.repeat(8) } },
          { function: { arguments: { file_path: 'a.md' } } },
        ],
      },
    ];
    const objectChars = JSON.stringify({ file_path: 'a.md' }).length;
    expect(estimateMessageTokens(messages)).toBe(Math.ceil((8 + objectChars) / 4));
  });
});

describe('compactToolHistory', () => {
  function makeMessages(): Msg[] {
    return [
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'initial task' },
      { role: 'tool', content: 'T'.repeat(5000) },
      { role: 'assistant', content: 'A'.repeat(5000) },
      { role: 'tool', content: 'small' },
      { role: 'tool', content: 'tail-1 '.repeat(10) },
      { role: 'assistant', content: 'tail-2' },
      { role: 'tool', content: 'tail-3' },
      { role: 'user', content: 'tail-4' },
    ];
  }

  it('returns false and leaves messages untouched when under budget', () => {
    const messages = makeMessages();
    const before = JSON.stringify(messages);
    expect(compactToolHistory(messages, 1_000_000)).toBe(false);
    expect(JSON.stringify(messages)).toBe(before);
  });

  it('truncates middle tool results and long assistant messages, preserving head and tail', () => {
    const messages = makeMessages();
    expect(compactToolHistory(messages, 10)).toBe(true);

    // Protected head (system + initial user)
    expect(messages[0].content).toBe('system prompt');
    expect(messages[1].content).toBe('initial task');

    // Middle: big tool result and big assistant message compacted
    expect(messages[2].content).toBe('[content truncated to stay within context budget]');
    expect(messages[3].content).toBe('A'.repeat(500) + '\n\n[...truncated]');
    expect(messages[4].content).toBe('small'); // ≤200 chars — untouched

    // Protected tail (last 4)
    expect(messages.slice(-4).map((m) => m.content)).toEqual([
      'tail-1 '.repeat(10),
      'tail-2',
      'tail-3',
      'tail-4',
    ]);
  });

  it('stops compacting once the budget is met', () => {
    const messages: Msg[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'task' },
      { role: 'tool', content: 'T'.repeat(4000) },
      { role: 'tool', content: 'U'.repeat(4000) },
      { role: 'tool', content: 't1' },
      { role: 'tool', content: 't2' },
      { role: 'tool', content: 't3' },
      { role: 'tool', content: 't4' },
    ];

    // Budget large enough that truncating the FIRST big tool result suffices
    expect(compactToolHistory(messages, 1100)).toBe(true);
    expect(messages[2].content).toBe('[content truncated to stay within context budget]');
    expect(messages[3].content).toBe('U'.repeat(4000)); // untouched — loop exited early
  });

  it('cannot compact when everything is protected (single huge message case)', () => {
    const messages: Msg[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'X'.repeat(1_000_000) },
      { role: 'tool', content: 'a' },
      { role: 'tool', content: 'b' },
      { role: 'tool', content: 'c' },
      { role: 'tool', content: 'd' },
    ];
    // 6 messages = PROTECTED_HEAD + PROTECTED_TAIL → nothing compactable
    expect(compactToolHistory(messages, 10)).toBe(false);
    expect(messages[1].content?.length).toBe(1_000_000);
  });
});
