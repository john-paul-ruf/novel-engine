import * as path from 'path';
import { nanoid } from 'nanoid';

import type { IModelProvider, IDatabaseService } from '@domain/interfaces';
import type { MessageRole, StreamEvent, ProviderCapability, ProviderId } from '@domain/types';
import { CHARS_PER_TOKEN, MAX_CALL_CONTEXT_TOKENS, OLLAMA_CLI_PROVIDER_ID } from '@domain/constants';
import { StreamSessionTracker } from '../claude-cli/StreamSessionTracker';
import { ToolExecutor } from './ToolExecutor';
import { OLLAMA_TOOLS, WRITE_TOOLS } from './tools';
import type { OllamaToolCall } from './tools';
import { Agent as UndiciAgent } from 'undici';

/**
 * Custom undici dispatcher with no body timeout.
 *
 * Node.js's built-in fetch (undici) has a 300-second body timeout by default.
 * Ollama inference on large models (36B+) with 100K+ token contexts can easily
 * exceed this — especially on the final turn when the model generates a long
 * report after reading the full manuscript. Disabling the body timeout lets
 * the model take as long as it needs.
 */
const ollamaDispatcher = new UndiciAgent({
  bodyTimeout: 0,         // no body timeout — model can take as long as needed
  headersTimeout: 0,      // no headers timeout — prompt processing time is unpredictable
                          // (depends on model size, context length, GPU load, and whether
                          // the model needs to be loaded from disk into VRAM first)
});

const OLLAMA_NOT_FOUND_MESSAGE =
  'Ollama not reachable. Check the endpoint in Settings → Providers.';

const OLLAMA_REQUEST_FAILED_MESSAGE =
  'Ollama request failed — the prompt may exceed the model\'s context window. ' +
  'Try a model with a larger context, or reduce the manuscript size.';

const OLLAMA_TIMEOUT_MESSAGE =
  'Ollama timed out while processing the prompt. The model may still be loading, ' +
  'or the context may be too large for the available hardware. Check that Ollama is ' +
  'running and the model is responsive.';

/** How long (ms) to wait with no stream data before warning the user. */
const INACTIVITY_WARNING_MS = 90_000; // 90 seconds

/** Default Ollama API base URL. Can be overridden via OLLAMA_HOST env var. */
const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';

/** Maximum tool-use turns before forcing completion. */
const DEFAULT_MAX_TURNS = 30;

/**
 * Ollama provider — uses the Ollama HTTP API (`/api/chat`) with streaming,
 * thinking support, and function-calling tool use.
 *
 * Sends a POST to `/api/chat` with `stream: true`, `think: true`, and
 * `tools: [...]`, then parses the NDJSON response. When the model returns
 * tool calls instead of text, the provider executes them via ToolExecutor
 * and sends the results back in a multi-turn loop (up to maxTurns).
 *
 * This gives Ollama models the same agent-loop capability as Claude CLI —
 * they can read, write, edit, and list files within the book directory.
 *
 * Capabilities: text-completion + streaming + tool-use.
 */
export class OllamaCodeClient implements IModelProvider {
  readonly providerId: ProviderId = OLLAMA_CLI_PROVIDER_ID;

  readonly capabilities: ProviderCapability[] = [
    'text-completion',
    'streaming',
    'tool-use',
  ];

  /** Cached availability result — Ollama presence doesn't change during a session. */
  private _available: boolean | null = null;

  /** Active abort controllers keyed by conversationId for abort support. */
  private activeStreams: Map<string, AbortController> = new Map();

  /** Maps conversationId → bookSlug for scoped idle checks. */
  private streamBookMap: Map<string, string> = new Map();

  /** Ollama API base URL (derived from config, OLLAMA_HOST, or default). */
  private baseUrl: string;

  /** Cached model context window sizes (from /api/show). */
  private contextWindowCache: Map<string, number> = new Map();

