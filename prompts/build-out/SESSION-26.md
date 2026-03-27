# Session 26 — Modal Chat for Voice Profile & Author Profile

## Context

Novel Engine Electron app. Sessions 01–25 built the complete app including agent chat with pipeline lock, voice setup via `VoiceSetupButton`, and author profile editing in `SettingsView`.

**The Problem:** Clicking "Set Up Voice Profile" (sidebar) or "Set Up with Verity" / "Refine with Verity" (settings) navigates the user to the main chat view and creates a `voice-setup` or `author-profile` purpose conversation inline with the pipeline-locked chat. This causes two UX issues:

1. **Context loss** — the user is yanked away from whatever they were doing (settings, file browser, build view).
2. **Pipeline confusion** — voice-setup and author-profile conversations appear in the same chat space as pipeline-locked agent conversations. They aren't pipeline steps — they're side tasks that should feel separate.

**The Fix:** Open voice-setup and author-profile conversations in a **floating modal** that overlays the current view. The main pipeline chat is completely unaffected. The modal has its own isolated Zustand store, its own stream routing, and reuses existing `MessageBubble`, `ThinkingBlock`, and `ChatInput` components.

---

## Design

### Modal Anatomy

```
┌──────────────────────────────────────────────────────┐
│  ░░░░░░░░░░░░░ backdrop (black/60, blur) ░░░░░░░░░░ │
│  ░░░┌────────────────────────────────────────┐░░░░░░ │
│  ░░░│ Voice Profile Setup              [✕]   │░░░░░░ │
│  ░░░│ ──────────────────────────────────────  │░░░░░░ │
│  ░░░│ ● Verity — Ghostwriter                 │░░░░░░ │
│  ░░░│ ──────────────────────────────────────  │░░░░░░ │
│  ░░░│                                        │░░░░░░ │
│  ░░░│  [Messages scroll area]                │░░░░░░ │
│  ░░░│    User bubble                         │░░░░░░ │
│  ░░░│    Assistant bubble (with save btn)     │░░░░░░ │
│  ░░░│    ...                                 │░░░░░░ │
│  ░░░│    [Streaming message if active]        │░░░░░░ │
│  ░░░│                                        │░░░░░░ │
│  ░░░│ ──────────────────────────────────────  │░░░░░░ │
│  ░░░│ [Chat input area]              [Send]   │░░░░░░ │
│  ░░░└────────────────────────────────────────┘░░░░░░ │
└──────────────────────────────────────────────────────┘
```

- **Panel**: `w-[700px]`, `max-h-[85vh]`, `bg-zinc-900`, `rounded-xl`, `border border-zinc-700`, `shadow-2xl`
- **Backdrop**: `fixed inset-0 z-50 bg-black/60 backdrop-blur-sm`, click to close (only when not streaming)
- **Layout**: flex column — header, scrollable message area, input bar

### Stream Isolation

Both the modal and the main chat use the same `chat:streamEvent` IPC channel. A lightweight **stream router** (a mutable ref, not reactive state) tells each store's event handler whether to process or ignore incoming events.

```
modalChatStore.sendMessage()
  → sets streamRouter.target = 'modal'
  → calls window.novelEngine.chat.send(...)
  → stream events arrive on chat:streamEvent
  → chatStore._handleStreamEvent checks router → target is 'modal' → early return
  → modalChatStore._handleStreamEvent checks router → target is 'modal' → processes event
  → on done/error → resets streamRouter.target = 'main'
```

### Save Button Strategy

The modal's message list renders `MessageBubble` for each message. Since modal conversations always have a known `purpose`, each assistant message shows a contextual save button:

- **`voice-setup`**: "Save as Voice Profile" → `window.novelEngine.files.write(bookSlug, 'source/voice-profile.md', content)`
- **`author-profile`**: "Save as Author Profile" → `window.novelEngine.settings.saveAuthorProfile(content)`

These are the same save mechanisms already in `MessageBubble` — the component's existing `targets` logic handles this via `conversationPurpose`. No change needed to `MessageBubble` itself.

### Conversation Persistence

Modal conversations are real conversations stored in SQLite. Closing the modal does NOT delete the conversation. Reopening the modal for the same purpose + book finds the existing conversation and resumes it.

---

## Task 1: Create the Stream Router

### Create `src/renderer/stores/streamRouter.ts`

A plain mutable ref — no Zustand, no React. Both stores import it.

