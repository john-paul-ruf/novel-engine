# SESSION-03 — Auto-Draft Recovery on Book Switch

> **Depends on:** SESSION-02 (switchBook rewrite)
> **Modules:** M10 (renderer)
> **Estimated effort:** 20 minutes

---

## Goal

When the user switches to a book that has a running auto-draft loop, the chat UI should automatically reconnect to the auto-draft's active CLI call so the user sees live streaming output. Currently, switching away from a book with auto-draft running disconnects the visual stream — switching back shows the conversation but without live updates.

---

## Problem Analysis

The auto-draft loop (`autoDraftStore`) runs independently per book. Each iteration:

1. Generates a unique `callId`
2. Calls `chatStore.attachToExternalStream(callId, conversationId)` if the user is watching
3. Calls `window.novelEngine.chat.send()` directly

When the user switches away:
- SESSION-02's new `switchBook` clears `_activeCallId` and streaming state
- The auto-draft CLI call continues on main process
- Live events from that call arrive at `_handleStreamEvent` but are dropped by the callId guard

When the user switches back:
- SESSION-02's `switchBook` recovers the active stream via `getActiveStreamForBook`
- This correctly reconnects `_activeCallId` and sets `isStreaming: true`
- **But** the auto-draft loop may fire a NEW `attachToExternalStream` call on its next iteration, which is correct — it checks `useChatStore.getState().activeConversation?.id === conversationId` before attaching

**The gap:** Between switching back and the next auto-draft iteration, there's a window where:
- The stream is recovered by switchBook (correct callId from main process)
- But the auto-draft stageLabel and progress in the PipelineTracker may be stale

---

## Changes

### 1. `src/renderer/stores/chatStore.ts` — Enrich stream recovery in `switchBook`

After SESSION-02's switchBook recovers an active stream for the new book, also check if the auto-draft store has an active session for that book. If so, set `_streamOrigin: 'external'` so the stream is correctly identified as background work:

In the stream recovery block of `switchBook` (the `getActiveStreamForBook` section), after the `set({...})` call, add:

```typescript
// If this book has a running auto-draft, mark the stream as external
// so it isn't misidentified as user-initiated.
const autoDraftSession = useAutoDraftStore.getState().sessions[newBookSlug];
if (autoDraftSession?.isRunning) {
  set({ _streamOrigin: 'external' });
}
```

**Import needed:** Add `import { useAutoDraftStore } from './autoDraftStore';` at the top of chatStore.ts (if not already imported — check first).

### 2. `src/renderer/stores/autoDraftStore.ts` — Reconnect on book focus

Add a method `reconnect(bookSlug: string)` that re-attaches the auto-draft's current callId to chatStore when the user navigates back to a book with a running loop:

```typescript
reconnect: (bookSlug: string) => {
  const session = get().sessions[bookSlug];
  if (!session?.isRunning || !session.conversationId) return;

  const chatState = useChatStore.getState();

  // Only reconnect if chatStore is showing this conversation but NOT already streaming
  // (if already streaming, switchBook's recovery handled it via getActiveStreamForBook)
  if (
    chatState.activeConversation?.id === session.conversationId &&
    !chatState.isStreaming
  ) {
    // The auto-draft loop will attach on its next iteration.
    // For now, just ensure the conversation is loaded and active.
    // No forced attachToExternalStream here — the loop handles that.
    return;
  }

  // If chatStore hasn't selected the auto-draft conversation yet,
  // and the user is now viewing this book, switch to it
  if (chatState.activeConversation?.id !== session.conversationId) {
    const conversation = chatState.conversations.find(
      (c) => c.id === session.conversationId
    );
    if (conversation) {
      useChatStore.getState().setActiveConversation(session.conversationId);
    }
  }
},
```

Add `reconnect` to the `AutoDraftState` type definition and the store creator.

### 3. `src/renderer/stores/bookStore.ts` — Call auto-draft reconnect on book switch

In `setActiveBook`, after `switchBook` completes and the dashboard navigation, add:

```typescript
// Reconnect auto-draft visual state if the new book has a running loop
const { reconnect } = useAutoDraftStore.getState();
reconnect(slug);
```

**Import needed:** Add `import { useAutoDraftStore } from './autoDraftStore';` at the top of bookStore.ts (if not already imported — check first).

### 4. `src/renderer/stores/autoDraftStore.ts` — Ensure `isViewingBook` checks are non-destructive

Review every `isViewingBook(bookSlug)` call in the auto-draft loop. These currently use `useBookStore.getState().activeSlug === bookSlug` which is correct — they only trigger visual updates (pipeline, file changes, word count) when the user is looking at that book. No changes needed here, but verify.

---

## Verification

```bash
npx tsc --noEmit
```

Behavioral verification:
1. Start auto-draft on Book A (first-draft phase active, click "Auto-Draft"). PipelineTracker shows progress.
2. Switch to Book B. The auto-draft loop continues in the background (check console for `[auto-draft]` logs).
3. Switch back to Book A. The PipelineTracker should show the auto-draft status immediately (stageLabel, chaptersWritten). The chat view (if navigated to) should show the auto-draft conversation with live streaming.
4. Start auto-draft on Book A AND manually chat on Book B simultaneously. Both should work without cross-book interference.

---

## Files Modified

| File | Change |
|------|--------|
| `src/renderer/stores/chatStore.ts` | Mark recovered auto-draft streams as `_streamOrigin: 'external'` in switchBook recovery block |
| `src/renderer/stores/autoDraftStore.ts` | Add `reconnect(bookSlug)` method for visual re-attachment |
| `src/renderer/stores/bookStore.ts` | Call `autoDraftStore.reconnect(slug)` after switchBook in `setActiveBook` |

---

## Caution

- **The auto-draft loop itself must not be modified.** Its per-book architecture with unique callIds is correct.
- **Do not create circular imports.** chatStore already imports bookStore. autoDraftStore already imports chatStore and bookStore. bookStore importing autoDraftStore is a NEW dependency — ensure it doesn't create a cycle. Both bookStore and autoDraftStore import from chatStore, so the direction is: `bookStore -> autoDraftStore -> chatStore` which is fine (no cycles).
- **The PipelineTracker already reads `autoDraftStore.sessions[activeSlug]` directly.** It doesn't need changes — it will automatically show the correct state for whichever book is active.
