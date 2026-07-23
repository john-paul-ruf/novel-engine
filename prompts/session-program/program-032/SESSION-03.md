# SESSION-03 — AutoTurnResumer caps attempts + detects no-progress loops

> **Program:** Novel Engine
> **Feature:** fix-phantom-turns-renderer-reads
> **Modules:** M08 (application)
> **Depends on:** SESSION-02
> **Estimated effort:** 25 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M08 | `src/application/AutoTurnResumer.ts` | Full file — 242 lines | `while (true)` loop with no attempt cap; partial-text/files accumulation already present |
| M08 | `src/application/AutoTurnResumer.test.ts` | Existing test file | Need to assert attempt cap, no-progress guard, and existing forwarding tests still pass |
| M01 | `src/domain/types.ts` (via imports) | `FileTouchMap` shape and `StreamEvent` variants | Confirm `done`/`warning` event shapes match — the test mocks use them |

## Context

`src/application/AutoTurnResumer.ts` wraps an `IProviderRegistry` and
re-spawns a CLI call when the inner provider exits with `isMaxTurns: true`.
The class docstring at line 34 states: *"No cap on resume attempts — keeps
going until the task finishes naturally."*

In the crash log, this spiral was visible:
- Turn 5 of the original call hits a phantom empty turn (from SESSION-02, now
  correctly carried as `isMaxTurns: true`).
- AutoTurnResumer re-spawns with `+10` turns → hits another phantom → re-spawn → …

Without a hard cap, this can repeat indefinitely. The resumer also has no
notion of progress — if every attempt produces no new partial text and
touches no new files (which is exactly what happens during a phantom storm),
the resumer has no way to know and keeps looping.

Two new guards:
1. **Hard cap** = `MAX_RESUME_ATTEMPTS` (5). After the cap, emit a single
   merged `done` with `isMaxTurns: true` and a `warning` that the task
   exceeded the resume budget. Caller then stops.
2. **No-progress guard**. Track `filesTouched` and `partialText.length`
   across attempts. If two consecutive attempts add no new files AND no
   new partial text, the model is stuck on the same prompt — emit a
   `warning` and a merged `done` with `isMaxTurns: true`.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/application/AutoTurnResumer.ts` | Modify | Add `MAX_RESUME_ATTEMPTS` cap + no-progress detection |
| `src/application/AutoTurnResumer.test.ts` | Modify | Add tests for: (a) hard-cap-on-attempts, (b) no-progress guard (two zero-progress consecutive attempts) |

## Implementation

### 1. Read the existing resumer code fully

Read `src/application/AutoTurnResumer.ts` end-to-end. Note the loop body:

- Lines 60–65: per-attempt state is reset: `partialText`, `partialThinking`,
  `attemptInputTokens`, `attemptFilesTouched`.
- Line 70: `const currentMaxTurns = baseMaxTurns + (attempt - 1) * AUTO_RESUME_EXTRA_TURNS;`
  — turn budget grows by 10 each attempt.
- Lines 83–113: `wrappedOnEvent` accumulates `partialText` and
  `partialThinking` during the attempt and captures token/file totals on
  `done`/`error`.
- Lines 132–151: if `!maxTurnsExhausted`, this is a natural completion. Emit
  a single merged `done` and `return`.
- Lines 154–183: max-turns path — accumulate tokens, log, append an
  assistant/user "continue" message, and `params.onEvent({ type: 'maxTurnsResume', ... })`.

### 2. Add the `MAX_RESUME_ATTEMPTS` constant

Near the top of `src/application/AutoTurnResumer.ts` after line 20
(`AUTO_RESUME_EXTRA_TURNS`):

```typescript
/** Hard cap on resume attempts. After this, the resumer emits a final
 *  merged done (isMaxTurns: true) and stops. Five attempts yields a total
 *  turn budget of base + (10+20+30+40) = base + 100 turns — generous for
 *  a single chapter draft. */
const MAX_RESUME_ATTEMPTS = 5;

/** Consecutive zero-progress attempts that trigger a no-progress abort.
 *  "Zero progress" means: no new files touched AND no new partial text
 *  emitted relative to the previous attempt. Two is the smallest sample
 *  that distinguishes a one-off hiccup from a stuck model. */
