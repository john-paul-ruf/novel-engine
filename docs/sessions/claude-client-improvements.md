# ClaudeCodeClient Improvements — Session Prompts

Six enhancements to the CLI streaming layer, ordered by dependency. Each session
builds on the previous one. Execute in order.

---

## Session A: Domain Types & Schema — Stream Event Persistence + Rich Tool Tracking

### Goal

Extend the domain types and database schema to support:
1. Persisting every stream event to SQLite (for timeline replay on refresh)
2. File-touch tracking as a `Map<path, writeCount>` instead of a flat array
3. A high-level progress stage enum inferred from tool-use patterns
4. A thinking summary (first ~200 chars or last complete sentence)
5. Timestamped tool-use blocks with duration
6. Orphaned session detection and recovery

### Files to Create / Modify

**`src/domain/types.ts`** — Add these types:

```typescript
// === Progress Stage ===
// High-level stage inferred from tool-use patterns during a CLI stream.
// The UI binds a status indicator to this single string.
export type ProgressStage =
  | 'idle'
  | 'reading'      // agent is using Read/LS tools
  | 'thinking'     // extended thinking block is active
  | 'drafting'     // first Write to a file path
  | 'editing'      // Edit tool or second+ Write to a previously-written path
  | 'reviewing'    // Read of a file the agent already wrote in this session
  | 'complete';    // result event received

// === File Touch Tracking ===
export type FileTouchMap = Record<string, number>;  // path → write count

// === Timestamped Tool Use ===
export type TimestampedToolUse = ToolUseInfo & {
  startedAt: number;    // Date.now() when tool_use block started
  endedAt?: number;     // Date.now() when content_block_stop fires
  durationMs?: number;  // endedAt - startedAt
};

// === Thinking Summary ===
// First ~200 chars or last complete sentence of a thinking block.
export type ThinkingSummary = {
  text: string;          // the summary snippet
  fullLengthChars: number;  // total chars in the full thinking block
};

// === Persisted Stream Event ===
// Every event that flows through onEvent is persisted to SQLite for replay.
export type PersistedStreamEvent = {
  id: number;                     // auto-increment PK
  sessionId: string;              // groups events for one CLI call
  conversationId: string;         // the conversation this belongs to
  sequenceNumber: number;         // ordering within the session
  eventType: string;              // StreamEvent.type discriminator
  payload: string;                // JSON-serialized StreamEvent
  timestamp: string;              // ISO date
};

// === Session Record ===
// Tracks a single CLI invocation for orphan detection.
export type StreamSessionRecord = {
  id: string;                     // nanoid
  conversationId: string;
  agentName: AgentName;
  model: string;
  bookSlug: string;
  startedAt: string;              // ISO date
  endedAt: string | null;         // null = still running (or orphaned)
  finalStage: ProgressStage;      // last known stage
  filesTouched: FileTouchMap;     // accumulated file touch map
  interrupted: boolean;           // true if marked as orphaned on startup
};
```

Update the existing `StreamEvent` union to add three new event variants:

```typescript
// Add to the StreamEvent union:
| { type: 'progressStage'; stage: ProgressStage }
| { type: 'thinkingSummary'; summary: ThinkingSummary }
| { type: 'toolDuration'; tool: TimestampedToolUse }
```

Update `ActiveStreamInfo` to include the new fields:

```typescript
export type ActiveStreamInfo = {
  conversationId: string;
  agentName: AgentName;
  model: string;
  bookSlug: string;
  startedAt: string;
  sessionId: string;              // NEW — links to StreamSessionRecord
  progressStage: ProgressStage;   // NEW — current inferred stage
  filesTouched: FileTouchMap;     // NEW — accumulated file touches
};
```

**`src/domain/interfaces.ts`** — Extend `IDatabaseService` with:

