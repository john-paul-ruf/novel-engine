# SESSION-02 — OllamaCodeClient detects phantom empty turns, retries bounded

> **Program:** Novel Engine
> **Feature:** fix-phantom-turns-renderer-reads
> **Modules:** M12 (ollama-cli)
> **Depends on:** none
> **Estimated effort:** 25 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M12 | `src/infrastructure/ollama-cli/OllamaCodeClient.ts` lines 1–60, 280–605, 660–810, 935–955 | Agent-loop turn bookkeeping; `streamOneTurn`; `OllamaChatChunk` type | The `toolCalls.length === 0` branch is the exit-too-early bug; `OllamaChatChunk.prompt_eval_count/eval_count` distinguishes phantom from natural |
| M12 | `src/infrastructure/ollama-cli/OllamaCodeClient.test.ts` | Existing tests, especially `describe('agent loop with tools')` and the maxTurns test at line 233 | Need to mirror fixture style; ensure existing assertion "stops after maxTurns" still passes |
| M16 | `src/test/fixtures/ollama-responses.ts` | Existing `contentChunk`, `thinkingChunk`, `toolCallChunk`, `doneChunk`, `chatResponse`, `makeOllamaFetchStub` | Need a phantom chunk (done with 0 tokens, only thinking) — extend if missing |

## Context

The crash log shows the agent loop "completing" after a single turn that
produced 123K chars of thinking but **zero** content text and **zero**
tool calls:

```
[OllamaCodeClient] Turn 5 done: thinking=123068 chars, content=0 chars, toolCalls=0, tokens=0in/0out
[OllamaCodeClient] No tool calls — agent loop complete after 5 turn(s)
```

The current decision at `src/infrastructure/ollama-cli/OllamaCodeClient.ts:431-436`:

```typescript
if (turnResult.toolCalls.length === 0) {
  exitReason = 'natural';
  console.log(`[OllamaCodeClient] No tool calls — agent loop complete after ${turn + 1} turn(s)`);
  break;
}
```

…treats any turn with no tool calls as natural completion. But a turn with
no *content* either is not a normal finish — it's the Ollama server returning
a 0-token response (the model OOM'd on its own giant thinking block, the
GPU threw, etc.). Treating that as "natural" silently ends the stream while
the agent did nothing. Worse, AutoTurnResumer (SESSION-03) re-spawns when
exit reason is `max-turns`; a phantom exit sets `exitReason = 'natural'` so
the resumer never even gets a chance to react.

The fix: detect a **phantom empty turn** (no content, no tool calls) and
retry the same turn up to a small bound (`MAX_CONSECUTIVE_EMPTY_TURNS = 3`)
with a warning event each time. If the bound is exceeded, set
`exitReason = 'max-turns'` and break — that gives the AutoTurnResumer the
right signal to do its bounded-resume work in SESSION-03.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/infrastructure/ollama-cli/OllamaCodeClient.ts` | Modify | Add phantom-empty-turn detection + bounded retry + warning + max-turns exit |
| `src/infrastructure/ollama-cli/OllamaCodeClient.test.ts` | Modify | Add tests: (a) one phantom turn retried then content → done natural; (b) three phantom turns in a row → `done` with `isMaxTurns: true` |
| `src/test/fixtures/ollama-responses.ts` | Modify | Add `phantomChunk` helper (or use existing `doneChunk(0, 0)`); if a `thinkingOnlyChunk` is needed, add it |

## Implementation

### 1. Read the relevant parts of OllamaCodeClient.ts

Read lines 1–60 (imports + constants), 280–605 (sendMessage main loop), and
660–810 (`streamOneTurn`) and 935–955 (`OllamaChatChunk`). Confirm that
`streamOneTurn` returns `{ thinkingText, contentText, inputTokens,
outputTokens, toolCalls }`.

### 2. Add a `MAX_CONSECUTIVE_EMPTY_TURNS` constant

At the top of `src/infrastructure/ollama-cli/OllamaCodeClient.ts`, near the
other constants (around line 47–53, after `DEFAULT_MAX_TURNS`):

```typescript
/** Maximum consecutive "phantom" empty turns (0 content + 0 tool calls)
 *  before the agent loop gives up and exits with `isMaxTurns: true`.
 *
 *  Ollama can occasionally return a 0-token `done` chunk — the model OOM'd
 *  on thinking, the GPU ran out of VRAM, the server hiccuped. Retrying
 *  the same turn is cheap and usually recovers. Three strikes is enough
 *  to distinguish a transient failure from a stuck model; further retries
 *  just burn context budget. */
