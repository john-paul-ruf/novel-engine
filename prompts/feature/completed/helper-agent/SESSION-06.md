# SESSION-06 — Renderer UI: Floating Help Button & Chat Panel

> **Feature:** helper-agent
> **Layer(s):** Renderer
> **Depends on:** SESSION-05
> **Estimated effort:** 25 min

---

## Context

SESSION-05 created the `helperStore` Zustand store. This session builds the UI: a floating help button in the lower-right corner that opens a slide-up chat panel. The panel is non-blocking (users can interact with the main app while it's open) and persists across view/book changes.

The design follows the "typical agent chats on websites" pattern — a circular button that expands into a chat panel, positioned at the bottom-right corner of the viewport.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/components/Helper/HelperButton.tsx` | Create | Floating circular help button (bottom-right corner) |
| `src/renderer/components/Helper/HelperPanel.tsx` | Create | Slide-up chat panel with message list, input, and header |
| `src/renderer/components/Helper/HelperMessageList.tsx` | Create | Scrollable message list with streaming support |
| `src/renderer/components/Layout/AppLayout.tsx` | Modify | Add HelperButton + HelperPanel to the layout, initialize stream listener |

---

## Implementation

### 1. Create `src/renderer/components/Helper/HelperButton.tsx`

A fixed-position circular button in the bottom-right corner. Shows a help icon (question mark). When the helper panel is open, shows a close (X) icon instead.

```typescript
import { useHelperStore } from '../../stores/helperStore';
```

Design specifications:
- Position: `fixed bottom-6 right-6` (24px from edges)
- Size: `w-14 h-14` (56px circle)
- Background: `bg-blue-500 hover:bg-blue-600` (interactive accent color)
- Icon: Question mark SVG icon when closed, X icon when open
- Shadow: `shadow-lg` for depth
- Z-index: `z-50` to float above content
- Transition: smooth scale on hover (`transition-transform hover:scale-105`)
- Tooltip: "Need help?" on hover (use `title` attribute)

```tsx
export function HelperButton(): React.ReactElement {
  const { isOpen, toggle } = useHelperStore();

  return (
    <button
      onClick={toggle}
      title={isOpen ? 'Close help' : 'Need help?'}
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-500 text-white shadow-lg transition-all hover:bg-blue-600 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-zinc-950"
    >
      {isOpen ? (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      ) : (
        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M12 18h.01" />
        </svg>
      )}
    </button>
  );
}
```

### 2. Create `src/renderer/components/Helper/HelperPanel.tsx`

A fixed-position panel that slides up from the bottom-right when open. Contains a header, message list, and text input.

```typescript
import { useState, useRef, useEffect } from 'react';
import { useHelperStore } from '../../stores/helperStore';
import { HelperMessageList } from './HelperMessageList';
```

Design specifications:
- Position: `fixed bottom-24 right-6` (above the button)
- Size: `w-96 h-[32rem]` (384px wide, 512px tall) — or responsive `max-h-[70vh]`
- Background: `bg-white dark:bg-zinc-900`
- Border: `border border-zinc-200 dark:border-zinc-700`
- Rounded: `rounded-2xl`
- Shadow: `shadow-2xl`
- Z-index: `z-40` (below button)
- Animation: slide-up + fade-in on open (CSS transition or Tailwind animate)

Layout (flex column):
1. **Header** — "Help & FAQ" title, blue-500 accent bar, reset button (trash icon), close button
2. **Message list** — scrollable, auto-scroll to bottom on new messages
3. **Input area** — text input with send button, disabled while streaming

```tsx
export function HelperPanel(): React.ReactElement | null {
  const { isOpen, conversation, messages, isStreaming, isThinking, streamBuffer, thinkingBuffer, statusMessage, isLoading, sendMessage, close } = useHelperStore();
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && !isLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, isLoading]);

  if (!isOpen) return null;

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput('');
    sendMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed bottom-24 right-6 z-40 flex h-[32rem] w-96 max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 bg-blue-500 px-4 py-3 dark:border-zinc-700">
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M12 18h.01" />
          </svg>
          <span className="font-semibold text-white">Help & FAQ</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Reset button */}
          <button
            onClick={async () => {
              await useHelperStore.getState().resetConversation();
              await useHelperStore.getState().open();
            }}
            className="rounded p-1 text-white/80 hover:bg-white/20 hover:text-white"
            title="Start fresh conversation"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
          </button>
          {/* Close button */}
          <button
            onClick={close}
            className="rounded p-1 text-white/80 hover:bg-white/20 hover:text-white"
            title="Close"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-400">Loading...</div>
        ) : (
          <HelperMessageList
            messages={messages}
            isStreaming={isStreaming}
            isThinking={isThinking}
            streamBuffer={streamBuffer}
            thinkingBuffer={thinkingBuffer}
            statusMessage={statusMessage}
          />
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-zinc-200 p-3 dark:border-zinc-700">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? 'Waiting for response...' : 'Ask anything about Novel Engine...'}
            disabled={isStreaming || isLoading}
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming || isLoading}
            className="rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