```typescript
// Stream event persistence
persistStreamEvent(event: Omit<PersistedStreamEvent, 'id'>): void;
getStreamEvents(sessionId: string): PersistedStreamEvent[];
deleteStreamEvents(sessionId: string): void;
pruneStreamEvents(olderThanDays: number): void;

// Session records
createStreamSession(session: StreamSessionRecord): void;
endStreamSession(sessionId: string, finalStage: ProgressStage, filesTouched: FileTouchMap): void;
getActiveStreamSessions(): StreamSessionRecord[];
markSessionInterrupted(sessionId: string, lastStage: ProgressStage): void;
```

**`src/infrastructure/database/schema.ts`** — Add two new tables:

```sql
CREATE TABLE IF NOT EXISTS stream_events (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id       TEXT NOT NULL,
  conversation_id  TEXT NOT NULL,
  sequence_number  INTEGER NOT NULL,
  event_type       TEXT NOT NULL,
  payload          TEXT NOT NULL,
  timestamp        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stream_events_session
  ON stream_events(session_id, sequence_number);

CREATE TABLE IF NOT EXISTS stream_sessions (
  id               TEXT PRIMARY KEY,
  conversation_id  TEXT NOT NULL,
  agent_name       TEXT NOT NULL,
  model            TEXT NOT NULL,
  book_slug        TEXT NOT NULL,
  started_at       TEXT NOT NULL,
  ended_at         TEXT,
  final_stage      TEXT NOT NULL DEFAULT 'idle',
  files_touched    TEXT NOT NULL DEFAULT '{}',
  interrupted      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_stream_sessions_active
  ON stream_sessions(ended_at) WHERE ended_at IS NULL;
```

**`src/infrastructure/database/DatabaseService.ts`** — Implement the new `IDatabaseService` methods:

- `persistStreamEvent`: INSERT with parameterized query. Use a prepared statement.
- `getStreamEvents`: SELECT ordered by `sequence_number`.
- `deleteStreamEvents`: DELETE by `session_id`.
- `pruneStreamEvents`: DELETE WHERE `timestamp < datetime('now', '-N days')`.
- `createStreamSession`: INSERT the full record. `files_touched` stored as `JSON.stringify(filesTouched)`.
- `endStreamSession`: UPDATE `ended_at`, `final_stage`, `files_touched`.
- `getActiveStreamSessions`: SELECT WHERE `ended_at IS NULL`.
- `markSessionInterrupted`: UPDATE `interrupted = 1`, `final_stage`, `ended_at = datetime('now')`.

### Verification

- `npx tsc --noEmit` passes with no errors.
- The two new tables are created on app startup.
- All new `IDatabaseService` methods have matching prepared statements in `DatabaseService`.

---

## Session B: Stream Session Tracker — Extracting State from ClaudeCodeClient

### Goal

Create a new infrastructure-level class, `StreamSessionTracker`, that encapsulates
all the new tracking state for a single CLI invocation. The `ClaudeCodeClient` will
instantiate one per `sendMessage` call. This keeps the client class clean and makes
testing easier.

### Files to Create

**`src/infrastructure/claude-cli/StreamSessionTracker.ts`**

This class manages the per-call mutable state that was previously scattered as local
variables in `sendMessage`. It also adds the new tracking capabilities.

