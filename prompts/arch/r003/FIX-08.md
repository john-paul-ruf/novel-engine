# FIX-08 — Batch Stream Event DB Persistence to Reduce I/O Pressure

> **Issue(s):** 5.9
> **Severity:** 🟡 Medium
> **Category:** Performance
> **Effort:** Medium
> **Depends on:** FIX-06

---

## Objective

Every `StreamEvent` is individually written to SQLite via `wrappedOnEvent` in `ClaudeCodeClient`. During heavy thinking sessions, this can mean hundreds of DB writes per second for `thinkingDelta` events. WAL mode mitigates some pressure, but there is no batching.

The fix adds a simple event batching mechanism: non-critical events (thinkingDelta, textDelta, status) are buffered and flushed periodically or on critical events (done, error). This reduces SQLite write frequency without losing any event data.

---

## Findings Addressed

| # | Issues.md Ref | Title | Severity |
|---|---------------|-------|----------|
| 1 | 5.9 | Stream Event DB Persistence — Per-Event Writes | 🟡 Medium |

---

## Files to Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/infrastructure/claude-cli/ClaudeCodeClient.ts` | Modify | Add event batching in `wrappedOnEvent`; flush on timer and on critical events |
| `src/infrastructure/database/DatabaseService.ts` | Modify | Add `persistStreamEventBatch()` method for bulk inserts |
| `src/domain/interfaces.ts` | Modify | Add `persistStreamEventBatch()` to `IDatabaseService` |

---

## Implementation Steps

### 1. Read affected files

Read `src/infrastructure/claude-cli/ClaudeCodeClient.ts` (lines 120-150 — the `wrappedOnEvent` section), `src/infrastructure/database/DatabaseService.ts` (find `persistStreamEvent`), and `src/domain/interfaces.ts` (find `IDatabaseService`).

### 2. Add batch persist method to the database interface

In `src/domain/interfaces.ts`, add to `IDatabaseService`:

```typescript
persistStreamEventBatch(events: StreamEventRecord[]): void;
```

Where `StreamEventRecord` is the same type used by `persistStreamEvent()`.

### 3. Implement batch persist in DatabaseService

In `src/infrastructure/database/DatabaseService.ts`, add:

```typescript
persistStreamEventBatch(events: StreamEventRecord[]): void {
  if (events.length === 0) return;
  const insertMany = this.db.transaction((rows: StreamEventRecord[]) => {
    for (const row of rows) {
      this.persistStreamEvent(row);
    }
  });
  insertMany(events);
}
```

Using a transaction wraps all inserts in a single disk flush, which is dramatically faster than individual writes.

### 4. Add batching to wrappedOnEvent

In `ClaudeCodeClient.sendMessage()`, replace the per-event persistence with a batching approach:

```typescript
// Batch configuration
const BATCH_FLUSH_INTERVAL_MS = 100;
const BATCH_MAX_SIZE = 20;
const CRITICAL_EVENT_TYPES = new Set(['done', 'error', 'callStart', 'filesChanged']);

let eventBatch: StreamEventRecord[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const flushBatch = () => {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (eventBatch.length === 0) return;
  const toFlush = eventBatch;
  eventBatch = [];
  try {
    this.db.persistStreamEventBatch(toFlush);
  } catch (err) {
    if (!persistErrorLogged) {
      console.error(`[ClaudeCodeClient] Stream event batch persistence failed (conversationId=${conversationId}):`, err);
      persistErrorLogged = true;
    }
  }
};

const wrappedOnEvent = (streamEvent: StreamEvent) => {
  if (streamEvent.type === 'done') {
    doneEmitted = true;
  }

  // Build the record
  const record: StreamEventRecord = {
    sessionId,
    conversationId,
    sequenceNumber: tracker.nextSequence(),
    eventType: streamEvent.type,
    payload: JSON.stringify(streamEvent),
    timestamp: new Date().toISOString(),
  };

  eventBatch.push(record);

  // Critical events flush immediately (done, error must be persisted NOW)
  if (CRITICAL_EVENT_TYPES.has(streamEvent.type) || eventBatch.length >= BATCH_MAX_SIZE) {
    flushBatch();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flushBatch, BATCH_FLUSH_INTERVAL_MS);
  }

  // Forward ALL events to the caller immediately (no batching for UI)
  params.onEvent(streamEvent);
};
```

### 5. Flush on process exit

In the `child.on('close')` handler, ensure the batch is flushed before the promise resolves:

```typescript
child.on('close', (code) => {
  flushBatch(); // Flush any remaining batched events
  // ... existing close logic
});
```

### 6. Clean up timer on abort

If the process is aborted via `this.activeProcesses`, ensure the flush timer is cleared. Add `flushBatch()` to any cleanup/abort path so no events are lost.

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Grep for `persistStreamEventBatch` in interfaces.ts and DatabaseService.ts — should exist
3. Grep for `BATCH_FLUSH_INTERVAL_MS` in ClaudeCodeClient.ts — should show the batching configuration
4. Grep for `flushBatch` in the `close` event handler — should exist to prevent event loss
5. The transaction-wrapped batch insert should appear in DatabaseService

---

## State Update

After completing this prompt, update `prompts/arch/r003/STATE.md`:
- Set FIX-08 status to `done`
- Set Completed date
- Add notes about any complications or design decisions
