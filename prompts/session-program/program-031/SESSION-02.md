# SESSION-02 — Cap thinking/stream buffers and debatch delta updates in chatStore

> **Program:** Novel Engine
> **Feature:** fix-renderer-crash-recovery
> **Modules:** M10 (renderer/stores)
> **Depends on:** SESSION-01
> **Estimated effort:** 25 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M10 | `src/renderer/stores/chatStore.ts` | Full file — 719 lines | thinkingBuffer/streamBuffer unbounded accumulation + per-token setState |
| M10 | `src/renderer/stores/chatStore.test.ts` | Existing tests | Must not break existing test expectations |
| M10 | `src/renderer/stores/streamHandler.ts` | Full file | The createStreamHandler factory — onThinkingDelta/onTextDelta callbacks |

## Context

The Ollama model generated **225,328 chars** of thinking text across 30 turns.
The chatStore accumulates every `thinkingDelta` event via:

```typescript
onThinkingDelta: (text) => useChatStore.setState((s) => ({ thinkingBuffer: s.thinkingBuffer + text })),
onTextDelta: (text) => useChatStore.setState((s) => ({ streamBuffer: s.streamBuffer + text })),
```

Two problems:
1. **O(N²) string concatenation** — each `setState` creates a new string by
   concatenating the entire previous buffer + new delta. With 225K chars across
   thousands of deltas, this is extremely expensive.
2. **Per-token React re-render** — every `setState` triggers a Zustand notification,
   which re-renders every component subscribed to `thinkingBuffer` or `streamBuffer`.
   With massive text, each render is also expensive → OOM.

The fix has two parts:
- **Cap buffers** at a maximum size (e.g. 50K chars). Thinking text beyond the cap
  is silently dropped — it's already displayed in the thinking panel if visible, and
  the full thinking is persisted by the main process (StreamManager saves it to DB).
- **Debatch delta updates** — accumulate deltas in a local variable and flush to
  the Zustand store on a timer (every 100ms) instead of per-token. This reduces
  React re-renders from thousands to ~10/second.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/renderer/stores/chatStore.ts` | Modify | Add buffer cap constants, debatched delta accumulator, apply to onThinkingDelta/onTextDelta |
| `src/renderer/stores/streamHandler.ts` | Read | Understand the createStreamHandler signature — may need to pass batched callbacks |

## Implementation

### 1. Read streamHandler.ts to understand the callback interface

Read `src/renderer/stores/streamHandler.ts` fully to understand how
`onThinkingDelta` and `onTextDelta` are called.

### 2. Add buffer cap and debatching to chatStore

Near the top of `src/renderer/stores/chatStore.ts`, after imports, add:

```typescript
/** Maximum chars retained in renderer state for thinking/stream buffers.
 *  The main process (StreamManager) saves full content to the database —
 *  the renderer buffer is only for live display. Capping prevents OOM
 *  when models produce very long thinking sequences (200K+ chars observed). */
const MAX_BUFFER_CHARS = 50_000;

/** Interval (ms) for flushing buffered text/thinking deltas to Zustand state.
 *  Without debatching, every token triggers setState + React re-render.
 *  With 225K chars of thinking, that's thousands of renders → OOM. */