```typescript
/**
 * Tracks state for a single CLI stream session.
 *
 * Instantiated once per sendMessage() call. Encapsulates:
 * - File touch map (path → write count)
 * - Progress stage inference
 * - Thinking summary extraction
 * - Tool use timestamping
 * - Event sequence numbering for persistence
 *
 * This is a pure state-machine class with no I/O dependencies.
 */
export class StreamSessionTracker {
  readonly sessionId: string;
  private sequenceNumber = 0;
  private fileTouches: Map<string, number> = new Map();
  private currentStage: ProgressStage = 'idle';
  private thinkingBuffer = '';
  private currentBlockType: StreamBlockType | null = null;
  private hasEmittedText = false;
  private currentToolName = '';
  private currentToolId = '';
  private toolInputBuffer = '';
  private activeToolTimestamps: Map<string, number> = new Map(); // toolId → start time

  constructor(sessionId: string) { ... }

  // --- Existing State (migrated from ClaudeCodeClient locals) ---

  getCurrentBlockType(): StreamBlockType | null { ... }
  setCurrentBlockType(bt: StreamBlockType | null): void { ... }
  getHasEmittedText(): boolean { ... }
  markTextEmitted(): void { ... }
  getCurrentToolName(): string { ... }
  setCurrentToolName(name: string): void { ... }
  getCurrentToolId(): string { ... }
  setCurrentToolId(id: string): void { ... }
  getToolInputBuffer(): string { ... }
  setToolInputBuffer(input: string): void { ... }
  appendToolInput(partial: string): void { ... }
  getThinkingBuffer(): string { ... }
  appendThinkingBuffer(text: string): void { ... }
  resetThinkingBuffer(): void { ... }

  // --- File Tracking ---

  /**
   * Record a file touch from a Write or Edit tool completion.
   * Increments the write count for this path.
   * Returns the new count (1 = first draft, 2+ = revision/re-edit).
   */
  touchFile(filePath: string): number {
    const current = this.fileTouches.get(filePath) ?? 0;
    const next = current + 1;
    this.fileTouches.set(filePath, next);
    return next;
  }

  /** Returns the full file touch map as a plain Record. */
  getFileTouches(): FileTouchMap {
    return Object.fromEntries(this.fileTouches);
  }

  /** Returns paths where writeCount === 1 (first drafts this session). */
  getFirstDrafts(): string[] {
    return [...this.fileTouches.entries()]
      .filter(([, count]) => count === 1)
      .map(([path]) => path);
  }

  /** Returns paths where writeCount > 1 (revised files this session). */
  getRevisedFiles(): string[] {
    return [...this.fileTouches.entries()]
      .filter(([, count]) => count > 1)
      .map(([path]) => path);
  }

  // --- Progress Stage ---

  /**
   * Infer the progress stage from the current event context.
   *
   * State machine transitions:
   *   idle → reading          (Read/LS tool starts)
   *   idle|reading → thinking (thinking block starts)
   *   any → drafting          (first Write to a new path)
   *   any → editing           (Edit tool, or Write to an already-touched path)
   *   any → reviewing         (Read of a path in fileTouches — agent self-reviews)
   *   any → complete          (result event)
   *
   * Returns the new stage, or null if the stage didn't change.
   */
  inferStage(eventType: string, toolName?: string, filePath?: string): ProgressStage | null {
    let newStage: ProgressStage | null = null;

    if (eventType === 'result') {
      newStage = 'complete';
    } else if (eventType === 'blockStart' && this.currentBlockType === 'thinking') {
      newStage = 'thinking';
    } else if (eventType === 'toolUse' && toolName) {
      if (toolName === 'Read' || toolName === 'LS') {
        // Check if reading a file we already wrote → reviewing
        if (filePath && this.fileTouches.has(filePath)) {
          newStage = 'reviewing';
        } else if (this.currentStage === 'idle' || this.currentStage === 'thinking') {
          newStage = 'reading';
        }
      } else if (toolName === 'Write') {
        if (filePath && this.fileTouches.has(filePath)) {
          newStage = 'editing';
        } else {
          newStage = 'drafting';
        }
      } else if (toolName === 'Edit') {
        newStage = 'editing';
      }
    }

    if (newStage && newStage !== this.currentStage) {
      this.currentStage = newStage;
      return newStage;
    }
    return null;
  }

  getCurrentStage(): ProgressStage { return this.currentStage; }

  // --- Thinking Summary ---

  /**
   * Extract a summary when a thinking block ends.
   *
   * Strategy: take the first ~200 chars. If that cuts mid-sentence,
   * back up to the last sentence boundary (period, question mark,
   * exclamation mark followed by a space or end-of-string).
   * If no sentence boundary found within the first 200, truncate with "…".
   *
   * Returns null if the thinking buffer is empty.
   */
  extractThinkingSummary(): ThinkingSummary | null {
    if (!this.thinkingBuffer.trim()) return null;

    const full = this.thinkingBuffer;
    const maxLen = 200;

    if (full.length <= maxLen) {
      return { text: full.trim(), fullLengthChars: full.length };
    }

    // Look for sentence boundary within first 200 chars
    const snippet = full.slice(0, maxLen);
    const sentenceEnd = snippet.search(/[.!?](?:\s|$)/);

    let text: string;
    if (sentenceEnd !== -1 && sentenceEnd > 40) {
      // Found a reasonable sentence boundary
      text = snippet.slice(0, sentenceEnd + 1).trim();
    } else {
      // No sentence boundary — truncate at last word boundary
      const lastSpace = snippet.lastIndexOf(' ');
      text = (lastSpace > 40 ? snippet.slice(0, lastSpace) : snippet).trim() + '…';
    }

    return { text, fullLengthChars: full.length };
  }

  // --- Tool Timestamping ---

  /** Record when a tool_use block starts. Returns the timestamp. */
  startTool(toolId: string): number {
    const now = Date.now();
    this.activeToolTimestamps.set(toolId, now);
    return now;
  }

  /**
   * Record when a tool_use block ends.
   * Returns a TimestampedToolUse with duration, or the base info if
   * no start timestamp was recorded.
   */
  endTool(toolInfo: ToolUseInfo): TimestampedToolUse {
    const startedAt = this.activeToolTimestamps.get(toolInfo.toolId) ?? Date.now();
    const endedAt = Date.now();
    this.activeToolTimestamps.delete(toolInfo.toolId);
    return {
      ...toolInfo,
      startedAt,
      endedAt,
      durationMs: endedAt - startedAt,
    };
  }

  // --- Event Sequencing ---

  /** Returns the next sequence number for event persistence. */
  nextSequence(): number { return this.sequenceNumber++; }
}
```

