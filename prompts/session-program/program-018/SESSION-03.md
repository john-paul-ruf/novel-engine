# SESSION-03 — Bounded Retry on Transient Stream Failure

> **Program:** Novel Engine
> **Feature:** codex-stream-error-hardening
> **Modules:** M01 (domain), M11 (codex-cli)
> **Depends on:** SESSION-02
> **Estimated effort:** ~30 minutes

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M01 | domain | `src/domain/constants.ts` (~lines 520–540, `MULTI_CALL_MAX_RETRIES` block) | New retry constants follow this JSDoc pattern |
| M11 | codex-cli | `src/infrastructure/codex-cli/CodexCliClient.ts` | Retry loop + abort tracking land here |

## Context

When Codex CLI exhausts its internal stream retries it exits with **no output** — today that
kills the whole Novel Engine turn (chapter expansion runs lose everything). The failure is often
transient (rate limit, network). The app already retries elsewhere
(`MULTI_CALL_MAX_RETRIES` in `src/application/MultiCallOrchestrator.ts` ~line 212), but that
lives in the application layer for pipeline steps. This retry belongs in the **provider**
(`M11`): it is a codex-specific transport failure, and `ChatService` must stay provider-agnostic.

Retry the whole `codex exec` spawn only when it is safe and likely to help.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/domain/constants.ts` | Modify | Add `CODEX_STREAM_RETRY_MAX` and `CODEX_STREAM_RETRY_DELAY_MS` with JSDoc |
| `src/infrastructure/codex-cli/CodexCliClient.ts` | Modify | Extract single attempt into `runCodexAttempt()`; wrap in retry loop in `sendMessage()`; track user aborts so they never retry |

## Implementation

Read both target files first — SESSION-01/02 changed `sendMessage()` internals.

### 1. Domain constants (`src/domain/constants.ts`)

Append near the `MULTI_CALL_*` retry constants, matching their JSDoc style:

```typescript
/**
 * Maximum number of automatic re-spawn attempts when the Codex CLI exits
 * after exhausting its internal model-stream retries without producing any
 * output. Only fully-empty failures are retried — if any assistant text
 * streamed or any file was touched, the run is NOT retried (avoids
 * duplicate writes into the book workspace).
 */
export const CODEX_STREAM_RETRY_MAX = 2;

/**
 * Base delay before a Codex stream retry. Attempt N waits N × this value
 * (linear backoff: 2s, then 4s).
 */
export const CODEX_STREAM_RETRY_DELAY_MS = 2000;
```

### 2. Restructure `sendMessage()` into attempt + loop

Extract the body from *workspace snapshot* through the `new Promise` block into a private
`runCodexAttempt(...)` returning a result the loop can classify:

```typescript
private async runCodexAttempt(/* existing params + shared closures via an options object */): Promise<CodexAttemptOutcome>

type CodexAttemptOutcome =
  | { kind: 'success' }
  | { kind: 'failure'; message: string; retryable: boolean };
```

Rules for the extraction:

- **Per-attempt state** (must reset each attempt): stdout/stderr buffers, `parseState`,
  `textBlockOpen`, `outputTextLength`, `terminalErrorMessage`, `lastStreamErrorMessage`,
  event-tail arrays, workspace snapshot, temp output dir.
- **Per-call state** (shared across attempts): `sessionId`, `tracker`
  (`StreamSessionTracker` sequence numbers must keep increasing across attempts),
  event batching (`wrappedOnEvent`, `flushBatch`), `doneEmitted`.
- Instead of rejecting inside the `close` handler, resolve with
  `{ kind: 'failure', message, retryable }`. Classification:

```typescript
const retryable =
  outputTextLength === 0 &&                    // nothing streamed to the UI
  Object.keys(tracker.getFileTouches()).length === 0 &&  // nothing written to disk
  !doneEmitted &&
  (lastStreamErrorMessage !== '' || (code === 0 && parsedJsonEventCount > 0));
```

  ENOENT (`CODEX_NOT_FOUND_MESSAGE`), workspace-plan errors, and stdin errors are
  `retryable: false`.

### 3. The retry loop in `sendMessage()`

```typescript
for (let attempt = 0; attempt <= CODEX_STREAM_RETRY_MAX; attempt++) {
  if (attempt > 0) {
    wrappedOnEvent({
      type: 'status',
      message: `Codex stream failed — retrying (${attempt}/${CODEX_STREAM_RETRY_MAX})...`,
    });
    await this.delay(attempt * CODEX_STREAM_RETRY_DELAY_MS);
    if (conversationId && this.abortedStreams.has(conversationId)) break; // user cancelled during backoff
  }
  const outcome = await this.runCodexAttempt(/* … */);
  if (outcome.kind === 'success') return;
  lastFailure = outcome;
  if (!outcome.retryable) break;
  if (conversationId && this.abortedStreams.has(conversationId)) break;
}
this.abortedStreams.delete(conversationId);
throw new Error(lastFailure.message);
```

- Add `private delay(ms: number): Promise<void>` (`setTimeout` wrapper).
- Emit the final `error` StreamEvent only once, after the loop decides to give up —
  move the `wrappedOnEvent({ type: 'error', … })` calls for retryable failures out of the
  `close` handler and into the loop's give-up path, so the UI does not show N error banners
  followed by success. Non-retryable failures may keep emitting immediately.

### 4. Abort tracking

`abortStream()` (~line 168) currently deletes the process entry; a retry loop would happily
respawn after the user hits Stop. Add:

- `private abortedStreams = new Set<string>();`
- In `abortStream()`: `this.abortedStreams.add(conversationId);` before killing.
- In `sendMessage()`: clear the flag for this `conversationId` at entry and on final exit
  (both success and give-up paths) so the set cannot leak across turns.

## Verification

1. `npx tsc --noEmit` — zero errors.
2. Grep: `CODEX_STREAM_RETRY_MAX` imported from `@domain/constants` (never a magic number);
   no `setTimeout` retry logic outside `delay()`.
3. Desk-check the incident trace: empty-output stream failure → attempt 2 after 2s status
   event → attempt 3 after 4s → final rejection message is SESSION-02's
   `Codex CLI stream failed after retries: <reason>` (or terminal-error variant).
4. Safety checks: (a) a run that already streamed text is **never** retried; (b) a run that
   touched files is **never** retried; (c) Stop during backoff spawns no new process.
5. Architecture compliance: constants in M01, logic in M11, no application-layer changes;
   dependency flow `DOMAIN <- INFRASTRUCTURE` preserved.

## State Update

In `prompts/session-program/program-018/STATE.md`: set SESSION-03 to `done`, record date,
note the chosen `CodexAttemptOutcome` shape, and write a Handoff Note summarizing the whole
feature for the Final Report (all three sessions complete the program).
