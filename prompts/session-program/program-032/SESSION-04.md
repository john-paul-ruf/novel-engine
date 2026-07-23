# SESSION-04 — autoDraftStore time budget + no-progress retry cap

> **Program:** Novel Engine
> **Feature:** fix-phantom-turns-renderer-reads
> **Modules:** M10 (renderer/stores)
> **Depends on:** SESSION-03
> **Estimated effort:** 25 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M10 | `src/renderer/stores/autoDraftStore.ts` | Full file — 576 lines | Add time budget and no-progress retry counter; understand the chapter loop, the `patch()` helper, and the existing pause/resume flow |
| M10 | `src/renderer/stores/autoDraftStore.test.ts` | Existing test file — 290 lines | Mirror `installNovelEngineMock`/`resetStoresBeforeEach` pattern; assert new pause reasons |
| M10 | `src/renderer/stores/chatStore.ts` | Note `useChatStore.getState()` usage | Ensure no changes needed — this session only adds bookkeeping to autoDraftStore |

## Context

`src/renderer/stores/autoDraftStore.ts` runs the Chapter loop (`while
(!stopRequested && iteration < MAX_ITERATIONS)` at line 287). Each iteration:

1. Sends `AUTO_DRAFT_PROMPT` to Verity via the IPC bridge (line 319).
2. After `POST_SEND_SETTLE_MS`, counts chapters and assistant messages.
3. Branches on outcome:
   - `countAfter > countBefore` — wrote a chapter. Audit/fix, then loop
     again.
   - `!gotResponse` — CLI error. Pauses with "CLI error — no response
     received".  Resume/stop as user decides.
   - `isDraftComplete` — done. Break.
   - **else** — "Verity did prep work. Retry." Retry indefinitely
     (line 488–491).

The "prep work" branch is the unbounded case in the crash log: the model
returned something but didn't write a chapter, and the store just kept
retrying. When SESSION-02 (phantom turn) and SESSION-03 (capped resumer)
are in place, the model will eventually exit as `isMaxTurns: true` and
AutoTurnResumer will stop it. But the outer autodraft still doesn't know
about time or cumulative progress.

Two additions:
1. **Time budget**: `MAX_AUTO_DRAFT_DURATION_MS = 4h` hard cap on the entire
   run. Captured at `start()`, checked at the top of each iteration. Exceeding
   the budget pauses with a resume-able reason, not a hard error — the user
   may want to continue past the soft cap.
2. **No-progress retry cap**: `MAX_NO_PROGRESS_RETRIES = 3` consecutive
   iterations in the "prep work" branch before pausing with a reason.
   Counter resets on the happy path (new chapter written).

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/renderer/stores/autoDraftStore.ts` | Modify | Add time-budget check + no-progress retry counter |
| `src/renderer/stores/autoDraftStore.test.ts` | Modify | Add tests for both guards |

## Implementation

### 1. Read the store fully

Read `src/renderer/stores/autoDraftStore.ts` end-to-end. Note:
- `MAX_ITERATIONS = 150` at line 24.
- `MOTIF_AUDIT_CADENCE = 3` at line 27; `INTER_CHAPTER_DELAY_MS`,
  `POST_SEND_SETTLE_MS` at lines 38, 47.
- `defaultSession()` at lines 83–96 and `AutoDraftSession` type — fields the
  store tracks per book.
- The loop at lines 285–492, including the four-way branch at the end.
- `patch()` at line 224 and `session()` at line 221 — session-scoped helpers.

### 2. Add the two new constants

Near the existing constants at the top (after line 47, alongside
`POST_SEND_SETTLE_MS`):

```typescript
/** Hard cap on total auto-draft run duration. Acts as a safety valve so an
 *  unattended run that keeps hitting the resumer's bounded caps cannot
 *  churn forever. Pauses on exceedance — the user can resume to continue.
 *  4h mirrors a long writing session; user-driven, not performance-tuned. */
const MAX_AUTO_DRAFT_DURATION_MS = 4 * 60 * 60 * 1000;

/** Consecutive iterations that return no new chapter (and aren't
 *  DRAFT_COMPLETE) before the loop pauses for a user decision. Catches
 *  "Verity did prep work but no actual chapter" loops that could otherwise
 *  run until MAX_ITERATIONS. */