**`src/infrastructure/claude-cli/index.ts`** — Update barrel to export `StreamSessionTracker`.

### Verification

- `npx tsc --noEmit` passes.
- The tracker is a pure class with no I/O dependencies — it could be unit-tested with
  synthetic events.
- The `inferStage` method correctly transitions through the state machine for common
  event sequences (Read → thinking → Write → Edit → Read-of-written-file → result).

---

## Session C: Integrate Tracker into ClaudeCodeClient

### Goal

Refactor `ClaudeCodeClient.sendMessage` to use `StreamSessionTracker` and emit the
new event types. Also persist every event to the database via a new constructor
dependency.

### Files to Modify

**`src/domain/interfaces.ts`** — Update `IClaudeClient.sendMessage` params:

Add optional `sessionId` and `conversationId` parameters:

```typescript
export interface IClaudeClient {
  sendMessage(params: {
    model: string;
    systemPrompt: string;
    messages: { role: MessageRole; content: string }[];
    maxTokens: number;
    thinkingBudget?: number;
    bookSlug?: string;
    workingDir?: string;
    sessionId?: string;          // NEW — caller-provided session ID for tracking
    conversationId?: string;     // NEW — needed for event persistence
    onEvent: (event: StreamEvent) => void;
  }): Promise<void>;

  isAvailable(): Promise<boolean>;
  invalidateAvailabilityCache(): void;
}
```

**`src/infrastructure/claude-cli/ClaudeCodeClient.ts`** — Major refactor:

1. **Constructor** now accepts `IDatabaseService` as a second parameter:

   ```typescript
   constructor(
     private booksDir: string,
     private db: IDatabaseService,
   ) {}
   ```

