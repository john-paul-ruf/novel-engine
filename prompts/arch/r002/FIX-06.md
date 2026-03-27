# FIX-06 — Extract shared stream event handler utility

> **Issue(s):** 3.6
> **Severity:** 🟡 Medium
> **Category:** Architecture / Code Smell
> **Effort:** High
> **Depends on:** FIX-01

---

## Objective

Three stores — `chatStore`, `modalChatStore`, and `pitchRoomStore` — duplicate near-identical `_handleStreamEvent` logic: callId guard, `rev:` prefix filter, event type switch, buffer accumulation, done/error cleanup. Findings 1.3 and 1.4 (missing `_activeCallId` cleanup, fixed in FIX-01) affected all three identically, demonstrating the maintenance burden: bug fixes and new event types must be replicated three times.

This fix extracts a shared `createStreamHandler()` utility that encapsulates common guards, buffer accumulation, and cleanup, while accepting store-specific callbacks for `done` (message reload) and `error` (message creation) handling.

---

## Findings Addressed

| # | Issues.md Ref | Title | Severity |
|---|---------------|-------|----------|
| 1 | 3.6 | Three stores with near-identical _handleStreamEvent | 🟡 Medium |

---

## Files to Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/stores/streamHandler.ts` | Create | Shared stream event handler factory |
| `src/renderer/stores/chatStore.ts` | Modify | Replace `_handleStreamEvent` internals with shared handler |
| `src/renderer/stores/modalChatStore.ts` | Modify | Replace `_handleStreamEvent` internals with shared handler |
| `src/renderer/stores/pitchRoomStore.ts` | Modify | Replace `_handleStreamEvent` internals with shared handler |

---

## Implementation Steps

### 1. Identify the common pattern

Read all three `_handleStreamEvent` implementations. The shared logic is:

1. Cast event to `StreamEvent & { callId?, conversationId? }`
2. Filter `rev:` prefix
3. Primary guard: callId matching
4. Secondary guard: no active call → reject if not streaming
5. Switch on event type:
   - `status` → set `statusMessage`
   - `blockStart` → set `isThinking` / `isStreaming`
   - `thinkingDelta` → append to `thinkingBuffer`
   - `textDelta` → append to `streamBuffer`
   - `blockEnd` → no-op
   - `done` → store-specific (reload messages, clear state)
   - `error` → store-specific (create error message, clear state)

The differences:
- `chatStore`: `done` reloads messages + usage, clears recovery poll, handles tool activity, progress stage, thinking summary, tool duration, filesChanged
- `modalChatStore`: `done` reloads messages only, simpler cleanup; ignores toolUse, filesChanged, etc.
- `pitchRoomStore`: `done` reloads messages + conversation list; ignores most tool events

### 2. Design the shared handler

Create `src/renderer/stores/streamHandler.ts`:

```typescript
import type { StreamEvent } from '@domain/types';

interface StreamHandlerConfig {
  getActiveCallId: () => string | null;
  getIsStreaming: () => boolean;
  getActiveConversationId: () => string | null;

  // Buffer accumulation
  onStatus: (message: string) => void;
  onBlockStart: (blockType: string) => void;
  onThinkingDelta: (text: string) => void;
  onTextDelta: (text: string) => void;

  // Terminal events — store-specific
  onDone: () => void;
  onError: (message: string) => void;

  // Optional: store-specific events (chatStore uses these, others don't)
  onToolUse?: (tool: unknown) => void;
  onProgressStage?: (stage: string) => void;
  onThinkingSummary?: (summary: { text: string }) => void;
  onToolDuration?: (tool: unknown) => void;
  onFilesChanged?: (paths: string[]) => void;
}

export function createStreamHandler(config: StreamHandlerConfig): (event: StreamEvent) => void {
  return (event: StreamEvent) => {
    const enriched = event as StreamEvent & { callId?: string; conversationId?: string };
    const callId = enriched.callId;
    if (callId && callId.startsWith('rev:')) return;

    const activeCallId = config.getActiveCallId();
    const isStreaming = config.getIsStreaming();

    if (activeCallId && callId && callId !== activeCallId) return;
    if (!activeCallId) {
      if (!isStreaming) return;
      const activeConvId = config.getActiveConversationId();
      if (enriched.conversationId && activeConvId && enriched.conversationId !== activeConvId) return;
    }

    switch (event.type) {
      case 'status': config.onStatus(event.message); break;
      case 'blockStart': config.onBlockStart(event.blockType); break;
      case 'thinkingDelta': config.onThinkingDelta(event.text); break;
      case 'textDelta': config.onTextDelta(event.text); break;
      case 'blockEnd': break;
      case 'toolUse': config.onToolUse?.(event.tool); break;
      case 'progressStage': config.onProgressStage?.(event.stage); break;
      case 'thinkingSummary': config.onThinkingSummary?.(event.summary); break;
      case 'toolDuration': config.onToolDuration?.(event.tool); break;
      case 'filesChanged': config.onFilesChanged?.(event.paths); break;
      case 'done': config.onDone(); break;
      case 'error': config.onError(event.message); break;
    }
  };
}
```

### 3. Refactor each store

For each store, replace the `_handleStreamEvent` body. The `done` and `error` callbacks contain the store-specific logic (async DB reloads, fallback messages). Keep that logic in the store — only extract the shared guard/dispatch.

**Important:** Read the FIX-01 changes first. The error paths must include `_activeCallId: null` and temp message filtering.

### 4. Type the event payloads

Use `import type` for any domain types needed. The utility file lives in `src/renderer/stores/` so it can import types from `@domain/*` but NOT values.

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `src/renderer/stores/streamHandler.ts` exists and exports `createStreamHandler`
3. Grep for `callId.startsWith('rev:')` — should appear only in `streamHandler.ts`, not in any of the three stores
4. All three stores' `_handleStreamEvent` methods should be significantly shorter

---

## State Update

After completing this prompt, update `prompts/arch/r002/STATE.md`:
- Set FIX-06 status to `done`
- Set Completed date
- Add notes about any complications or design decisions