const MAX_CONSECUTIVE_EMPTY_TURNS = 3;
```

### 3. Add a `consecutiveEmptyTurns` counter inside `sendMessage`

Inside the `try { ... for (let turn = 0; turn < maxTurns; turn++) { ... } }`
block, before the loop starts (around line 365–370), add:

```typescript
let consecutiveEmptyTurns = 0;
```

### 4. Replace the "no tool calls → natural" branch

Find lines 431–436 (the block that breaks on `toolCalls.length === 0`).
Replace with logic that:

1. If `turnResult.contentText.length > 0` — real finish (model wrote text
   but called no tools). Set `exitReason = 'natural'` and break as before.
2. If `turnResult.contentText.length === 0` AND `toolCalls.length === 0` —
   phantom empty turn. Increment `consecutiveEmptyTurns`. Emit a `warning`
   event describing the retry. If `consecutiveEmptyTurns >=
   MAX_CONSECUTIVE_EMPTY_TURNS`, set `exitReason = 'max-turns'` and break
   (let the AutoTurnResumer decide). Otherwise, **retry the same turn** by
   decrementing `turn` so the `for` loop's `turn++` lands on the same
   index, and `continue`. Do not add anything to `apiMessages` — the next
   iteration sends the exact same prompt.

```typescript
// If no tool calls, the agent is done — but distinguish a real completion
// from a phantom empty turn (0 content + 0 tool calls), which is the
// Ollama server returning a 0-token chunk. Real completion: model wrote
// text. Phantom: only thinking was produced (or nothing at all).
if (turnResult.toolCalls.length === 0) {
  if (turnResult.contentText.length > 0) {
    exitReason = 'natural';
    console.log(`[OllamaCodeClient] No tool calls — agent loop complete after ${turn + 1} turn(s)`);
    break;
  }

  // Phantom empty turn — the model produced no usable output.
  consecutiveEmptyTurns++;
  if (consecutiveEmptyTurns >= MAX_CONSECUTIVE_EMPTY_TURNS) {
    exitReason = 'max-turns';
    console.warn(
      `[OllamaCodeClient] ${MAX_CONSECUTIVE_EMPTY_TURNS} consecutive empty turns — ` +
      `exiting as max-turns at turn ${turn + 1}.`,
    );
    wrappedOnEvent({
      type: 'warning',
      message: `Model produced no output for ${MAX_CONSECUTIVE_EMPTY_TURNS} consecutive turns — stopping.`,
    });
    break;
  }

  console.warn(
    `[OllamaCodeClient] Phantom empty turn ${consecutiveEmptyTurns}/${MAX_CONSECUTIVE_EMPTY_TURNS} at turn ${turn + 1} — retrying.`,
  );
  wrappedOnEvent({
    type: 'warning',
    message: `Empty model response — retrying (attempt ${consecutiveEmptyTurns}/${MAX_CONSECUTIVE_EMPTY_TURNS}).`,
  });
  // Re-send the same prompt — do not advance turn counter. `turn--` then
  // the `for` loop's `turn++` lands on the same index.
  turn--;
  continue;
}

