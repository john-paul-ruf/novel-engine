import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDatabaseService } from '@domain/interfaces';
import type { StreamEvent } from '@domain/types';
import { LlamaServerClient } from './LlamaServerClient';
import { rawStreamResponse, sseBody } from '../../test/fixtures/ollama-responses';
import { cleanupTempDirs, makeTempDir } from '../../test/tempDir';

const BASE_URL = 'http://llama.test:8080';

type Json = Record<string, unknown>;

function contentDelta(content: string): Json {
  return { choices: [{ index: 0, delta: { content } }] };
}

function toolCallDelta(index: number, name: string | undefined, argsFragment: string): Json {
  return {
    choices: [
      { index: 0, delta: { tool_calls: [{ index, ...(name ? { function: { name, arguments: argsFragment } } : { function: { arguments: argsFragment } }) }] } },
    ],
  };
}

function finishChunk(usage?: { prompt: number; completion: number }): Json {
  return {
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    ...(usage ? { usage: { prompt_tokens: usage.prompt, completion_tokens: usage.completion } } : {}),
  };
}

let booksDir: string;
let events: StreamEvent[];
let client: LlamaServerClient;
let fetchCalls: { url: string; init?: RequestInit }[];

function stubFetch(chatQueue: (() => Response | Promise<Response>)[]): void {
  fetchCalls = [];
  vi.stubGlobal('fetch', (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    fetchCalls.push({ url, init });
    if (url.endsWith('/v1/chat/completions')) {
      const next = chatQueue.shift();
      if (!next) throw new Error('no scripted chat response left');
      return next();
    }
    throw new Error(`unexpected URL ${url}`);
  }) as typeof fetch);
}

function send(overrides: Partial<Parameters<LlamaServerClient['sendMessage']>[0]> = {}): Promise<void> {
  return client.sendMessage({
    model: 'qwen2.5-32b',
    systemPrompt: 'You are Verity.',
    messages: [{ role: 'user', content: 'Write the scene.' }],
    maxTokens: 4096,
    conversationId: 'conv-1',
    bookSlug: 'my-book',
    onEvent: (e) => events.push(e),
    ...overrides,
  });
}

function chatBody(index = 0): Record<string, unknown> {
  const call = fetchCalls.filter((c) => c.url.endsWith('/v1/chat/completions'))[index];
  return JSON.parse(String(call.init?.body)) as Record<string, unknown>;
}

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  booksDir = await makeTempDir();
  await mkdir(path.join(booksDir, 'my-book'), { recursive: true });
  client = new LlamaServerClient(booksDir, { persistStreamEventBatch: vi.fn() } as unknown as IDatabaseService, BASE_URL);
  events = [];
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await cleanupTempDirs();
  vi.restoreAllMocks();
});

describe('single-turn streaming', () => {
  it('parses SSE content deltas and reports server-provided usage', async () => {
    stubFetch([
      () => rawStreamResponse([sseBody([contentDelta('Hello '), contentDelta('world.'), finishChunk({ prompt: 150, completion: 42 })])]),
    ]);

    await send();

    expect(events.map((e) => e.type)).toEqual(['blockStart', 'textDelta', 'textDelta', 'blockEnd', 'done']);
    expect(events.at(-1)).toMatchObject({ inputTokens: 150, outputTokens: 42, filesTouched: {} });

    const body = chatBody();
    expect(body.model).toBe('qwen2.5-32b');
    expect(body.stream).toBe(true);
    expect(body.max_tokens).toBe(4096);
    expect((body.tools as unknown[]).length).toBe(6);
    expect((body.messages as Json[])[0]).toEqual({ role: 'system', content: 'You are Verity.' });
  });

  it('estimates tokens when the server sends no usage', async () => {
    stubFetch([() => rawStreamResponse([sseBody([contentDelta('word '.repeat(80)), finishChunk()])])]);

    await send();

    const done = events.at(-1);
    expect(done?.type).toBe('done');
    if (done?.type === 'done') {
      expect(done.outputTokens).toBe(100); // 400 chars / 4
      expect(done.inputTokens).toBeGreaterThan(0);
    }
  });

  it('translates <think> tags into thinking blocks even when split across chunks', async () => {
    const full = sseBody([
      contentDelta('<thi'),
      contentDelta('nk>plan the scene</th'),
      contentDelta('ink>The scene begins.'),
      finishChunk(),
    ]);
    stubFetch([() => rawStreamResponse([full])]);

    await send();

    const types = events.map((e) => e.type);
    expect(types).toEqual([
      'blockStart', // thinking
      'progressStage',
      'thinkingDelta', // partial-tag buffering coalesces the fragments
      'blockEnd',
      'thinkingSummary',
      'blockStart', // text
      'textDelta',
      'blockEnd',
      'done',
    ]);
    const thinking = events.filter((e) => e.type === 'thinkingDelta').map((e) => e.text).join('');
    expect(thinking).toBe('plan the scene');
    expect(events.filter((e) => e.type === 'textDelta').map((e) => e.text).join('')).toBe('The scene begins.');
  });

  it('reassembles SSE lines split across network chunks', async () => {
    const line = `data: ${JSON.stringify(contentDelta('split payload'))}\n`;
    stubFetch([
      () => rawStreamResponse([line.slice(0, 18), line.slice(18), sseBody([finishChunk()])]),
    ]);

    await send();

    expect(events.filter((e) => e.type === 'textDelta').map((e) => e.text)).toEqual(['split payload']);
  });
});