const MAX_NO_PROGRESS_RETRIES = 3;
```

### 3. Track start time and no-progress count in the session state

Extend the `AutoDraftSession` type (lines 51–81) with two new fields:

```typescript
type AutoDraftSession = {
  // ... existing fields ...
  /** Timestamp (Date.now()) when the run started. Used for the time budget. */
  startedAt: number | null;
  /** Consecutive iterations that produced no new chapter. Reset on chapter written. */
  noProgressCount: number;
};
```

Update `defaultSession()` (lines 83–96) to include them:

```typescript
function defaultSession(): AutoDraftSession {
  return {
    isRunning: false,
    isPaused: false,
    pauseReason: null,
    stageLabel: null,
    chaptersWritten: 0,
    conversationId: null,
    error: null,
    skippedAudits: [],
    stopRequested: false,
    _resumeResolve: null,
    startedAt: null,
    noProgressCount: 0,
  };
}
```

### 4. Set `startedAt` when the session is created

In `start()` (lines 203–218) — where the initial session is constructed,
set `startedAt`. The initialization block currently looks like:

```typescript
set((state) => ({
  sessions: {
    ...state.sessions,
    [bookSlug]: {
      ...defaultSession(),
      isRunning: true,
    },
  },
}));
```

Change to:

```typescript
set((state) => ({
  sessions: {
    ...state.sessions,
    [bookSlug]: {
      ...defaultSession(),
      isRunning: true,
      startedAt: Date.now(),
    },
  },
}));
```

### 5. Check the time budget at the top of each iteration

Inside the `while` loop (line 287+), before the existing first-line
iteration work, add:

```typescript
while (!session()?.stopRequested && iteration < MAX_ITERATIONS) {
  // ── Time budget check ───────────────────────────────────
  const startedAt = session()?.startedAt;
  if (startedAt !== null && startedAt !== undefined && Date.now() - startedAt > MAX_AUTO_DRAFT_DURATION_MS) {
    const elapsedH = Math.floor((Date.now() - startedAt) / (60 * 60 * 1000));
    await new Promise<void>((resolve) => {
      patch({
        isPaused: true,
        pauseReason: `Time budget reached (${elapsedH}h) — resume to continue or stop`,
        _resumeResolve: resolve,
      });
    });
    patch({ isPaused: false, pauseReason: null, _resumeResolve: null });
    if (session()?.stopRequested) break;
    // After resume, reset startedAt so the budget restarts
    patch({ startedAt: Date.now() });
  }

  iteration++;
  // ... existing iteration body ...
}
```

Place the check so it runs *before* the existing `iteration++;` increment
(line 288). After a user resumes, `startedAt` is reset — the budget
restarts. That's intentional (the soft cap gives the user a checkpoint
to continue or stop; we don't want a single 8h session to require 4
resume clicks).

### 6. Track no-progress retries in the "prep work" branch

Find the "Verity did prep work. Retry." branch at lines 488–491:

```typescript
} else if (isDraftComplete) {
  // ✓ All chapters written
  break;
} else {
  // Got a response but no new chapter — Verity did prep work. Retry.
  await delay(INTER_CHAPTER_DELAY_MS);
}
```

Replace with a counter that pauses after `MAX_NO_PROGRESS_RETRIES`:

```typescript
} else if (isDraftComplete) {
  // ✓ All chapters written
  break;
} else {
  // Got a response but no new chapter — Verity did prep work. Retry,
  // but cap how many times we'll keep retrying without progress so the
  // user gets a chance to intervene if the model is stuck.
  const newCount = (session()?.noProgressCount ?? 0) + 1;
  patch({ noProgressCount: newCount });

  if (newCount >= MAX_NO_PROGRESS_RETRIES) {
    await new Promise<void>((resolve) => {
      patch({
        isPaused: true,
        pauseReason: `Verity produced no new chapter after ${newCount} attempts — the model may be stuck. Resume to retry or stop.`,
        _resumeResolve: resolve,
      });
    });
    patch({ isPaused: false, pauseReason: null, _resumeResolve: null, noProgressCount: 0 });
    if (session()?.stopRequested) break;
  } else {
    await delay(INTER_CHAPTER_DELAY_MS);
  }
}
```

### 7. Reset `noProgressCount` on real progress

In the successful "wrote a chapter" branch (lines 349–469), find a good
spot to reset the counter. After `patch({ chaptersWritten: ... })`
(line 352), add:

```typescript
patch({
  chaptersWritten: (session()?.chaptersWritten ?? 0) + newChapters,
  noProgressCount: 0,
});
```

Either update the existing `patch` call to include `noProgressCount: 0`
or add a second `patch`. Both work; the single-patch is cleaner.

### 8. Tests

Open `src/renderer/stores/autoDraftStore.test.ts` and inspect the existing
helpers (`installNovelEngineMock`, `makeConversation`, `makeMessage`,
`resetStoresBeforeEach`).

**Test A — time budget pauses after `MAX_AUTO_DRAFT_DURATION_MS`:**

```typescript
it('pauses when the time budget is exceeded and resets the budget on resume', async () => {
  mock.chat.getConversations.mockResolvedValue([verityConvo]);
  mock.books.wordCount.mockResolvedValue(chapters('01-one'));
  // Force the time budget: provide an initial startedAt far in the past.
  mock.chat.getMessages.mockResolvedValue([draftCompleteMsg]);

  // Mount the session with an artificially old start time, then start.
  useAutoDraftStore.setState({
    sessions: { [BOOK]: { ...defaultSessionButOld(), startedAt: Date.now() - (4 * 60 * 60 * 1000) - 1, isRunning: false } },
  });

  // Use vi.useFakeTimers? Or patch MAX_AUTO_DRAFT_DURATION_MS via vi.mock?
  // Simpler: set the active session's startedAt to a past time before the
  // first iteration. `start()` resets it via patch at line 216 — so set it
  // via the store's `start` initialization instead.
  // The cleanest approach: import MAX_AUTO_DRAFT_DURATION_MS and use
  // vi.useFakeTimers OR cause start to land a past startedAt by overriding
  // Date.now during the first iteration.
}, 15_000);
```

There's a wrinkle: `start()` resets `startedAt: Date.now()` at the
session init. To test the budget, either:
- **Option 1**: Use `vi.useFakeTimers()` and advance the clock after
  the loop enters its first iteration.
- **Option 2**: Make `MAX_AUTO_DRAFT_DURATION_MS` configurable at module
  load via a getter / exported check function.

Recommended approach — **Option 1**: Set `vi.useFakeTimers({ now:
Date.now() })` before `start()`, await the first cloned mock resolution
(making the first iteration's `countAfter === countBefore` and
response != `DRAFT_COMPLETE` → the no-progress branch is entered, then
the next iteration enters with the clock advanced 4h+) and assert the
session pauses with the expected reason.

A simpler but less rigorous approach: export `MAX_AUTO_DRAFT_DURATION_MS`
so tests can `vi.mock` the module with a tiny value (e.g. 100ms) and
verify the pause fires. If using `vi.mock` is awkward because of the
Zustand store wiring, use `vi.spyOn(Date, 'now')` to return a future
timestamp for the check. 

Whichever approach fits the repo's existing test patterns: assert that
`session.isPaused === true` and `pauseReason` matches
`/Time budget reached/`. Then call `useAutoDraftStore.getState().resume(BOOK)`
and assert the loop continues (budget reset, no more pause).

**Test B — no-progress retry cap pauses after `MAX_NO_PROGRESS_RETRIES`:**

```typescript
it('pauses when the model produces no new chapter for MAX_NO_PROGRESS_RETRIES consecutive iterations', async () => {
  mock.chat.getConversations.mockResolvedValue([verityConvo]);
  mock.books.wordCount.mockResolvedValue(chapters('01-one')); // never grows
  const prepMsg = makeMessage({ id: 'prep', content: 'I updated notes only.', conversationId: 'ad-conv' });
  mock.chat.getMessages.mockResolvedValue([prepMsg]); // gotResponse=true, no DRAFT_COMPLETE

  const run = useAutoDraftStore.getState().start(BOOK);

  await vi.waitFor(() => expect(useAutoDraftStore.getState().getSession(BOOK)?.isPaused).toBe(true), { timeout: 3000 });
  expect(useAutoDraftStore.getState().getSession(BOOK)?.pauseReason).toMatch(
    /no new chapter after \d+ attempts — the model may be stuck/,
  );

  useAutoDraftStore.getState().stop(BOOK);
  await run;
}, 10_000);
```

This mirrors the existing `'pauses on a CLI error'` test but mocks
`wordCount` to a constant list (no new chapter) and `getMessages` to
always return a non-DRAFT_COMPLETE assistant message. After 3 iterations,
the loop pauses with the expected reason. We then stop and await the
run.

**Ensure existing tests still pass:** The `defaultSession()` change adds
two fields. The existing `reset` test at line 267 only checks the session
is gone after reset, which still holds. The `reconnect` test at line 235
constructs a `runningSession` literal — it needs to include the new
fields or TypeScript will complain when the test compiles. Add
`startedAt: Date.now(), noProgressCount: 0` to that literal (or use
`defaultSession()` if the module exports it — currently it doesn't, so
extend the inline object). Carefully check any other inline session
literals in the test file and update them.

### 9. No other behavior changes

- The "happy" branch (chapter written) and the existing `!gotResponse`
  pause branch are untouched.
- The `DRAFT_COMPLETE` exit branch is untouched.
- `reset` / `stop` / `resume` are unchanged — the new fields are handled
  by `defaultSession()` initialization.
- No changes to chatStore, IPC, or the preload bridge.

## Verification

1. `npx tsc --noEmit` — no type errors. The two new `AutoDraftSession`
   fields extend the type; all inline literals in the test file must
   include them.
2. `npm test -- src/renderer/stores/autoDraftStore.test.ts` — both new
   tests pass and existing tests pass.
3. `npm test` — full suite green.
4. Manual test (optional): Run `npm start`, start auto-draft on a book
   with the Ollama model whose context is large enough to encourage
   phantom turns / stalls. After several iterations that produce no new
   chapters, the UI should pause with the "model may be stuck" reason;
   resume should reset the counter and keep going. (Hard to reproduce
   the time budget manually; rely on the unit test.)

## State Update

Update `prompts/session-program/program-032/STATE.md`:
- SESSION-04 → done, set `Completed` date.
- Handoff: "Added `MAX_AUTO_DRAFT_DURATION_MS` (4h) time budget and
  `MAX_NO_PROGRESS_RETRIES` (3) iteration cap to autoDraftStore. Time
  budget pauses with a resume/reset-budget continuation. No-progress cap
  in the 'prep work' branch. Extended `AutoDraftSession` with `startedAt`
  and `noProgressCount`. Updated existing inline-session test literals.
  End of program — all four sessions complete."