# SESSION-05 — Renderer Store: helperStore

> **Feature:** helper-agent
> **Layer(s):** Renderer
> **Depends on:** SESSION-04
> **Estimated effort:** 15 min

---

## Context

SESSION-04 wired the `HelperService` into the IPC layer, exposing `window.novelEngine.helper.*` to the renderer. This session creates the Zustand store that manages the helper panel's state — conversation, messages, streaming, and visibility.

The `helperStore` follows the same patterns as `modalChatStore` (which powers the voice-setup and author-profile modal chats) but with key differences:
- **App-wide scope**: not tied to any book slug. Persists across book switches.
- **Single conversation**: one persistent conversation, reused across the app lifetime.
- **Floating panel visibility**: controls whether the helper chat panel is open.
- **Stream scoping via callId**: uses the `createStreamHandler` utility to process events from the global `chat:streamEvent` channel.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/stores/helperStore.ts` | Create | Zustand store for helper panel state, conversation, messages, and streaming |

---

## Implementation

### 1. Create `src/renderer/stores/helperStore.ts`

Read these files first to understand existing patterns:
- `src/renderer/stores/modalChatStore.ts` — the closest existing pattern
- `src/renderer/stores/streamHandler.ts` — shared stream event handling
- `src/renderer/stores/chatStore.ts` — for `initStreamListener` / `destroyStreamListener` pattern

```typescript
import { create } from 'zustand';
import type { Conversation, Message, StreamEvent } from '@domain/types';
import { randomRespondingStatus } from '@domain/statusMessages';
import { createStreamHandler } from './streamHandler';
```

#### State Shape

```typescript
type HelperState = {
  // Visibility
  isOpen: boolean;

  // Conversation state
  conversation: Conversation | null;
  messages: Message[];
  isStreaming: boolean;
  isThinking: boolean;
  streamBuffer: string;
  thinkingBuffer: string;
  statusMessage: string;
  isLoading: boolean;  // true while initializing conversation

  // Actions
  toggle: () => void;
  open: () => Promise<void>;
  close: () => void;
  sendMessage: (content: string) => Promise<void>;
  abort: () => void;
  resetConversation: () => Promise<void>;

  // Call scoping
  _activeCallId: string | null;

  // Stream handling (internal)
  _handleStreamEvent: (event: StreamEvent) => void;
  _cleanupListener: (() => void) | null;
  initStreamListener: () => void;
  destroyStreamListener: () => void;
};
```

#### Store Implementation

Key behaviors:

**`toggle()`** — If closed, calls `open()`. If open, calls `close()`.

**`open()`** — Sets `isOpen: true`, `isLoading: true`. Calls `window.novelEngine.helper.getOrCreateConversation()` to get/create the persistent conversation. Then loads messages. Sets `isLoading: false`.

```typescript
open: async () => {
  set({ isOpen: true, isLoading: true });
  try {
    const conversation = await window.novelEngine.helper.getOrCreateConversation();
    const messages = await window.novelEngine.helper.getMessages(conversation.id);
    set({ conversation, messages, isLoading: false });
  } catch (error) {
    console.error('Failed to open helper:', error);
    set({ isLoading: false });
  }
},
```

**`close()`** — Sets `isOpen: false`. Does NOT clear conversation state — the conversation persists. If streaming, don't close (same deferred-close pattern as `modalChatStore`).

```typescript
close: () => {
  const { isStreaming } = get();
  if (isStreaming) {
    // Don't close while streaming — will auto-close on done if close was requested
    return;
  }
  set({ isOpen: false });
},
```

**`sendMessage(content)`** — Generates a `callId`, adds optimistic user message, sets streaming state, calls `window.novelEngine.helper.send(...)`.

```typescript
sendMessage: async (content: string) => {
  const { conversation } = get();
  if (!conversation) return;

  const callId = crypto.randomUUID();
  const tempMessage: Message = {
    id: 'temp-' + Date.now(),
    role: 'user',
    content,
    thinking: '',
    conversationId: conversation.id,
    timestamp: new Date().toISOString(),
  };

  set((state) => ({
    messages: [...state.messages, tempMessage],
    isStreaming: true,
    streamBuffer: '',
    thinkingBuffer: '',
    statusMessage: randomRespondingStatus(),
    _activeCallId: callId,
  }));

  try {
    await window.novelEngine.helper.send({
      message: content,
      conversationId: conversation.id,
      callId,
    });
  } catch (error) {
    console.error('Failed to send helper message:', error);
    set((state) => ({
      messages: state.messages.filter(m => m.id !== tempMessage.id),
      isStreaming: false,
      isThinking: false,
      streamBuffer: '',
      thinkingBuffer: '',
      _activeCallId: null,
    }));
  }
},
```

**`abort()`** — Calls `window.novelEngine.helper.abort(conversationId)`.

**`resetConversation()`** — Calls `window.novelEngine.helper.reset()`, then clears local state.

**`_handleStreamEvent`** — Uses `createStreamHandler` with the same pattern as `modalChatStore`:

```typescript
_handleStreamEvent: (() => {
  let handler: ((event: StreamEvent) => void) | null = null;
  return (event: StreamEvent) => {
    if (!handler) {
      handler = createStreamHandler({
        getActiveCallId: () => useHelperStore.getState()._activeCallId,
        getIsStreaming: () => useHelperStore.getState().isStreaming,
        getActiveConversationId: () => useHelperStore.getState().conversation?.id ?? null,
        alwaysCheckConversationId: true,

        onStatus: (message) => useHelperStore.setState({ statusMessage: message }),
        onBlockStart: (blockType) => {
          if (blockType === 'thinking') {
            useHelperStore.setState({ isThinking: true, statusMessage: '' });
          } else if (blockType === 'text') {
            useHelperStore.setState({ isThinking: false, statusMessage: '' });
          }
        },
        onThinkingDelta: (text) => useHelperStore.setState((s) => ({ thinkingBuffer: s.thinkingBuffer + text })),
        onTextDelta: (text) => useHelperStore.setState((s) => ({ streamBuffer: s.streamBuffer + text })),

        onDone: () => {
          const { conversation } = useHelperStore.getState();
          if (conversation) {
            window.novelEngine.helper.getMessages(conversation.id)
              .then((messages) => {
                useHelperStore.setState({
                  messages,
                  isStreaming: false,
                  isThinking: false,
                  streamBuffer: '',
                  thinkingBuffer: '',
                  statusMessage: '',
                  _activeCallId: null,
                });
              })
              .catch(() => {
                useHelperStore.setState({
                  isStreaming: false,
                  isThinking: false,
                  streamBuffer: '',
                  thinkingBuffer: '',
                  statusMessage: '',
                  _activeCallId: null,
                });
              });
          } else {
            useHelperStore.setState({
              isStreaming: false,
              isThinking: false,
              streamBuffer: '',
              thinkingBuffer: '',
              statusMessage: '',
              _activeCallId: null,
            });
          }
        },

        onError: (message) => {
          useHelperStore.setState((state) => ({
            messages: [...state.messages, {
              id: 'error-' + Date.now(),
              role: 'assistant' as const,
              content: `Error: ${message}`,
              thinking: '',
              conversationId: state.conversation?.id ?? '',
              timestamp: new Date().toISOString(),
            }],
            isStreaming: false,
            isThinking: false,
            streamBuffer: '',
            thinkingBuffer: '',
            statusMessage: '',
            _activeCallId: null,
          }));
        },
      });
    }
    handler(event);
  };
})(),
```

**`initStreamListener()` / `destroyStreamListener()`** — Same pattern as `modalChatStore`:

```typescript
initStreamListener: () => {
  const { _cleanupListener, _handleStreamEvent } = get();
  if (_cleanupListener) _cleanupListener();
  const cleanup = window.novelEngine.chat.onStreamEvent(_handleStreamEvent);
  set({ _cleanupListener: cleanup });
},

destroyStreamListener: () => {
  const { _cleanupListener } = get();
  if (_cleanupListener) _cleanupListener();
  set({ _cleanupListener: null });
},
```

**Important:** The stream listener subscribes to `window.novelEngine.chat.onStreamEvent` (the global channel). The `callId` scoping in `createStreamHandler` ensures only events from the helper's own CLI call are processed. This is the same approach used by `modalChatStore`.

---

## Architecture Compliance

- [x] Renderer accesses backend only through `window.novelEngine`
- [x] Uses `import type` for domain types — no value imports from domain (except `randomRespondingStatus` which is a pure function constant, already used by other stores)
- [x] No imports from infrastructure, application, or main
- [x] All async operations have error handling
- [x] Stream listener has cleanup function
- [x] callId scoping prevents cross-stream event bleed

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `useHelperStore` exports a Zustand store with all expected actions
3. No imports from `@infra/*` or `@app/*`
4. Stream handler uses `createStreamHandler` with `alwaysCheckConversationId: true`

---

## State Update

After completing this session, update `prompts/feature/helper-agent/STATE.md`:
- Set SESSION-05 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
