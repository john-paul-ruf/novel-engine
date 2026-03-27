# FIX-01 — switchBook() Aborts Background Streams (Auto-Draft, Hot Take, Ad Hoc Revision)

> **Issue(s):** 2.1
> **Severity:** 🔴 Critical
> **Category:** Race Condition
> **Effort:** Low
> **Depends on:** Nothing

---

## Objective

When a user switches books, `chatStore.switchBook()` unconditionally aborts the stream attached to `activeConversation.id`. If auto-draft, hot take, or ad hoc revision has attached its stream to chatStore via `attachToExternalStream`, the abort kills the background CLI process. The user loses the in-progress chapter or operation.

The fix adds a `_streamOrigin` discriminator to chatStore so `switchBook()` only aborts streams the user explicitly started via the chat input — never background-attached streams.

---

## Findings Addressed

| # | Issues.md Ref | Title | Severity |
|---|---------------|-------|----------|
| 1 | 2.1 | switchBook() Aborts Active Stream — May Kill Background Processes | 🔴 Critical |

---

## Files to Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/stores/chatStore.ts` | Modify | Add `_streamOrigin` field; set in `sendMessage()` and `attachToExternalStream()`; guard abort in `switchBook()` |

---

## Implementation Steps

### 1. Read chatStore.ts

Read `src/renderer/stores/chatStore.ts` in full to understand current state shape and all methods.

### 2. Add `_streamOrigin` to the state type

Add a new field to the chatStore state type:

```typescript
_streamOrigin: 'self' | 'external' | null;
```

Initialize it to `null` in the store's initial state (alongside `_activeCallId: null`).

### 3. Set `_streamOrigin` in `sendMessage()`

In the `sendMessage()` method, immediately after setting `isStreaming: true` and `_activeCallId`, also set `_streamOrigin: 'self'`:

```typescript
set({
  isStreaming: true,
  _activeCallId: callId,
  _streamOrigin: 'self',
  // ... existing fields
});
```

### 4. Set `_streamOrigin` in `attachToExternalStream()`

In the `attachToExternalStream()` method, add `_streamOrigin: 'external'` to the `set()` call:

```typescript
set((state) => ({
  isStreaming: true,
  _activeCallId: callId,
  _streamOrigin: 'external',
  // ... existing fields
}));
```

### 5. Guard the abort in `switchBook()`

Change the abort condition in `switchBook()` from:

```typescript
if (isStreaming && activeConversation) {
  try {
    await window.novelEngine.chat.abort(activeConversation.id);
  } catch {
    // Best-effort
  }
}
```

To:

```typescript
const { activeConversation, isStreaming, _streamOrigin } = get();
if (isStreaming && activeConversation && _streamOrigin === 'self') {
  try {
    await window.novelEngine.chat.abort(activeConversation.id);
  } catch {
    // Best-effort — the stream may have already completed
  }
}
```

This ensures only user-initiated chat streams are aborted. Background streams (auto-draft, hot take, ad hoc revision) continue running.

### 6. Reset `_streamOrigin` on terminal events

In every place that resets `_activeCallId: null` (onDone, onError, switchBook's cleanup set), also reset `_streamOrigin: null`:

- The `onDone` callback in `_handleStreamEvent`
- The `onError` callback in `_handleStreamEvent`
- The large `set()` call in `switchBook()` that clears streaming state
- Any other terminal state reset

Search for all occurrences of `_activeCallId: null` and add `_streamOrigin: null` alongside each one.

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Grep for `_streamOrigin` in chatStore.ts — should appear in: state type, initial state, `sendMessage()`, `attachToExternalStream()`, `switchBook()` guard, and all terminal reset points
3. Grep for the old unguarded pattern `if (isStreaming && activeConversation)` in `switchBook()` — should no longer exist without the `_streamOrigin` check

---

## State Update

After completing this prompt, update `prompts/arch/r003/STATE.md`:
- Set FIX-01 status to `done`
- Set Completed date
- Add notes about any complications or design decisions