```

### 3. Create `src/renderer/components/Helper/HelperMessageList.tsx`

A scrollable list of messages with auto-scroll. Renders the streaming buffer as a live message.

```typescript
import { useRef, useEffect } from 'react';
import type { Message } from '@domain/types';
```

Key behaviors:
- Empty state: welcome message with question mark icon
- User messages: right-aligned, blue-500 background
- Assistant messages: left-aligned, zinc-100/zinc-800 background
- Streaming: shows streamBuffer with blinking cursor
- Thinking: shows "Thinking..." label above stream buffer
- Waiting: shows bouncing dots animation
- Auto-scroll to bottom on new content

```tsx
export function HelperMessageList(props: {
  messages: Message[];
  isStreaming: boolean;
  isThinking: boolean;
  streamBuffer: string;
  thinkingBuffer: string;
  statusMessage: string;
}): React.ReactElement {
  const { messages, isStreaming, isThinking, streamBuffer, statusMessage } = props;
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamBuffer, isStreaming]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="rounded-full bg-blue-100 p-3 dark:bg-blue-900/30">
          <svg className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M12 18h.01" />
          </svg>
        </div>
        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
          Hi! I'm your Novel Engine assistant.
        </p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Ask me anything about using the app — features, workflows, agents, troubleshooting, and more.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
              msg.role === 'user'
                ? 'bg-blue-500 text-white'
                : 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
            }`}
          >
            <div className="whitespace-pre-wrap break-words">{msg.content}</div>
          </div>
        </div>
      ))}

      {isStreaming && (
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-2xl bg-zinc-100 px-4 py-2 text-sm text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
            {isThinking && (
              <div className="mb-1 text-xs text-amber-500 dark:text-amber-400">Thinking...</div>
            )}
            {streamBuffer ? (
              <div className="whitespace-pre-wrap break-words">
                {streamBuffer}
                <span className="animate-pulse">|</span>
              </div>
            ) : statusMessage ? (
              <div className="text-xs text-zinc-400 dark:text-zinc-500">{statusMessage}</div>
            ) : (
              <div className="flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: '0ms' }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: '150ms' }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: '300ms' }} />
              </div>
            )}
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
```

### 4. Update `AppLayout.tsx`

Read `src/renderer/components/Layout/AppLayout.tsx`.

Add imports:

```typescript
import { HelperButton } from '../Helper/HelperButton';
import { HelperPanel } from '../Helper/HelperPanel';
import { useHelperStore } from '../../stores/helperStore';
```

In the `StreamManager` component, add a `useEffect` to initialize the helper stream listener (alongside the existing pitch room listener):

```typescript
useEffect(() => {
  useHelperStore.getState().initStreamListener();
  return () => useHelperStore.getState().destroyStreamListener();
}, []);
```

In the `AppLayout` JSX return, add `HelperPanel` and `HelperButton` inside the outer div, after the existing overlays (ChatModal, CliActivityListener) and before TourManager:

```tsx
<HelperPanel />
<HelperButton />
```

---

## Architecture Compliance

- [x] Renderer accesses backend only through `window.novelEngine`
- [x] Components use Zustand store — no prop drilling beyond 2 levels
- [x] Uses `import type` for domain types
- [x] Stream listener cleanup in useEffect return
- [x] Tailwind utility classes only — no custom CSS
- [x] Dark theme uses zinc scale (950 bg, 900 sidebar, 800 cards, 700 borders, 100 text)
- [x] Blue-500 for interactive elements
- [x] Amber for thinking blocks

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `HelperButton` renders as a fixed-position button in the bottom-right corner
3. Clicking the button opens the `HelperPanel`
4. The panel shows an empty state welcome message on first open
5. Typing and pressing Enter sends a message via the bridge
6. Stream events update the panel's streaming message in real-time
7. The panel persists across view navigation (chat, files, build, etc.)
8. The panel persists across book switches
9. The "Reset" button clears the conversation and starts fresh

---

## State Update

After completing this session, update `prompts/feature/helper-agent/STATE.md`:
- Set SESSION-06 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
