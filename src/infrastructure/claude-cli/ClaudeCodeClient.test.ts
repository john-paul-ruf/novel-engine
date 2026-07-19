import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDatabaseService } from '@domain/interfaces';
import type { StreamEvent } from '@domain/types';
import { makeFakeSpawn, type FakeSpawn } from '../../test/fakeProcess';
import {
  assistantText,
  assistantThinking,
  assistantToolUse,
  initEvent,
  ndjson,
  resultEvent,
  toolResult,
} from '../../test/fixtures/claude-ndjson';

// ClaudeCodeClient imports spawn/execFile from bare 'child_process' and
// promisifies execFile at module load — both need hoisted mock plumbing.
const holder = vi.hoisted(() => ({
  spawn: undefined as ((...args: unknown[]) => unknown) | undefined,
  execFile: undefined as
    | ((cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>)
    | undefined,
}));

vi.mock('child_process', async () => {
  const { promisify } = await import('node:util');
  const execFile = Object.assign(
    () => undefined,
    { [promisify.custom]: (cmd: string, args: string[]) => holder.execFile?.(cmd, args) }
  );
  return {
    spawn: (...args: unknown[]) => holder.spawn?.(...args),
    execFile,
  };
});

import { ClaudeCodeClient } from './ClaudeCodeClient';

const BOOKS_DIR = '/fake/books';

let fake: FakeSpawn;
let persistBatch: ReturnType<typeof vi.fn>;
let client: ClaudeCodeClient;
let events: StreamEvent[];

function makeClient(): ClaudeCodeClient {
  persistBatch = vi.fn();
  const db = { persistStreamEventBatch: persistBatch } as unknown as IDatabaseService;
  return new ClaudeCodeClient(BOOKS_DIR, db);
}

type SendOverrides = Partial<Parameters<ClaudeCodeClient['sendMessage']>[0]>;

function send(overrides: SendOverrides = {}): Promise<void> {
  return client.sendMessage({
    model: 'claude-opus-4-20250514',
    systemPrompt: 'You are a test agent.',
    messages: [{ role: 'user', content: 'Write chapter one.' }],
    maxTokens: 8192,
    conversationId: 'conv-1',
    bookSlug: 'my-book',
    onEvent: (e) => events.push(e),
    ...overrides,
  });
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  fake = makeFakeSpawn();
  holder.spawn = fake.spawnMock as unknown as (...args: unknown[]) => unknown;
  holder.execFile = undefined;
  client = makeClient();
  events = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sendMessage — happy path', () => {
  it('translates the CLI event stream into StreamEvents and resolves', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    child.pushStdout(
      ndjson([
        initEvent,
        assistantThinking('Let me plan the chapter opening carefully.'),
        assistantText('Here is the chapter.'),
        assistantToolUse('tool-1', 'Write', 'chapters/01-opening/draft.md'),
        toolResult('tool-1', { filePath: 'chapters/01-opening/draft.md' }),
        resultEvent({ result: 'Chapter written.', inputTokens: 100, outputTokens: 50 }),
      ])
    );
    child.exit(0);
    await promise;

    const types = events.map((e) => e.type);
    expect(types).toEqual([
      'blockStart', // thinking
      'progressStage', // thinking
      'thinkingDelta',
      'blockEnd',
      'thinkingSummary',
      'blockStart', // text
      'textDelta',
      'blockEnd',
      'toolUse', // started
      'progressStage', // drafting
      'toolUse', // complete
      'toolDuration',
      'progressStage', // editing (Write to an already-touched path)
      'progressStage', // complete
      'done',
      'filesChanged', // emitted in the close handler, after done
    ]);

    const done = events.find((e) => e.type === 'done');
    expect(done).toMatchObject({
      inputTokens: 100,
      outputTokens: 50,
      thinkingTokens: 0, // thinking buffer reset at blockEnd
      filesTouched: { 'chapters/01-opening/draft.md': 1 },
    });

    const filesChanged = events.find((e) => e.type === 'filesChanged');
    expect(filesChanged).toMatchObject({ paths: ['chapters/01-opening/draft.md'] });

    const summary = events.find((e) => e.type === 'thinkingSummary');
    expect(summary).toMatchObject({
      summary: { text: 'Let me plan the chapter opening carefully.' },
    });
  });

  it('separates multiple assistant text turns with a paragraph break', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    child.pushStdout(ndjson([assistantText('First turn.'), assistantText('Second turn.')]));
    child.exit(0);
    await promise;

    const texts = events.filter((e) => e.type === 'textDelta').map((e) => e.text);
    expect(texts).toEqual(['First turn.', '\n\n', 'Second turn.']);
  });

  it('falls back to the result text when no text deltas were streamed', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    child.pushStdout(ndjson([resultEvent({ result: 'Full result text.', inputTokens: 1, outputTokens: 2 })]));
    child.exit(0);
    await promise;

    const texts = events.filter((e) => e.type === 'textDelta').map((e) => e.text);
    expect(texts).toEqual(['Full result text.']);
  });
});

