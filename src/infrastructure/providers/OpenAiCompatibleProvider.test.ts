import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamEvent } from '@domain/types';
import { OpenAiCompatibleProvider } from './OpenAiCompatibleProvider';
import { rawStreamResponse, sseBody } from '../../test/fixtures/ollama-responses';

type Json = Record<string, unknown>;

function delta(content: string): Json {
  return { choices: [{ delta: { content } }] };
}

let events: StreamEvent[];
let fetchCalls: { url: string; init?: RequestInit }[];

function stubFetch(handler: (url: string) => Response | Promise<Response>): void {
  fetchCalls = [];
  vi.stubGlobal('fetch', (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    fetchCalls.push({ url, init });
    return handler(url);
  }) as typeof fetch);
}

function makeProvider(apiKey = 'sk-test'): OpenAiCompatibleProvider {
  return new OpenAiCompatibleProvider('byok-1', 'https://api.example.com/', apiKey);
}

function send(provider: OpenAiCompatibleProvider): Promise<void> {
  return provider.sendMessage({
    model: 'gpt-x',
    systemPrompt: 'sys',
    messages: [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      { role: 'user', content: 'go' },
    ],
    maxTokens: 2048,
    conversationId: 'conv-1',
    bookSlug: 'book',
    onEvent: (e) => events.push(e),
  });
}

beforeEach(() => {
  events = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('wire format', () => {
  it('trims trailing slashes, maps messages, and streams SSE deltas to events', async () => {
    stubFetch(() => rawStreamResponse([sseBody([delta('One '), delta('two.')])]));

    await send(makeProvider());

    const call = fetchCalls[0];
    expect(call.url).toBe('https://api.example.com/v1/chat/completions'); // no double slash
    const body = JSON.parse(String(call.init?.body)) as Json;
    expect(body).toMatchObject({ model: 'gpt-x', max_tokens: 2048, stream: true });
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      { role: 'user', content: 'go' },
    ]);

    expect(events.map((e) => e.type)).toEqual(['blockStart', 'textDelta', 'textDelta', 'blockEnd', 'done']);
    const done = events.at(-1);
    if (done?.type === 'done') {
      expect(done.outputTokens).toBe(Math.ceil('One two.'.length / 4));
      expect(done.inputTokens).toBe(Math.ceil('syshihellogo'.length / 4));
    }
  });

  it('sends the Authorization header only when an API key is configured', async () => {
    stubFetch(() => rawStreamResponse([sseBody([])]));
    await send(makeProvider('secret-key'));
    expect((fetchCalls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer secret-key');

    stubFetch(() => rawStreamResponse([sseBody([])]));
    await send(makeProvider(''));
    expect((fetchCalls[0].init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('skips unparseable SSE lines and handles [DONE]', async () => {
    stubFetch(() =>
      rawStreamResponse(['data: {broken json\n', sseBody([delta('still fine')])])
    );

    await send(makeProvider());

    expect(events.some((e) => e.type === 'error')).toBe(false);
    expect(events.filter((e) => e.type === 'textDelta').map((e) => e.text)).toEqual(['still fine']);
  });
});

describe('failure + lifecycle', () => {
  it('HTTP errors surface as error events (no done)', async () => {
    stubFetch(() => new Response('invalid key', { status: 401 }));

    await send(makeProvider());

    expect(events).toEqual([{ type: 'error', message: 'API error 401: invalid key' }]);
  });

  it('abort emits blockEnd + done zeros and clears tracking', async () => {
    const provider = makeProvider();
    stubFetch(
      () =>
        new Promise<Response>((_resolve, reject) => {
          setTimeout(() => {
            provider.abortStream('conv-1');
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          }, 20);
        })
    );

    await send(provider);

    expect(events.at(-1)).toMatchObject({ type: 'done', inputTokens: 0, outputTokens: 0 });
    expect(provider.hasActiveProcesses()).toBe(false);
    expect(provider.hasActiveProcessesForBook('book')).toBe(false);
  });

  it('isAvailable GETs /v1/models with auth, caches, and resets on config changes', async () => {
    stubFetch(() => new Response('{}', { status: 200 }));
    const provider = makeProvider();

    expect(await provider.isAvailable()).toBe(true);
    expect(fetchCalls[0].url).toBe('https://api.example.com/v1/models');
    expect(await provider.isAvailable()).toBe(true);
    expect(fetchCalls.length).toBe(1); // cached

    provider.updateApiKey('new-key');
    stubFetch(() => new Response('nope', { status: 500 }));
    expect(await provider.isAvailable()).toBe(false); // cache invalidated by key change

    provider.updateBaseUrl('https://other.example.com/');
    stubFetch(() => new Response('{}', { status: 200 }));
    expect(await provider.isAvailable()).toBe(true);
    expect(fetchCalls[0].url).toBe('https://other.example.com/v1/models'); // trailing slash trimmed
  });
});
