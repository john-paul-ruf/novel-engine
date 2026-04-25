import * as path from 'path';
import { nanoid } from 'nanoid';

import type { IModelProvider, IDatabaseService } from '@domain/interfaces';
import type { MessageRole, StreamEvent, ProviderCapability, ProviderId } from '@domain/types';
import { CHARS_PER_TOKEN, LLAMA_SERVER_PROVIDER_ID } from '@domain/constants';
import { StreamSessionTracker } from '../claude-cli/StreamSessionTracker';
import { ToolExecutor } from '../ollama-cli/ToolExecutor';
import { OLLAMA_TOOLS, WRITE_TOOLS } from '../ollama-cli/tools';
import type { OllamaToolCall } from '../ollama-cli/tools';
import { Agent as UndiciAgent } from 'undici';

/**
 * Custom undici dispatcher with no body timeout.
 *
 * llama-server inference on large models with long contexts can easily
 * exceed Node.js's default 300-second body timeout. Disabling it lets
 * the model take as long as it needs.
 */
const llamaDispatcher = new UndiciAgent({
  bodyTimeout: 0,
  headersTimeout: 0,
});

const NOT_REACHABLE_MESSAGE =
  'llama-server not reachable. Check the endpoint in Settings \u2192 Providers.';

const REQUEST_FAILED_MESSAGE =
  'llama-server request failed \u2014 the prompt may exceed the model\u2019s context window. ' +
  'Try reducing the manuscript size or increasing n_ctx.';

const TIMEOUT_MESSAGE =
  'llama-server timed out while processing the prompt. The model may still be loading ' +
  'or the context may be too large. Check that llama-server is running and responsive.';

/** How long (ms) to wait with no stream data before warning the user. */
const INACTIVITY_WARNING_MS = 90_000;

/** Default llama-server base URL. */
const DEFAULT_BASE_URL = 'http://127.0.0.1:8080';

/** Maximum tool-use turns before forcing completion. */
const DEFAULT_MAX_TURNS = 30;

/**
 * llama-server provider — uses the OpenAI-compatible HTTP API
 * (`/v1/chat/completions`) with SSE streaming and function-calling tool use.
 *
 * Sends a POST to `/v1/chat/completions` with `stream: true` and `tools: [...]`,
 * then parses the SSE response. When the model returns tool calls, the provider
 * executes them via ToolExecutor and sends the results back in a multi-turn loop.
 *
 * For reasoning models (QwQ, DeepSeek-R1, etc.) that emit `<think>...</think>`
 * tags in their content, the provider automatically parses these into proper
 * thinking block events.
 *
 * Capabilities: text-completion + streaming + tool-use.
 */
export class LlamaServerClient implements IModelProvider {
  readonly providerId: ProviderId = LLAMA_SERVER_PROVIDER_ID;

  readonly capabilities: ProviderCapability[] = [
    'text-completion',
    'streaming',
    'tool-use',
  ];

  private _available: boolean | null = null;
  private activeStreams: Map<string, AbortController> = new Map();
  private streamBookMap: Map<string, string> = new Map();
  private baseUrl: string;

  constructor(
    private booksDir: string,
    private db: IDatabaseService,
    configBaseUrl?: string,
  ) {
    if (configBaseUrl) {
      this.baseUrl = configBaseUrl.startsWith('http') ? configBaseUrl : `http://${configBaseUrl}`;
    } else {
      this.baseUrl = DEFAULT_BASE_URL;
    }
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url.startsWith('http') ? url : `http://${url}`;
    this._available = null;
  }

