# SESSION-02 — Surface Real Codex Errors (stream_error vs terminal error)

> **Program:** Novel Engine
> **Feature:** codex-stream-error-hardening
> **Modules:** M11 (codex-cli)
> **Depends on:** SESSION-01
> **Estimated effort:** ~25 minutes

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M11 | codex-cli | `src/infrastructure/codex-cli/CodexCliClient.ts` | All changes land here |

## Context

The triggering incident (see `input-files/codex-stream-error-report.md`): the stream failed with
`stream_error` ×5 → `error`, yet the user saw *"Codex CLI exited without assistant output or
usage"* plus a raw diagnostic dump. Two causes:

1. `extractError()` (~line 868) reads only top-level keys, so 0.27.0's
   `{"msg":{"type":"stream_error","message":"<real reason>"}}` never set `terminalErrorMessage`
   — the `code === 0 && terminalErrorMessage` branch (~line 414) that produces the good
   *"Codex CLI reported an error: …"* summary was never taken.
2. `stream_error` is a **transient** notice (the CLI retries internally); it must not be
   conflated with the terminal `error` event, and its message must survive into the exit
   diagnostics when the CLI ultimately gives up.

SESSION-01 added `unwrapCodexEvent()` and made `extractStatus()` skip `*error*` types — this
session gives errors their real handling.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/infrastructure/codex-cli/CodexCliClient.ts` | Modify | Envelope-aware `extractError()`; new `extractStreamError()`; `stream_error` → status event + recorded message; `lastStreamErrorMessage` in exit diagnostics and summaries |

## Implementation

Read the current file first — SESSION-01 changed `processOutputLine()` signatures and parse state.

### 1. Split transient from terminal: `extractStreamError()`

New private method:

```typescript
/** Transient model-stream failure (the CLI retries internally). Returns its message, or ''. */
private extractStreamError(event: Record<string, unknown>): string {
  for (const candidate of this.unwrapCodexEvent(event)) {
    const type = (this.getString(candidate, 'type') ?? '').toLowerCase();
    if (type === 'stream_error') {
      return this.getString(candidate, 'message') ?? this.getString(candidate, 'msg') ?? 'stream error';
    }
  }
  return '';
}
```

### 2. Make `extractError()` envelope-aware — terminal errors only

Rewrite to iterate `this.unwrapCodexEvent(event)` and apply the existing per-record logic
(`error` string/record, `type`/`level` containing `error`, error-typed `item`) to each candidate,
returning the first hit. Two changes to the logic itself:

- Skip candidates whose `type === 'stream_error'` (transient — handled above).
- Keep top-level-first ordering so newer flat protocols behave exactly as before.

### 3. Route the two classes differently in `processOutputLine()`

At the top of the parsed-JSON path (currently the `extractError` block, ~line 561):

```typescript
const streamErrorMessage = this.extractStreamError(parsed);
if (streamErrorMessage) {
  onEvent({ type: 'status', message: `Model stream error (Codex retrying): ${streamErrorMessage}` });
  return { parsedJson: true, eventSummary, rawJsonSnippet, streamErrorMessage, emittedText: false, emittedUsageDone: false };
}
```

- Add `streamErrorMessage?: string` to `CodexLineResult`.
- In `applyLineResult()` (~line 371), record it into a new closure variable
  `lastStreamErrorMessage` in `sendMessage()`.
- Terminal errors keep today's behavior (emit `error` event, set `terminalErrorMessage`) — but
  now they actually fire for 0.27.0 envelopes, so the final `error` event of the incident trace
  will populate `terminalErrorMessage` with the real reason.

### 4. Put the stream error into exit diagnostics

In `buildCodexExitMessage()` (~line 790):

- Add `lastStreamErrorMessage: string` to its params; append
  `streamError=<message>` after `lastStatus` when non-empty.
- Update all four call sites in the `close` handler to pass it.

In the `close` handler summaries:

- The empty-output branch (~line 466): when `lastStreamErrorMessage` is set and
  `terminalErrorMessage` is not, use summary
  `` `Codex CLI stream failed after retries: ${lastStreamErrorMessage}` `` instead of the generic
  *"exited without assistant output or usage."*
- The nonzero-exit branch (~line 507): same preference order —
  `terminalErrorMessage` → `lastStreamErrorMessage` → generic.

### 5. Do not fail successful runs over transient blips

Guard: if output text **was** emitted (or files were touched) and the process exits 0, a recorded
`lastStreamErrorMessage` must not change the success path — it only enriches diagnostics on
failure. Verify the success branch (~lines 433–505) is untouched by this session apart from
passing the new param through.

## Verification

1. `npx tsc --noEmit` — zero errors.
2. Grep: `stream_error` appears in `extractStreamError` only (not in `extractError`'s accept path);
   all `buildCodexExitMessage` call sites pass `lastStreamErrorMessage`.
3. Trace replay (desk-check): feed the incident's event sequence mentally —
   `task_started > stream_error ×5 > error` with exit 0 → expected outcome:
   5 `status` events, `terminalErrorMessage` set from the final `error` envelope, rejection
   message starts with `Codex CLI reported an error: <real reason>`.
4. Architecture compliance: no new imports; error strings propagate via existing `StreamEvent`
   union — no domain type changes.

## State Update

In `prompts/session-program/program-018/STATE.md`: set SESSION-02 to `done`, record date, and
add a Handoff Note stating how `lastStreamErrorMessage` is exposed (SESSION-03's retry
classification consumes it).
