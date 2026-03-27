# FIX-08 — Modal close-on-stream-end UX

> **Issue(s):** 3.2
> **Severity:** 🟢 Low
> **Category:** Race Condition
> **Effort:** Low
> **Depends on:** Nothing

---

## Objective

`modalChatStore.close()` checks `isStreaming` and returns early if true, preventing the user from closing the modal during an active stream. The close button appears unresponsive — the user must click again after the stream finishes.

This fix adds a `_closeRequested` flag so the modal auto-closes when the stream completes (or errors).

---

## Findings Addressed

| # | Issues.md Ref | Title | Severity |
|---|---------------|-------|----------|
| 1 | 3.2 | Modal close during stream returns early — minor UX friction | 🟢 Low |

---

## Files to Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/stores/modalChatStore.ts` | Modify | Add `_closeRequested` flag, honor it on stream end |

---

## Implementation Steps

### 1. Add _closeRequested to store state

Read `src/renderer/stores/modalChatStore.ts`. Add `_closeRequested: boolean` to the store state (initially `false`). Add it to the type interface if one exists, or to the initial state object.

### 2. Update close() to set the flag during streaming

**Before (line 85-89):**
```typescript
close: () => {
  const { isStreaming } = get();
  if (isStreaming) return;
  set({ isOpen: false });
},
```

**After:**
```typescript
close: () => {
  const { isStreaming } = get();
  if (isStreaming) {
    set({ _closeRequested: true });
    return;
  }
  set({ isOpen: false, _closeRequested: false });
},
```

### 3. Honor _closeRequested in the done handler

Locate the `done` case in `_handleStreamEvent` (around line 190). After reloading messages, check `_closeRequested`:

In the `.then()` callback:
```typescript
.then((messages) => {
  const { _closeRequested } = get();
  set({
    messages,
    isStreaming: false,
    isThinking: false,
    streamBuffer: '',
    thinkingBuffer: '',
    statusMessage: '',
    _activeCallId: null,
    ...(_closeRequested ? { isOpen: false, _closeRequested: false } : {}),
  });
})
```

Apply the same pattern in the `.catch()` fallback and the `else` branch (no conversation).

### 4. Honor _closeRequested in the error handler

In the `error` case (around line 227), after creating the error message, also check `_closeRequested`:

```typescript
case 'error':
  set((state) => {
    const { _closeRequested } = get();
    const errorMessage: Message = { ... };
    return {
      messages: [...state.messages, errorMessage],
      isStreaming: false,
      isThinking: false,
      streamBuffer: '',
      thinkingBuffer: '',
      statusMessage: '',
      _activeCallId: null,
      ...(_closeRequested ? { isOpen: false, _closeRequested: false } : {}),
    };
  });
  break;
```

### 5. Reset flag on open

In the `open()` method, ensure `_closeRequested: false` is set alongside `isOpen: true`.

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Grep for `_closeRequested` in `modalChatStore.ts` — should appear in state, `close()`, `open()`, `done`, and `error`
3. Manual test: open modal, send message, click close while streaming. Modal should auto-close when the stream finishes.

---

## State Update

After completing this prompt, update `prompts/arch/r002/STATE.md`:
- Set FIX-08 status to `done`
- Set Completed date
- Add notes about any complications or design decisions