  async isAvailable(): Promise<boolean> {
    if (this._available !== null) return this._available;
    try {
      // llama-server health check — try /health first, fall back to /v1/models
      let ok = false;
      try {
        const resp = await fetch(`${this.baseUrl}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(5_000),
        });
        ok = resp.ok;
      } catch {
        const resp = await fetch(`${this.baseUrl}/v1/models`, {
          method: 'GET',
          signal: AbortSignal.timeout(5_000),
        });
        ok = resp.ok;
      }
      this._available = ok;
      return ok;
    } catch {
      this._available = false;
      return false;
    }
  }

  invalidateAvailabilityCache(): void {
    this._available = null;
  }

  hasActiveProcesses(): boolean {
    return this.activeStreams.size > 0;
  }

  hasActiveProcessesForBook(bookSlug: string): boolean {
    for (const slug of this.streamBookMap.values()) {
      if (slug === bookSlug) return true;
    }
    return false;
  }

  abortStream(conversationId: string): void {
    const controller = this.activeStreams.get(conversationId);
    if (!controller) return;
    controller.abort();
    this.activeStreams.delete(conversationId);
    this.streamBookMap.delete(conversationId);
  }

  async sendMessage(params: {
    model: string;
    systemPrompt: string;
    messages: { role: MessageRole; content: string }[];
    maxTokens: number;
    thinkingBudget?: number;
    maxTurns?: number;
    bookSlug?: string;
    workingDir?: string;
    sessionId?: string;
    conversationId?: string;
    onEvent: (event: StreamEvent) => void;
  }): Promise<void> {
    const { model, systemPrompt, messages, bookSlug } = params;
    const maxTurns = params.maxTurns ?? DEFAULT_MAX_TURNS;
    const sessionId = params.sessionId || nanoid();
    const conversationId = params.conversationId ?? '';

    const tracker = new StreamSessionTracker(sessionId);
    let doneEmitted = false;
    let persistErrorLogged = false;

    // Batched event persistence (same pattern as OllamaCodeClient)
    const BATCH_FLUSH_INTERVAL_MS = 100;
    const BATCH_MAX_SIZE = 20;
    const CRITICAL_EVENT_TYPES = new Set(['done', 'error', 'callStart', 'filesChanged']);

    type EventRecord = {
      sessionId: string;
      conversationId: string;
      sequenceNumber: number;
      eventType: string;
      payload: string;
      timestamp: string;
    };
    let eventBatch: EventRecord[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flushBatch = () => {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      if (eventBatch.length === 0) return;
      const toFlush = eventBatch;
      eventBatch = [];
      try {
        this.db.persistStreamEventBatch(toFlush);
      } catch (err) {
        if (!persistErrorLogged) {
          console.error(
            `[LlamaServerClient] Stream event batch persistence failed (conversationId=${conversationId}):`,
            err,
          );
          persistErrorLogged = true;
        }
      }
    };

    const wrappedOnEvent = (streamEvent: StreamEvent) => {
      if (streamEvent.type === 'done') doneEmitted = true;

      eventBatch.push({
        sessionId,
        conversationId,
        sequenceNumber: tracker.nextSequence(),
        eventType: streamEvent.type,
        payload: JSON.stringify(streamEvent),
        timestamp: new Date().toISOString(),
      });

      if (CRITICAL_EVENT_TYPES.has(streamEvent.type) || eventBatch.length >= BATCH_MAX_SIZE) {
        flushBatch();
      } else if (!flushTimer) {
        flushTimer = setTimeout(flushBatch, BATCH_FLUSH_INTERVAL_MS);
      }

      params.onEvent(streamEvent);
    };

    // Build OpenAI-format messages
    const apiMessages: OpenAIMessage[] = this.buildChatMessages(systemPrompt, messages);

    // Resolve working directory for tool execution
    const bookDir = bookSlug
      ? path.join(this.booksDir, bookSlug)
      : (params.workingDir ?? this.booksDir);
    const toolExecutor = new ToolExecutor(bookDir);

    const _totalChars = apiMessages.reduce((s, m) => {
      if (typeof m.content === 'string') return s + m.content.length;
      return s;
    }, 0);
    console.log(
      `[LlamaServerClient] Streaming: model=${model}, ` +
      `tools=${OLLAMA_TOOLS.length}, maxTurns=${maxTurns}, msgs=${apiMessages.length}, ` +
      `~${Math.ceil(_totalChars / 3.5).toLocaleString()} est tokens ` +
      `(${_totalChars.toLocaleString()} chars), conversationId=${conversationId}`,
    );

    const controller = new AbortController();
    if (conversationId) {
      this.activeStreams.set(conversationId, controller);
      if (bookSlug) this.streamBookMap.set(conversationId, bookSlug);
    }

    let totalThinkingText = '';
    let totalText = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    try {
      for (let turn = 0; turn < maxTurns; turn++) {
        console.log(`[LlamaServerClient] Turn ${turn + 1}/${maxTurns} starting...`);

        const turnResult = await this.streamOneTurn({
          model,
          apiMessages,
          maxTokens: params.maxTokens,
          controller,
          tracker,
          wrappedOnEvent,
          turn: turn + 1,
        });

        totalThinkingText += turnResult.thinkingText;
        totalText += turnResult.contentText;
        totalInputTokens += turnResult.inputTokens;
        totalOutputTokens += turnResult.outputTokens;

        console.log(
          `[LlamaServerClient] Turn ${turn + 1} done: ` +
          `thinking=${turnResult.thinkingText.length} chars, ` +
          `content=${turnResult.contentText.length} chars, ` +
          `toolCalls=${turnResult.toolCalls.length}, ` +
          `tokens=${turnResult.inputTokens}in/${turnResult.outputTokens}out`,
        );

        if (turnResult.toolCalls.length === 0) {
          console.log(
            `[LlamaServerClient] No tool calls \u2014 agent loop complete after ${turn + 1} turn(s)`,
          );
          break;
        }

        // Add the assistant's tool-call message to the conversation
        const assistantMsg: OpenAIMessage = {
          role: 'assistant',
          content: turnResult.contentText || null,
          tool_calls: turnResult.toolCalls.map(() => ({
            id: `call_${nanoid(8)}`,
            type: 'function' as const,
            function: {
              name: '',
              arguments: '',
            },
          })),
        };

        // Fill in the tool call details
        for (let i = 0; i < turnResult.toolCalls.length; i++) {
          const tc = turnResult.toolCalls[i];
          assistantMsg.tool_calls![i].function.name = tc.function.name;
          assistantMsg.tool_calls![i].function.arguments = JSON.stringify(tc.function.arguments);
        }

        apiMessages.push(assistantMsg);

        // Execute each tool call and add results
        for (let i = 0; i < turnResult.toolCalls.length; i++) {
          const toolCall = turnResult.toolCalls[i];
          const toolCallId = assistantMsg.tool_calls![i].id;
          const toolName = toolCall.function.name;
          const startTime = Date.now();

          const toolId = nanoid(8);
          const rawFilePath = toolCall.function.arguments.file_path
            ?? toolCall.function.arguments.path
            ?? toolCall.function.arguments.file;
          const eventFilePath = typeof rawFilePath === 'string'
            ? rawFilePath
            : typeof rawFilePath === 'object' && rawFilePath !== null
              ? (Object.values(rawFilePath as Record<string, unknown>).find(
                  (v) => typeof v === 'string',
                ) as string | undefined)
              : undefined;

          wrappedOnEvent({
            type: 'toolUse',
            tool: { toolName, toolId, filePath: eventFilePath, status: 'started' },
          });

          if (WRITE_TOOLS.has(toolName)) {
            wrappedOnEvent({ type: 'progressStage', stage: 'drafting' });
          } else {
            wrappedOnEvent({ type: 'progressStage', stage: 'reading' });
          }

          const result = await toolExecutor.execute(toolCall);

          if (result.isWrite && result.filePath) {
            tracker.touchFile(result.filePath);
          }

          const endTime = Date.now();
          wrappedOnEvent({
            type: 'toolUse',
            tool: {
              toolName,
              toolId,
              filePath: result.filePath,
              status: result.isError ? 'error' : 'complete',
            },
          });
          wrappedOnEvent({
            type: 'toolDuration',
            tool: {
              toolName,
              toolId,
              filePath: result.filePath,
              status: 'complete',
              startedAt: startTime,
              endedAt: endTime,
              durationMs: endTime - startTime,
            },
          });

          if (result.isWrite && result.filePath) {
            wrappedOnEvent({ type: 'filesChanged', paths: [result.filePath] });
          }

          // Add tool result in OpenAI format
          apiMessages.push({
            role: 'tool',
            tool_call_id: toolCallId,
            content: result.content,
          });
        }
      }

      // Stream complete
      flushBatch();
      console.log(
        `[LlamaServerClient] Stream complete: ` +
        `totalThinking=${totalThinkingText.length} chars, ` +
        `totalText=${totalText.length} chars, ` +
        `filesTouched=${JSON.stringify(tracker.getFileTouches())}`,
      );

      if (!doneEmitted) {
        const thinkingTokens = Math.ceil(totalThinkingText.length / CHARS_PER_TOKEN);
        wrappedOnEvent({
          type: 'done',
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          thinkingTokens,
          filesTouched: tracker.getFileTouches(),
        });
      }
    } catch (err) {
      console.error(`[LlamaServerClient] Stream error:`, err);
      flushBatch();

      if (err instanceof Error && err.name === 'AbortError') {
        wrappedOnEvent({ type: 'blockEnd', blockType: 'text' });
        if (!doneEmitted) {
          wrappedOnEvent({
            type: 'done',
            inputTokens: 0,
            outputTokens: 0,
            thinkingTokens: 0,
            filesTouched: tracker.getFileTouches(),
          });
        }
      } else {
        const message = err instanceof Error ? err.message : String(err);
        const causeCode = (err as { cause?: { code?: string } })?.cause?.code;
        const isTimeout = causeCode === 'UND_ERR_HEADERS_TIMEOUT'
          || causeCode === 'UND_ERR_BODY_TIMEOUT'
          || message.includes('TimeoutError')
          || message.includes('timed out');

        if (message.includes('ECONNREFUSED')) {
          wrappedOnEvent({ type: 'error', message: NOT_REACHABLE_MESSAGE });
        } else if (isTimeout) {
          wrappedOnEvent({ type: 'error', message: TIMEOUT_MESSAGE });
        } else if (message.includes('fetch failed')) {
          if (this._available === false) {
            wrappedOnEvent({ type: 'error', message: NOT_REACHABLE_MESSAGE });
          } else {
            wrappedOnEvent({ type: 'error', message: REQUEST_FAILED_MESSAGE });
          }
        } else {
          wrappedOnEvent({ type: 'error', message });
        }
      }
    } finally {
      if (conversationId) {
        this.activeStreams.delete(conversationId);
        this.streamBookMap.delete(conversationId);
      }
    }
  }

  /**
   * Stream a single turn using OpenAI-compatible SSE format.
   *
   * Parses `<think>...</think>` tags from content for reasoning models,
   * and handles OpenAI-style tool_calls in the delta.
   */
  private async streamOneTurn(params: {
    model: string;
    apiMessages: OpenAIMessage[];
    maxTokens: number;
    controller: AbortController;
    tracker: StreamSessionTracker;
    wrappedOnEvent: (event: StreamEvent) => void;
    turn: number;
  }): Promise<TurnResult> {
    const { model, apiMessages, maxTokens, controller, tracker, wrappedOnEvent, turn } = params;

    // Convert tool definitions to OpenAI format
    const tools = OLLAMA_TOOLS.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      },
    }));

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        max_tokens: maxTokens,
        stream: true,
        tools,
      }),
      signal: controller.signal,
      // @ts-expect-error -- undici dispatcher is valid for Node.js fetch but not in DOM types
      dispatcher: llamaDispatcher,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`llama-server API error ${response.status}: ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body \u2014 streaming not supported');
    }

    // State tracking
    let inThinkingBlock = false;
    let inTextBlock = false;
    let thinkingText = '';
    let contentText = '';
    let inputTokens = 0;
    let outputTokens = 0;
    const toolCalls: OllamaToolCall[] = [];

    // Tool call accumulation (OpenAI streams tool calls across multiple deltas)
    const toolCallAccumulator: Map<number, { name: string; arguments: string }> = new Map();

    // <think> tag parser state
    let thinkTagBuffer = '';
    let insideThinkTag = false;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Inactivity watchdog
    let inactivityWarned = false;
    let lastDataTime = Date.now();
    const inactivityTimer = setInterval(() => {
      const elapsed = Date.now() - lastDataTime;
      if (elapsed >= INACTIVITY_WARNING_MS && !inactivityWarned) {
        inactivityWarned = true;
        const elapsedSec = Math.round(elapsed / 1000);
        console.warn(
          `[LlamaServerClient] No data received for ${elapsedSec}s on turn ${turn}.`,
        );
        wrappedOnEvent({
          type: 'warning',
          message: `No response from model for ${elapsedSec}s \u2014 it may be processing a large context or stalled. You can wait or abort.`,
        });
      }
    }, 15_000);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        lastDataTime = Date.now();
        inactivityWarned = false;
        buffer += decoder.decode(value, { stream: true });

        // SSE format: lines starting with "data: "
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            // Stream complete — finalize any accumulated tool calls
            this.finalizeToolCalls(toolCallAccumulator, toolCalls);
            continue;
          }

          let parsed: OpenAIChatChunk;
          try {
            parsed = JSON.parse(data) as OpenAIChatChunk;
          } catch {
            continue;
          }

          const choice = parsed.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta;

          // ── Tool calls ──────────────────────────────────────
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              let acc = toolCallAccumulator.get(idx);
              if (!acc) {
                acc = { name: '', arguments: '' };
                toolCallAccumulator.set(idx, acc);
              }
              if (tc.function?.name) acc.name += tc.function.name;
              if (tc.function?.arguments) acc.arguments += tc.function.arguments;
            }
          }

