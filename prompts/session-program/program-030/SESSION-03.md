# SESSION-03 — Ollama & llama-server: flag max-turn exhaustion

> **Program:** Novel Engine
> **Feature:** auto-resume-max-turns
> **Modules:** M12 (ollama-cli), M13 (llama-server)
> **Depends on:** SESSION-01
> **Estimated effort:** 25 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M12 | ollama-cli | `src/infrastructure/ollama-cli/OllamaCodeClient.ts` | Multi-turn agent loop — needs exit-reason tracking |
| M12 | ollama-cli | `src/infrastructure/ollama-cli/OllamaCodeClient.test.ts` | Existing maxTurns test at line ~232 needs updating |
| M13 | llama-server | `src/infrastructure/llama-server/LlamaServerClient.ts` | Same multi-turn loop pattern |
| M13 | llama-server | `src/infrastructure/llama-server/LlamaServerClient.test.ts` | Existing maxTurns test at line ~208 needs updating |
| M01 | domain | `src/domain/types.ts` | Confirm `isMaxTurns` on `done` StreamEvent (added in SESSION-01) |

## Context

Both `OllamaCodeClient` and `LlamaServerClient` run an internal multi-turn agent
loop: `for (let turn = 0; turn < maxTurns; turn++)`. The loop can exit three ways:

1. **Natural completion** — the model returns no tool calls (`turnResult.toolCalls.length === 0`).
   The loop `break`s. This is a clean finish.
2. **Context ceiling** — estimated tokens exceed the hard ceiling after compaction.
   The loop `break`s. This is a graceful degradation, not max-turns.
3. **Max turns exhausted** — the loop condition `turn < maxTurns` becomes false
   naturally (no `break`). The model was still requesting tool calls on the last
   turn. This is the case we need to signal.

Currently, all three exit paths emit the same `done` event with no way to
distinguish them. We need to set `isMaxTurns: true` on the `done` event when
the loop exits due to max-turns exhaustion (exit reason 3).

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/infrastructure/ollama-cli/OllamaCodeClient.ts` | Modify | Track exit reason; set `isMaxTurns: true` on `done` when max-turns exhausted |
| `src/infrastructure/ollama-cli/OllamaCodeClient.test.ts` | Modify | Update maxTurns test to assert `isMaxTurns: true` |
| `src/infrastructure/llama-server/LlamaServerClient.ts` | Modify | Same pattern |
| `src/infrastructure/llama-server/LlamaServerClient.test.ts` | Modify | Same pattern |

## Implementation

### 1. OllamaCodeClient — track exit reason

Read `src/infrastructure/ollama-cli/OllamaCodeClient.ts` lines 369–543
(the multi-turn loop and the "Stream complete" section).

**1a. Add an exit-reason tracker before the loop:**

Before the `for` loop (line ~369), add:

```typescript
let hitMaxTurns = false;
```

**1b. Set `hitMaxTurns` when the loop exits at maxTurns:**

Inside the `for` loop, after the tool-call check and before executing tool calls,
detect if this is the last iteration. The simplest approach — set it right after
the "no tool calls" break check (line ~429), at the end of the loop body, or
simply check after the loop. But the cleanest approach is: default
`hitMaxTurns = true` before the loop, and set it to `false` on each break path
that is NOT max-turns.

Actually, the simplest reliable method: **after the loop, check if the last
turn had tool calls and the loop completed all iterations**. Use a boolean:

```typescript
let lastTurnHadToolCalls = false;

for (let turn = 0; turn < maxTurns; turn++) {
  // ... context ceiling check (existing) ...
  //   if (estimatedTokens > contextCeiling) {
  //     lastTurnHadToolCalls = false;  // NOT max turns
  //     break;
  //   }

  const turnResult = await this.streamOneTurn({ ... });

  // ... accumulate totals (existing) ...

  if (turnResult.toolCalls.length === 0) {
    lastTurnHadToolCalls = false;
    console.log(`[OllamaCodeClient] No tool calls — agent loop complete after ${turn + 1} turn(s)`);
    break;
  }
  lastTurnHadToolCalls = true;

  // ... execute tools (existing) ...
}

const hitMaxTurns = lastTurnHadToolCalls;
```

Wait — the context ceiling break happens **before** `streamOneTurn` on that
iteration, so `lastTurnHadToolCalls` is still whatever the previous iteration
set it to (likely `true` since the previous iteration had tool calls). We need
to set `lastTurnHadToolCalls = false` on the context ceiling break too. The
cleanest approach: use a typed exit reason.

**Preferred implementation:**

```typescript
type ExitReason = 'natural' | 'context-ceiling' | 'max-turns';
let exitReason: ExitReason = 'max-turns'; // default — loop completed without break