```typescript
/**
 * Mutable routing flag for stream events.
 * When 'main', the chatStore processes stream events.
 * When 'modal', the modalChatStore processes them.
 * This is NOT reactive — it's only checked inside event handlers.
 */
export const streamRouter = {
  target: 'main' as 'main' | 'modal',
};
```

---

## Task 2: Create the Modal Chat Store

### Create `src/renderer/stores/modalChatStore.ts`

A Zustand store that mirrors the relevant parts of `chatStore` but operates independently.

**State shape:**

```typescript
import { create } from 'zustand';
import type { Conversation, ConversationPurpose, Message, StreamEvent } from '@domain/types';
import { streamRouter } from './streamRouter';

type ModalChatState = {
  // Visibility
  isOpen: boolean;
  purpose: ConversationPurpose | null;
  bookSlug: string;

  // Conversation state
  conversation: Conversation | null;
  messages: Message[];
  isStreaming: boolean;
  isThinking: boolean;
  streamBuffer: string;
  thinkingBuffer: string;
  statusMessage: string;

  // Actions
  open: (purpose: ConversationPurpose, bookSlug: string) => Promise<void>;
  close: () => void;
  sendMessage: (content: string) => Promise<void>;

  // Stream handling (internal)
  _handleStreamEvent: (event: StreamEvent) => void;
  _cleanupListener: (() => void) | null;
  initStreamListener: () => void;
  destroyStreamListener: () => void;
};
```

**Key action implementations:**

#### `open(purpose, bookSlug)`

1. Load all conversations for `bookSlug` via `window.novelEngine.chat.getConversations(bookSlug)`.
2. Find the first conversation matching `purpose` and `bookSlug`.
3. If found, load its messages via `window.novelEngine.chat.getMessages(conv.id)` and set it as active.
4. If not found, create a new conversation with `agentName: 'Verity'`, `pipelinePhase: null`, and the given `purpose`.
5. Set `isOpen: true`, `purpose`, `bookSlug`.

#### `close()`

- If `isStreaming` is true, do nothing (prevent closing mid-stream).
- Otherwise, set `isOpen: false`. Do NOT clear `conversation` or `messages` — keep them cached for instant reopen.

#### `sendMessage(content)`

1. Verify `conversation` is not null.
2. Optimistic update: append user message to `messages`.
3. Set `streamRouter.target = 'modal'`.
4. Set `isStreaming: true`, clear buffers.
5. Call `window.novelEngine.chat.send({ agentName: conversation.agentName, message: content, conversationId: conversation.id, bookSlug })`.
6. Catch errors → add error message to `messages`, reset `streamRouter.target = 'main'`.

#### `_handleStreamEvent(event)`

- First line: `if (streamRouter.target !== 'modal') return;`
- Then handle each event type exactly like `chatStore._handleStreamEvent`, but operating on this store's state.
- On `done`: reload messages from DB, reset `isStreaming`, reset `streamRouter.target = 'main'`.
- On `error`: same — append error message, reset streaming state, reset `streamRouter.target = 'main'`.

#### `initStreamListener()` / `destroyStreamListener()`

Same pattern as `chatStore` — register/unregister on `window.novelEngine.chat.onStreamEvent`.

---

## Task 3: Guard the Main Chat Store

### Modify `src/renderer/stores/chatStore.ts`

Add the stream router guard to `_handleStreamEvent`:

```typescript
import { streamRouter } from './streamRouter';
```

At the very top of `_handleStreamEvent`, before the existing `const { activeConversation } = get();`:

```typescript
_handleStreamEvent: (event: StreamEvent) => {
  if (streamRouter.target !== 'main') return;  // ← NEW LINE

  const { activeConversation } = get();
  // ... rest of existing handler unchanged
},
```

This is the **only** change to `chatStore`.

---

## Task 4: Create the Chat Modal Component

### Create `src/renderer/components/Chat/ChatModal.tsx`

A self-contained modal overlay with its own message list, streaming display, and input.

**Imports:**

```tsx
import { useEffect, useRef, useCallback, useMemo } from 'react';
import { marked } from 'marked';
import { useModalChatStore } from '../../stores/modalChatStore';
import { MessageBubble } from './MessageBubble';
import { ThinkingBlock } from './ThinkingBlock';
import { ChatInput } from './ChatInput';
import { AGENT_REGISTRY } from '@domain/constants';
```

**Subcomponents (all private within the file, not exported):**

#### `ModalHeader`

- Displays title based on `purpose`:
  - `'voice-setup'` → "Voice Profile Setup"
  - `'author-profile'` → "Author Profile Setup"
