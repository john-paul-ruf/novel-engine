# FIX-05 — Add logging for silent error paths in ClaudeCodeClient

> **Issue(s):** 3.4, 3.5
> **Severity:** 🟡 Medium
> **Category:** Error Handling
> **Effort:** Low
> **Depends on:** Nothing

---

## Objective

Two error paths in `ClaudeCodeClient` silently swallow failures with zero diagnostics:

1. **EPIPE/ERR_STREAM_DESTROYED on stdin (line 213-216):** When the CLI exits before stdin is fully written, the error is silently returned. The `close` event usually fires with a non-zero code, but the EPIPE itself leaves no trace — making it harder to debug CLI startup failures.

2. **Stream event persistence failures (line 131-142):** Every stream event is persisted to SQLite. If the DB write fails (disk full, locked), the error is silently caught. If the DB enters a degraded state, EVERY event fails with zero indication. The best-effort policy is correct — but logging the first failure per stream would provide essential diagnostics.

This fix adds minimal, non-disruptive logging to both paths.

---

## Findings Addressed

| # | Issues.md Ref | Title | Severity |
|---|---------------|-------|----------|
| 1 | 3.4 | EPIPE guard on stdin silently swallows errors without logging | 🟡 Medium |
| 2 | 3.5 | wrappedOnEvent catches all DB persistence errors silently | 🟡 Medium |

---

## Files to Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/infrastructure/claude-cli/ClaudeCodeClient.ts` | Modify | Add console.warn for EPIPE, add first-failure logging for DB persistence |

---

## Implementation Steps

### 1. Add EPIPE logging

Read `src/infrastructure/claude-cli/ClaudeCodeClient.ts`. Locate the stdin error handler (lines 213-216):

**Before:**
```typescript
child.stdin.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') {
    return;
  }
```

**After:**
```typescript
child.stdin.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') {
    console.warn(`[ClaudeCodeClient] stdin ${err.code} — CLI process may have exited early (conversationId=${conversationId})`);
    return;
  }
```

### 2. Add first-failure logging for DB persistence

Locate the `wrappedOnEvent` function (lines 127-143). Add a `persistErrorLogged` flag scoped to the stream session:

**Before:**
```typescript
const wrappedOnEvent = (streamEvent: StreamEvent) => {
  if (streamEvent.type === 'done') {
    doneEmitted = true;
  }
  try {
    this.db.persistStreamEvent({ ... });
  } catch {
    // Event persistence is best-effort — don't fail the stream
  }
  params.onEvent(streamEvent);
};
```

**After:**
```typescript
let persistErrorLogged = false;
const wrappedOnEvent = (streamEvent: StreamEvent) => {
  if (streamEvent.type === 'done') {
    doneEmitted = true;
  }
  try {
    this.db.persistStreamEvent({
      sessionId,
      conversationId,
      sequenceNumber: tracker.nextSequence(),
      eventType: streamEvent.type,
      payload: JSON.stringify(streamEvent),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    // Event persistence is best-effort — don't fail the stream.
    // Log the first failure per session to aid diagnostics.
    if (!persistErrorLogged) {
      console.error(`[ClaudeCodeClient] Stream event persistence failed (conversationId=${conversationId}):`, err);
      persistErrorLogged = true;
    }
  }
  params.onEvent(streamEvent);
};
```

The `persistErrorLogged` flag is scoped to the `sendMessage` call (same scope as `wrappedOnEvent`), so each new stream session gets its own flag. Subsequent failures in the same session are suppressed to avoid log spam.

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Grep for `EPIPE` in `ClaudeCodeClient.ts` — the handler should contain a `console.warn`
3. Grep for `persistErrorLogged` in `ClaudeCodeClient.ts` — should appear as a flag + check
4. The bare `catch {}` for persistence should now be `catch (err)` with conditional logging

---

## State Update

After completing this prompt, update `prompts/arch/r002/STATE.md`:
- Set FIX-05 status to `done`
- Set Completed date
- Add notes about any complications or design decisions
