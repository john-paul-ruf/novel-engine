# Session 16 — Chat Interface + Thinking Blocks

## Context

Novel Engine Electron app. Sessions 01–15 done. This is the **heart of the app** — the chat interface where users interact with agents. It needs streaming text, extended thinking display, and conversation management.

---

## Task 1: Chat View Container

### `src/renderer/components/Chat/ChatView.tsx`

The main view shown when `currentView === 'chat'`.

**Layout:**
```
┌──────────────────────────────────────────┐
│  Agent Header                            │
├──────────────────────────────────────────┤
│                                          │
│  Message List (scrollable, flex-1)       │
│                                          │
│  [User message]                          │
│  [Thinking block]                        │
│  [Assistant message]                     │
│  [User message]                          │
│  [Streaming thinking...]                 │
│  [Streaming response...]                 │
│                                          │
├──────────────────────────────────────────┤
│  Input Area                              │
└──────────────────────────────────────────┘
```

**On mount:**
- Call `chatStore.initStreamListener()` to register the stream event handler
- Return cleanup: `chatStore.destroyStreamListener()`
- Also check `viewStore.payload.conversationId`. If present, call `chatStore.setActiveConversation(payload.conversationId)` to load that conversation. This enables PipelineTracker to navigate directly to a specific conversation.

```typescript
const { payload } = useViewStore();

useEffect(() => {
  if (payload.conversationId) {
    chatStore.setActiveConversation(payload.conversationId);
  }
}, [payload.conversationId]);
```

**No active conversation state:**
If `chatStore.activeConversation` is null, show a centered empty state:
- "No conversation selected"
- "Select a phase from the pipeline or start a new conversation"
- A dropdown to pick an agent + "New Conversation" button

---

## Task 2: Agent Header

### `src/renderer/components/Chat/AgentHeader.tsx`

Props: agent meta (name, role, color), pipeline phase label, conversation usage stats.

**Layout:**
- Left side: Agent name (large, bold) with a colored left border using the agent's color. Below it: role + phase in smaller gray text.
- Right side: Token count and estimated cost in small monospace text.

**Token usage data:** After each `done` stream event in `chatStore._handleStreamEvent`, call `window.novelEngine.usage.byConversation(conversationId)` to fetch the usage records for the current conversation. Store the result in `chatStore` as `conversationUsage: UsageRecord[] | null`. The `AgentHeader` reads this from the store and aggregates the totals for display (sum `inputTokens`, `outputTokens`, `thinkingTokens`, and `estimatedCost` across all records). Note: this returns `UsageRecord[]` (individual per-message records), **not** `UsageSummary` — the component aggregates them.

**Style:** `border-b border-zinc-800`, padding `px-6 py-4`.

---

## Task 3: Message List

### `src/renderer/components/Chat/MessageList.tsx`

Renders all messages from `chatStore.messages` plus the streaming state.

**Auto-scroll:** Always scroll to bottom when new content arrives (new messages or streaming deltas). Use a `ref` on a div at the bottom and call `scrollIntoView({ behavior: 'smooth' })` on changes. But: if the user has scrolled up manually, DON'T auto-scroll. Track this with an `isAtBottom` flag using an `IntersectionObserver` on the bottom sentinel div.

**Rendering order:**
1. All completed messages from `chatStore.messages`
2. If streaming: the in-progress message (thinking block + text buffer)

---

## Task 4: Message Bubble

### `src/renderer/components/Chat/MessageBubble.tsx`

Props: `message: Message`

**User messages:**
- Right-aligned
- `bg-blue-600 text-white` rounded bubble
- Whitespace preserved (`whitespace-pre-wrap`)
- Max width: `max-w-2xl`

**Assistant messages:**
- Left-aligned
- `bg-zinc-800 text-zinc-100` rounded bubble
- Content rendered as markdown via `marked` (import from `marked`)
- Add the `prose prose-invert prose-sm` Tailwind typography classes for nice markdown rendering
- Max width: `max-w-3xl`
- If the message has `thinking` content (non-empty string), show a `ThinkingBlock` above the response

**Render the markdown safely:** Use `dangerouslySetInnerHTML={{ __html: marked.parse(content) }}`. Configure `marked` with `{ breaks: true, gfm: true }` for GitHub-flavored markdown with line break support. Note: `marked` v4+ removed built-in sanitization — there is no sanitizer to disable. Security is handled by Electron's CSP, and content comes from the Claude Code CLI, not from untrusted user input.

