/**
 * Event-parsing coverage checklist (processOutputLine + extractors):
 *   agent_message_delta ✓  agent_message (fresh + after-deltas skip) ✓
 *   token_count (pending usage) ✓  turn.completed (terminal usage) ✓
 *   task_complete (terminal, pending usage) ✓  stream_error → status ✓
 *   error → withheld until attempt settles ✓  item.completed/file_change ✓
 *   item.completed/tool_call (web_search) ✓  unknown typed → status ✓
 *   config echo (no type) → silent ✓  non-JSON line → silent diagnostics ✓
 *   --output-last-message fallback ✓  workspace snapshot diff fallback ✓
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDatabaseService } from '@domain/interfaces';
import type { StreamEvent } from '@domain/types';
import { makeFakeSpawn, type FakeSpawn } from '../../test/fakeProcess';
import {
  agentDelta,
  agentMessage,
  configEcho,
  fileChangeCompleted,
  ndjson,
  streamError,
  taskComplete,
  terminalError,
  tokenCount,
  turnCompleted,
  unknownTyped,
  webSearchCompleted,
} from '../../test/fixtures/codex-events';
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
  bookDir = path.join(booksDir, 'my-book');
  await mkdir(bookDir, { recursive: true });
  fake = makeFakeSpawn();
  holder.spawn = fake.spawnMock as unknown as (...args: unknown[]) => unknown;
  holder.execFile = vi.fn(async () => ({ stdout: '--add-dir', stderr: '' }));
  client = new CodexCliClient(booksDir, { persistStreamEventBatch: vi.fn() } as unknown as IDatabaseService);
  events = [];
});

afterEach(async () => {
  await cleanupTempDirs();
  vi.restoreAllMocks();
});

describe('text + usage events', () => {
  it('streams deltas in one text block, skips the echoing agent_message, and ends via turn.completed', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    child.pushStdout(
      ndjson([
        agentDelta('Hello '),
        agentDelta('world.'),
        agentMessage('Hello world.'), // full echo after deltas — must be skipped
        turnCompleted({ inputTokens: 120, outputTokens: 40, reasoningTokens: 8 }),
      ])
    );
    child.exit(0);
    await promise;

    const texts = events.filter((e) => e.type === 'textDelta').map((e) => e.text);
    expect(texts).toEqual(['Hello ', 'world.']);
    expect(events.filter((e) => e.type === 'blockStart').length).toBe(1);

    expect(events.find((e) => e.type === 'done')).toMatchObject({
      inputTokens: 120,
      outputTokens: 40,
      thinkingTokens: 8,
    });
    expect(events.find((e) => e.type === 'progressStage' && e.stage === 'complete')).toBeDefined();
  });

  it('emits a fresh agent_message when no deltas preceded it', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    child.pushStdout(ndjson([agentMessage('Direct message.'), turnCompleted({ inputTokens: 1, outputTokens: 1 })]));
    child.exit(0);
    await promise;

    expect(events.filter((e) => e.type === 'textDelta').map((e) => e.text)).toEqual(['Direct message.']);
  });

  it('task_complete finishes the turn using the pending token_count usage', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    child.pushStdout(ndjson([agentDelta('x'), tokenCount(77, 33), taskComplete()]));
    child.exit(0);
    await promise;

    expect(events.find((e) => e.type === 'done')).toMatchObject({ inputTokens: 77, outputTokens: 33 });
  });

  it('reassembles JSON split across stdout chunks', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    const line = JSON.stringify(agentDelta('split text'));
    child.pushStdout(line.slice(0, 15));
    child.pushStdout(line.slice(15) + '\n' + JSON.stringify(turnCompleted({ inputTokens: 1, outputTokens: 1 })) + '\n');
    child.exit(0);
    await promise;

    expect(events.filter((e) => e.type === 'textDelta').map((e) => e.text)).toEqual(['split text']);
  });
});

describe('tool + file-change events', () => {
  it('maps completed file_change items to Write/Edit tools and touches the file', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    child.pushStdout(
      ndjson([
        fileChangeCompleted(path.join(bookDir, 'chapters/01/draft.md'), 'add'),
        agentDelta('done'),
        turnCompleted({ inputTokens: 1, outputTokens: 1 }),
      ])
    );
    child.exit(0);
    await promise;

    const toolUse = events.find((e) => e.type === 'toolUse');
    expect(toolUse).toMatchObject({
      tool: { toolName: 'Write', filePath: 'chapters/01/draft.md', status: 'complete' },
    });
    expect(events.some((e) => e.type === 'toolDuration')).toBe(true);
    expect(events.find((e) => e.type === 'progressStage' && e.stage === 'drafting')).toBeDefined();
    expect(events.find((e) => e.type === 'done')).toMatchObject({
      filesTouched: { 'chapters/01/draft.md': 1 },
    });
    expect(events.find((e) => e.type === 'filesChanged')).toMatchObject({
      paths: ['chapters/01/draft.md'],
    });
  });

  it('update-kind changes map to Edit', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    child.pushStdout(
      ndjson([
        fileChangeCompleted(path.join(bookDir, 'source/pitch.md'), 'update'),
        agentDelta('x'),
        turnCompleted({ inputTokens: 1, outputTokens: 1 }),
      ])
    );
    child.exit(0);
    await promise;

    expect(events.find((e) => e.type === 'toolUse')).toMatchObject({ tool: { toolName: 'Edit' } });
  });

  it('maps web_search tool calls with the query as the display path', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    child.pushStdout(
      ndjson([webSearchCompleted('comparable fantasy titles'), agentDelta('x'), turnCompleted({ inputTokens: 1, outputTokens: 1 })])
    );
    child.exit(0);
    await promise;

    expect(events.find((e) => e.type === 'toolUse')).toMatchObject({
      tool: { toolName: 'WebSearch', filePath: 'comparable fantasy titles' },
    });
  });
});

describe('status, unknown, and noise handling', () => {
  it('stream_error becomes a status event, unknown typed events surface as status, config echo is silent', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    child.pushStdout(
      ndjson([
        streamError('rate limited'),
        unknownTyped('exotic_new_event'),
        configEcho,
        agentDelta('recovered'),
        turnCompleted({ inputTokens: 1, outputTokens: 1 }),
      ])
    );
    child.pushStdout('plain progress text, not json\n');
    child.exit(0);
    await promise;

    const statuses = events.filter((e) => e.type === 'status').map((e) => e.message);
    expect(statuses).toContain('Model stream error (Codex retrying): rate limited');
    expect(statuses).toContain('exotic_new_event');
    // config echo and non-JSON stdout produce no events
    expect(statuses.length).toBe(2);
    expect(events.some((e) => e.type === 'error')).toBe(false);
  });

  it('a terminal error event is withheld mid-attempt and reported once at the end', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    child.pushStdout(
      ndjson([
        agentDelta('some output'), // non-empty output → failure is not retryable
        terminalError('model refused'),
      ])
    );
    child.exit(0);

    await expect(promise).rejects.toThrow(/Codex CLI reported an error: model refused/);
    const errors = events.filter((e) => e.type === 'error');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('model refused');
  });
});

describe('output fallbacks on clean exit', () => {
  it('reads --output-last-message when nothing streamed', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    const { args } = fake.lastCall();
    const lastMessagePath = args[args.indexOf('--output-last-message') + 1];
    await writeFile(lastMessagePath, 'Fallback final message.', 'utf-8');

    child.pushStdout(ndjson([unknownTyped('noise')])); // ≥1 parsed event, no text
    child.exit(0);
    await promise;

    expect(events.filter((e) => e.type === 'textDelta').map((e) => e.text)).toEqual([
      'Fallback final message.',
    ]);
    expect(events.find((e) => e.type === 'done')).toBeDefined();
  });

  it('detects silently-written files via the workspace snapshot diff', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    // Codex wrote a file without emitting a file_change event
    await writeFile(path.join(bookDir, 'new-scene.md'), 'surprise prose', 'utf-8');

    child.pushStdout(ndjson([agentDelta('narrated'), turnCompleted({ inputTokens: 1, outputTokens: 1 })]));
    child.exit(0);
    await promise;

    expect(events.find((e) => e.type === 'filesChanged')).toMatchObject({ paths: ['new-scene.md'] });
  });

  it('synthesizes a file summary + done when files changed but nothing streamed', async () => {
    const promise = send();
    const child = await fake.waitForChild();

    await writeFile(path.join(bookDir, 'quiet-edit.md'), 'content', 'utf-8');

    child.pushStdout(ndjson([unknownTyped('noise')]));
    child.exit(0);
    await promise;

    const text = events.filter((e) => e.type === 'textDelta').map((e) => e.text).join('');
    expect(text).toContain('Codex completed and updated files:');
    expect(text).toContain('- quiet-edit.md');
    expect(events.find((e) => e.type === 'done')).toMatchObject({
      filesTouched: { 'quiet-edit.md': 1 },
    });
  });
});
