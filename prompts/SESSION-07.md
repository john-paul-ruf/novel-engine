# Session 07 — Anthropic Client

## Context

Novel Engine Electron app. Sessions 01–06 done. Now I need the **Anthropic API client** — it wraps the `@anthropic-ai/sdk`, handles streaming, extended thinking, and emits typed `StreamEvent` objects.

## Architecture Rule

Lives in `src/infrastructure/anthropic/`. Imports from `@domain` and `@anthropic-ai/sdk`. Implements `IAnthropicClient`. No Electron imports.

## Task

Create `src/infrastructure/anthropic/AnthropicClient.ts` and `index.ts` barrel.

### Interface It Implements

```typescript
interface IAnthropicClient {
  sendMessage(params: {
    apiKey: string;
    model: string;
    systemPrompt: string;
    messages: { role: MessageRole; content: string }[];
    maxTokens: number;
    thinking?: { type: 'enabled'; budget_tokens: number };
    onEvent: (event: StreamEvent) => void;
  }): Promise<void>;
}
```

### Implementation

**`sendMessage(params)`:**

1. Create a new `Anthropic` client instance with the provided `apiKey`. Create it fresh each call — don't cache the client, since the key can change.

2. Build the request body:
   ```typescript
   {
     model: params.model,
     max_tokens: params.maxTokens,
     system: params.systemPrompt,
     messages: params.messages,
     stream: true,
     // Only include thinking if provided
     ...(params.thinking && { thinking: params.thinking }),
   }
   ```

3. If thinking is enabled, add the `interleaved-thinking-2025-05-14` beta header via the `betas` parameter on the SDK's `messages.stream()` call. Check the SDK docs — the `stream()` method may accept `betas` as an option.

4. Use the SDK's streaming interface. The `@anthropic-ai/sdk` provides `client.messages.stream()` which returns an async iterable of events. Iterate through them and map to our `StreamEvent` type:

   - `content_block_start` where the block type is `'thinking'` → emit `{ type: 'blockStart', blockType: 'thinking' }`
   - `content_block_start` where the block type is `'text'` → emit `{ type: 'blockStart', blockType: 'text' }`
   - `content_block_delta` with `delta.type === 'thinking_delta'` → emit `{ type: 'thinkingDelta', text: delta.thinking }`
   - `content_block_delta` with `delta.type === 'text_delta'` → emit `{ type: 'textDelta', text: delta.text }`
   - `content_block_delta` with `delta.type === 'signature_delta'` → ignore (crypto signature, not for display)
   - `content_block_stop` → emit `{ type: 'blockEnd', blockType: currentBlockType }` (track which block type we're in)
   - `message_stop` → don't emit here; we emit `done` after the loop

5. After the stream completes, get the final message's `usage` object. Track thinking tokens by accumulating the length of thinking deltas and estimating via `CHARS_PER_TOKEN`, OR by reading the usage object's thinking-specific fields if the SDK exposes them (check `finalMessage.usage` for a `cache_creation_input_tokens` or thinking-related field). Emit:
   ```typescript
   { type: 'done', inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, thinkingTokens: estimatedThinkingTokens }
   ```
   For `thinkingTokens`: estimate from the accumulated thinking buffer using `Math.ceil(thinkingBuffer.length / CHARS_PER_TOKEN)` from `@domain/constants`. This is an approximation — the actual thinking token count may be higher since the API returns a condensed summary of its reasoning.

6. Wrap the entire thing in a try/catch. On error, emit:
   ```typescript
   { type: 'error', message: error.message || 'Unknown API error' }
   ```
   Then re-throw so the caller knows it failed.

### Key details

- **Do NOT store state between calls.** This class is stateless. Every call gets its own client instance and stream.
- **Track the current block type** in a local variable within `sendMessage` so you can emit the correct `blockEnd` event.
- **The SDK's streaming API** may return events via `for await (const event of stream)` or via event listeners. Use whichever pattern the SDK supports — check the `@anthropic-ai/sdk` types for the correct streaming approach. The SDK's `messages.stream()` method returns an object with `.on('event', callback)` style listeners, but also supports `for await` via the async iterable protocol. Use the event listener approach for clearer mapping.
- Use `stream.on('text', ...)` for text deltas and handle raw events for thinking blocks since the SDK's convenience methods may not expose thinking content.

### Actually, here's the most reliable pattern with the SDK:

```typescript
// The betas parameter is passed as an option to the stream() method,
// NOT inside the message body. Check the current @anthropic-ai/sdk version
// for the correct parameter position. As of SDK v0.39+:

const streamParams = {
  model: params.model,
  max_tokens: params.maxTokens,
  system: params.systemPrompt,
  messages: params.messages,
  ...(params.thinking && { thinking: params.thinking }),
};

// If thinking is enabled, pass betas as a separate option:
const stream = params.thinking
  ? client.messages.stream(streamParams, {
      headers: { 'anthropic-beta': 'interleaved-thinking-2025-05-14' },
    })
  : client.messages.stream(streamParams);

stream.on('event', (event) => {
  // Handle raw SSE events here - this gives you content_block_start,
  // content_block_delta, content_block_stop, message_stop
});

const finalMessage = await stream.finalMessage();
// finalMessage.usage has input_tokens, output_tokens
// Track thinking buffer length to estimate thinkingTokens for the done event
```

> **SDK Version Note:** The exact API for passing beta headers varies between SDK versions. The `headers` approach via the second options parameter is the most stable pattern. If the SDK version supports `betas: [...]` as a top-level stream parameter, that also works. The implementer should check the installed SDK's TypeScript types to determine which pattern their version supports.

Use the `'event'` listener to get the raw event objects. This is the most reliable way to see thinking blocks, since the convenience listeners like `stream.on('text', ...)` skip thinking content.

## Verification

- Compiles with `npx tsc --noEmit`
- Implements `IAnthropicClient`
- No Electron imports, no state between calls
- Emits `StreamEvent` objects in the correct order: blockStart → deltas → blockEnd → done
- Handles errors by emitting error event AND re-throwing
