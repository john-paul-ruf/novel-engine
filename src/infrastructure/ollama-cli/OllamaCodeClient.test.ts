import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDatabaseService } from '@domain/interfaces';
import type { StreamEvent } from '@domain/types';
import { OllamaCodeClient } from './OllamaCodeClient';
import type { OllamaCliRunner } from './OllamaCliRunner';
import {
  chatResponse,
  contentChunk,
  doneChunk,
  makeOllamaFetchStub,
  thinkingChunk,
  toolCallChunk,
} from '../../test/fixtures/ollama-responses';
import { cleanupTempDirs, makeTempDir } from '../../test/tempDir';

const REMOTE_URL = 'http://ollama.test:11434'; // non-local → skips CLI/serve plumbing

let booksDir: string;
let events: StreamEvent[];

const fakeRunner = {
  detect: async () => false,
  startServe: () => undefined,
  listModels: async () => [],
  showModelContext: async () => undefined,
} as unknown as OllamaCliRunner;

function makeClient(baseUrl: string = REMOTE_URL): OllamaCodeClient {
  return new OllamaCodeClient(
    booksDir,
    { persistStreamEventBatch: vi.fn() } as unknown as IDatabaseService,
    baseUrl,
    fakeRunner
  );
}

function send(client: OllamaCodeClient, overrides: Partial<Parameters<OllamaCodeClient['sendMessage']>[0]> = {}): Promise<void> {
  return client.sendMessage({
    model: 'llama3.2',
    systemPrompt: 'You are Quill.',
    messages: [{ role: 'user', content: 'Research agents.' }],
    maxTokens: 4096,
    conversationId: 'conv-1',
    bookSlug: 'my-book',
    onEvent: (e) => events.push(e),
    ...overrides,
  });
}

function chatBody(call: { init?: RequestInit }): Record<string, unknown> {
  return JSON.parse(String(call.init?.body)) as Record<string, unknown>;
}

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  booksDir = await makeTempDir();
  await mkdir(path.join(booksDir, 'my-book'), { recursive: true });
  events = [];
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await cleanupTempDirs();
  vi.restoreAllMocks();
});

describe('single-turn text responses', () => {
  it('translates thinking + content chunks into stream events and emits done with usage', async () => {
    const { stub } = makeOllamaFetchStub({
      chatQueue: [
        () =>
          chatResponse([
            thinkingChunk('Considering the market.'),
            contentChunk('Here are '),
            contentChunk('the agents.'),
            doneChunk(200, 80),
          ]),
      ],
    });
    vi.stubGlobal('fetch', stub);

    await send(makeClient());

    expect(events.map((e) => e.type)).toEqual([
      'blockStart', // thinking
      'progressStage', // thinking
      'thinkingDelta',
      'blockEnd', // thinking (content arrived)
      'thinkingSummary',
      'blockStart', // text
      'textDelta',
      'textDelta',
      'blockEnd',
      'done',
    ]);

    expect(events.at(-1)).toMatchObject({
      inputTokens: 200,
      outputTokens: 80,
      thinkingTokens: Math.ceil('Considering the market.'.length / 4),
      filesTouched: {},
    });
  });

  it('sends model, streaming flags, tools, and the capped num_ctx in the request body', async () => {
    const { stub, calls } = makeOllamaFetchStub({
      chatQueue: [() => chatResponse([contentChunk('ok'), doneChunk(1, 1)])],
    });
    vi.stubGlobal('fetch', stub);

    await send(makeClient());

    const chatCall = calls.find((c) => c.url.endsWith('/api/chat'));
    const body = chatBody(chatCall!);
    expect(body.model).toBe('llama3.2');
    expect(body.stream).toBe(true);
    expect(body.think).toBe(true); // enabled unless thinkingBudget === 0
    expect((body.tools as unknown[]).length).toBe(6);
    expect((body.options as { num_ctx: number }).num_ctx).toBe(250_000); // MAX_CALL ceiling fallback
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are Quill.' },
      { role: 'user', content: 'Research agents.' },
    ]);
  });

  it('disables thinking when thinkingBudget is exactly 0', async () => {
    const { stub, calls } = makeOllamaFetchStub({
      chatQueue: [() => chatResponse([contentChunk('ok'), doneChunk(1, 1)])],
    });
    vi.stubGlobal('fetch', stub);

    await send(makeClient(), { thinkingBudget: 0 });

    expect(chatBody(calls.find((c) => c.url.endsWith('/api/chat'))!).think).toBe(false);
  });

  it('skips malformed NDJSON lines without failing the stream', async () => {
    const { stub } = makeOllamaFetchStub({
      chatQueue: [() => chatResponse([contentChunk('good'), doneChunk(1, 1)], ['{not json'])],
    });
    vi.stubGlobal('fetch', stub);

    await send(makeClient());

    expect(events.some((e) => e.type === 'error')).toBe(false);
    expect(events.filter((e) => e.type === 'textDelta').map((e) => e.text)).toEqual(['good']);
  });
});