2. **Replace `mapStreamEvent`'s 16-parameter signature** with a cleaner method:

   ```typescript
   private processStreamEvent(
     event: Record<string, unknown>,
     tracker: StreamSessionTracker,
     onEvent: (event: StreamEvent) => void,
   ): void
   ```

   The tracker holds all mutable state (currentBlockType, thinkingBuffer,
   toolInputBuffer, etc.). The method:
   - Parses the raw CLI event (same logic as current `mapStreamEvent`)
   - Uses `tracker.touchFile()` on Write/Edit completions instead of `changedFiles.push()`
   - Calls `tracker.inferStage()` and emits `{ type: 'progressStage', stage }` when stage changes
   - Calls `tracker.appendThinkingBuffer()` on thinking deltas
   - Calls `tracker.extractThinkingSummary()` on thinking block end → emits `{ type: 'thinkingSummary', summary }`
   - Calls `tracker.startTool()` / `tracker.endTool()` → emits `{ type: 'toolDuration', tool }` on completion

3. **Wrap `onEvent`** to persist every emitted event:

   ```typescript
   const wrappedOnEvent = (streamEvent: StreamEvent) => {
     this.db.persistStreamEvent({
       sessionId,
       conversationId: params.conversationId ?? '',
       sequenceNumber: tracker.nextSequence(),
       eventType: streamEvent.type,
       payload: JSON.stringify(streamEvent),
       timestamp: new Date().toISOString(),
     });
     params.onEvent(streamEvent);
   };
   ```

4. **Update `done` event** to include `filesTouched`:

   The `done` event in the `StreamEvent` union gains a `filesTouched` field:
   ```typescript
   | { type: 'done'; inputTokens: number; outputTokens: number; thinkingTokens: number; filesTouched: FileTouchMap }
   ```

   In `processStreamEvent`, when emitting done:
   ```typescript
   onEvent({
     type: 'done',
     inputTokens, outputTokens, thinkingTokens,
     filesTouched: tracker.getFileTouches(),
   });
   ```

5. **The `filesChanged` event** now uses the tracker's file touch map keys
   (preserving backward compatibility — paths array is just the Map keys):

   ```typescript
   const touchedPaths = Object.keys(tracker.getFileTouches());
   if (touchedPaths.length > 0) {
     wrappedOnEvent({ type: 'filesChanged', paths: touchedPaths });
   }
   ```

6. **Remove all the setter-callback parameters** from `mapStreamEvent`. The
   tracker absorbs all that state. Delete the old `mapStreamEvent` method entirely.

### Files to Modify (composition root)

**`src/main/index.ts`** — Update the `ClaudeCodeClient` instantiation:

```typescript
const claude = new ClaudeCodeClient(booksDir, db);
```

### Verification

- `npx tsc --noEmit` passes.
- Run the app, send a message, and verify in the SQLite database:
  - `stream_events` table is populated with events in `sequence_number` order
  - `progressStage` events appear in the stream
  - `thinkingSummary` events appear after thinking blocks end
  - `toolDuration` events have correct `durationMs` values
  - The `done` event's `filesTouched` field has write counts > 1 for revised files

---

## Session D: Orphan Detection — Startup Recovery

### Goal

On app startup, check for stream sessions that have `ended_at IS NULL` in the
database. These are orphans from crashes or forced quits. Mark them as interrupted
and expose the last known state so the UI can show "Session interrupted at: drafting".

### Files to Modify

**`src/application/ChatService.ts`**:

Add a new public field and method:

```typescript
private recoveredOrphans: StreamSessionRecord[] = [];

/**
 * Called once at app startup. Checks for orphaned stream sessions
 * (started but never finished) and marks them as interrupted.
 *
 * Returns the list of interrupted sessions so the UI can display
 * a recovery notice (e.g., "Previous session interrupted during: drafting").
 */
async recoverOrphanedSessions(): Promise<StreamSessionRecord[]> {
  const orphans = this.db.getActiveStreamSessions();

  for (const session of orphans) {
    this.db.markSessionInterrupted(session.id, session.finalStage);
  }

  this.recoveredOrphans = orphans;
  return orphans;
}

/** Returns orphans recovered at startup (cached). */
getRecoveredOrphans(): StreamSessionRecord[] {
  return this.recoveredOrphans;
}
```

Modify `sendMessage` to create and close stream session records:

