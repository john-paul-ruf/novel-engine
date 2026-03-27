# FIX-06 — EPIPE Guard Should Log Write Progress for Debugging

> **Issue(s):** 5.5
> **Severity:** 🟡 Medium
> **Category:** Error Handling
> **Effort:** Low
> **Depends on:** Nothing

---

## Objective

The EPIPE/ERR_STREAM_DESTROYED guard on `child.stdin` returns early without logging how much data was written vs. expected. If the CLI process exits before the full conversation prompt is written and somehow succeeds (exit code 0), the partial write is silently swallowed. While unlikely, this makes debugging very difficult.

The fix adds diagnostic logging — bytes written vs. expected — so that if a partial write occurs, the developer has actionable information.

---

## Findings Addressed

| # | Issues.md Ref | Title | Severity |
|---|---------------|-------|----------|
| 1 | 5.5 | EPIPE Guard on stdin May Mask Failures | 🟡 Medium |

---

## Files to Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/infrastructure/claude-cli/ClaudeCodeClient.ts` | Modify | Add write progress tracking and diagnostic logging to stdin EPIPE guard |

---

## Implementation Steps

### 1. Read ClaudeCodeClient.ts

Read `src/infrastructure/claude-cli/ClaudeCodeClient.ts`, focusing on the stdin write section (around lines 227-238) and the `child.stdin.end(conversationPrompt)` call.

### 2. Track expected write size

Before writing to stdin, capture the expected byte count. There is likely already a `promptBytes` variable from the system prompt size guard. If the `conversationPrompt` is separate, also compute its size:

```typescript
const stdinBytes = Buffer.byteLength(conversationPrompt, 'utf-8');
```

### 3. Enhance the EPIPE handler

Update the stdin error handler to log write progress:

**Before:**
```typescript
child.stdin.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') {
    console.warn(`[ClaudeCodeClient] stdin ${err.code} — CLI process may have exited early (conversationId=${conversationId})`);
    return;
  }
  // ...
});
```

**After:**
```typescript
child.stdin.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') {
    console.warn(
      `[ClaudeCodeClient] stdin ${err.code} — CLI process may have exited early ` +
      `(conversationId=${conversationId}, stdinBytes=${stdinBytes}, ` +
      `writableFinished=${child.stdin.writableFinished}, writableEnded=${child.stdin.writableEnded})`
    );
    return;
  }
  // ...
});
```

The `writableFinished` and `writableEnded` properties indicate whether the full payload was flushed to the underlying resource. If `writableFinished === false`, the write was partial.

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Grep for `stdinBytes` in the stdin error handler area — should show the new diagnostic logging
3. The EPIPE guard still returns early (no behavioral change to error propagation)

---

## State Update

After completing this prompt, update `prompts/arch/r003/STATE.md`:
- Set FIX-06 status to `done`
- Set Completed date
- Add notes about any complications or design decisions
