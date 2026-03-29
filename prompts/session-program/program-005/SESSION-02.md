# SESSION-02 — Preserve User Sessions on Book Switch

> **Depends on:** Nothing
> **Modules:** M10 (renderer)
> **Estimated effort:** 25 minutes

---

## Goal

Stop destroying user-initiated chat sessions when switching books. Currently `chatStore.switchBook()` aborts the in-flight stream and wipes all chat state. After this session, switching books must:

1. **Not abort** any running CLI stream (user-initiated or external)
2. **Save** which conversation was active for the departing book
3. **Restore** that conversation when the user switches back
4. **Recover** any in-flight stream that's still running on the returning book

---

## Problem Analysis

### Current `switchBook()` flow (broken):

1. Clears localStorage conversation
2. Navigates to `'chat'` (immediately overridden by `bookStore.setActiveBook` navigating to `'dashboard'`)
3. Aborts user-initiated streams (`_streamOrigin === 'self'`)
4. Clears ALL chat state (conversations, messages, buffers, callId)
5. Loads conversations for new book
6. Auto-selects most recent conversation
7. Checks for active CLI stream on new book and recovers

### Problems:

- **Step 1** loses the departing book's active conversation. When the user switches back, step 6 picks "most recent" which may not be the one they were chatting with.
- **Step 2** navigates to `'chat'` which is immediately overridden by `bookStore.setActiveBook`'s `navigate('dashboard')`. Wasteful and confusing.
- **Step 3** kills the user's in-flight work. The CLI child process gets SIGTERM. The user's partial response is lost.

---

## Changes

### 1. `src/renderer/stores/chatStore.ts` — Rewrite `switchBook()`

Replace the current `switchBook` implementation with a version that:

#### a. Saves per-book conversation ID

Instead of a single `novel-engine-active-conversation` localStorage key, use per-book keys:

```typescript
// Helper functions (module-level, above the store)
function saveBookConversation(bookSlug: string, conversationId: string): void {
  localStorage.setItem(`novel-engine-convo:${bookSlug}`, conversationId);
}

function loadBookConversation(bookSlug: string): string | null {
  return localStorage.getItem(`novel-engine-convo:${bookSlug}`);
}

function clearBookConversation(bookSlug: string): void {
  localStorage.removeItem(`novel-engine-convo:${bookSlug}`);
}
```

#### b. On departure: save state, don't abort

```typescript
switchBook: async (newBookSlug: string) => {
  const { activeConversation } = get();

  // Save the departing book's active conversation
  const departingSlug = useBookStore.getState().activeSlug;
  if (departingSlug && activeConversation) {
    saveBookConversation(departingSlug, activeConversation.id);
  }

  // Do NOT abort any streams. The CLI calls continue on the main process.
  // When the user switches back, we recover them visually.

  // Clear renderer chat state (but don't kill the main process stream)
  set({
    activeConversation: null,
    conversations: [],
    messages: [],
    isStreaming: false,
    isThinking: false,
    streamBuffer: '',
    thinkingBuffer: '',
    conversationUsage: null,
    toolActivity: [],
    lastChangedFiles: [],
    messageToolActivity: {},
    progressStage: 'idle',
    thinkingSummary: '',
    toolTimings: [],
    interruptedSession: null,
    _activeCallId: null,
    _streamOrigin: null,
  });

  // Load conversations for the new book
  try {
    const conversations = await window.novelEngine.chat.getConversations(newBookSlug);
    set({ conversations });

    // Restore previously active conversation for this book
    const savedId = loadBookConversation(newBookSlug);
    if (savedId && conversations.some((c) => c.id === savedId)) {
      await get().setActiveConversation(savedId);
    } else if (conversations.length > 0) {
      // Fallback: select most recent
      await get().setActiveConversation(conversations[0].id);
    }
  } catch (error) {
    console.error('Failed to load conversations for new book:', error);
  }

  // Recover any in-flight CLI stream for the new book
  try {
    const active = await window.novelEngine.chat.getActiveStreamForBook(newBookSlug);
    if (active) {
      const conversation = get().conversations.find(
        (c) => c.id === active.conversationId
      ) ?? null;
      if (conversation) {
        const messages = await window.novelEngine.chat.getMessages(active.conversationId);
        set({
          activeConversation: conversation,
          messages,
          isStreaming: true,
          isThinking: (active.thinkingBuffer ?? '').length > 0 && !(active.textBuffer ?? ''),
          streamBuffer: active.textBuffer ?? '',
          thinkingBuffer: active.thinkingBuffer ?? '',
          statusMessage: randomRespondingStatus(),
          progressStage: active.progressStage ?? 'idle',
          _activeCallId: active.callId || null,
        });
        saveBookConversation(newBookSlug, active.conversationId);
      }
    }
  } catch (error) {
    console.error('Failed to recover active stream for book:', error);
  }
},
```

#### c. Update all other localStorage references

Update every method that touches the old generic `'novel-engine-active-conversation'` key:

- **`loadConversations(bookSlug)`**: Change the restore to use `loadBookConversation(bookSlug)` instead of the generic key.
- **`createConversation(agentName, bookSlug, ...)`**: Use `saveBookConversation(bookSlug, conversation.id)`.
- **`setActiveConversation(conversationId)`**: Use `saveBookConversation(useBookStore.getState().activeSlug, conversationId)`.
- **`deleteConversation(conversationId)`**: If the deleted conversation was active, call `clearBookConversation(useBookStore.getState().activeSlug)`.
- **`recoverActiveStream()`**: Update the recovery localStorage call at line 342 to use `saveBookConversation(useBookStore.getState().activeSlug, active.conversationId)`.

**Important:** Remove ALL references to the old `'novel-engine-active-conversation'` key. Search the file and eliminate every occurrence. The per-book keys completely replace it.

### 2. Remove the `navigate('chat')` call from `switchBook`

The current switchBook calls `useViewStore.getState().navigate('chat')` (line 273). Remove it. Navigation is controlled by `bookStore.setActiveBook` which navigates to `'dashboard'`. Having switchBook navigate to 'chat' first is both wasteful and visually jarring.

---

## Verification

```bash
npx tsc --noEmit
```

Then search for any remaining references to the old key:

```bash
grep -r "novel-engine-active-conversation" src/
```

This should return **zero results**.

Behavioral verification:
1. Open Book A, start a conversation with Spark. Switch to Book B. Switch back to Book A — the Spark conversation should be restored.
2. Open Book A, send a message (stream starts). Switch to Book B while streaming. The stream should NOT be aborted. Switch back to Book A — the stream should be recovered or completed.
3. Navigate to dashboard on book switch — not chat.

---

## Files Modified

| File | Change |
|------|--------|
| `src/renderer/stores/chatStore.ts` | Rewrite `switchBook()`: no abort, per-book conversation memory, remove navigate('chat'). Update localStorage usage in `loadConversations`, `createConversation`, `setActiveConversation`, `deleteConversation`, `recoverActiveStream`. |

---

## Caution

- **Do NOT change the bookStore.** The `navigate('dashboard')` is intentional (program-004).
- **Do NOT change IPC handlers or main process.** All changes are renderer-only.
- **`recoverActiveStream()` handles app-refresh recovery.** Update its localStorage call to use per-book keys, but don't change its core logic.
- **`_handleStreamEvent` and `initStreamListener` must not change.** They handle live stream events and are correct.