  constructor(
    private booksDir: string,
    private db: IDatabaseService,
    configBaseUrl?: string,
  ) {
    // Priority: explicit config > OLLAMA_HOST env var > default localhost
    const envHost = process.env.OLLAMA_HOST;
    if (configBaseUrl) {
      this.baseUrl = configBaseUrl.startsWith('http') ? configBaseUrl : `http://${configBaseUrl}`;
    } else if (envHost) {
      this.baseUrl = envHost.startsWith('http') ? envHost : `http://${envHost}`;
    } else {
      this.baseUrl = DEFAULT_OLLAMA_BASE_URL;
    }
  }

  /** Get the current base URL. */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /** Update the base URL at runtime (e.g. when settings change). */
  setBaseUrl(url: string): void {
    this.baseUrl = url.startsWith('http') ? url : `http://${url}`;
    // Invalidate cached availability since we're pointing to a new host
    this._available = null;
  }

  async isAvailable(): Promise<boolean> {
    if (this._available !== null) return this._available;
    try {
      // Only check API reachability — the local `ollama` CLI binary is not
      // required. The user may be connecting to a remote Ollama instance
      // where no local CLI is installed, or the Electron process may not
      // have `ollama` in its PATH.
      const resp = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5_000),
      });
      this._available = resp.ok;
      return this._available;
    } catch {
      this._available = false;
      return false;
    }
  }

  /** Force re-check on next isAvailable() call (e.g. after user installs Ollama). */
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

  /**
   * Abort the streaming request for the given conversation.
   * No-op if no stream is active.
   */
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

    // Use caller-provided sessionId or generate one
    const sessionId = params.sessionId || nanoid();
    const conversationId = params.conversationId ?? '';

    // Create tracker for this stream session
    const tracker = new StreamSessionTracker(sessionId);

    // Track whether a 'done' event was emitted.
    let doneEmitted = false;

    // Wrap onEvent to persist emitted events in batches (same pattern as ClaudeCodeClient).
    let persistErrorLogged = false;

    const BATCH_FLUSH_INTERVAL_MS = 100;
    const BATCH_MAX_SIZE = 20;
    const CRITICAL_EVENT_TYPES = new Set(['done', 'error', 'callStart', 'filesChanged']);

    type EventRecord = { sessionId: string; conversationId: string; sequenceNumber: number; eventType: string; payload: string; timestamp: string };
    let eventBatch: EventRecord[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flushBatch = () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (eventBatch.length === 0) return;
      const toFlush = eventBatch;
      eventBatch = [];
      try {
        this.db.persistStreamEventBatch(toFlush);
      } catch (err) {
        if (!persistErrorLogged) {
          console.error(`[OllamaCodeClient] Stream event batch persistence failed (conversationId=${conversationId}):`, err);
          persistErrorLogged = true;
        }
      }
    };

    const wrappedOnEvent = (streamEvent: StreamEvent) => {
      if (streamEvent.type === 'done') {
        doneEmitted = true;
      }

      eventBatch.push({
        sessionId,
        conversationId,
        sequenceNumber: tracker.nextSequence(),
        eventType: streamEvent.type,
        payload: JSON.stringify(streamEvent),
        timestamp: new Date().toISOString(),
      });

      // Critical events flush immediately
      if (CRITICAL_EVENT_TYPES.has(streamEvent.type) || eventBatch.length >= BATCH_MAX_SIZE) {
        flushBatch();
      } else if (!flushTimer) {
        flushTimer = setTimeout(flushBatch, BATCH_FLUSH_INTERVAL_MS);
      }

      // Forward ALL events to the caller immediately
      params.onEvent(streamEvent);
    };

    // Build message array for the Ollama /api/chat endpoint
    const apiMessages = this.buildChatMessages(systemPrompt, messages);

    // Determine if thinking should be enabled:
    // Enabled by default unless thinkingBudget is explicitly 0
    const thinkingEnabled = params.thinkingBudget !== 0;

    // Resolve working directory for tool execution
    const bookDir = bookSlug
      ? path.join(this.booksDir, bookSlug)
      : (params.workingDir ?? this.booksDir);
    const toolExecutor = new ToolExecutor(bookDir);

    const _totalChars = apiMessages.reduce((s, m) => s + m.content.length, 0);
    console.log(
      `[OllamaCodeClient] Streaming: model=${model}, think=${thinkingEnabled}, ` +
      `tools=${OLLAMA_TOOLS.length}, maxTurns=${maxTurns}, msgs=${apiMessages.length}, ` +
      `~${Math.ceil(_totalChars / 3.5).toLocaleString()} est tokens (${_totalChars.toLocaleString()} chars), ` +
      `conversationId=${conversationId}`,
    );
    for (const _m of apiMessages) {
      console.log(`  [msg] ${_m.role}: ${_m.content.length.toLocaleString()} chars`);
    }

    // Create abort controller for this stream
    const controller = new AbortController();
    if (conversationId) {
      this.activeStreams.set(conversationId, controller);
      if (bookSlug) {
        this.streamBookMap.set(conversationId, bookSlug);
      }
    }

    // Cumulative token and text tracking across all turns
    let totalThinkingText = '';
    let totalText = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // Look up model context window for num_ctx, capped at the global ceiling
    const rawContextWindow = await this.getModelContextWindow(model);
    const contextWindow = rawContextWindow
      ? Math.min(rawContextWindow, MAX_CALL_CONTEXT_TOKENS)
      : MAX_CALL_CONTEXT_TOKENS;

    // Warn threshold: stop adding turns when context reaches 90% of the cap.
    // This leaves headroom for the model's response tokens.
    const contextCeiling = Math.floor(contextWindow * 0.90);

    try {
      // ── Multi-turn agent loop ──────────────────────────────────────
      // Each iteration sends the conversation to Ollama. If the response
      // includes tool_calls, we execute them and add the results to the
      // conversation, then loop. If the response is plain text (no tool
      // calls), we break out — the agent is done.

      for (let turn = 0; turn < maxTurns; turn++) {
        // ── Context size guard ──────────────────────────────────────
        // Estimate total token count of all messages queued for the next
        // turn. If we've exceeded the ceiling, break early so the model
        // doesn't silently truncate or stall.
        const estimatedTokens = this.estimateMessageTokens(apiMessages);
        if (turn > 0 && estimatedTokens > contextCeiling) {
          console.warn(
            `[OllamaCodeClient] Context ceiling reached: ~${estimatedTokens.toLocaleString()} tokens ` +
            `(ceiling=${contextCeiling.toLocaleString()}) at turn ${turn + 1}. Breaking agent loop.`,
          );
          wrappedOnEvent({
            type: 'status',
            message: `Context limit approaching (~${Math.round(estimatedTokens / 1000)}K tokens). Finishing current work.`,
          });
          break;
        }

        console.log(`[OllamaCodeClient] Turn ${turn + 1}/${maxTurns} starting (est. ~${estimatedTokens.toLocaleString()} tokens)...`);

        const turnResult = await this.streamOneTurn({
          model,
          apiMessages,
          thinkingEnabled,
          contextWindow,
          controller,
          tracker,
          wrappedOnEvent,
          turn: turn + 1,
        });

        // Accumulate text and token counts
        totalThinkingText += turnResult.thinkingText;
        totalText += turnResult.contentText;
        totalInputTokens += turnResult.inputTokens;
        totalOutputTokens += turnResult.outputTokens;

        console.log(
          `[OllamaCodeClient] Turn ${turn + 1} done: ` +
          `thinking=${turnResult.thinkingText.length} chars, ` +
          `content=${turnResult.contentText.length} chars, ` +
          `toolCalls=${turnResult.toolCalls.length}, ` +
          `tokens=${turnResult.inputTokens}in/${turnResult.outputTokens}out`,
        );

        // If no tool calls, the agent is done
        if (turnResult.toolCalls.length === 0) {
          console.log(`[OllamaCodeClient] No tool calls — agent loop complete after ${turn + 1} turn(s)`);
          break;
        }

        // ── Execute tool calls ────────────────────────────────────
        // Add the assistant's tool-call message to the conversation
        apiMessages.push({
          role: 'assistant',
          content: turnResult.contentText,
          tool_calls: turnResult.toolCalls,
        });

        // Execute each tool call and add results
        for (const toolCall of turnResult.toolCalls) {
          const toolName = toolCall.function.name;
          const startTime = Date.now();

          // Emit tool use start event — extract filePath with resilience for
          // models that nest objects in arguments
          const toolId = nanoid(8);
          const rawFilePath = toolCall.function.arguments.file_path
            ?? toolCall.function.arguments.path
            ?? toolCall.function.arguments.file;
          const eventFilePath = typeof rawFilePath === 'string'
            ? rawFilePath
            : typeof rawFilePath === 'object' && rawFilePath !== null
              ? (Object.values(rawFilePath as Record<string, unknown>).find((v) => typeof v === 'string') as string | undefined)
              : undefined;

          wrappedOnEvent({
            type: 'toolUse',
            tool: {
              toolName,
              toolId,
              filePath: eventFilePath,
              status: 'started',
            },
          });

          // Infer progress stage from tool type
          if (WRITE_TOOLS.has(toolName)) {
            wrappedOnEvent({ type: 'progressStage', stage: 'drafting' });
          } else {
            wrappedOnEvent({ type: 'progressStage', stage: 'reading' });
          }

          const result = await toolExecutor.execute(toolCall);

          // Track file touches for write operations
          if (result.isWrite && result.filePath) {
            tracker.touchFile(result.filePath);
          }

          // Emit tool completion events
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

          // Emit filesChanged for write operations
          if (result.isWrite && result.filePath) {
            wrappedOnEvent({
              type: 'filesChanged',
              paths: [result.filePath],
            });
          }

          // Add tool result to the conversation for the next turn
          apiMessages.push({
            role: 'tool',
            content: result.content,
          });
        }
      }

      // ── Stream complete ──────────────────────────────────────────
      flushBatch();

      console.log(
        `[OllamaCodeClient] Stream complete: ` +
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
      console.error(`[OllamaCodeClient] Stream error:`, err);
      // Flush any buffered events before error handling
      flushBatch();

      if (err instanceof Error && err.name === 'AbortError') {
        // User-initiated abort — close gracefully
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
        // Check for timeout errors (undici HeadersTimeoutError / BodyTimeoutError)
        const causeCode = (err as { cause?: { code?: string } })?.cause?.code;
        const isTimeout = causeCode === 'UND_ERR_HEADERS_TIMEOUT'
          || causeCode === 'UND_ERR_BODY_TIMEOUT'
          || message.includes('TimeoutError')
          || message.includes('timed out');

        if (message.includes('ECONNREFUSED')) {
          wrappedOnEvent({ type: 'error', message: OLLAMA_NOT_FOUND_MESSAGE });
        } else if (isTimeout) {
          console.error(`[OllamaCodeClient] Request timed out (cause: ${causeCode}):`, message);
          wrappedOnEvent({ type: 'error', message: OLLAMA_TIMEOUT_MESSAGE });
        } else if (message.includes('fetch failed')) {
          // "fetch failed" can mean connection refused OR payload too large.
          // Distinguish by checking if Ollama was reachable before.
          if (this._available === false) {
            wrappedOnEvent({ type: 'error', message: OLLAMA_NOT_FOUND_MESSAGE });
          } else {
            console.error(`[OllamaCodeClient] fetch failed (likely context overflow):`, message);
            wrappedOnEvent({ type: 'error', message: OLLAMA_REQUEST_FAILED_MESSAGE });
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
   * Stream a single turn of the agent loop.
   *
   * Sends the conversation to `/api/chat` with tools and streaming,
   * processes the NDJSON response, and returns the accumulated result
   * including any tool calls the model wants to make.
   */
  private async streamOneTurn(params: {
    model: string;
    apiMessages: OllamaMessage[];
    thinkingEnabled: boolean;
    contextWindow?: number;
    controller: AbortController;
    tracker: StreamSessionTracker;
    wrappedOnEvent: (event: StreamEvent) => void;
    turn: number;
  }): Promise<TurnResult> {
    const { model, apiMessages, thinkingEnabled, contextWindow, controller, tracker, wrappedOnEvent, turn } = params;

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        stream: true,
        think: thinkingEnabled,
        tools: OLLAMA_TOOLS,
        ...(contextWindow ? { options: { num_ctx: contextWindow } } : {}),
      }),
      signal: controller.signal,
      // @ts-expect-error -- undici dispatcher is valid for Node.js fetch but not in DOM types
      dispatcher: ollamaDispatcher,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Ollama API error ${response.status}: ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body — streaming not supported');
    }

    // State tracking for this turn
    let inThinkingBlock = false;
    let inTextBlock = false;
    let thinkingText = '';
    let contentText = '';
    let inputTokens = 0;
    let outputTokens = 0;
    const toolCalls: OllamaToolCall[] = [];

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // ── Inactivity watchdog ──────────────────────────────────
    // When Ollama stalls (e.g. model OOMs, GPU runs out of VRAM,
    // or prompt processing takes too long), the stream goes silent
    // with no error. The watchdog warns the user after 90s of no
    // data so they know something is wrong and can abort.
    let inactivityWarned = false;
    let lastDataTime = Date.now();
    const inactivityTimer = setInterval(() => {
      const elapsed = Date.now() - lastDataTime;
      if (elapsed >= INACTIVITY_WARNING_MS && !inactivityWarned) {
        inactivityWarned = true;
        const elapsedSec = Math.round(elapsed / 1000);
        console.warn(
          `[OllamaCodeClient] No data received for ${elapsedSec}s on turn ${turn}. ` +
          `Model may be stalled or processing a very large context.`,
        );
        wrappedOnEvent({
          type: 'warning',
          message: `No response from model for ${elapsedSec}s — it may be processing a large context or stalled. You can wait or abort and try a smaller context.`,
        });
      }
    }, 15_000); // Check every 15s

    try {

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      lastDataTime = Date.now();
      inactivityWarned = false; // Reset if data resumes
      buffer += decoder.decode(value, { stream: true });

      // Ollama streams NDJSON — one JSON object per line
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // Keep incomplete last line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let chunk: OllamaChatChunk;
        try {
          chunk = JSON.parse(trimmed) as OllamaChatChunk;
        } catch {
          // Skip unparseable lines
          continue;
        }

        const thinking = chunk.message?.thinking ?? '';
        const content = chunk.message?.content ?? '';

        // ── Tool calls ────────────────────────────────────────
        // Ollama returns tool calls in the message when the model
        // decides to use a tool instead of generating text.
        // Arguments may arrive as an object or a JSON string —
        // normalize to always be Record<string, unknown>.
        let hasToolCalls = false;
        if (chunk.message?.tool_calls?.length) {
          hasToolCalls = true;
          for (const tc of chunk.message.tool_calls) {
            const normalized = { ...tc };
            if (typeof normalized.function.arguments === 'string') {
              try {
                normalized.function.arguments = JSON.parse(normalized.function.arguments as unknown as string);
              } catch {
                normalized.function.arguments = { value: normalized.function.arguments };
              }
            }
            toolCalls.push(normalized);
          }
        }

        // ── Thinking tokens ──────────────────────────────────
        if (thinking) {
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

          thinkingText += thinking;
          tracker.appendThinkingBuffer(thinking);
          wrappedOnEvent({ type: 'thinkingDelta', text: thinking });
        }

        // ── Content tokens ───────────────────────────────────
        // When tool calls are present, some models also emit the tool call
        // description as content text. Suppress this to avoid showing raw
        // tool call JSON in the chat.
        if (content && !hasToolCalls) {
          if (inThinkingBlock) {
            wrappedOnEvent({ type: 'blockEnd', blockType: 'thinking' });
            tracker.setCurrentBlockType(null);
            inThinkingBlock = false;

            const summary = tracker.extractThinkingSummary();
            if (summary) {
              wrappedOnEvent({ type: 'thinkingSummary', summary });
            }
          }

          if (!inTextBlock) {
            inTextBlock = true;
            tracker.setCurrentBlockType('text');
            tracker.markTextEmitted();
            wrappedOnEvent({ type: 'blockStart', blockType: 'text' });
          }

          contentText += content;
          wrappedOnEvent({ type: 'textDelta', text: content });
        }

        // ── Stream completion ────────────────────────────────
        if (chunk.done) {
          // Close any open blocks
          if (inThinkingBlock) {
            wrappedOnEvent({ type: 'blockEnd', blockType: 'thinking' });
            tracker.setCurrentBlockType(null);
            inThinkingBlock = false;

            const summary = tracker.extractThinkingSummary();
            if (summary) {
              wrappedOnEvent({ type: 'thinkingSummary', summary });
            }
          }
          if (inTextBlock) {
            wrappedOnEvent({ type: 'blockEnd', blockType: 'text' });
            tracker.setCurrentBlockType(null);
            inTextBlock = false;
          }

          // Capture token counts from the final chunk
          inputTokens = chunk.prompt_eval_count ?? 0;
          outputTokens = chunk.eval_count ?? 0;
        }
      }
    }

    } finally {
      clearInterval(inactivityTimer);
    }

    // Safety: close any open blocks if stream ended without done:true
    if (inThinkingBlock) {
      wrappedOnEvent({ type: 'blockEnd', blockType: 'thinking' });
      const summary = tracker.extractThinkingSummary();
      if (summary) {
        wrappedOnEvent({ type: 'thinkingSummary', summary });
      }
    }
    if (inTextBlock) {
      wrappedOnEvent({ type: 'blockEnd', blockType: 'text' });
    }

    return {
      thinkingText,
      contentText,
      inputTokens,
      outputTokens,
      toolCalls,
    };
  }

  /**
   * Look up a model's context window size via /api/show.
   * Cached per model for the session lifetime.
   */
  private async getModelContextWindow(model: string): Promise<number | undefined> {
    const cached = this.contextWindowCache.get(model);
    if (cached) return cached;
    try {
      const resp = await fetch(`${this.baseUrl}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!resp.ok) return undefined;
      const data = await resp.json() as Record<string, unknown>;
      const info = data.model_info as Record<string, unknown> | undefined;
      if (!info) return undefined;
      for (const [key, value] of Object.entries(info)) {
        if (key.endsWith('.context_length') && typeof value === 'number') {
          this.contextWindowCache.set(model, value);
          console.log(`[OllamaCodeClient] Model ${model} context window: ${value.toLocaleString()} tokens`);
          return value;
        }
      }
    } catch { /* non-critical */ }
    return undefined;
  }

  /**
   * Estimate total token count for an array of Ollama messages.
   * Uses the simple chars/token heuristic — good enough for a guard rail.
   */
  private estimateMessageTokens(messages: OllamaMessage[]): number {
    let totalChars = 0;
    for (const msg of messages) {
      totalChars += (msg.content ?? '').length;
      // Tool call arguments add context too
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          totalChars += JSON.stringify(tc.function.arguments).length;
        }
      }
    }
    return Math.ceil(totalChars / CHARS_PER_TOKEN);
  }

  /**
   * Build the messages array for the Ollama /api/chat endpoint.
   *
   * Maps our internal message format to Ollama's expected format:
   *   { role: 'system' | 'user' | 'assistant', content: string }
   */
  private buildChatMessages(
    systemPrompt: string,
    messages: { role: MessageRole; content: string }[],
  ): OllamaMessage[] {
    const apiMessages: OllamaMessage[] = [];

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

/** Message format for the Ollama /api/chat endpoint. */
type OllamaMessage = {
  role: string;
  content: string;
  tool_calls?: OllamaToolCall[];
};

/** Result of streaming a single agent-loop turn. */
type TurnResult = {
  thinkingText: string;
  contentText: string;
  inputTokens: number;
  outputTokens: number;
  toolCalls: OllamaToolCall[];
};

/** Shape of a single NDJSON line from Ollama's /api/chat streaming response. */
interface OllamaChatChunk {
  model?: string;
  message?: {
    role?: string;
    content?: string;
    thinking?: string;
    tool_calls?: OllamaToolCall[];
  };
  done: boolean;
  done_reason?: string;
  /** Total tokens evaluated in the prompt (available in the final chunk). */
  prompt_eval_count?: number;
  /** Total tokens generated in the response (available in the final chunk). */
  eval_count?: number;
  /** Total duration in nanoseconds. */
  total_duration?: number;
}
