# FIX-04 — Deduplicate polling intervals in cliActivityStore recovery

> **Issue(s):** 3.3
> **Severity:** 🟡 Medium
> **Category:** Race Condition / Memory
> **Effort:** Low
> **Depends on:** Nothing

---

## Objective

`cliActivityStore.recoverActiveStream()` creates a polling `setInterval` to detect stream completion. If called multiple times (e.g., rapid view switches that each trigger recovery), each call creates a new interval without clearing the previous one. After N rapid navigations, N concurrent intervals run simultaneously, each calling `getActiveStream()` every 2 seconds.

The `chatStore` already handles this correctly with a module-level `_recoveryPollTimer` variable and `clearRecoveryPoll()`. Apply the same pattern to `cliActivityStore`.

---

## Findings Addressed

| # | Issues.md Ref | Title | Severity |
|---|---------------|-------|----------|
| 1 | 3.3 | cliActivityStore recovery creates duplicate polling intervals | 🟡 Medium |

---

## Files to Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/stores/cliActivityStore.ts` | Modify | Store poll timer refs at module level, clear before creating new ones |

---

## Implementation Steps

### 1. Add module-level timer variables

Read `src/renderer/stores/cliActivityStore.ts`. At the top of the file, outside the store definition (near other module-level variables or imports), add:

```typescript
let _activityRecoveryPollTimer: ReturnType<typeof setInterval> | null = null;
let _activityRecoveryTimeout: ReturnType<typeof setTimeout> | null = null;
```

### 2. Update recoverActiveStream to manage timer lifecycle

Locate `recoverActiveStream()` (around line 580-641). Replace the untracked `pollTimer` and `setTimeout` (lines 617-637) with the module-level refs.

**Before (lines 616-637):**
```typescript
// Polling fallback: detect stream end if `done` was missed during reload
const pollTimer = setInterval(async () => {
  try {
    const current = await window.novelEngine.chat.getActiveStream();
    if (!current) {
      clearInterval(pollTimer);
      // ...mark as done...
    }
  } catch {
    // Poll failed — try again next tick
  }
}, 2000);

// Safety: stop polling after 10 minutes max
setTimeout(() => clearInterval(pollTimer), 10 * 60 * 1000);
```

**After:**
```typescript
// Clear any existing recovery poll from a previous call
if (_activityRecoveryPollTimer) clearInterval(_activityRecoveryPollTimer);
if (_activityRecoveryTimeout) clearTimeout(_activityRecoveryTimeout);

// Polling fallback: detect stream end if `done` was missed during reload
_activityRecoveryPollTimer = setInterval(async () => {
  try {
    const current = await window.novelEngine.chat.getActiveStream();
    if (!current) {
      if (_activityRecoveryPollTimer) clearInterval(_activityRecoveryPollTimer);
      _activityRecoveryPollTimer = null;
      if (_activityRecoveryTimeout) clearTimeout(_activityRecoveryTimeout);
      _activityRecoveryTimeout = null;
      // Mark the recovered call as done
      const { calls } = get();
      const existingCall = calls[callId];
      if (existingCall && existingCall.isActive) {
        let finished = { ...existingCall, isActive: false };
        finished = pushEntry(finished, 'done', 'Stream completed (detected via poll)');
        set((s) => ({ calls: { ...s.calls, [callId]: finished } }));
      }
    }
  } catch {
    // Poll failed — try again next tick
  }
}, 2000);

// Safety: stop polling after 10 minutes max
_activityRecoveryTimeout = setTimeout(() => {
  if (_activityRecoveryPollTimer) clearInterval(_activityRecoveryPollTimer);
  _activityRecoveryPollTimer = null;
  _activityRecoveryTimeout = null;
}, 10 * 60 * 1000);
```

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Grep for `_activityRecoveryPollTimer` in `cliActivityStore.ts` — should appear at module level and inside `recoverActiveStream()`
3. Grep for `setInterval` in `cliActivityStore.ts` — should appear exactly once (the managed interval)
4. The old local `pollTimer` variable should no longer exist

---

## State Update

After completing this prompt, update `prompts/arch/r002/STATE.md`:
- Set FIX-04 status to `done`
- Set Completed date
- Add notes about any complications or design decisions