- Subtitle text:
  - `'voice-setup'` → "Chat with Verity to establish your voice profile"
  - `'author-profile'` → "Chat with Verity to create your author profile"
- Close button (✕) on the right — disabled (opacity-30, cursor-not-allowed) when `isStreaming`
- Styling: `px-5 py-4 border-b border-zinc-800 flex items-center justify-between`

#### `ModalAgentBar`

- Verity's color dot (use `AGENT_REGISTRY.Verity.color` → `#8B5CF6`)
- Name: "Verity"
- Role: "Ghostwriter"
- Purpose badge: small pill with `bg-purple-500/20 text-purple-300 text-xs px-2 py-0.5 rounded-full`
  - `'voice-setup'` → "Voice Setup"
  - `'author-profile'` → "Author Profile"
- Message count: `{messages.length} messages` in `text-zinc-500 text-xs`
- Styling: `px-5 py-2.5 border-b border-zinc-800 flex items-center gap-3`

#### `ModalMessageList`

- Scrollable `div` with `flex-1 overflow-y-auto`
- Maps `messages` from `modalChatStore` to `<MessageBubble message={msg} key={msg.id} />` components
- If `isStreaming`, appends a streaming-in-progress block at the bottom:
  - If `isThinking && thinkingBuffer`, show `<ThinkingBlock content={thinkingBuffer} isStreaming={true} />`
  - If `streamBuffer`, render it via `marked.parse()` inside an assistant-style bubble (`rounded-2xl bg-zinc-800 px-4 py-3`)
  - If neither but `statusMessage`, show a subtle status indicator
- Auto-scroll to bottom on new messages / stream updates:
  - Use a `messagesEndRef = useRef<HTMLDivElement>(null)` at the bottom of the list
  - `useEffect` on `[messages.length, streamBuffer, thinkingBuffer]` → `messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })`
- Empty state when no messages: centered text "Start the conversation — Verity will guide you."

#### Main `ChatModal` export

```tsx
export function ChatModal(): React.ReactElement {
  const {
    close,
    isStreaming,
    sendMessage,
    initStreamListener,
    destroyStreamListener,
  } = useModalChatStore();

  // Register stream listener on mount, cleanup on unmount
  useEffect(() => {
    initStreamListener();
    return () => destroyStreamListener();
  }, [initStreamListener, destroyStreamListener]);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isStreaming) {
        close();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [close, isStreaming]);

  const handleSend = useCallback(
    (content: string) => {
      sendMessage(content);
    },
    [sendMessage],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => {
        if (!isStreaming) close();
      }}
    >
      <div
        className="flex w-[700px] max-h-[85vh] flex-col rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalHeader />
        <ModalAgentBar />
        <ModalMessageList />
        <div className="shrink-0 border-t border-zinc-800">
          <ChatInput onSend={handleSend} disabled={isStreaming} lockedAgentName={null} />
        </div>
      </div>
    </div>
  );
}
```

---

## Task 5: Mount the Modal in AppLayout

### Modify `src/renderer/components/Layout/AppLayout.tsx`

Add the modal as a sibling rendered outside the main layout flow:

```tsx
import { useModalChatStore } from '../../stores/modalChatStore';
import { ChatModal } from '../Chat/ChatModal';
```

Update the `AppLayout` component:

```tsx
export function AppLayout(): React.ReactElement {
  const isModalOpen = useModalChatStore((s) => s.isOpen);

  return (
    <div className="flex h-screen w-screen bg-zinc-950 text-zinc-100">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <ViewContent />
      </main>
      {isModalOpen && <ChatModal />}
    </div>
  );
}
```

---

## Task 6: Rewire VoiceSetupButton

### Modify `src/renderer/components/Sidebar/VoiceSetupButton.tsx`

Replace the current navigation-based logic with modal opening.

**Before (current):**
- Imports `useChatStore`, `useViewStore`
- Finds or creates a voice-setup conversation
- Calls `navigate('chat')`

**After:**
- Import only `useBookStore` and `useModalChatStore`
- On click, call `openModal('voice-setup', activeSlug)`
- Remove all conversation search/creation logic — the modal store handles it

```tsx
import { useCallback } from 'react';
import { useBookStore } from '../../stores/bookStore';
import { useModalChatStore } from '../../stores/modalChatStore';

export function VoiceSetupButton(): React.ReactElement | null {
  const activeSlug = useBookStore((s) => s.activeSlug);
  const openModal = useModalChatStore((s) => s.open);

  const handleClick = useCallback(async () => {
    if (!activeSlug) return;
    await openModal('voice-setup', activeSlug);
  }, [activeSlug, openModal]);

  if (!activeSlug) return null;

  return (
    <button
      onClick={handleClick}
      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800/50 hover:text-zinc-200"
    >
      <span className="text-purple-400">🎙</span>
      <span>Set Up Voice Profile</span>
    </button>
  );
}
```