describe('agent loop with tools', () => {
  it('executes a Write tool call, feeds the result back, and finishes on the text turn', async () => {
    const { stub, calls } = makeOllamaFetchStub({
      chatQueue: [
        () =>
          chatResponse([
            toolCallChunk('Write', { file_path: 'source/query-research.md', content: 'Agent list.' }),
            doneChunk(50, 20),
          ]),
        () => chatResponse([contentChunk('Research written.'), doneChunk(60, 10)]),
      ],
    });
    vi.stubGlobal('fetch', stub);

    await send(makeClient());

    // The file was really written by the real ToolExecutor
    const written = await readFile(path.join(booksDir, 'my-book', 'source/query-research.md'), 'utf-8');
    expect(written).toBe('Agent list.');

    // Tool lifecycle events
    const toolEvents = events.filter((e) => e.type === 'toolUse');
    expect(toolEvents[0]).toMatchObject({ tool: { toolName: 'Write', status: 'started', filePath: 'source/query-research.md' } });
    expect(toolEvents[1]).toMatchObject({ tool: { toolName: 'Write', status: 'complete' } });
    expect(events.some((e) => e.type === 'toolDuration')).toBe(true);
    expect(events.find((e) => e.type === 'filesChanged')).toMatchObject({ paths: ['source/query-research.md'] });
    expect(events.find((e) => e.type === 'progressStage' && e.stage === 'drafting')).toBeDefined();

    // Usage accumulates across turns; file touches reported in done
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      inputTokens: 110,
      outputTokens: 30,
      filesTouched: { 'source/query-research.md': 1 },
    });

    // Second request carries the assistant tool_calls message + tool result
    const secondBody = chatBody(calls.filter((c) => c.url.endsWith('/api/chat'))[1]);
    const messages = secondBody.messages as { role: string; content: string }[];
    expect(messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'tool']);
    expect(messages[3].content).toContain('Successfully wrote');
  });

  it('normalizes tool-call arguments that arrive as a JSON string', async () => {
    const { stub } = makeOllamaFetchStub({
      chatQueue: [
        () =>
          chatResponse([
            toolCallChunk('Write', JSON.stringify({ file_path: 'note.md', content: 'from string args' })),
            doneChunk(1, 1),
          ]),
        () => chatResponse([contentChunk('done'), doneChunk(1, 1)]),
      ],
    });
    vi.stubGlobal('fetch', stub);

    await send(makeClient());

    expect(await readFile(path.join(booksDir, 'my-book', 'note.md'), 'utf-8')).toBe('from string args');
  });

  it('a failed tool call surfaces status "error" and keeps the loop alive', async () => {
    const { stub } = makeOllamaFetchStub({
      chatQueue: [
        () => chatResponse([toolCallChunk('Read', { file_path: 'missing.md' }), doneChunk(1, 1)]),
        () => chatResponse([contentChunk('Recovered.'), doneChunk(1, 1)]),
      ],
    });
    vi.stubGlobal('fetch', stub);

    await send(makeClient());

    const completions = events.filter((e) => e.type === 'toolUse' && e.tool.status !== 'started');
    expect(completions[0]).toMatchObject({ tool: { toolName: 'Read', status: 'error' } });
    expect(events.filter((e) => e.type === 'textDelta').map((e) => e.text)).toEqual(['Recovered.']);
    expect(events.at(-1)?.type).toBe('done');
  });

  it('stops after maxTurns even while the model keeps requesting tools', async () => {
    const toolTurn = () =>
      chatResponse([toolCallChunk('LS', { path: '.' }), doneChunk(5, 5)]);
    const { stub, calls } = makeOllamaFetchStub({ chatQueue: [toolTurn, toolTurn, toolTurn] });
    vi.stubGlobal('fetch', stub);

    await send(makeClient(), { maxTurns: 2 });

    expect(calls.filter((c) => c.url.endsWith('/api/chat')).length).toBe(2);
    expect(events.at(-1)).toMatchObject({ type: 'done', inputTokens: 10, outputTokens: 10 });
  });

  it('breaks the loop with a status event when compaction cannot fit the context ceiling', async () => {
    // /api/show reports a tiny 1000-token window → ceiling 980, threshold 800
    const bigFile = path.join(booksDir, 'my-book', 'huge.md');
    await writeFile(bigFile, 'lorem '.repeat(4000), 'utf-8'); // ~24k chars → ~6k tokens

    const { stub, calls } = makeOllamaFetchStub({
      showResponse: () =>
        new Response(JSON.stringify({ model_info: { 'llama.context_length': 1000 } }), { status: 200 }),
      chatQueue: [() => chatResponse([toolCallChunk('Read', { file_path: 'huge.md' }), doneChunk(5, 5)])],
    });
    vi.stubGlobal('fetch', stub);

    await send(makeClient());

    expect(chatBody(calls.find((c) => c.url.endsWith('/api/chat'))!)).toMatchObject({
      options: { num_ctx: 1000 },
    });
    expect(calls.filter((c) => c.url.endsWith('/api/chat')).length).toBe(1); // second turn never sent
    const status = events.find((e) => e.type === 'status');
    expect(status?.message).toContain('Context limit approaching');
    expect(events.at(-1)?.type).toBe('done');
  });
});

