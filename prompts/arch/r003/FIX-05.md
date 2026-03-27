# FIX-05 — PitchRoomStore Needs Store-Level Stream Listener Lifecycle

> **Issue(s):** 5.4
> **Severity:** 🟡 Medium
> **Category:** Architecture
> **Effort:** Medium
> **Depends on:** Nothing

---

## Objective

Unlike chatStore and modalChatStore, pitchRoomStore does not have `initStreamListener`/`destroyStreamListener` methods. The stream listener is registered inside `PitchRoomView`'s `useEffect`, which means navigating away from the pitch room unmounts the component and destroys the listener. If a CLI call is in-flight when the user navigates away, the `done` event is missed and the store gets stuck with `isStreaming: true` permanently.

The fix adds `initStreamListener`/`destroyStreamListener` to pitchRoomStore (matching chatStore's pattern) and registers the listener at the AppLayout level so it persists across view changes.

---

## Findings Addressed

| # | Issues.md Ref | Title | Severity |
|---|---------------|-------|----------|
| 1 | 5.4 | PitchRoomStore Has No Store-Level Listener Lifecycle | 🟡 Medium |

---

## Files to Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/stores/pitchRoomStore.ts` | Modify | Add `initStreamListener()`, `destroyStreamListener()`, and `_cleanupListener` field |
| `src/renderer/components/PitchRoom/PitchRoomView.tsx` | Modify | Remove the `useEffect` that registers the stream listener |
| `src/renderer/components/Layout/AppLayout.tsx` | Modify | Call `pitchRoomStore.initStreamListener()` on mount, cleanup on unmount |

---

## Implementation Steps

### 1. Read affected files

Read `src/renderer/stores/pitchRoomStore.ts`, `src/renderer/components/PitchRoom/PitchRoomView.tsx`, and `src/renderer/components/Layout/AppLayout.tsx`. Also read `src/renderer/stores/chatStore.ts` for the reference pattern (look at `initStreamListener`/`destroyStreamListener`).

### 2. Add lifecycle fields to pitchRoomStore state type

Add to the `PitchRoomState` type:

```typescript
_cleanupListener: (() => void) | null;
initStreamListener: () => void;
destroyStreamListener: () => void;
```

### 3. Implement `initStreamListener()` in pitchRoomStore

Following chatStore's pattern:

```typescript
_cleanupListener: null,

initStreamListener: () => {
  const { _cleanupListener } = get();
  if (_cleanupListener) return; // Already initialized

  const cleanup = window.novelEngine.chat.onStreamEvent(get()._handleStreamEvent);
  set({ _cleanupListener: cleanup });
},

destroyStreamListener: () => {
  const { _cleanupListener } = get();
  if (_cleanupListener) {
    _cleanupListener();
    set({ _cleanupListener: null });
  }
},
```

### 4. Remove the `useEffect` listener registration from PitchRoomView

In `src/renderer/components/PitchRoom/PitchRoomView.tsx`, find and remove this block:

```typescript
// Register stream event listener for the pitch room
useEffect(() => {
  const cleanup = window.novelEngine.chat.onStreamEvent(handleStreamEvent);
  return () => { cleanup(); };
}, [handleStreamEvent]);
```

Also remove the `handleStreamEvent` variable if it is only used by this `useEffect`. The stream handling is now managed by the store's `_handleStreamEvent` registered via `initStreamListener`.

### 5. Register the listener in AppLayout

In `src/renderer/components/Layout/AppLayout.tsx`, add the pitchRoomStore listener initialization alongside the existing chatStore listener init:

```typescript
import { usePitchRoomStore } from '../stores/pitchRoomStore';

// In the component or its mount effect:
useEffect(() => {
  usePitchRoomStore.getState().initStreamListener();
  return () => {
    usePitchRoomStore.getState().destroyStreamListener();
  };
}, []);
```

This should be placed near the existing `chatStore.initStreamListener()` call.

### 6. Verify the `_handleStreamEvent` access pattern

In pitchRoomStore, `_handleStreamEvent` is currently defined as an IIFE that lazily creates the handler. Ensure that `initStreamListener()` correctly accesses this handler. The current pattern uses `get()._handleStreamEvent` which works because the IIFE has already executed and the method is bound to the store.

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Grep for `onStreamEvent` in `PitchRoomView.tsx` — should no longer exist (the component no longer registers its own listener)
3. Grep for `initStreamListener` in `pitchRoomStore.ts` — should exist as a method
4. Grep for `initStreamListener` in `AppLayout.tsx` — should show both chatStore and pitchRoomStore initialization
5. Manual test scenario: Start a pitch room chat, navigate to Files view, wait for response to complete, navigate back to pitch room. The response should be visible and `isStreaming` should be `false`.

---

## State Update

After completing this prompt, update `prompts/arch/r003/STATE.md`:
- Set FIX-05 status to `done`
- Set Completed date
- Add notes about any complications or design decisions