const NO_PROGRESS_LIMIT = 2;
```

### 3. Track progress signals across attempts

Inside the outer `while (true)` loop, add two module-scoped tracking
variables declared **before** the loop (around line 60, right after the
`let attempt = 0;` line):

```typescript
let previousPartialTextLength = 0;
let previousFilesTouchedCount = 0;
let consecutiveNoProgressAttempts = 0;
```

(I.e. hoist them next to the existing `let attempt = 0;` at line 59.)

### 4. Implement the hard cap right after incrementing attempt

After `attempt++;` (line 69), add:

```typescript
if (attempt > MAX_RESUME_ATTEMPTS) {
  console.warn(
    `[AutoTurnResumer] Hit hard cap of ${MAX_RESUME_ATTEMPTS} resume attempts — stopping.`,
  );
  params.onEvent({
    type: 'warning',
    message: `Reached max resume attempts (${MAX_RESUME_ATTEMPTS}) — the task is taking too many turns. Stop and retry with a different prompt.`,
  });
  if (!doneEmitted) {
    params.onEvent({
      type: 'done',
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      thinkingTokens: totalThinkingTokens,
      filesTouched: allFilesTouched,
      isMaxTurns: true,
    });
  }
  return;
}
```

Check carefully: the existing loop accumulates `totalInputTokens` and the
other totals only in two places — inside the `!maxTurnsExhausted` branch and
after the `maxTurnsExhausted` branch (lines 154–157). At the moment we hit
the hard cap, the *previous* attempt's `attemptInputTokens/OutputTokens/
ThinkingTokens/FilesTouched` were already folded into the running totals
on the previous iteration's lines 154–157. So the totals emitted by the
hard-cap `done` represent all completed attempts so far.

Note: `let callStartForwarded = false;` at line 66 is a one-shot guard.
The hard-cap branch does not reset it — it just emits `done` and returns.
`doneEmitted` is used for the existing exit paths so we mirror that.

### 5. Implement the no-progress guard before re-spawning

After the hard cap check and after `maxTurnsExhausted` totals are accumulated
(line 157), but before logging/re-spawning (line 159), add the no-progress
detection. The current attempt just completed with max-turns; compare it to
the previous attempt to detect whether it produced any new work:

```typescript
// ── No-progress detection ──────────────────────────────────
const currentFilesTouchedCount = Object.keys(allFilesTouched).length;
const currentPartialTextLength = partialText.length;
const hasProgress =
  currentPartialTextLength > previousPartialTextLength ||
  currentFilesTouchedCount > previousFilesTouchedCount;

if (!hasProgress) {
  consecutiveNoProgressAttempts++;
} else {
  consecutiveNoProgressAttempts = 0;
}

previousPartialTextLength = currentPartialTextLength;
previousFilesTouchedCount = currentFilesTouchedCount;

