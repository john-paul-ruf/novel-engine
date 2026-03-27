# FIX-07 — Abort active stream on switchBook

> **Issue(s):** 1.5
> **Severity:** 🟡 Medium
> **Category:** Chat Bleed
> **Effort:** Low
> **Depends on:** FIX-01

---

## Objective

When the user switches books via `chatStore.switchBook()`, the UI state is cleared (`_activeCallId: null`, `isStreaming: false`) so events from the old book are filtered out. However, the CLI process for the old book continues running in the background — consuming tokens, potentially writing files to the old book's directory, and appearing as an active call in the activity monitor with no way to abort from the UI (since the conversation is no longer visible).

This fix aborts the active CLI stream for the old book before clearing state. The user initiated a book switch, which is a clear signal that they want to move on. If they switch back, the recovery logic in Step 4 of `switchBook` handles re-attachment.

---

## Findings Addressed

| # | Issues.md Ref | Title | Severity |
|---|---------------|-------|----------|
| 1 | 1.5 | switchBook clears _activeCallId but doesn't abort the active CLI stream | 🟡 Medium |

---

## Files to Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/stores/chatStore.ts` | Modify | Abort active stream before clearing state in `switchBook()` |

---

## Implementation Steps

### 1. Add abort call before state clearing

Read `src/renderer/stores/chatStore.ts`. Locate `switchBook()` (line 259). Currently Step 2 immediately clears all state (line 267-285).

**Before Step 2, add an abort step:**

```typescript
switchBook: async (newBookSlug: string) => {
  localStorage.removeItem('novel-engine-active-conversation');
  useViewStore.getState().navigate('chat');

  // Step 1.5: Abort any active stream for the old book so it doesn't
  // continue consuming tokens and writing files in the background.
  const { activeConversation, isStreaming } = get();
  if (isStreaming && activeConversation) {
    try {
      await window.novelEngine.chat.abort(activeConversation.id);
    } catch {
      // Best-effort — the stream may have already completed
    }
  }

  // Step 2: Clear all chat state immediately
  set({ ... });
```

### 2. Verify abort IPC channel exists

Read `src/preload/index.ts` and check that `chat.abort` is exposed on the bridge. Read `src/main/ipc/handlers.ts` to confirm the `chat:abort` handler delegates to the service correctly.

### 3. Handle edge case: abort racing with done

The abort call is async. The `done` event may arrive between the abort and the state clear. Since `_activeCallId` is still set at that point, the `done` handler would process the event normally (reloading messages for the old conversation). This is fine — the state clear in Step 2 immediately overwrites everything. No race condition.

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Grep for `chat.abort` in `chatStore.ts` — should appear in `switchBook()`
3. Manual test: start a long stream in Book A, switch to Book B. The CLI process for Book A should be killed (check activity monitor — the call should show as completed/aborted)

---

## State Update

After completing this prompt, update `prompts/arch/r002/STATE.md`:
- Set FIX-07 status to `done`
- Set Completed date
- Add notes about any complications or design decisions
