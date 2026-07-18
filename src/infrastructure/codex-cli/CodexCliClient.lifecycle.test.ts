import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDatabaseService } from '@domain/interfaces';
import type { StreamEvent } from '@domain/types';
import { makeFakeSpawn, type FakeSpawn } from '../../test/fakeProcess';
import { agentDelta, ndjson, streamError, turnCompleted } from '../../test/fixtures/codex-events';
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
let fake: FakeSpawn;
let persistBatch: ReturnType<typeof vi.fn>;
let client: CodexCliClient;
let events: StreamEvent[];

function send(): Promise<void> {
  return client.sendMessage({
    model: 'gpt-5.3-codex',
    systemPrompt: 'sys',
    messages: [{ role: 'user', content: 'go' }],
    maxTokens: 8192,
    conversationId: 'conv-1',
    bookSlug: 'my-book',
    onEvent: (e) => events.push(e),
  });
}

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  booksDir = await makeTempDir();
  await mkdir(path.join(booksDir, 'my-book'), { recursive: true });
  fake = makeFakeSpawn();
  holder.spawn = fake.spawnMock as unknown as (...args: unknown[]) => unknown;
  holder.execFile = vi.fn(async () => ({ stdout: '--add-dir', stderr: '' }));
  persistBatch = vi.fn();
  client = new CodexCliClient(booksDir, { persistStreamEventBatch: persistBatch } as unknown as IDatabaseService);
  events = [];
});

afterEach(async () => {
  await cleanupTempDirs();
  vi.restoreAllMocks();
});

describe('failure lifecycle', () => {
  it('maps spawn ENOENT to the install message without retrying', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    child.fail(Object.assign(new Error('spawn codex ENOENT'), { code: 'ENOENT' }));

    await expect(promise).rejects.toThrow(/Codex CLI not found/);
    expect(fake.children.length).toBe(1); // non-retryable → single attempt
    expect(events.filter((e) => e.type === 'error').length).toBe(1);
  });

  it('nonzero exit rejects with a diagnostic message including stderr and exit code', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    child.pushStderr('sandbox denied');
    child.exit(2);

    await expect(promise).rejects.toThrow(/exitCode=2/);
    await promise.catch((err: Error) => {
      expect(err.message).toContain('stderr=sandbox denied');
      expect(err.message).toContain('Codex CLI exited unsuccessfully.');
    });
    expect(fake.children.length).toBe(1);
  });

  it('a clean exit with no output and no parsed events fails without retry', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    child.exit(0);

    await expect(promise).rejects.toThrow(/exited without assistant output/);
    expect(fake.children.length).toBe(1);
  });

  it('retries an empty run that recorded a stream error, then succeeds', async () => {
    const promise = send();

    // Attempt 1: stream error, nothing produced → retryable
    const first = await fake.waitForChild(0);
    first.pushStdout(ndjson([streamError('connection reset')]));
    first.exit(1);

    // Attempt 2 spawns after ~2s backoff
    const second = await vi.waitFor(
      async () => fake.waitForChild(1),
      { timeout: 5000 }
    );
    second.pushStdout(ndjson([agentDelta('recovered'), turnCompleted({ inputTokens: 1, outputTokens: 2 })]));
    second.exit(0);

    await promise;

    expect(fake.children.length).toBe(2);
    const statuses = events.filter((e) => e.type === 'status').map((e) => e.message);
    expect(statuses.some((m) => m.includes('retrying (1/2)'))).toBe(true);
    expect(events.find((e) => e.type === 'done')).toMatchObject({ inputTokens: 1, outputTokens: 2 });
    expect(events.some((e) => e.type === 'error')).toBe(false);
  }, 15_000);
});

describe('abort + process tracking', () => {
  it('tracks active processes per conversation and book during a run', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    expect(client.hasActiveProcesses()).toBe(true);
    expect(client.hasActiveProcessesForBook('my-book')).toBe(true);
    expect(client.hasActiveProcessesForBook('other')).toBe(false);

    child.pushStdout(ndjson([agentDelta('x'), turnCompleted({ inputTokens: 1, outputTokens: 1 })]));
    child.exit(0);
    await promise;

    expect(client.hasActiveProcesses()).toBe(false);
  });

  it('abortStream SIGTERMs the child and prevents retry after the failed exit', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    client.abortStream('conv-1');
    expect(child.killSignals).toEqual(['SIGTERM']);
    expect(client.hasActiveProcesses()).toBe(false);

    // Even a retryable-looking failure must not respawn after an abort
    child.pushStdout(ndjson([streamError('killed mid-flight')]));
    child.exit(1);

    await expect(promise).rejects.toThrow();
    expect(fake.children.length).toBe(1);
  });
});

describe('bookkeeping', () => {
  it('persists stream events with monotonic sequence numbers, flushing on done', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    child.pushStdout(ndjson([agentDelta('x'), turnCompleted({ inputTokens: 1, outputTokens: 1 })]));
    child.exit(0);
    await promise;

    const persisted = persistBatch.mock.calls.flatMap(
      (c) => c[0] as { eventType: string; sequenceNumber: number }[]
    );
    expect(persisted.some((r) => r.eventType === 'done')).toBe(true);
    expect(persisted.map((r) => r.sequenceNumber)).toEqual(persisted.map((_, i) => i));
  });

  it('isAvailable answers from codex --version and caches until invalidated', async () => {
    holder.execFile = vi.fn(async () => ({ stdout: 'codex 0.29.0', stderr: '' }));
    expect(await client.isAvailable()).toBe(true);

    holder.execFile = vi.fn(async () => {
      throw new Error('gone');
    });
    expect(await client.isAvailable()).toBe(true); // cached

    client.invalidateAvailabilityCache();
    expect(await client.isAvailable()).toBe(false);
  });
});
