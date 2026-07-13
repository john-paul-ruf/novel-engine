# SESSION-01 — Treat Error `result` Events as Errors in ClaudeCodeClient

> **Program:** Novel Engine
> **Feature:** query-research-failure-handling
> **Modules:** M06 (claude-cli)
> **Depends on:** none
> **Estimated effort:** 20 minutes

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M06 | claude-cli | `src/infrastructure/claude-cli/ClaudeCodeClient.ts` | Owns the fix |
| M06 | claude-cli | `src/infrastructure/claude-cli/StreamSessionTracker.ts` | Flag plumbing |
| M01 | domain | `src/domain/types.ts` (StreamEvent union) | Verify `error` event shape |

## Context

The Claude CLI (`--print --output-format stream-json`) emits a final `result` NDJSON
event even when the run **fails** — e.g. `subtype: "error_max_turns"` or
`subtype: "error_during_execution"` with `is_error: true` — and then exits with
code 1. `processStreamEvent` (around `src/infrastructure/claude-cli/ClaudeCodeClient.ts:461`)
currently treats ANY `result` event as success:

1. It emits the result text as a `textDelta` (polluting the response buffer with an
   error/partial narration), and
2. It emits a `done` event, which fires ChatService's `onDone` hook → post-stream file
   extraction runs and auto-saves garbage into pipeline output files (this corrupted
   `source/query-tracker.md` in the reported bug).

The process `close` handler (code=1 branch, ~line 383) then emits a second, correct
`error` event — but by then the damage is done.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/infrastructure/claude-cli/ClaudeCodeClient.ts` | Modify | Detect error results in `processStreamEvent`; emit `error` instead of `done`/`textDelta` |
| `src/infrastructure/claude-cli/StreamSessionTracker.ts` | Modify | Add `hasErrorResult` flag (getter + marker) |

## Implementation

### 1. Read the `result` branch of `processStreamEvent`

Read `src/infrastructure/claude-cli/ClaudeCodeClient.ts` — specifically the
`if (eventType === 'result')` block (~line 461) and the `close` handler (~line 333)
to understand `doneEmitted` and the code≠0 error path. Read
`src/infrastructure/claude-cli/StreamSessionTracker.ts` and follow its existing
getter/marker naming convention (`getHasEmittedText` / `markTextEmitted`).

### 2. Detect error results

At the TOP of the `result` branch, before any event emission, add:

```typescript
// The CLI emits a `result` event even on failure (subtype
// "error_max_turns" / "error_during_execution", is_error: true) and then
// exits non-zero. Treating those as success previously emitted a `done`
// event, which triggered ChatService's post-stream extraction and
// auto-saved partial narration into pipeline output files.
const subtype = event.subtype as string | undefined;
const isErrorResult =
  event.is_error === true || (subtype !== undefined && subtype !== 'success');
if (isErrorResult) {
  tracker.markErrorResult();
  const resultText = typeof event.result === 'string' ? event.result.trim() : '';
  const message = resultText
    ? `Claude CLI run failed (${subtype ?? 'error'}): ${resultText}`
    : `Claude CLI run failed (${subtype ?? 'error'})`;
  console.error(
    `[ClaudeCodeClient] Error result event: subtype=${subtype ?? '(none)'}, ` +
    `is_error=${event.is_error === true}`,
  );
  onEvent({ type: 'error', message });
  return;
}
```

Key behaviors:
- Do **not** emit the result text as `textDelta` on error results.
- Do **not** emit `done` — the `close` handler's non-zero-exit branch remains the
  authority for rejecting the promise. (`doneEmitted` stays false, which is correct:
  the code-0 synthetic-done fallback only runs when `code === 0`.)

### 3. Add the flag to StreamSessionTracker

```typescript
private hasErrorResult = false;

markErrorResult(): void {
  this.hasErrorResult = true;
}

getHasErrorResult(): boolean {
  return this.hasErrorResult;
}
```

### 4. Avoid duplicate error events on close

In the `close` handler's `code !== 0` branch (~line 383): if
`tracker.getHasErrorResult()` is true, still log the `CLI failed` diagnostics and
still `settle(() => reject(new Error(message)))`, but skip the second
`wrappedOnEvent({ type: 'error', message })` — the user already saw the richer
error-result message.

## Verification

```bash
npx tsc --noEmit
```

- Grep check: `grep -n "isErrorResult" src/infrastructure/claude-cli/ClaudeCodeClient.ts` shows the guard before the `done` emission.
- Architecture compliance: change stays inside M06; no new imports from application/renderer layers.
- Manual (if running app): trigger any agent with an absurdly low `--max-turns` and confirm the UI receives a single `error` event and no `done`.

## State Update

Update `prompts/session-program/program-023/STATE.md`: set SESSION-01 status to `done`,
add completion date, note the tracker-flag approach chosen, and any deviations in
Handoff Notes.
