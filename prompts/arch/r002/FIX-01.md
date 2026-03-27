# FIX-01 — Fix send error paths in all three chat stores

> **Issue(s):** 3.1, 1.3, 1.4
> **Severity:** 🟠 High
> **Category:** Race Condition / Error Handling
> **Effort:** Low
> **Depends on:** Nothing

---

## Objective

When `sendMessage()` throws in any of the three chat stores (`chatStore`, `modalChatStore`, `pitchRoomStore`), the error catch block has two defects:

1. **`chatStore` + `pitchRoomStore` + `modalChatStore`: `_activeCallId` is not cleared.** The stale UUID lingers. While benign (the next `sendMessage` overwrites it), it violates the invariant that `_activeCallId` is null when `isStreaming` is false.

2. **All three stores: the optimistic temp message is not removed.** The user sees both their original message and the error message. On next reload, the temp message disappears (replaced by the DB record with a different ID), causing a visual flash.

This fix ensures all three stores clean up fully on send failure.

---

## Findings Addressed

| # | Issues.md Ref | Title | Severity |
|---|---------------|-------|----------|
| 1 | 3.1 | Optimistic message not cleaned up on send error | 🟠 High |
| 2 | 1.3 | chatStore sendMessage error path doesn't clear _activeCallId | 🟡 Medium |
| 3 | 1.4 | pitchRoomStore and modalChatStore error paths don't clear _activeCallId | 🟡 Medium |

---

## Files to Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/stores/chatStore.ts` | Modify | Error catch: add `_activeCallId: null`, filter out temp message |
| `src/renderer/stores/modalChatStore.ts` | Modify | Error catch: add `_activeCallId: null`, filter out temp message |
| `src/renderer/stores/pitchRoomStore.ts` | Modify | Error catch: add `_activeCallId: null`, filter out temp message |

---

## Implementation Steps

### 1. Fix chatStore.ts sendMessage error catch

Read `src/renderer/stores/chatStore.ts`. Locate the `catch` block in `sendMessage` (lines 186-204).

The `tempMessage` variable (line 158) is already in scope within the catch block.

**Before (lines 196-203):**
```typescript
set((state) => ({
  messages: [...state.messages, errorMessage],
  isStreaming: false,
  isThinking: false,
  streamBuffer: '',
  thinkingBuffer: '',
  toolActivity: [],
}));
```

**After:**
```typescript
set((state) => ({
  messages: [...state.messages.filter(m => m.id !== tempMessage.id), errorMessage],
  isStreaming: false,
  isThinking: false,
  streamBuffer: '',
  thinkingBuffer: '',
  toolActivity: [],
  _activeCallId: null,
}));
```

Two changes: (a) filter out the temp message by ID, (b) add `_activeCallId: null`.

### 2. Fix modalChatStore.ts sendMessage error catch

Read `src/renderer/stores/modalChatStore.ts`. Locate the `catch` block in `sendMessage` (lines 124-141).

The `tempMessage` variable (line 95) is in scope.

**Before (lines 134-140):**
```typescript
set((state) => ({
  messages: [...state.messages, errorMessage],
  isStreaming: false,
  isThinking: false,
  streamBuffer: '',
  thinkingBuffer: '',
}));
```

**After:**
```typescript
set((state) => ({
  messages: [...state.messages.filter(m => m.id !== tempMessage.id), errorMessage],
  isStreaming: false,
  isThinking: false,
  streamBuffer: '',
  thinkingBuffer: '',
  _activeCallId: null,
}));
```

### 3. Fix pitchRoomStore.ts sendMessage error catch

Read `src/renderer/stores/pitchRoomStore.ts`. Locate the `catch` block in `sendMessage` (lines 180-197).

The `tempMessage` variable is in scope.

**Before (lines 190-196):**
```typescript
set((state) => ({
  messages: [...state.messages, errorMessage],
  isStreaming: false,
  isThinking: false,
  streamBuffer: '',
  thinkingBuffer: '',
}));
```

**After:**
```typescript
set((state) => ({
  messages: [...state.messages.filter(m => m.id !== tempMessage.id), errorMessage],
  isStreaming: false,
  isThinking: false,
  streamBuffer: '',
  thinkingBuffer: '',
  _activeCallId: null,
}));
```

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Grep for `_activeCallId` in all three stores — every `set()` that sets `isStreaming: false` must also set `_activeCallId: null`
3. Grep for `tempMessage.id` in all three stores — confirm the filter is applied in the catch block
4. Manual test: trigger a send error (e.g., disconnect network before sending) and verify the message list shows only the error, not the duplicate temp user message

---

## State Update

After completing this prompt, update `prompts/arch/r002/STATE.md`:
- Set FIX-01 status to `done`
- Set Completed date
- Add notes about any complications or design decisions
