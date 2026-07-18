import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDatabaseService } from '@domain/interfaces';
import type { StreamEvent } from '@domain/types';
import { makeFakeSpawn, type FakeSpawn } from '../../test/fakeProcess';
import { agentDelta, ndjson, turnCompleted } from '../../test/fixtures/codex-events';
import { cleanupTempDirs, makeTempDir } from '../../test/tempDir';

const holder = vi.hoisted(() => ({
  spawn: undefined as ((...args: unknown[]) => unknown) | undefined,
  execFile: undefined as ((cmd: string, args: string[], opts?: object) => Promise<{ stdout: string; stderr: string }>) | undefined,
}));

vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util');
  const execFile = Object.assign(
    () => undefined,
    { [promisify.custom]: (cmd: string, args: string[], opts?: object) => holder.execFile?.(cmd, args, opts) }
  );
  return { spawn: (...args: unknown[]) => holder.spawn?.(...args), execFile };
});

import { CodexCliClient } from './CodexCliClient';

let booksDir: string;
let bookDir: string;
let fake: FakeSpawn;
let client: CodexCliClient;
let events: StreamEvent[];

/** execFile fake: --version answers, `exec --help` advertises --add-dir (or not). */
function wireExecFile(helpText: string): void {
  holder.execFile = vi.fn(async (_cmd: string, args: string[]) => {
    if (args[0] === '--version') return { stdout: 'codex 0.29.0', stderr: '' };
    return { stdout: helpText, stderr: '' };
  });
}

function send(overrides: Partial<Parameters<CodexCliClient['sendMessage']>[0]> = {}): Promise<void> {
  return client.sendMessage({
    model: 'gpt-5.3-codex',
    systemPrompt: 'You are Verity.',
    messages: [{ role: 'user', content: 'Draft the scene.' }],
    maxTokens: 8192,
    conversationId: 'conv-1',
    bookSlug: 'my-book',
    onEvent: (e) => events.push(e),
    ...overrides,
  });
}

/** Drive the fake child to a clean success so the send promise resolves. */
async function finishCleanly(promise: Promise<void>): Promise<void> {
  const child = await fake.waitForChild(fake.children.length - 1);
  child.pushStdout(ndjson([agentDelta('ok'), turnCompleted({ inputTokens: 1, outputTokens: 1 })]));
  child.exit(0);
  await promise;
}

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  booksDir = await makeTempDir();
  bookDir = path.join(booksDir, 'my-book');
  await mkdir(bookDir, { recursive: true });
  fake = makeFakeSpawn();
  holder.spawn = fake.spawnMock as unknown as (...args: unknown[]) => unknown;
  wireExecFile('--add-dir <dir>  add a writable directory');
  client = new CodexCliClient(booksDir, { persistStreamEventBatch: vi.fn() } as unknown as IDatabaseService);
  events = [];
});

afterEach(async () => {
  await cleanupTempDirs();
  vi.restoreAllMocks();
});

describe('argv assembly + workspace sandbox planning', () => {
  it('book run on a CLI with --add-dir: cwd is the book, books root added writable', async () => {
    const promise = send();
    await fake.waitForChild();

    const { command, args, options } = fake.lastCall();
    expect(command).toBe('codex');
    expect(args.slice(0, 2)).toEqual(['exec', '--json']);
    expect(args.join(' ')).toContain('--model gpt-5.3-codex');
    expect(args.join(' ')).toContain('--sandbox workspace-write');
    expect(args).toContain('--skip-git-repo-check');
    expect(args.join(' ')).toContain(`--cd ${bookDir}`);
    expect(args.join(' ')).toContain(`--add-dir ${booksDir}`);
    expect(args[args.length - 1]).toBe('-'); // prompt from stdin
    expect(args).toContain('--output-last-message');
    expect(options.cwd).toBe(bookDir);

    await finishCleanly(promise);
  });

  it('book run on an older CLI: falls back to writable_roots config override', async () => {
    wireExecFile('no add dir flag here');

    const promise = send();
    await fake.waitForChild();

    const { args } = fake.lastCall();
    expect(args).not.toContain('--add-dir');
    const configIndex = args.indexOf('-c');
    expect(configIndex).toBeGreaterThan(-1);
    expect(args[configIndex + 1]).toBe(
      `sandbox_workspace_write.writable_roots=[${JSON.stringify(booksDir)}]`
    );

    await finishCleanly(promise);
  });

  it('run without a book targets the books root with no extra writable args', async () => {
    const promise = send({ bookSlug: undefined, conversationId: 'conv-2' });
    await fake.waitForChild();

    const { args, options } = fake.lastCall();
    expect(options.cwd).toBe(booksDir);
    expect(args).not.toContain('--add-dir');
    expect(args).not.toContain('-c');

    await finishCleanly(promise);
  });

  it('an explicit workingDir wins over the bookSlug-derived path', async () => {
    const customDir = path.join(booksDir, 'custom');
    await mkdir(customDir);

    const promise = send({ workingDir: customDir });
    await fake.waitForChild();

    const { args, options } = fake.lastCall();
    expect(options.cwd).toBe(customDir);
    expect(args.join(' ')).toContain(`--cd ${customDir}`);
    expect(args.join(' ')).toContain(`--add-dir ${booksDir}`);

    await finishCleanly(promise);
  });

  it('rejects before spawning when the working directory does not exist', async () => {
    await expect(send({ bookSlug: 'ghost-book' })).rejects.toThrow(/working directory does not exist/);

    expect(fake.children.length).toBe(0);
    expect(events).toContainEqual({
      type: 'error',
      message: expect.stringContaining('does not exist'),
    });
  });

  it('delivers the SYSTEM + CONVERSATION prompt via stdin', async () => {
    const promise = send({
      messages: [
        { role: 'user', content: 'First ask' },
        { role: 'assistant', content: 'Prior answer' },
        { role: 'user', content: 'Second ask' },
      ],
    });
    const child = await fake.waitForChild();

    expect(child.stdin.written).toContain('SYSTEM:\nYou are Verity.');
    expect(child.stdin.written).toContain(
      'CONVERSATION:\nUser: First ask\n\nAssistant: Prior answer\n\nUser: Second ask'
    );
    expect(child.stdin.writableEnded).toBe(true);

    await finishCleanly(promise);
  });
});
