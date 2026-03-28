import type { IModelProvider } from '@domain/interfaces';
import type {
  MessageRole,
  ProviderCapability,
  ProviderId,
  StreamEvent,
} from '@domain/types';

/**
 * OpenAI-compatible API provider for BYOK and self-hosted models.
 *
 * Works with any endpoint that speaks the OpenAI Chat Completions format:
 * OpenAI, Anthropic direct API, Ollama, LM Studio, vLLM, Groq, Together, etc.
 *
 * Uses built-in `fetch` + SSE parsing — no npm dependencies.
 * Does NOT support tool-use (file read/write). Text completion + streaming only.
 */
export class OpenAiCompatibleProvider implements IModelProvider {
  readonly providerId: ProviderId;
  readonly capabilities: ProviderCapability[];

  private activeStreams = new Map<string, AbortController>();
  private streamBookMap = new Map<string, string>();
  private _available: boolean | null = null;

  constructor(
    providerId: ProviderId,
    private baseUrl: string,
    private apiKey: string,
    capabilities?: ProviderCapability[],
  ) {
    this.providerId = providerId;
    this.capabilities = capabilities ?? ['text-completion', 'streaming'];
    if (this.baseUrl.endsWith('/')) {
      this.baseUrl = this.baseUrl.slice(0, -1);
    }
  }

  async isAvailable(): Promise<boolean> {
    if (this._available !== null) return this._available;
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(10_000),
      });
      this._available = response.ok;
      return this._available;
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
    const { model, systemPrompt, messages, maxTokens, onEvent } = params;
    const conversationId = params.conversationId ?? '';

    const apiMessages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];
    for (const msg of messages) {
      apiMessages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      });
    }

    const controller = new AbortController();
    if (conversationId) {
      this.activeStreams.set(conversationId, controller);
      if (params.bookSlug) {
        this.streamBookMap.set(conversationId, params.bookSlug);
      }
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { ...this.buildHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: apiMessages,
          max_tokens: maxTokens,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`API error ${response.status}: ${errorText}`);
      }

      if (!response.body) {
        throw new Error('No response body — streaming not supported by this endpoint');
      }

      onEvent({ type: 'blockStart', blockType: 'text' });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let totalText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{
                delta?: { content?: string; role?: string };
                finish_reason?: string | null;
              }>;
            };
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) {
              totalText += delta.content;
              onEvent({ type: 'textDelta', text: delta.content });
            }
          } catch {
            // Skip unparseable SSE lines
          }
        }
      }

      onEvent({ type: 'blockEnd', blockType: 'text' });

      // Estimate token counts (4 chars/token) — not all providers include usage in SSE
      const estimatedInputTokens = Math.ceil(
        apiMessages.reduce((sum, m) => sum + m.content.length, 0) / 4,
      );
      const estimatedOutputTokens = Math.ceil(totalText.length / 4);

      onEvent({
        type: 'done',
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens,
        thinkingTokens: 0,
        filesTouched: {},
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        onEvent({ type: 'blockEnd', blockType: 'text' });
        onEvent({
          type: 'done',
          inputTokens: 0,
          outputTokens: 0,
          thinkingTokens: 0,
          filesTouched: {},
        });
      } else {
        const message = err instanceof Error ? err.message : String(err);
        onEvent({ type: 'error', message });
      }
    } finally {
      if (conversationId) {
        this.activeStreams.delete(conversationId);
        this.streamBookMap.delete(conversationId);
      }
    }
  }

  /** Update the API key at runtime (e.g. from settings changes). */
  updateApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    this._available = null;
  }

  /** Update the base URL at runtime (e.g. from settings changes). */
  updateBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this._available = null;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Accept': 'text/event-stream' };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }
}