// Reset counter — model produced real work this turn.
consecutiveEmptyTurns = 0;
```

Place the `consecutiveEmptyTurns = 0` reset at the end of the
"if (turnResult.toolCalls.length === 0) {...}" block (only when the model
produced a non-empty turn, the counter should reset). The cleanest pattern
is:

```typescript
if (turnResult.toolCalls.length === 0) {
  if (turnResult.contentText.length > 0) {
    exitReason = 'natural';
    console.log(`[OllamaCodeClient] No tool calls — agent loop complete after ${turn + 1} turn(s)`);
    break;
  }
  // ... phantom branch (increment, maybe break, turn--, continue) ...
}
// Reset phantom counter — we have real tool calls this turn.
consecutiveEmptyTurns = 0;
```

### 5. No other changes

The `streamOneTurn` return type is already `{ thinkingText, contentText,
inputTokens, outputTokens, toolCalls }` — the `contentText.length` check is
already available, no plumbing needed. The exit path at lines 529–548
already emits the `done` event with `isMaxTurns: exitReason === 'max-turns'`
so a phantom-induced exit will correctly carry `isMaxTurns: true`. No
change to that block.

### 6. Add test fixtures (if needed)

Read `src/test/fixtures/ollama-responses.ts` to confirm the existing
helpers. If `doneChunk(0, 0)` produces a valid `done:true, eval_count:0,
prompt_eval_count:0` chunk with no `message.content`, **no new fixture is
needed** — the existing `doneChunk` already supports that. If `doneChunk`
requires content, add a `phantomDoneChunk` (or `doneChunk(0, 0)` semantics):

```typescript
export function phantomDoneChunk(): string {
  return JSON.stringify({
    model: 'test-model',
    message: { role: 'assistant', content: '', thinking: 'thinking without output' },
    done: true,
    done_reason: 'stop',
    prompt_eval_count: 0,
    eval_count: 0,
  });
}
```

Prefer extending `doneChunk` only if necessary; otherwise compose from
existing helpers in the test file itself (e.g. `chatResponse([
thinkingChunk('idle...'), doneChunkFactory(0,0)])`).

### 7. Add two tests to OllamaCodeClient.test.ts

Add inside the `describe('agent loop with tools')` block (or a new
`describe('phantom empty turns')` block adjacent):

**Test A — single phantom turn retried, then content → natural done:**

```typescript
it('retries a single phantom empty turn and completes when content follows', async () => {
  const phantomTurn = () =>
    chatResponse([thinkingChunk('processing...'), /* done with 0 tokens, no content */ doneChunk(0, 0)]);
  const goodTurn = () =>
    chatResponse([contentChunk('Chapter one.'), doneChunk(20, 5)]);
  const { stub, calls } = makeOllamaFetchStub({ chatQueue: [phantomTurn, goodTurn] });
  vi.stubGlobal('fetch', stub);

  await send(makeClient());

  // Phantom counted as a turn that didn't advance; two /api/chat calls
  // were made for the same turn index
  expect(calls.filter((c) => c.url.endsWith('/api/chat')).length).toBe(2);
  // Warning about the empty response
  expect(events.some((e) => e.type === 'warning' && /Empty model response/.test(e.message))).toBe(true);
  expect(events.at(-1)).toMatchObject({
    type: 'done',
    inputTokens: 20,
    outputTokens: 5,
    isMaxTurns: false,
  });
});
```

**Test B — three consecutive phantom turns → done with `isMaxTurns: true`:**

```typescript
it('exits as max-turns after MAX_CONSECUTIVE_EMPTY_TURNS phantom turns', async () => {
  const phantom = () => chatResponse([thinkingChunk('idle'), doneChunk(0, 0)]);
  const { stub, calls } = makeOllamaFetchStub({
    chatQueue: [phantom, phantom, phantom],
  });
  vi.stubGlobal('fetch', stub);

  await send(makeClient(), { maxTurns: 10 });
  // Three retries for the same turn (turn index 0 → 2 retries, third
  // strike breaks). Loop never advances past turn 0.
  expect(calls.filter((c) => c.url.endsWith('/api/chat')).length).toBe(3);
  const warnings = events.filter((e) => e.type === 'warning');
  expect(warnings.length).toBeGreaterThanOrEqual(3);
  expect(events.at(-1)).toMatchObject({
    type: 'done',
    isMaxTurns: true,
  });
});
```

Adjust the helper names to whatever the fixtures file exposes. If
`doneChunk(0, 0)` already produces a valid phantom chunk, use that inline.

## Verification

1. `npx tsc --noEmit` — no type errors. The `turn--` arithmetic needs
   `let turn` in the for loop; the existing `for (let turn = 0; ...)` already
   uses `let`, so this is safe.
2. `npm test -- src/infrastructure/ollama-cli/OllamaCodeClient.test.ts`
   — new tests pass; existing maxTurns test (line 233) still passes
   (model keeps calling tools, no phantom path triggered).
3. `npm test` — full suite green. AutoTurnResumer tests still pass — the
   phantom exit carries `isMaxTurns: true` and existing tests assert on
   `isMaxTurns: true` semantics.
4. Manual test optional: run `npm start`, send a message to an Ollama
   model whose context is near its limit so a 0-token response is likely
   to occur. The stream should now warn "Empty model response — retrying"
   before either retrying successfully or finishing with
   `isMaxTurns: true`, not silently end with
   `'No tool calls — agent loop complete'`.

## State Update

Update `prompts/session-program/program-032/STATE.md`:
- SESSION-02 → done, set `Completed` date.
- Handoff: "Added `MAX_CONSECUTIVE_EMPTY_TURNS = 3` detection to
  OllamaCodeClient's agent loop. Phantom empty turn (0 content + 0 tool
  calls) now emits a warning and retries the same turn up to 3 times;
  exceeds the bound → exits with `exitReason = 'max-turns'`. Existing
  natural-finish branch (contentText > 0) unchanged. Added two tests for
  retry-then-success and triple-phantom. SESSION-03 (AutoTurnResumer)
  can now rely on `isMaxTurns: true` being set for phantom-induced exits."