---

## Task 7: Rewire AuthorProfileSection in Settings

### Modify `src/renderer/components/Settings/SettingsView.tsx`

In the `AuthorProfileSection` function only:

**Remove:**
- The `useChatStore` import (used only by `handleEditWithVerity`)
- The `useViewStore` import (used only by `handleEditWithVerity`)
- The old `handleEditWithVerity` that calls `chatStore.createConversation(...)` and `viewStore.navigate('chat')`

**Add:**
- Import `useModalChatStore` from `'../../stores/modalChatStore'`
- New `handleEditWithVerity`:

```typescript
const openModal = useModalChatStore((s) => s.open);

const handleEditWithVerity = useCallback(async () => {
  const { activeSlug } = useBookStore.getState();
  await openModal('author-profile', activeSlug || '');
}, [openModal]);
```

The button JSX stays exactly the same — only the handler implementation changes.

**Important:** Only `AuthorProfileSection` uses these imports for the Verity button. Verify no other section in `SettingsView` needs `useChatStore` or `useViewStore` before removing the imports. (They don't — `AuthorProfileSection` is the only consumer.)

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/renderer/stores/streamRouter.ts` | **CREATE** | Mutable ref for stream event routing between main chat and modal |
| `src/renderer/stores/modalChatStore.ts` | **CREATE** | Zustand store for modal chat state + actions |
| `src/renderer/components/Chat/ChatModal.tsx` | **CREATE** | Full modal overlay with header, agent bar, messages, streaming, input |
| `src/renderer/stores/chatStore.ts` | **MODIFY** | Add `streamRouter` guard to `_handleStreamEvent` (1 import + 1 line) |
| `src/renderer/components/Layout/AppLayout.tsx` | **MODIFY** | Mount `<ChatModal />` conditionally when `isOpen` |
| `src/renderer/components/Sidebar/VoiceSetupButton.tsx` | **MODIFY** | Rewire to open modal instead of navigating to chat view |
| `src/renderer/components/Settings/SettingsView.tsx` | **MODIFY** | Rewire author profile "Set Up with Verity" button to open modal |

---

## Files NOT Modified

- **Domain layer**: No changes. `ConversationPurpose` already includes `'voice-setup' | 'author-profile'`.
- **Infrastructure / Application**: No changes. The same `ChatService` handles all conversations regardless of purpose.
- **Preload / IPC**: No changes. The existing `chat:send`, `chat:createConversation`, `chat:getConversations`, `chat:getMessages`, and `chat:streamEvent` channels serve both the main chat and the modal.
- **Main process**: No changes.
- **`MessageBubble`**: No changes. It already determines save targets from `activeConversation.purpose` via `useChatStore`. **However**, since `MessageBubble` reads `activeConversation` from `useChatStore`, it won't see the modal's conversation. The modal must provide the conversation context to `MessageBubble`. Two options:
  - **Option A (simple):** The modal renders its own lightweight message bubble that handles saves directly, rather than reusing `MessageBubble` which is coupled to `useChatStore`. The modal's bubble is simpler — it only needs markdown rendering, thinking blocks, and the purpose-specific save button.
  - **Option B (cleaner, preferred):** Refactor `MessageBubble` to accept an optional `conversationOverride` prop. When provided, it uses that conversation for determining save targets instead of reading from `useChatStore`. The modal passes its `conversation` as the override.

  **Choose Option B.** Add to `MessageBubble`:

  ```typescript
  type MessageBubbleProps = {
    message: Message;
    conversationOverride?: Conversation;  // NEW — used by modal to bypass chatStore
  };
  ```

  Then in the component, change:

  ```typescript
  // Before:
  const activeConversation = useChatStore((s) => s.activeConversation);

  // After:
  const storeConversation = useChatStore((s) => s.activeConversation);
  const activeConversation = conversationOverride ?? storeConversation;
  ```

  This is the only `MessageBubble` change — a 2-line modification. Add this file to the modify list.

### Updated Files Summary (with MessageBubble)

| File | Action | Description |
|------|--------|-------------|
| `src/renderer/stores/streamRouter.ts` | **CREATE** | Mutable ref for stream event routing |
| `src/renderer/stores/modalChatStore.ts` | **CREATE** | Zustand store for modal chat |
| `src/renderer/components/Chat/ChatModal.tsx` | **CREATE** | Modal overlay component |
| `src/renderer/stores/chatStore.ts` | **MODIFY** | Add `streamRouter` guard (1 import + 1 line) |
| `src/renderer/components/Chat/MessageBubble.tsx` | **MODIFY** | Add `conversationOverride` prop (2 lines) |
| `src/renderer/components/Layout/AppLayout.tsx` | **MODIFY** | Mount `<ChatModal />` |
| `src/renderer/components/Sidebar/VoiceSetupButton.tsx` | **MODIFY** | Open modal instead of navigating |
| `src/renderer/components/Settings/SettingsView.tsx` | **MODIFY** | Open modal instead of navigating |

---

## Architecture Notes

- **Layer boundaries preserved.** `modalChatStore` lives in `src/renderer/stores/` and imports only from `@domain/types` (via `import type`) and other renderer-layer modules. No infrastructure or application imports.
- **Stream routing via mutable ref, not Zustand.** The `streamRouter` doesn't need reactivity — it's only checked inside event handlers. A plain object avoids unnecessary re-renders and keeps the routing logic dead simple.
- **Two stores, one IPC channel.** Both `chatStore` and `modalChatStore` listen on `chat:streamEvent`. The `streamRouter` ensures only one processes events at a time. No IPC layer changes.
- **Conversation persistence.** Modal conversations are standard SQLite rows. Closing the modal keeps the conversation. Reopening finds it by `purpose` + `bookSlug`. The conversation also appears in the main chat's conversation list — it's a real conversation, just surfaced through a different UI.
- **Component reuse.** `MessageBubble`, `ThinkingBlock`, and `ChatInput` are used directly inside the modal. `MessageBubble` gains a minimal `conversationOverride` prop to decouple it from `chatStore` when rendered in the modal.

---

## Verification

1. **Voice Profile flow:**
   - Click "Set Up Voice Profile" in the sidebar
   - Modal opens overlaying the current view (does NOT navigate away)
   - Chat with Verity works — messages appear in the modal
   - Streaming works — thinking blocks and text stream into the modal
   - "Save as Voice Profile" button appears on assistant messages
   - Clicking save writes `source/voice-profile.md`
   - Close modal (Escape or backdrop click) → user is back on their original view
   - Reopen → previous messages are loaded (conversation persisted)

2. **Author Profile flow:**
   - Go to Settings → Author Profile → click "Set Up with Verity"
   - Modal opens overlaying the settings view
   - Chat works, streaming works
   - "Save as Author Profile" button on assistant messages
   - Clicking save writes the global author profile
   - Close → back to settings with profile preview updated

3. **Stream isolation:**
   - Open modal and send a message (streaming starts)
   - Main chat view does NOT show stray stream events or enter streaming state
   - After modal stream completes, send a message in main chat → streams correctly to main chat

4. **Escape to close:**
   - While not streaming: Escape closes the modal
   - While streaming: Escape does nothing (modal stays open)
   - Clicking backdrop while not streaming: closes
   - Clicking backdrop while streaming: does nothing

5. **Main chat unaffected:**
   - Pipeline lock still works normally
   - Sending messages in the main chat streams normally
   - `chatStore` state is untouched by modal interactions

6. **Compilation:**
   - `npx tsc --noEmit` passes with zero errors
   - No unused imports or type errors

---

## Acceptance Criteria

- [ ] `ChatModal` renders as a centered overlay with backdrop blur at z-50
- [ ] `modalChatStore` manages its own conversation, messages, and streaming state independently
- [ ] `streamRouter` correctly isolates stream events — only one store processes events at a time
- [ ] `VoiceSetupButton` opens the modal instead of navigating to the chat view
- [ ] `AuthorProfileSection` "Set Up with Verity" / "Refine with Verity" opens the modal instead of navigating
- [ ] Modal displays Verity's agent header with color dot and purpose badge
- [ ] Messages render using existing `MessageBubble` component with `conversationOverride` (save buttons work)
- [ ] Streaming works in the modal — thinking blocks and text deltas render live
- [ ] Modal is keyboard-dismissible (Escape) when not streaming
- [ ] Clicking backdrop closes modal when not streaming, does nothing when streaming
- [ ] Closing and reopening the modal resumes the existing conversation with messages loaded
- [ ] Main `chatStore` ignores stream events while modal is streaming
- [ ] No new IPC channels, preload changes, or domain layer changes required
- [ ] TypeScript compiles cleanly with zero errors