          // ── Content ─────────────────────────────────────────
          const content = delta?.content ?? '';
          if (content) {
            const fragments = this.parseThinkTags(content, insideThinkTag, thinkTagBuffer);
            thinkTagBuffer = fragments.buffer;
            insideThinkTag = fragments.insideThinkTag;

            for (const frag of fragments.output) {
              if (frag.type === 'thinking') {
                if (!inThinkingBlock) {
                  if (inTextBlock) {
                    wrappedOnEvent({ type: 'blockEnd', blockType: 'text' });
                    tracker.setCurrentBlockType(null);
                    inTextBlock = false;
                  }
                  inThinkingBlock = true;
                  tracker.setCurrentBlockType('thinking');
                  wrappedOnEvent({ type: 'blockStart', blockType: 'thinking' });
                  const stageChange = tracker.inferStage('blockStart');
                  if (stageChange) {
                    wrappedOnEvent({ type: 'progressStage', stage: stageChange });
                  }
                }
                thinkingText += frag.text;
                tracker.appendThinkingBuffer(frag.text);
                wrappedOnEvent({ type: 'thinkingDelta', text: frag.text });
              } else {
                if (inThinkingBlock) {
                  wrappedOnEvent({ type: 'blockEnd', blockType: 'thinking' });
                  tracker.setCurrentBlockType(null);
                  inThinkingBlock = false;
                  const summary = tracker.extractThinkingSummary();
                  if (summary) wrappedOnEvent({ type: 'thinkingSummary', summary });
                }

                if (!inTextBlock) {
                  inTextBlock = true;
                  tracker.setCurrentBlockType('text');
                  tracker.markTextEmitted();
                  wrappedOnEvent({ type: 'blockStart', blockType: 'text' });
                }

                contentText += frag.text;
                wrappedOnEvent({ type: 'textDelta', text: frag.text });
              }
            }
          }

