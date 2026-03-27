# ARCH-04 — Extract Stream Lifecycle Helpers from ChatService

> **Issue:** #1 (ChatService is a god object — 1,218 lines)
> **Severity:** High (prerequisite for the main decomposition)
> **Effort:** Medium
> **Depends on:** ARCH-03 (interfaces exist)

---

## Objective

Extract the repetitive stream lifecycle management code from ChatService into a reusable `StreamManager` utility. Every `handle*` method in ChatService duplicates the same pattern: create activeStream entry, accumulate buffers, save message on done, record usage, clean up. This shared concern should live in one place.

---

## The Repeated Pattern

Every handler in ChatService repeats this ~50-line block:

1. Register active stream in `this.activeStreams.set(conversationId, { ... })`
2. Emit `callStart` event
3. In the `onEvent` callback: accumulate textDelta/thinkingDelta into buffers, update progressStage, track filesTouched, save message on done, record usage on done, end stream session, delete stream entry, handle error cleanup
4. Forward all events to the caller's `onEvent`

This pattern appears 4 times: main `sendMessage`, `handleHotTake`, `handleAdhocRevision`, `handlePitchRoomMessage`.

---

## Implementation Steps

### 1. Create `src/application/StreamManager.ts`

This is a stateful utility (not a domain-interface service). It owns the `activeStreams` map and the stream lifecycle pattern.

```typescript
import type { IDatabaseService, IUsageService } from '@domain/interfaces';
import type { ActiveStreamInfo, AgentName, StreamEvent } from '@domain/types';

export type StreamParams = {
  conversationId: string;
  agentName: AgentName;
  model: string;
  bookSlug: string;
  sessionId: string;
  callId: string;
  onEvent: (event: StreamEvent) => void;
};

export class StreamManager {
  private activeStreams: Map<string, ActiveStreamInfo> = new Map();
  private lastChangedFiles: string[] = [];

  constructor(
    private db: IDatabaseService,
    private usage: IUsageService,
  ) {}

  startStream(params: StreamParams): {
    onEvent: (event: StreamEvent) => void;
    getResponseBuffer: () => string;
    getThinkingBuffer: () => string;
  } { /* ... */ }

  getActiveStream(): ActiveStreamInfo | null { /* ... */ }
  getActiveStreamForBook(bookSlug: string): ActiveStreamInfo | null { /* ... */ }
  getLastChangedFiles(): string[] { /* ... */ }
  abortStream(conversationId: string): { ... } | null { /* ... */ }
}
```

The `startStream` method returns a callback tuple. The `onEvent` callback handles all accumulation, persistence, usage recording, and cleanup internally. The caller just passes it to `this.claude.sendMessage({ onEvent: stream.onEvent })`.

### 2. Extract `resolveThinkingBudget` to shared utility

Create `src/application/thinkingBudget.ts`:
```typescript
export function resolveThinkingBudget(
  settings: Pick<AppSettings, 'enableThinking' | 'thinkingBudget' | 'overrideThinkingBudget'>,
  agentThinkingBudget: number,
  perMessageOverride?: number,
): number | undefined { /* ... */ }
```

This is used by ChatService and will be used by every extracted service.

### 3. Update ChatService to use StreamManager

Replace all manual stream management with StreamManager calls. Move `getActiveStream()`, `getActiveStreamForBook()`, `getLastChangedFiles()` to delegate to StreamManager.

### 4. Update `abortStream` in ChatService

ChatService's `abortStream` calls `this.claude.abortStream()` for the process kill, then uses StreamManager for state cleanup and partial message save.

---

## Verification

1. `npx tsc --noEmit` passes
2. `src/application/StreamManager.ts` exists and is < 200 lines
3. `src/application/thinkingBudget.ts` exists
4. ChatService no longer has a `private activeStreams` field
5. The duplicated onEvent accumulation pattern appears only in StreamManager

---

## State Update

After completing this prompt, update `prompts/arch/STATE.md`:
- Set ARCH-04 status to `done`
- Set Completed date
- Note how many lines were removed from ChatService