describe('tool-call loop', () => {
  it('accumulates streamed tool-call fragments, executes them, and threads OpenAI-format results', async () => {
    const args = JSON.stringify({ file_path: 'source/scene.md', content: 'Scene prose.' });
    stubFetch([
      () =>
        rawStreamResponse([
          sseBody([
            toolCallDelta(0, 'Write', args.slice(0, 20)),
            toolCallDelta(0, undefined, args.slice(20)),
            finishChunk(),
          ]),
        ]),
      () => rawStreamResponse([sseBody([contentDelta('Scene written.'), finishChunk({ prompt: 10, completion: 5 })])]),
    ]);

    await send();

    // Real file written through ToolExecutor
    expect(await readFile(path.join(booksDir, 'my-book', 'source/scene.md'), 'utf-8')).toBe('Scene prose.');

    expect(events.find((e) => e.type === 'filesChanged')).toMatchObject({ paths: ['source/scene.md'] });
    expect(events.at(-1)).toMatchObject({ type: 'done', filesTouched: { 'source/scene.md': 1 }, isMaxTurns: false });

    // Second request: assistant tool_calls entry with stringified args + tool result with matching id
    const second = chatBody(1);
    const messages = second.messages as { role: string; content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[]; tool_call_id?: string }[];
    const assistant = messages.find((m) => m.role === 'assistant' && m.tool_calls);
    expect(assistant?.tool_calls?.[0].function.name).toBe('Write');
    expect(JSON.parse(assistant?.tool_calls?.[0].function.arguments ?? '{}')).toMatchObject({ file_path: 'source/scene.md' });
    const toolMsg = messages.find((m) => m.role === 'tool');
    expect(toolMsg?.tool_call_id).toBe(assistant?.tool_calls?.[0].id);
    expect(toolMsg?.content).toContain('Successfully wrote');
  });

  it('a failed tool keeps the loop alive and surfaces status error', async () => {
    stubFetch([
      () =>
        rawStreamResponse([
          sseBody([toolCallDelta(0, 'Read', JSON.stringify({ file_path: 'missing.md' })), finishChunk()]),
        ]),
      () => rawStreamResponse([sseBody([contentDelta('Recovered.'), finishChunk()])]),
    ]);

    await send();

    const completions = events.filter((e) => e.type === 'toolUse' && e.tool.status !== 'started');
    expect(completions[0]).toMatchObject({ tool: { toolName: 'Read', status: 'error' } });
    expect(events.at(-1)?.type).toBe('done');
  });

  it('stops at maxTurns while tools keep coming', async () => {
    const toolTurn = () =>
      rawStreamResponse([sseBody([toolCallDelta(0, 'LS', JSON.stringify({ path: '.' })), finishChunk()])]);
    stubFetch([toolTurn, toolTurn, toolTurn]);

    await send({ maxTurns: 2 });

    expect(fetchCalls.filter((c) => c.url.endsWith('/v1/chat/completions')).length).toBe(2);
    expect(events.at(-1)).toMatchObject({ type: 'done', isMaxTurns: true });
  });
});

describe('failures + lifecycle', () => {
  it('HTTP errors become error events and the call resolves', async () => {
    stubFetch([() => new Response('overloaded', { status: 500 })]);

    await send();

    expect(events.at(-1)).toEqual({
      type: 'error',
      message: 'llama-server API error 500: overloaded',
    });
  });

  it('maps ECONNREFUSED to the not-reachable message', async () => {
    stubFetch([
      () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:8080');
      },
    ]);

    await send();

    expect(events.at(-1)).toMatchObject({
      type: 'error',
      message: expect.stringContaining('llama-server not reachable'),
    });
  });

  it('abort resolves gracefully with done and clears tracking', async () => {
    stubFetch([
      () =>
        new Promise<Response>((_resolve, reject) => {
          setTimeout(() => {
            client.abortStream('conv-1');
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          }, 20);
        }),
    ]);

    await send();

    expect(events.at(-1)).toMatchObject({ type: 'done', inputTokens: 0, outputTokens: 0 });
    expect(client.hasActiveProcesses()).toBe(false);
  });
});

describe('availability + base URL', () => {
  it('isAvailable prefers /health, falls back to /v1/models, and caches', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', (async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith('/health')) throw new Error('no health endpoint');
      if (url.endsWith('/v1/models')) return new Response('{}', { status: 200 });
      throw new Error('unexpected');
    }) as typeof fetch);

    expect(await client.isAvailable()).toBe(true);
    expect(urls).toEqual([`${BASE_URL}/health`, `${BASE_URL}/v1/models`]);

    expect(await client.isAvailable()).toBe(true); // cached — no new calls
    expect(urls.length).toBe(2);

    client.invalidateAvailabilityCache();
    vi.stubGlobal('fetch', (async () => {
      throw new Error('down');
    }) as typeof fetch);
    expect(await client.isAvailable()).toBe(false);
  });

  it('normalizes base URLs', () => {
    expect(client.getBaseUrl()).toBe(BASE_URL);
    client.setBaseUrl('bare-host:8081');
    expect(client.getBaseUrl()).toBe('http://bare-host:8081');
  });
});