for (let turn = 0; turn < maxTurns; turn++) {
  // Context ceiling check:
  if (estimatedTokens > contextCeiling) {
    exitReason = 'context-ceiling';
    break;
  }

  const turnResult = await this.streamOneTurn({ ... });

  if (turnResult.toolCalls.length === 0) {
    exitReason = 'natural';
    break;
  }

  // ... execute tools ...
}

// exitReason is 'max-turns' only if no break was hit
```

Then at the `done` emission:

```typescript
if (!doneEmitted) {
  const thinkingTokens = Math.ceil(totalThinkingText.length / CHARS_PER_TOKEN);
  wrappedOnEvent({
    type: 'done',
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    thinkingTokens,
    filesTouched: tracker.getFileTouches(),
    isMaxTurns: exitReason === 'max-turns',
  });
}
```

**1c. Update the context-ceiling `break` statement to set `exitReason`:**

Find the context ceiling break (line ~397):

```typescript
if (estimatedTokens > contextCeiling) {
  console.warn(...);
  wrappedOnEvent({ type: 'status', message: `Context limit approaching...` });
  break;
}
```

Change to:

```typescript
if (estimatedTokens > contextCeiling) {
  exitReason = 'context-ceiling';
  console.warn(...);
  wrappedOnEvent({ type: 'status', message: `Context limit approaching...` });
  break;
}
```

**1d. Update the natural-completion `break`:**

Find (line ~429):

```typescript
if (turnResult.toolCalls.length === 0) {
  console.log(`[OllamaCodeClient] No tool calls — agent loop complete after ${turn + 1} turn(s)`);
  break;
}
```

Change to:

```typescript
if (turnResult.toolCalls.length === 0) {
  exitReason = 'natural';
  console.log(`[OllamaCodeClient] No tool calls — agent loop complete after ${turn + 1} turn(s)`);
  break;
}
```

### 2. OllamaCodeClient test — assert `isMaxTurns: true`

Read `src/infrastructure/ollama-cli/OllamaCodeClient.test.ts` line ~232:

```typescript
it('stops after maxTurns even while the model keeps requesting tools', async () => {
```

This test sends a model that keeps requesting tools until `maxTurns: 2` is hit.
After the change, the `done` event should have `isMaxTurns: true`.

Find where the test asserts the `done` event and add:

```typescript
expect(doneEvent).toMatchObject({ type: 'done', isMaxTurns: true });
```

Also verify that a natural completion (no tool calls) sets `isMaxTurns: false` or
omits it. If there's an existing test for natural completion, add an assertion.
If not, skip — the default behavior (no `isMaxTurns` when naturally done) is
covered by the type being optional.

### 3. LlamaServerClient — identical pattern

Read `src/infrastructure/llama-server/LlamaServerClient.ts` lines 257–434.

Apply the **exact same changes** as OllamaCodeClient:

**3a.** Add `let exitReason: ExitReason = 'max-turns';` before the loop.

**3b.** Set `exitReason = 'context-ceiling'` on the context ceiling break (line ~278).

**3c.** Set `exitReason = 'natural'` on the no-tool-calls break (line ~316).

**3d.** Add `isMaxTurns: exitReason === 'max-turns'` to the `done` event (line ~428).

If a local `ExitReason` type is needed, define it inline. It can be a simple
string literal union — no need for a shared domain type.

### 4. LlamaServerClient test — assert `isMaxTurns: true`

Read `src/infrastructure/llama-server/LlamaServerClient.test.ts` line ~208:

```typescript
it('stops at maxTurns while tools keep coming', async () => {
```

Same assertion pattern as Ollama — find the `done` event assertion and add:

```typescript
expect(doneEvent).toMatchObject({ type: 'done', isMaxTurns: true });
```

## Verification

1. `npx tsc --noEmit` — clean.
2. Run Ollama tests:
   ```bash
   npx vitest run src/infrastructure/ollama-cli/OllamaCodeClient.test.ts
   ```
3. Run Llama tests:
   ```bash
   npx vitest run src/infrastructure/llama-server/LlamaServerClient.test.ts
   ```
4. Confirm both maxTurns tests assert `isMaxTurns: true` on the `done` event.
5. Run full suite to ensure no regressions:
   ```bash
   npx vitest run src/infrastructure/
   ```

## State Update

Update `prompts/session-program/program-030/STATE.md`:
- SESSION-03 status → `done`, completion date
- Handoff note: confirm both Ollama and Llama set `isMaxTurns: true` on `done`
  when the loop exits at maxTurns. Context-ceiling and natural-completion exits
  do NOT set `isMaxTurns`. Tests pass.