---

## Task 5: Thinking Block

### `src/renderer/components/Chat/ThinkingBlock.tsx`

Props: `content: string`, `isStreaming: boolean`, `tokenEstimate?: number`

**Design:**
- Collapsible panel with amber/gold accent
- Container: `border border-amber-500/20 rounded-lg bg-amber-950/20`
- Header (always visible): 
  - 🧠 emoji + "Thinking..." (streaming) or "Agent Thinking" (done)
  - Pulsing dot when streaming
  - Token estimate on the right
  - Chevron ▼/▶ for collapse toggle
- Body (collapsible):
  - `max-h-64 overflow-y-auto` — scrollable, bounded height
  - Monospace font, amber-tinted text: `font-mono text-sm text-amber-200/70`
  - Render as markdown via `marked`
  - Pulsing cursor block when streaming

**Behavior:**
- Starts expanded when streaming
- Auto-collapses 1.5s after streaming ends (if `autoCollapseThinking` setting is true)
- User can manually toggle at any time
- Auto-scrolls to bottom while streaming (within the thinking panel)

---

## Task 6: Streaming Message

### `src/renderer/components/Chat/StreamingMessage.tsx`

Shows the in-progress response. Only visible when `chatStore.isStreaming` is true.

**Layout:**
1. If `chatStore.thinkingBuffer` is non-empty OR `chatStore.isThinking`:
   - Show `<ThinkingBlock content={thinkingBuffer} isStreaming={isThinking} />`
2. If `chatStore.streamBuffer` is non-empty:
   - Show the response text in an assistant-style bubble
   - Pulsing cursor at the end

---

## Task 7: Chat Input

### `src/renderer/components/Chat/ChatInput.tsx`

Props: `onSend: (message: string) => void`, `disabled: boolean`

**Layout:**
- Textarea (auto-growing, min 3 rows, max 10 rows)
- Send button to the right
- Container: `border-t border-zinc-800`, padding

**Behavior:**
- `Enter` sends the message (if not empty and not disabled)
- `Shift+Enter` inserts a newline
- Send button is disabled when input is empty or when `disabled` is true
- After sending, clear the input and refocus the textarea
- While streaming (`disabled=true`), show a subtle "Agent is responding..." label

**Style:**
- Textarea: `bg-zinc-800 border border-zinc-700 rounded-lg resize-none`
- Send button: `bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-6`
- Disabled state: `opacity-50 cursor-not-allowed`

---

## Task 8: Conversation List

### `src/renderer/components/Chat/ConversationList.tsx`

A secondary panel (could be a dropdown or slide-out) that shows past conversations for the current book.

**Each conversation shows:**
- Agent name + colored dot
- First message preview (the `title` field)
- Relative timestamp ("2 hours ago", "Yesterday")
- **Delete button** (trash icon, right side, appears on hover)

**Clicking a conversation:** calls `chatStore.setActiveConversation(id)` which loads its messages.

**Delete behavior:**
- On click: show confirmation "Delete this conversation? This cannot be undone."
- On confirm: call `chatStore.deleteConversation(conversationId)`
- The `deleteConversation` action in `chatStore`:

```typescript
deleteConversation: async (conversationId: string) => {
  await window.novelEngine.chat.deleteConversation(conversationId);
  const state = get();
  set({
    conversations: state.conversations.filter(c => c.id !== conversationId),
    ...(state.activeConversation?.id === conversationId && {
      activeConversation: null,
      messages: [],
    }),
  });
},
```

**"+ New" button:** Opens a small agent picker, then creates a new conversation.

**Where it lives in the layout:** Above the message list, as a collapsible panel or a tabbed header. Keep it simple — a row of conversation tabs or a dropdown select.

---

## Verification

- Selecting an agent and starting a conversation shows the chat interface
- Typing a message and pressing Enter sends it (appears as a blue bubble on the right)
- The agent's response streams in token by token (if Claude CLI is connected)
- Extended thinking appears in the amber panel above the response
- Thinking block auto-collapses after the response finishes
- Historical thinking content is expandable on past messages
- Auto-scroll works: follows new content unless user scrolls up
- Conversation list shows past conversations and switching between them loads history
- Input is disabled during streaming