describe('failure + lifecycle paths', () => {
  it('HTTP errors from /api/chat become error events and resolve without done', async () => {
    const { stub } = makeOllamaFetchStub({
      chatQueue: [() => new Response('model not found', { status: 404 })],
    });
    vi.stubGlobal('fetch', stub);

    await send(makeClient());

    expect(events.filter((e) => e.type === 'error')).toEqual([
      { type: 'error', message: 'Ollama API error 404: model not found' },
    ]);
    expect(events.some((e) => e.type === 'done')).toBe(false);
  });

  it('maps ECONNREFUSED to the not-reachable message', async () => {
    const { stub } = makeOllamaFetchStub({
      chatQueue: [
        () => {
          throw new Error('connect ECONNREFUSED 127.0.0.1:11434');
        },
      ],
    });
    vi.stubGlobal('fetch', stub);

    await send(makeClient());

    expect(events.at(-1)).toMatchObject({
      type: 'error',
      message: expect.stringContaining('Ollama not reachable'),
    });
  });

  it('rejects before streaming when the local service is down and the CLI is absent', async () => {
    vi.stubGlobal('fetch', (async () => {
      throw new Error('connect ECONNREFUSED');
    }) as typeof fetch);

    const local = makeClient('http://127.0.0.1:11434'); // fakeRunner.detect → false
    await expect(send(local)).rejects.toThrow(/Ollama not reachable/);
    expect(events).toEqual([]);
  });

  it('abortStream closes gracefully with a done event and clears tracking', async () => {
    const client = makeClient();
    const { stub } = makeOllamaFetchStub({
      chatQueue: [
        () =>
          new Promise<Response>((_resolve, reject) => {
            // Simulate an in-flight request cancelled by the AbortController
            setTimeout(() => {
              client.abortStream('conv-1');
              reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));
            }, 20);
          }),
      ],
    });
    vi.stubGlobal('fetch', stub);

    const promise = send(client);
    await promise;

    expect(events.at(-1)).toMatchObject({ type: 'done', inputTokens: 0, outputTokens: 0 });
    expect(client.hasActiveProcesses()).toBe(false);
    expect(client.hasActiveProcessesForBook('my-book')).toBe(false);
  });

  it('normalizes base URLs and invalidates availability on change', () => {
    const client = makeClient();
    expect(client.getBaseUrl()).toBe(REMOTE_URL);

    client.setBaseUrl('remote-host:1234');
    expect(client.getBaseUrl()).toBe('http://remote-host:1234');
  });
});