At the start (after loading settings and agent, before the CLI call):
```typescript
const sessionId = nanoid();
this.db.createStreamSession({
  id: sessionId,
  conversationId,
  agentName,
  model: appSettings.model,
  bookSlug,
  startedAt: new Date().toISOString(),
  endedAt: null,
  finalStage: 'idle',
  filesTouched: {},
  interrupted: false,
});
```

Pass `sessionId` and `conversationId` to `claude.sendMessage`:
```typescript
await this.claude.sendMessage({
  ...existingParams,
  sessionId,
  conversationId,
});
```

In the `done` handler:
```typescript
this.db.endStreamSession(sessionId, 'complete', event.filesTouched);
```

In the `error` handler / catch block:
```typescript
this.db.endStreamSession(sessionId, 'idle', {});
```

Update `activeStream` construction to include new fields:
```typescript
this.activeStream = {
  conversationId,
  agentName,
  model: appSettings.model,
  bookSlug,
  startedAt: new Date().toISOString(),
  sessionId,
  progressStage: 'idle',
  filesTouched: {},
};
```

**`src/main/index.ts`** — Call `chatService.recoverOrphanedSessions()` during app
startup, after database initialization but before creating the main window. Also call
`db.pruneStreamEvents(7)` to clean up old event data.

**`src/main/ipc/handlers.ts`** — Add a new handler:

```typescript
ipcMain.handle('chat:getOrphanedSessions', () =>
  chatService.getRecoveredOrphans()
);
```

**`src/preload/index.ts`** — Expose the new method in the chat namespace:

```typescript
getOrphanedSessions: () => ipcRenderer.invoke('chat:getOrphanedSessions'),
```

### Verification

- `npx tsc --noEmit` passes.
- Simulate an orphan: start a message, force-quit the app, relaunch. The
  `stream_sessions` table should show the orphan with `interrupted = 1` and a valid
  `final_stage`.
- `chat:getOrphanedSessions` returns the orphan list from the renderer.

---

## Session E: Update ChatService Active Stream Tracking

### Goal

Keep `ChatService.activeStream` in sync with the new progress stage and file touch
map as events flow through. This way `getActiveStream()` always returns current
state, and the renderer can show real-time progress after a mid-stream refresh.

### Files to Modify

**`src/application/ChatService.ts`** — In the `onEvent` callback inside `sendMessage`:

```typescript
onEvent: (event: StreamEvent) => {
  // Update activeStream with live progress data
  if (this.activeStream) {
    if (event.type === 'progressStage') {
      this.activeStream.progressStage = event.stage;
    }
    if (event.type === 'toolDuration') {
      // Update file touch map for each completed tool with a file path
      if (event.tool.filePath && (event.tool.toolName === 'Write' || event.tool.toolName === 'Edit')) {
        const current = this.activeStream.filesTouched[event.tool.filePath] ?? 0;
        this.activeStream.filesTouched[event.tool.filePath] = current + 1;
      }
    }
    if (event.type === 'done') {
      // Snapshot the final file touch map from the done event
      this.activeStream.filesTouched = event.filesTouched;
    }
  }

  // ... rest of existing handler (accumulate text, save on done, etc.)
}
```

Apply the same pattern to `handlePitchRoomMessage`'s inner `onEvent` callback.

### Verification

- Call `getActiveStream()` mid-stream from the renderer — `progressStage` reflects
  the current agent activity (e.g., `'reading'`, `'drafting'`).
- `filesTouched` accumulates in real-time as the agent writes files.
- After the stream ends, `getActiveStream()` returns `null` as before.

---

## Session F: Renderer Integration — Wire Up New Events

### Goal

Update the renderer's `chatStore` and stream event handler to consume the three new
event types (`progressStage`, `thinkingSummary`, `toolDuration`) and expose them for
UI binding. Also wire up orphan recovery.

### Files to Modify

**`src/renderer/stores/chatStore.ts`**:

Add new state fields to `ChatState`:

```typescript
// New tracking fields
progressStage: ProgressStage;              // current high-level agent activity
thinkingSummary: string;                   // latest thinking summary text
toolTimings: TimestampedToolUse[];         // completed tool uses with durations

// Orphan recovery
interruptedSession: StreamSessionRecord | null;
dismissInterrupted: () => void;
```

Initialize defaults:
```typescript
progressStage: 'idle',
thinkingSummary: '',
toolTimings: [],
interruptedSession: null,
```

Handle the new events in `_handleStreamEvent`:

```typescript
case 'progressStage':
  set({ progressStage: event.stage });
  break;

case 'thinkingSummary':
  set({ thinkingSummary: event.summary.text });
  break;

case 'toolDuration':
  set((state) => ({
    toolTimings: [...state.toolTimings, event.tool],
  }));
  break;
```

Reset the new fields when streaming ends (in the `done` handler, alongside existing resets):

```typescript
progressStage: 'idle',
thinkingSummary: '',
toolTimings: [],
```

Update `recoverActiveStream` to use the enriched `ActiveStreamInfo`:

```typescript
recoverActiveStream: async () => {
  const active = await window.novelEngine.chat.getActiveStream();
  if (!active) {
    // Check for orphans from a previous crash
    try {
      const orphans = await window.novelEngine.chat.getOrphanedSessions();
      if (orphans.length > 0) {
        set({ interruptedSession: orphans[0] });
      }
    } catch {
      // Orphan check is best-effort
    }
    return;
  }

  // ... existing recovery logic, plus:
  set({
    // ... existing streaming recovery fields ...
    progressStage: active.progressStage ?? 'idle',
  });
};
```

Add the dismiss action:
```typescript
dismissInterrupted: () => set({ interruptedSession: null }),
```

Also reset `interruptedSession` in `switchBook`:
```typescript
interruptedSession: null,
```

### Type imports

Add `ProgressStage`, `TimestampedToolUse`, `StreamSessionRecord` to the domain type
imports at the top of chatStore.ts.

### Verification

- `npx tsc --noEmit` passes.
- Run the app, send a message, and verify:
  - `progressStage` updates in React DevTools as the agent works (reading → thinking → drafting, etc.)
  - `thinkingSummary` populates briefly after each thinking block with a ~200 char snippet
  - `toolTimings` accumulates with duration data (e.g., `{ toolName: 'Read', durationMs: 1234 }`)
  - After a simulated crash and relaunch, `interruptedSession` is populated with the orphan data
  - Calling `dismissInterrupted()` clears it
- Existing `toolActivity`, `lastChangedFiles`, and `messageToolActivity` still work (backward compatible)

---

## Session Summary

| Session | Layer | What It Does |
|---------|-------|-------------|
| **A** | Domain + Database | New types, schema tables, DB methods |
| **B** | Infrastructure | `StreamSessionTracker` class (pure state machine, no I/O) |
| **C** | Infrastructure | Integrate tracker into `ClaudeCodeClient`, persist events, emit new event types |
| **D** | Application + Main | Orphan detection at startup, session lifecycle in ChatService, IPC + preload |
| **E** | Application | Keep `activeStream` in sync with progress stage and file touches in real-time |
| **F** | Renderer | Wire new events into Zustand store for UI binding, orphan recovery UX |

### Pruning Strategy

Stream events accumulate fast. Session A includes `pruneStreamEvents(olderThanDays)`.
Call this on startup (Session D) with a 7-day window — old events are diagnostic
history, not essential data. The `stream_sessions` table is small and can be kept
indefinitely.

### Backward Compatibility

All new `StreamEvent` variants are additive — existing event handlers in the chat
store's `_handleStreamEvent` switch statement ignore unknown `type` values via the
default fall-through. The `done` event gains a `filesTouched` field; code that
destructures only `inputTokens`/`outputTokens`/`thinkingTokens` continues to work.
The new `IClaudeClient.sendMessage` params (`sessionId`, `conversationId`) are
optional — callers that don't pass them get auto-generated IDs and no persistence
(graceful degradation).
