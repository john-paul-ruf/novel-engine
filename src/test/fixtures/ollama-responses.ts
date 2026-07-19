/**
 * Fixtures for the Ollama /api/chat NDJSON streaming protocol that
 * OllamaCodeClient parses, plus a fetch-stub router for its endpoints.
 */
import type { OllamaToolCall } from '@infra/ollama-cli/tools';

type Json = Record<string, unknown>;

export function thinkingChunk(thinking: string): Json {
  return { message: { role: 'assistant', thinking }, done: false };
}

export function contentChunk(content: string): Json {
  return { message: { role: 'assistant', content }, done: false };
}

export function toolCallChunk(name: string, args: Record<string, unknown> | string): Json {
  const call: OllamaToolCall = { function: { name, arguments: args as Record<string, unknown> } };
  return { message: { role: 'assistant', content: '', tool_calls: [call] }, done: false };
}

export function doneChunk(promptTokens: number, evalTokens: number): Json {
  return { message: { role: 'assistant', content: '' }, done: true, prompt_eval_count: promptTokens, eval_count: evalTokens };
}

/** Build a streaming Response whose body is one NDJSON line per chunk. */
export function chatResponse(chunks: Json[], extraRawLines: string[] = []): Response {
  const encoder = new TextEncoder();
  const lines = [...chunks.map((c) => JSON.stringify(c)), ...extraRawLines];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line + '\n'));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

/**
 * Build a streaming Response from raw string chunks — each chunk is one
 * reader.read() result, so callers control exactly where splits happen
 * (e.g. mid-SSE-line, mid-<think>-tag).
 */
export function rawStreamResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status });
}

/** Serialize events to OpenAI-style SSE (`data: {json}` lines + [DONE]). */
export function sseBody(events: Json[], includeDone = true): string {
  const lines = events.map((e) => `data: ${JSON.stringify(e)}\n`);
  if (includeDone) lines.push('data: [DONE]\n');
  return lines.join('');
}

export type FetchCall = { url: string; init?: RequestInit };

/**
 * Build a fetch stub routing OllamaCodeClient's endpoints:
 * /api/tags → 200, /api/show → `showResponse`, /api/chat → shift from `chatQueue`.
 * Install it with `vi.stubGlobal('fetch', stub)`; assert against `calls`.
 */
export function makeOllamaFetchStub(opts: {
  chatQueue: (() => Response | Promise<Response>)[];
  showResponse?: () => Response;
}): { stub: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];

  const stub = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    calls.push({ url, init });

    if (url.endsWith('/api/tags')) return new Response('{}', { status: 200 });
    if (url.endsWith('/api/show')) {
      return opts.showResponse ? opts.showResponse() : new Response('not found', { status: 404 });
    }
    if (url.endsWith('/api/chat')) {
      const next = opts.chatQueue.shift();
      if (!next) throw new Error('fetch stub: no more scripted /api/chat responses');
      return next();
    }
    throw new Error(`fetch stub: unexpected URL ${url}`);
  }) as typeof fetch;

  return { stub, calls };
}