describe('sendMessage — spawn contract', () => {
  it('assembles CLI args and delivers the prompt via stdin, not argv', async () => {
    const promise = send({
      maxTurns: 12,
      messages: [
        { role: 'user', content: 'First ask' },
        { role: 'assistant', content: 'First answer' },
        { role: 'user', content: 'Second ask' },
      ],
    });
    const child = await fake.waitForChild();

    const { command, args, options } = fake.lastCall();
    expect(command).toBe('claude');
    expect(args).toContain('--print');
    expect(args.join(' ')).toContain('--output-format stream-json');
    expect(args.join(' ')).toContain('--model claude-opus-4-20250514');
    expect(args.join(' ')).toContain('--max-turns 12');
    expect(args).toContain('--system-prompt-file');
    expect(args.join(' ')).toContain(`--add-dir ${BOOKS_DIR}`);
    expect(args).not.toContain('--effort'); // no thinking budget requested
    expect(options.cwd).toBe(path.join(BOOKS_DIR, 'my-book'));

    // Prompt goes through stdin as a Human/Assistant transcript
    expect(child.stdin.written).toBe('Human: First ask\n\nAssistant: First answer\n\nHuman: Second ask');
    expect(child.stdin.writableEnded).toBe(true);
    expect(args.join(' ')).not.toContain('Second ask');

    child.exit(0);
    await promise;
  });

  it('adds --effort high when a thinking budget is set and prefers workingDir over bookSlug', async () => {
    const promise = send({ thinkingBudget: 8000, workingDir: '/explicit/dir' });
    await fake.waitForChild();

    const { args, options } = fake.lastCall();
    expect(args.join(' ')).toContain('--effort high');
    expect(options.cwd).toBe('/explicit/dir');

    fake.lastChild().exit(0);
    await promise;
  });

  it('rejects oversized system prompts before spawning', async () => {
    await send({ systemPrompt: 'x'.repeat(500_001) });

    expect(fake.children.length).toBe(0);
    expect(events).toEqual([
      { type: 'error', message: expect.stringContaining('System prompt exceeds 500KB limit') },
    ]);
  });
});

describe('sendMessage — stream parsing edges', () => {
  it('reassembles a JSON object split across stdout chunks', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    const line = JSON.stringify(assistantText('split across chunks'));
    child.pushStdout(line.slice(0, 20));
    child.pushStdout(line.slice(20) + '\n');
    child.exit(0);
    await promise;

    const texts = events.filter((e) => e.type === 'textDelta').map((e) => e.text);
    expect(texts).toEqual(['split across chunks']);
  });

  it('parses a final line left in the buffer without a trailing newline', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    child.pushStdout(JSON.stringify(resultEvent({ inputTokens: 7, outputTokens: 3 }))); // no \n
    child.exit(0);
    await promise;

    expect(events.find((e) => e.type === 'done')).toMatchObject({ inputTokens: 7, outputTokens: 3 });
  });

  it('skips malformed NDJSON lines without emitting errors', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    child.pushStdout('this is not json\n' + ndjson([assistantText('still works')]));
    child.exit(0);
    await promise;

    expect(events.some((e) => e.type === 'error')).toBe(false);
    expect(events.filter((e) => e.type === 'textDelta').length).toBe(1);
  });

  it('emits a synthetic done when the CLI exits 0 without a result event', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    child.pushStdout(ndjson([assistantText('partial output')]));
    child.exit(0);
    await promise;

    expect(events.find((e) => e.type === 'done')).toMatchObject({
      inputTokens: 0,
      outputTokens: 0,
      filesTouched: {},
    });
  });
});