const DELTA_FLUSH_INTERVAL_MS = 100;
```

### 3. Create a debatched delta accumulator

Inside the `create<ChatState>((set, get) => ({` block, before `_handleStreamEvent`,
add module-scoped mutable buffers and a flush mechanism. These must be
module-scoped (not in store state) so they don't trigger Zustand updates:

```typescript
// ── Debatched delta accumulator ───────────────────────────────────
// Accumulates thinking/text deltas in local variables and flushes to
// Zustand state on a timer. Prevents per-token setState + re-render
// when the model produces thousands of small deltas.
let _pendingThinking = '';
let _pendingText = '';
let _deltaFlushTimer: ReturnType<typeof setInterval> | null = null;

function startDeltaFlushTimer(): void {
  if (_deltaFlushTimer) return;
  _deltaFlushTimer = setInterval(() => {
    if (_pendingThinking || _pendingText) {
      const thinkDelta = _pendingThinking;
      const textDelta = _pendingText;
      _pendingThinking = '';
      _pendingText = '';
      useChatStore.setState((s) => ({
        thinkingBuffer: (s.thinkingBuffer + thinkDelta).slice(0, MAX_BUFFER_CHARS),
        streamBuffer: (s.streamBuffer + textDelta).slice(0, MAX_BUFFER_CHARS),
      }));
    }
  }, DELTA_FLUSH_INTERVAL_MS);
}

function stopDeltaFlushTimer(): void {
  if (_deltaFlushTimer) {
    clearInterval(_deltaFlushTimer);
    _deltaFlushTimer = null;
  }
  // Final flush
  if (_pendingThinking || _pendingText) {
    const thinkDelta = _pendingThinking;
    const textDelta = _pendingText;
    _pendingThinking = '';
    _pendingText = '';
    useChatStore.setState((s) => ({
      thinkingBuffer: (s.thinkingBuffer + thinkDelta).slice(0, MAX_BUFFER_CHARS),
      streamBuffer: (s.streamBuffer + textDelta).slice(0, MAX_BUFFER_CHARS),
    }));
  }
}
```

### 4. Replace onThinkingDelta and onTextDelta callbacks

In the `createStreamHandler({...})` call inside `_handleStreamEvent`
(around lines 408-409), replace:

**Before:**
```typescript
onThinkingDelta: (text) => useChatStore.setState((s) => ({ thinkingBuffer: s.thinkingBuffer + text })),
onTextDelta: (text) => useChatStore.setState((s) => ({ streamBuffer: s.streamBuffer + text })),
```

**After:**
```typescript
onThinkingDelta: (text) => {
  _pendingThinking += text;
  startDeltaFlushTimer();
},
onTextDelta: (text) => {
  _pendingText += text;
  startDeltaFlushTimer();
},
```

### 5. Flush on stream end (onDone and onError)

In the `onDone` callback (line 423), add `stopDeltaFlushTimer()` at the top:

```typescript
onDone: () => {
  clearRecoveryPoll();
  stopDeltaFlushTimer();  // ← ADD THIS
  const { activeConversation, toolActivity } = useChatStore.getState();
  // ... rest unchanged
```

In the `onError` callback (line 514), add `stopDeltaFlushTimer()` at the top:

```typescript
onError: (message) => {
  clearRecoveryPoll();
  stopDeltaFlushTimer();  // ← ADD THIS
  useChatStore.setState((state) => {
  // ... rest unchanged
```

### 6. Clear pending deltas on book switch

In `switchBook` (line 298), add cleanup before `set({...})`:

```typescript
switchBook: async (newBookSlug: string, departingSlug?: string | null) => {
  stopDeltaFlushTimer();  // ← ADD THIS — flush pending and clear timer
  _pendingThinking = '';  // ← ADD THIS
  _pendingText = '';       // ← ADD THIS
  const { activeConversation } = get();
  // ... rest unchanged
```

### 7. Clear pending deltas in destroyStreamListener

In `destroyStreamListener` (line 580), add cleanup:

```typescript
destroyStreamListener: () => {
  stopDeltaFlushTimer();  // ← ADD THIS
  _pendingThinking = '';  // ← ADD THIS
  _pendingText = '';       // ← ADD THIS
  const { _cleanupListener, _cleanupFilesChanged } = get();
  // ... rest unchanged
```

### 8. Update the recovery path

In `recoverActiveStream` (line 602) and the polling callback (line 658),
the store sets `streamBuffer` and `thinkingBuffer` from the active stream
snapshot. After restoring, the live deltas will continue to accumulate.
No change needed — the debatch timer will start when new deltas arrive.

However, in the polling fallback's `set({...})` calls that reset buffers to `''`,
also clear pending:

```typescript
// In the poll callback where it sets isStreaming: false (line 677)
stopDeltaFlushTimer();
_pendingThinking = '';
_pendingText = '';
```

## Verification

1. `npx tsc --noEmit` — no type errors
2. `npm test` — all existing tests pass; chatStore tests that assert on
   `thinkingBuffer`/`streamBuffer` values may need timing-aware updates if they
   expect immediate updates. If any test breaks:
   - Tests that call `onThinkingDelta` followed by immediate assertion on
     `thinkingBuffer` will need `await new Promise(r => setTimeout(r, DELTA_FLUSH_INTERVAL_MS + 10))`
     or manual `stopDeltaFlushTimer()` to flush.
3. Manual test: run `npm start`, send a message to an Ollama model, verify:
   - Streaming works normally (text appears within ~100ms)
   - Thinking panel shows thinking text
   - No OOM crash with long thinking sequences
   - After stream done, messages reload from DB (full content, not capped)

## State Update

Update `prompts/session-program/program-031/STATE.md`:
- SESSION-02 → done
- Handoff: "Added MAX_BUFFER_CHARS cap (50K) and debatched delta updates
  (100ms flush timer) to chatStore. Thinking/stream buffers accumulate in
  module-scoped locals, flush via setInterval. Tested manually with long
  thinking sequences — no OOM."