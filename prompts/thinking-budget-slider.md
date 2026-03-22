# Thinking Budget Slider — Session Prompt

## Goal

Add a slider control to the chat input area that lets the user adjust the thinking token budget for the **next message only**. This gives fine-grained control over how much "thinking time" the AI spends — from zero (no thinking) up to a configurable maximum — without changing the global settings.

The slider value is ephemeral: it resets to the agent's default after each sent message. It does **not** persist across conversations or app restarts.

---

## Motivation

Different prompts warrant different thinking depths. A quick "rename this character" doesn't need 16K thinking tokens, but a complex structural revision might benefit from maxing it out. The global `enableThinking` toggle and per-agent `thinkingBudget` in settings are too coarse — the user should be able to dial it per-message.

---

## Architecture

The thinking budget override flows through the full stack:

```
ChatInput (slider UI) → ChatView → chatStore.sendMessage(content, thinkingBudget?)
  → IPC chat:send → ChatService.sendMessage(params) → claude.sendMessage({ thinkingBudget })
```

### Key Design Decisions

1. **The slider value is per-message, not persistent.** After sending, it resets to the agent's default thinking budget from `AGENT_REGISTRY`.
2. **Slider range:** 0 to 32,000 tokens (0 = no thinking, max = 32K). Step size: 1,000.
3. **Default value:** The current agent's `thinkingBudget` from `AGENT_REGISTRY` (e.g. 10K for Verity, 8K for Spark). If thinking is globally disabled (`enableThinking: false` in settings), the slider still appears but starts at 0.
4. **A value of 0 means no thinking** — `thinkingBudget` is not passed to the CLI at all.
5. **The slider only appears when there is an active conversation** (not in the empty state).

---

## Files to Modify

### 1. `src/domain/types.ts` — Extend `SendMessageParams`

Add an optional `thinkingBudgetOverride` field:

```typescript
export type SendMessageParams = {
  agentName: AgentName;
  message: string;
  conversationId: string;
  bookSlug: string;
  thinkingBudgetOverride?: number;  // NEW — per-message thinking budget (0 = no thinking)
};
```

### 2. `src/renderer/components/Chat/ThinkingBudgetSlider.tsx` — NEW FILE

Create a new component that renders the slider. This is a controlled component — the parent owns the value.

**Specifications:**

- Horizontal slider with a label showing the current value (e.g., "Thinking: 8K tokens")
- Range: 0 to 32,000, step 1,000
- When value is 0, label shows "Thinking: Off"
- Visual styling: compact, sits inline with the chat input area
- A small reset button (circular arrow icon or "Reset" text) appears when the value differs from the agent's default, allowing one-click return to default
- Uses Tailwind zinc/blue color scheme consistent with the app
- The slider track uses `accent-blue-500` or a custom styled range input

**Props:**

```typescript
type ThinkingBudgetSliderProps = {
  value: number;
  defaultValue: number;  // agent's default, used for reset and visual indicator
  onChange: (value: number) => void;
  disabled?: boolean;
};
```

**Display format:**
- 0 → "Thinking: Off"
- 1000–9999 → "Thinking: {N}K" (e.g., "Thinking: 8K")
- 10000+ → "Thinking: {N}K" (e.g., "Thinking: 16K")
- Show a subtle dot or marker on the track at the default position

### 3. `src/renderer/components/Chat/ChatInput.tsx` — Add slider to input area

**Changes:**

- Add new props: `thinkingBudget: number`, `defaultThinkingBudget: number`, `onThinkingBudgetChange: (value: number) => void`
- Render the `ThinkingBudgetSlider` above the textarea, inside the border-t container
- The slider should be visually compact — a single row above the textarea/send button row
- Hide the slider when `readOnly` is true

### 4. `src/renderer/components/Chat/ChatView.tsx` — Wire slider state

**Changes:**

- Add local state: `const [thinkingBudget, setThinkingBudget] = useState<number>(...)` — initialized from the active conversation's agent's default thinking budget
- When the active conversation changes, reset the thinking budget to the new agent's default
- When thinking is globally disabled (`enableThinking === false` from settings), initialize to 0 instead
- Pass `thinkingBudget`, `defaultThinkingBudget`, and `onThinkingBudgetChange` to `ChatInput`
- Modify `handleSend` to pass the thinking budget to `sendMessage`:

```typescript
const handleSend = useCallback(
  (content: string) => {
    sendMessage(content, thinkingBudget);
    // Reset to default after sending
    setThinkingBudget(defaultThinkingBudget);
  },
  [sendMessage, thinkingBudget, defaultThinkingBudget]
);
```

- Import `AGENT_REGISTRY` to look up the default thinking budget for the current agent
- Import settings from `useSettingsStore` to check `enableThinking`

### 5. `src/renderer/stores/chatStore.ts` — Accept thinking budget in sendMessage

**Changes:**

- Update `sendMessage` signature from `(content: string) => Promise<void>` to `(content: string, thinkingBudgetOverride?: number) => Promise<void>`
- Pass `thinkingBudgetOverride` through to the IPC call:

```typescript
await window.novelEngine.chat.send({
  agentName,
  message: content,
  conversationId,
  bookSlug,
  thinkingBudgetOverride,
});
```

### 6. `src/preload/index.ts` — Pass the new field through IPC

No structural changes needed — `SendMessageParams` already flows as a single object. The new field is included automatically when the type is extended.

### 7. `src/main/ipc/handlers.ts` — Pass through to ChatService

The handler already forwards the full `SendMessageParams` object. Verify it passes through.

### 8. `src/application/ChatService.ts` — Use the override

**Changes in `sendMessage`:**

Where the thinking budget is currently determined:

```typescript
// BEFORE:
const thinkingBudget = appSettings.enableThinking ? agent.thinkingBudget : undefined;

// AFTER:
const thinkingBudget = (() => {
  // Per-message override takes priority
  if (params.thinkingBudgetOverride !== undefined) {
    return params.thinkingBudgetOverride > 0 ? params.thinkingBudgetOverride : undefined;
  }
  // Fall back to global setting
  return appSettings.enableThinking ? agent.thinkingBudget : undefined;
})();
```

Apply the same pattern in `handlePitchRoomMessage` if it has a similar thinking budget line.

Update the `sendMessage` params type to accept `thinkingBudgetOverride`:

```typescript
async sendMessage(params: {
  agentName: AgentName;
  message: string;
  conversationId: string;
  bookSlug: string;
  thinkingBudgetOverride?: number;   // NEW
  onEvent: (event: StreamEvent) => void;
}): Promise<void> {
```

---

## Visual Design

The slider sits in a compact row above the textarea:

```
┌────────────────────────────────────────────────────┐
│  🧠 Thinking: 10K tokens  ────●──────────  ↺      │
│ ┌────────────────────────────────────────────┐ ┌──┐│
│ │ Message Verity...                          │ │  ││
│ │                                            │ │Snd│
│ │                                            │ │  ││
│ └────────────────────────────────────────────┘ └──┘│
└────────────────────────────────────────────────────┘
```

- The brain emoji is a label prefix
- The slider track is subtle (zinc-700 track, blue-500 thumb)
- The reset button only appears when value differs from default
- The whole row is ~28px tall — compact and unobtrusive

---

## Edge Cases

1. **Global thinking disabled + slider at 0:** No thinking budget passed. Slider shows "Off".
2. **User drags to 0:** Thinking is suppressed for this message only. Next message resets to default.
3. **User sends while slider is at non-default:** The override is sent, then slider resets.
4. **Agent switch (conversation change):** Slider resets to the new agent's default budget.
5. **Read-only conversations:** Slider is hidden entirely.
6. **Pitch Room conversations:** Slider still works — thinking budget override flows through `handlePitchRoomMessage` too.

---

## Verification

1. `npx tsc --noEmit` passes with no errors.
2. Send a message with the slider at the agent's default — behavior unchanged from before.
3. Drag the slider to 0 — send a message — no thinking block appears in the response.
4. Drag the slider to 32K — send a message — thinking block appears (model permitting).
5. After sending, the slider resets to the agent's default.
6. Switch conversations — slider resets to the new agent's default.
7. With `enableThinking: false` in global settings — slider starts at 0, but dragging it up still enables thinking for that message.
8. Read-only conversations — slider is hidden.