describe('sendMessage — failure paths', () => {
  it('maps spawn ENOENT to the install-instructions error and rejects', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    child.fail(Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }));

    await expect(promise).rejects.toThrow(/Claude Code CLI not found/);
    expect(events).toContainEqual({
      type: 'error',
      message: expect.stringContaining('Claude Code CLI not found'),
    });
  });

  it('rejects with stderr output on nonzero exit', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    child.pushStderr('boom: invalid flag');
    child.exit(2);

    await expect(promise).rejects.toThrow('boom: invalid flag');
    expect(events).toContainEqual({ type: 'error', message: 'boom: invalid flag' });
  });

  it('an error result (e.g. error_max_turns) emits one rich error and suppresses the generic close error', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    child.pushStdout(
      ndjson([resultEvent({ subtype: 'error_max_turns', isError: true, result: 'Ran out of turns' })])
    );
    child.exit(1);

    await expect(promise).rejects.toThrow();
    const errors = events.filter((e) => e.type === 'error');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('error_max_turns');
    expect(errors[0].message).toContain('Ran out of turns');
    expect(events.some((e) => e.type === 'done')).toBe(false);
  });

  it('a failed tool result never counts as a touched file', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    child.pushStdout(
      ndjson([
        assistantToolUse('t1', 'Write', 'chapters/01/draft.md'),
        toolResult('t1', { filePath: 'chapters/01/draft.md', isError: true }),
        resultEvent({}),
      ])
    );
    child.exit(0);
    await promise;

    const done = events.find((e) => e.type === 'done');
    expect(done).toMatchObject({ filesTouched: {} });
    expect(events.some((e) => e.type === 'filesChanged')).toBe(false);
  });
});

describe('process lifecycle', () => {
  it('tracks active processes per conversation and book', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    expect(client.hasActiveProcesses()).toBe(true);
    expect(client.hasActiveProcessesForBook('my-book')).toBe(true);
    expect(client.hasActiveProcessesForBook('other-book')).toBe(false);

    child.exit(0);
    await promise;

    expect(client.hasActiveProcesses()).toBe(false);
    expect(client.hasActiveProcessesForBook('my-book')).toBe(false);
  });

  it('abortStream sends SIGTERM and is a no-op for unknown conversations', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    client.abortStream('conv-1');
    expect(child.killSignals).toEqual(['SIGTERM']);
    expect(client.hasActiveProcesses()).toBe(false);

    client.abortStream('conv-1'); // second abort: process already removed
    expect(child.killSignals).toEqual(['SIGTERM']);

    child.exit(1);
    await expect(promise).rejects.toThrow();
  });

  it('persists stream events in batches, flushing on done', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    child.pushStdout(ndjson([assistantText('text'), resultEvent({})]));
    child.exit(0);
    await promise;

    expect(persistBatch).toHaveBeenCalled();
    const persisted = persistBatch.mock.calls.flatMap((c) => c[0] as { eventType: string; sessionId: string; sequenceNumber: number }[]);
    expect(persisted.some((r) => r.eventType === 'done')).toBe(true);
    expect(persisted.map((r) => r.sequenceNumber)).toEqual(persisted.map((_, i) => i));
  });
});

describe('isAvailable', () => {
  it('returns true when the CLI answers --version, and caches the result', async () => {
    holder.execFile = vi.fn().mockResolvedValue({ stdout: '2.1.0', stderr: '' });
    expect(await client.isAvailable()).toBe(true);

    holder.execFile = vi.fn().mockRejectedValue(new Error('gone'));
    expect(await client.isAvailable()).toBe(true); // cached

    client.invalidateAvailabilityCache();
    expect(await client.isAvailable()).toBe(false); // re-checked
  });
});