          // ── Finish reason ─────────────────────────────────
          if (choice.finish_reason) {
            if (inThinkingBlock) {
              wrappedOnEvent({ type: 'blockEnd', blockType: 'thinking' });
              tracker.setCurrentBlockType(null);
              inThinkingBlock = false;
              const summary = tracker.extractThinkingSummary();
              if (summary) wrappedOnEvent({ type: 'thinkingSummary', summary });
            }
            if (inTextBlock) {
              wrappedOnEvent({ type: 'blockEnd', blockType: 'text' });
              tracker.setCurrentBlockType(null);
              inTextBlock = false;
            }
          }

          // ── Usage info ────────────────────────────────────
          if (parsed.usage) {
            inputTokens = parsed.usage.prompt_tokens ?? 0;
            outputTokens = parsed.usage.completion_tokens ?? 0;
          }
        }
      }
    } finally {
      clearInterval(inactivityTimer);
    }

    // Safety: close any open blocks
    if (inThinkingBlock) {
      wrappedOnEvent({ type: 'blockEnd', blockType: 'thinking' });
      const summary = tracker.extractThinkingSummary();
      if (summary) wrappedOnEvent({ type: 'thinkingSummary', summary });
    }
    if (inTextBlock) {
      wrappedOnEvent({ type: 'blockEnd', blockType: 'text' });
    }

    // Finalize tool calls if [DONE] wasn't received
    if (toolCalls.length === 0 && toolCallAccumulator.size > 0) {
      this.finalizeToolCalls(toolCallAccumulator, toolCalls);
    }

    // Estimate tokens if server didn't provide usage
    if (inputTokens === 0 && outputTokens === 0) {
      const totalChars = apiMessages.reduce((s, m) => {
        if (typeof m.content === 'string') return s + m.content.length;
        return s;
      }, 0);
      inputTokens = Math.ceil(totalChars / CHARS_PER_TOKEN);
      outputTokens = Math.ceil((contentText.length + thinkingText.length) / CHARS_PER_TOKEN);
    }

    return { thinkingText, contentText, inputTokens, outputTokens, toolCalls };
  }

  /**
   * Move accumulated tool call fragments into the final toolCalls array.
   */
  private finalizeToolCalls(
    accumulator: Map<number, { name: string; arguments: string }>,
    toolCalls: OllamaToolCall[],
  ): void {
    for (const [, acc] of accumulator) {
      let parsedArgs: Record<string, unknown>;
      try {
        parsedArgs = JSON.parse(acc.arguments);
      } catch {
        parsedArgs = { value: acc.arguments };
      }
      toolCalls.push({
        function: { name: acc.name, arguments: parsedArgs },
      });
    }
    accumulator.clear();
  }

  /**
   * Parse `<think>...</think>` tags from streaming content.
   *
   * Since tags can span multiple SSE chunks, this uses a stateful parser
   * that tracks whether we're inside a think block and buffers partial tags.
   */
  private parseThinkTags(
    chunk: string,
    insideThinkTag: boolean,
    buffer: string,
  ): {
    output: Array<{ type: 'thinking' | 'text'; text: string }>;
    insideThinkTag: boolean;
    buffer: string;
  } {
    const output: Array<{ type: 'thinking' | 'text'; text: string }> = [];
    let text = buffer + chunk;
    buffer = '';

    while (text.length > 0) {
      if (insideThinkTag) {
        const closeIdx = text.indexOf('</think>');
        if (closeIdx === -1) {
          const partialMatch = this.findPartialTag(text, '</think>');
          if (partialMatch > 0) {
            if (text.length - partialMatch > 0) {
              output.push({ type: 'thinking', text: text.slice(0, text.length - partialMatch) });
            }
            buffer = text.slice(text.length - partialMatch);
            text = '';
          } else {
            output.push({ type: 'thinking', text });
            text = '';
          }
        } else {
          if (closeIdx > 0) {
            output.push({ type: 'thinking', text: text.slice(0, closeIdx) });
          }
          insideThinkTag = false;
          text = text.slice(closeIdx + '</think>'.length);
        }
      } else {
        const openIdx = text.indexOf('<think>');
        if (openIdx === -1) {
          const partialMatch = this.findPartialTag(text, '<think>');
          if (partialMatch > 0) {
            if (text.length - partialMatch > 0) {
              output.push({ type: 'text', text: text.slice(0, text.length - partialMatch) });
            }
            buffer = text.slice(text.length - partialMatch);
            text = '';
          } else {
            output.push({ type: 'text', text });
            text = '';
          }
        } else {
          if (openIdx > 0) {
            output.push({ type: 'text', text: text.slice(0, openIdx) });
          }
          insideThinkTag = true;
          text = text.slice(openIdx + '<think>'.length);
        }
      }
    }

    return { output, insideThinkTag, buffer };
  }

  /**
   * Check if the end of `text` is a partial match for `tag`.
   * Returns the length of the partial match (0 if none).
   */
  private findPartialTag(text: string, tag: string): number {
    for (let len = Math.min(tag.length - 1, text.length); len > 0; len--) {
      if (text.endsWith(tag.slice(0, len))) {
        return len;
      }
    }
    return 0;
  }

  /**
   * Build OpenAI-format messages array.
   */
  private buildChatMessages(
    systemPrompt: string,
    messages: { role: MessageRole; content: string }[],
  ): OpenAIMessage[] {
    const apiMessages: OpenAIMessage[] = [];

    if (systemPrompt) {
      apiMessages.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      apiMessages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      });
    }

    return apiMessages;
  }
}

// ── Types ────────────────────────────────────────────────────────

/** Message format for the OpenAI /v1/chat/completions endpoint. */
type OpenAIMessage = {
  role: string;
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

/** Result of streaming a single agent-loop turn. */
type TurnResult = {
  thinkingText: string;
  contentText: string;
  inputTokens: number;
  outputTokens: number;
  toolCalls: OllamaToolCall[];
};

/** Shape of an SSE chunk from OpenAI-compatible /v1/chat/completions. */
interface OpenAIChatChunk {
  id?: string;
  choices?: Array<{
    index: number;
    delta?: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}
