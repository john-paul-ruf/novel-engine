# Session 07 — Claude Code CLI Client

## Context

Novel Engine Electron app. Sessions 01–06 done. Now I need the **Claude Code CLI client** — it wraps the `claude` command-line tool, handles streaming via `--output-format stream-json`, extended thinking, and emits typed `StreamEvent` objects.

## Architecture Rule

Lives in `src/infrastructure/claude-cli/`. Imports from `@domain` and Node.js builtins (`child_process`, `path`, `os`). Implements `IClaudeClient`. No Electron imports, no `@anthropic-ai/sdk`.

## Task

Create `src/infrastructure/claude-cli/ClaudeCodeClient.ts` and `index.ts` barrel.

### Interface It Implements

```typescript
interface IClaudeClient {
  sendMessage(params: {
    model: string;
    systemPrompt: string;
    messages: { role: MessageRole; content: string }[];
    maxTokens: number;
    thinkingBudget?: number;
    onEvent: (event: StreamEvent) => void;
  }): Promise<void>;
  isAvailable(): Promise<boolean>;
}
```

### Implementation

**`isAvailable()`:**

Run `claude --version` via `execFileAsync`. Return `true` if exit code 0, `false` otherwise. Wrap in try/catch.

**`sendMessage(params)`:**

1. **Build the conversation prompt.** Reconstruct the conversation history as a single prompt string. Format previous messages as:
   ```
   Human: {user message}

   Assistant: {assistant message}

   Human: {latest user message}
   ```
   The last message in `params.messages` is always the new user message.

2. **Write the system prompt to a temp file** (using `node:fs/promises` and `node:os` for `tmpdir()`). This avoids shell argument length limits for long agent system prompts. Clean up the temp file after the process exits.

3. **Build the CLI args:**
   ```typescript
   const args = [
     '--print',                              // non-interactive mode
     '--output-format', 'stream-json',       // streaming JSON output
     '--model', params.model,
     '--max-tokens', String(params.maxTokens),
     '--system-prompt', systemPromptTempPath, // path to temp file
   ];

   // Add thinking budget if provided
   if (params.thinkingBudget) {
     args.push('--thinking-budget', String(params.thinkingBudget));
   }
   ```

4. **Spawn the `claude` process** using `child_process.spawn` (NOT `execFile` — we need streaming stdout):
   ```typescript
   const child = spawn('claude', args, {
     stdio: ['pipe', 'pipe', 'pipe'],
     env: { ...process.env },
   });
   ```

5. **Write the conversation prompt to stdin** and close it:
   ```typescript
   child.stdin.write(conversationPrompt);
   child.stdin.end();
   ```

6. **Parse streaming JSON from stdout.** The CLI outputs newline-delimited JSON objects. Buffer stdout data and split on newlines. Parse each complete line as JSON and map to our `StreamEvent` type:

   The `stream-json` format emits objects like:
   ```json
   {"type":"assistant","subtype":"thinking","content_block_start":true}
   {"type":"assistant","subtype":"thinking","content":"reasoning text..."}
   {"type":"assistant","subtype":"thinking","content_block_stop":true}
   {"type":"assistant","subtype":"text","content_block_start":true}
   {"type":"assistant","subtype":"text","content":"response text..."}
   {"type":"assistant","subtype":"text","content_block_stop":true}
   {"type":"result","cost_usd":0.05,"input_tokens":1500,"output_tokens":800,"duration_ms":5000}
   ```

   Map these to `StreamEvent`:
   - `content_block_start` with `subtype === 'thinking'` → emit `{ type: 'blockStart', blockType: 'thinking' }`
   - `content_block_start` with `subtype === 'text'` → emit `{ type: 'blockStart', blockType: 'text' }`
   - `subtype === 'thinking'` with `content` (no `content_block_start`/`stop`) → emit `{ type: 'thinkingDelta', text: content }`
   - `subtype === 'text'` with `content` (no `content_block_start`/`stop`) → emit `{ type: 'textDelta', text: content }`
   - `content_block_stop` → emit `{ type: 'blockEnd', blockType: currentBlockType }`
   - `type === 'result'` → emit `{ type: 'done', inputTokens, outputTokens, thinkingTokens: estimatedFromBuffer }`

   For `thinkingTokens`: estimate from the accumulated thinking buffer using `Math.ceil(thinkingBuffer.length / CHARS_PER_TOKEN)` from `@domain/constants`.

7. **Handle stderr.** Accumulate stderr output. If the process exits with a non-zero code, emit:
   ```typescript
   { type: 'error', message: stderrBuffer || `Claude CLI exited with code ${code}` }
   ```
   Then throw an error.

8. **Clean up.** Delete the temp system prompt file in a `finally` block.

9. **Return a Promise** that resolves when the child process exits with code 0, or rejects on non-zero exit.

### Key details

- **Do NOT store state between calls.** This class is stateless. Every call spawns a fresh `claude` process.
- **Track the current block type** in a local variable within `sendMessage` so you can emit the correct `blockEnd` event.
- **Handle partial JSON lines** in the stdout buffer — a chunk from the child process may contain a partial line. Only parse complete lines (ending with `\n`).
- **The `claude` CLI must be in PATH.** If not found, `spawn` will emit an `error` event. Catch it and emit a user-friendly error: "Claude Code CLI not found. Install it from https://docs.anthropic.com/en/docs/claude-code"

### Reliable stdout parsing pattern:

```typescript
let stdoutBuffer = '';
let thinkingBuffer = '';
let currentBlockType: 'thinking' | 'text' | null = null;

child.stdout.on('data', (chunk: Buffer) => {
  stdoutBuffer += chunk.toString();
  const lines = stdoutBuffer.split('\n');
  // Keep the last (possibly incomplete) line in the buffer
  stdoutBuffer = lines.pop() || '';

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      // Map to StreamEvent and emit via params.onEvent
    } catch {
      // Skip unparseable lines
    }
  }
});
```

## Verification

- Compiles with `npx tsc --noEmit`
- Implements `IClaudeClient`
- No Electron imports, no `@anthropic-ai/sdk`, no state between calls
- Emits `StreamEvent` objects in the correct order: blockStart → deltas → blockEnd → done
- Handles errors by emitting error event AND re-throwing
- Cleans up temp files in all cases (success, error, abort)