if (consecutiveNoProgressAttempts >= NO_PROGRESS_LIMIT) {
  console.warn(
    `[AutoTurnResumer] No progress for ${consecutiveNoProgressAttempts} consecutive attempts — stopping.`,
  );
  params.onEvent({
    type: 'warning',
    message: `No progress across ${consecutiveNoProgressAttempts} resume attempts (no new text, no new files) — the model may be stuck. Stop and retry with a different prompt.`,
  });
  if (!doneEmitted) {
    params.onEvent({
      type: 'done',
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      thinkingTokens: totalThinkingTokens,
      filesTouched: allFilesTouched,
      isMaxTurns: true,
    });
  }
  return;
}
```

This placement matters: the detection must run *after* this attempt's
totals have been folded into the running totals (lines 154–157) and uses the
accumulator variables that already exist. It must run *before* the
re-spawn logging at line 159 (`console.log('[AutoTurnResumer] Max turns
exhausted...')`) — if we're aborting, we want to skip that log.

### 6. No changes to the natural-completion branch

The `if (!maxTurnsExhausted) { ... return; }` block at lines 132–151 is
unchanged. A natural completion is always progress — the provider stopped
calling tools and emitted text, so no no-progress counter should run there.

### 7. Update the class docstring

Update the JSDoc at lines 22–38 (specifically line 34) to reflect the new
behavior:

```typescript
/**
 * AutoTurnResumer — transparent wrapper around IProviderRegistry that
 * auto-resumes CLI calls when the max-turns limit is reached.
 *
 * When a provider emits `done` or `error` with `isMaxTurns: true`, this
 * wrapper suppresses the terminal event, captures the partial assistant
 * text, and re-spawns the call with:
 *   - The original messages + the partial assistant output + a "continue" instruction
 *   - A higher turn budget (original + AUTO_RESUME_EXTRA_TURNS per attempt)
 *   - A fresh sessionId (for DB orphan-recovery tracking)
 *
 * Safety valves:
 *   - `MAX_RESUME_ATTEMPTS` (5) — hard cap on resume attempts before
 *     stopping with `isMaxTurns: true`.
 *   - `NO_PROGRESS_LIMIT` (2) — if consecutive attempts produce no new
 *     partial text and no new file touches, stop with `isMaxTurns: true`.
 *
 * Token usage and file touches are accumulated across all attempts and emitted
 * in a single merged `done` event when the task finally completes.
 */
```

### 8. Add tests in AutoTurnResumer.test.ts

Open `src/application/AutoTurnResumer.test.ts` and read the existing
`makeMockRegistry`/`describe('AutoTurnResumer')` pattern (lines 1–199).
Add two new tests inside the existing `describe` block:

**Test A — hard cap on resume attempts:**

```typescript
it('stops after MAX_RESUME_ATTEMPTS resume attempts and emits a merged done (isMaxTurns: true)', async () => {
  const events: StreamEvent[] = [];
  let callCount = 0;
  const inner = makeMockRegistry({
    onSend: (onEvent) => {
      callCount++;
      onEvent({ type: 'textDelta', text: 'work' });
      onEvent({ type: 'done', inputTokens: 1, outputTokens: 1, thinkingTokens: 0, filesTouched: {}, isMaxTurns: true });
      return Promise.resolve();
    },
  });
  const resumer = new AutoTurnResumer(inner);

  await resumer.sendMessage({
    model: 'test-model',
    systemPrompt: 'sys',
    messages: [{ role: 'user', content: 'do work' }],
    maxTokens: 4096,
    maxTurns: 30,
    conversationId: 'conv-1',
    onEvent: (e) => events.push(e),
  });

  // 1 initial call + MAX_RESUME_ATTEMPTS resumes = 6 calls total
  expect(callCount).toBe(MAX_RESUME_ATTEMPTS + 1);
  const warnings = events.filter((e) => e.type === 'warning');
  expect(warnings.some((w) => /max resume attempts/.test(w.message))).toBe(true);
  const done = events.find((e) => e.type === 'done');
  expect(done).toBeDefined();
  expect((done as { isMaxTurns?: boolean }).isMaxTurns).toBe(true);
  // No further resume events after the cap
  const resumeEvents = events.filter((e) => e.type === 'maxTurnsResume');
  expect(resumeEvents.length).toBe(MAX_RESUME_ATTEMPTS);
});
```

Import `MAX_RESUME_ATTEMPTS` from the module if not already exported — or
just inline the literal `6` if the resumer doesn't export the constant.
Prefer an export: add `export` to the constant in `AutoTurnResumer.ts` so
the test can reference it without magic numbers.

**Test B — no-progress abort after two consecutive zero-progress attempts:**

```typescript
it('aborts after NO_PROGRESS_LIMIT consecutive attempts with no new text or files', async () => {
  const events: StreamEvent[] = [];
  let callCount = 0;
  const inner = makeMockRegistry({
    onSend: (onEvent) => {
      callCount++;
      // Every attempt emits *nothing* — no text delta, no file touches.
      onEvent({ type: 'done', inputTokens: 1, outputTokens: 0, thinkingTokens: 0, filesTouched: {}, isMaxTurns: true });
      return Promise.resolve();
    },
  });
  const resumer = new AutoTurnResumer(inner);

  await resumer.sendMessage({
    model: 'test-model',
    systemPrompt: 'sys',
    messages: [{ role: 'user', content: 'do work' }],
    maxTokens: 4096,
    maxTurns: 30,
    conversationId: 'conv-1',
    onEvent: (e) => events.push(e),
  });

  // Initial attempt + NO_PROGRESS_LIMIT (2) zero-progress resumes = 3 calls.
  expect(callCount).toBe(NO_PROGRESS_LIMIT + 1);
  const warnings = events.filter((e) => e.type === 'warning');
  expect(warnings.some((w) => /No progress across 2/.test(w.message))).toBe(true);
  const done = events.find((e) => e.type === 'done');
  expect(done).toBeDefined();
  expect((done as { isMaxTurns?: boolean }).isMaxTurns).toBe(true);
});
```

If `NO_PROGRESS_LIMIT` isn't exported either, export it. Both exports make
the tests deterministic regardless of future tuning.

### 9. Ensure existing tests still pass

Existing tests at `AutoTurnResumer.test.ts:99` (`'auto-resumes when done has
isMaxTurns: true (Ollama/Llama pattern)'`) and the `callStart` forwarding
test at line 167 use the same `makeMockRegistry` with controlled `done`
events. They should still pass — the new caps don't trigger for
two-iteration tests. Verify by running the test file after editing.

One fragile area: the test at line 62 (`'auto-resumes when error has
isMaxTurns: true, then forwards done'`) sends a partial text `'partial
work'` on the first attempt — that's "progress", so
`consecutiveNoProgressAttempts` resets. The second attempt emits
`' finished'` and then a normal `done` — also progress. Test passes as
before. The hard-cap check (`attempt > MAX_RESUME_ATTEMPTS`) only triggers
if the inner provider keeps returning `isMaxTurns: true` for 6+ attempts,
which these tests don't do.

## Verification

1. `npx tsc --noEmit` — no type errors. The new variables are typed
   implicitly (`let previousPartialTextLength = 0;` is `number`).
2. `npm test -- src/application/AutoTurnResumer.test.ts` — both new tests
   pass and all existing tests still pass.
3. `npm test` — full suite green.
4. Check that no other caller of `IProviderRegistry.sendMessage` depends on
   the unbounded behavior. Search for callers of `resumer.sendMessage` or
   any code that commented on the unbounded nature — only `ChatService`
   (and indirectly `autoDraftStore`) call into the registry, and they all
   handle `done` events generically.

## State Update

Update `prompts/session-program/program-032/STATE.md`:
- SESSION-03 → done, set `Completed` date.
- Handoff: "Capped AutoTurnResumer at MAX_RESUME_ATTEMPTS = 5 resume
  attempts. Added no-progress guard: 2 consecutive attempts with zero new
  partial text and zero new file touches trigger stop. Both new branches
  emit warning + merged done (isMaxTurns: true). Exported the constants so
  tests reference them by name. SESSION-04 (autoDraftStore) can now rely on
  the resumer being bounded — needed for the outer time budget."