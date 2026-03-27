# Hot Take — Session Prompt

## Goal

Add a **Hot Take** feature — a lightweight, on-demand Ghostlight invocation that can be triggered at any point during the writing process. Ghostlight reads the full manuscript chapter by chapter from disk (via tool calls), then delivers a short (~5 paragraph) gut-reaction report directly in chat. No files are written. No pipeline state is affected. Just a hot take on "is it good?"

---

## Motivation

The formal Ghostlight pipeline phase (`first-read`, `second-read`) produces a full `reader-report.md` and gates pipeline advancement. That's important for the structured workflow, but sometimes you just want a quick pulse check mid-draft — after banging out five chapters, or after a round of revisions — without committing to the full read phase. The Hot Take answers one question: *"Is it good?"*

It's the difference between sending your manuscript to an editor and asking a friend to read the first hundred pages over the weekend.

---

## Architecture

The Hot Take is a **special-purpose conversation** — similar in spirit to voice-setup and author-profile conversations, but running Ghostlight in full agent mode with tool use enabled:

1. User clicks "Hot Take" (sidebar button or quick action)
2. App creates a conversation with `purpose: 'hot-take'`
3. ChatService detects the purpose and uses a custom system prompt that:
   - Instructs Ghostlight to read every chapter draft from disk, in order, cold
   - Limits the response to ~5 paragraphs
   - Forbids writing any files (no `reader-report.md`, no artifacts)
   - Asks for honest, unfiltered reaction
4. A synthetic user message is sent: `"Read the full manuscript and give me your honest reaction."`
5. Ghostlight reads chapter by chapter via Read tool calls — the UI shows reading progress as it goes
6. After reading everything, Ghostlight responds in chat with the hot take
7. The user can follow up with questions in the same conversation
8. No pipeline state changes. No files written.

### Why agent mode with tool calls?

The agent reads files from disk chapter by chapter, exactly like the formal Ghostlight pipeline phase. This means:
- **No manuscript size limit** — the agent reads files one at a time, never needs the whole book in a single prompt
- **Works for any length novel** — 30 chapters, 80 chapters, doesn't matter
- **Natural reading flow** — the agent reads sequentially, building its impression as it goes, just like a real reader
- **The UI shows progress** — the user sees each Read tool call fire, knows Ghostlight is on chapter 14 of 26

The system prompt explicitly forbids Write/Edit tool use. The agent can only Read. If it tries to write a file, the instruction is clear: don't.

This is an **Opus call, always**. The entire value of a Hot Take is getting the best model's honest reaction. Sonnet might be cheaper but it won't tell you your third act doesn't land — Opus will. The model is hardcoded to `claude-opus-4-20250514` regardless of global settings.

---

## Domain Changes

### `src/domain/types.ts` — Extend `ConversationPurpose`

```typescript
export type ConversationPurpose = 'pipeline' | 'voice-setup' | 'author-profile' | 'pitch-room' | 'hot-take';
```

### `src/domain/constants.ts` — Add Hot Take prompt

Add a `HOT_TAKE_INSTRUCTIONS` constant — the purpose-specific instructions injected into the system prompt when the conversation purpose is `'hot-take'`:

```typescript
export const HOT_TAKE_INSTRUCTIONS = `You are giving a HOT TAKE — an informal, off-the-record assessment.

INSTRUCTIONS:
1. Use the Read tool to read every chapter draft file in the chapters/ directory, in order. Read them one at a time, start to finish, like a reader would.
2. Do NOT read any source documents (pitch, outline, bible, reports). This is a cold read — you know nothing about the book going in.
3. After reading the entire manuscript, respond with AT MOST five paragraphs.
4. Do NOT write any files. Do NOT use the Write or Edit tools. No reader-report.md, no artifacts. Your response lives in chat only.

RESPONSE FORMAT:
  1. **Gut reaction** — Your immediate emotional response. Did it grab you? Where did you zone out?
  2. **What's working** — The strongest elements. Be specific: name scenes, characters, lines.
  3. **What's not working** — The weakest elements. Don't soften it. Name the problems.
  4. **The big question** — The single most important thing the author needs to address.
  5. **Verdict** — One sentence. Would you keep reading? Would you recommend it?

TONE:
- This is a hot take, not a formal report. Write like a smart friend who just read the draft, not like an editor writing a letter. Be human about it.
- Do NOT hedge with "it depends on your goals" or "this is subjective." Have an opinion.`;

export const HOT_TAKE_MODEL = 'claude-opus-4-20250514';
```

---

## Application Changes

### `src/application/ChatService.ts` — Handle `hot-take` purpose

Add a `handleHotTake` private method, similar to `handlePitchRoomMessage`, that:

1. Loads the Ghostlight agent and builds a system prompt from the base Ghostlight prompt + `HOT_TAKE_INSTRUCTIONS`
2. Includes a chapter listing in the system prompt (from the project manifest) so Ghostlight knows the reading order
3. Saves a synthetic user message: `"Read the full manuscript and give me your honest reaction."`
4. Calls the CLI in **full agent mode** (tool use enabled) with `HOT_TAKE_MODEL` (Opus) regardless of global model setting
5. The agent reads each chapter via Read tool calls — the UI sees these as normal tool-use events with reading progress
6. After reading, the agent responds with the ~5 paragraph hot take
7. Saves the assistant response and records token usage normally

**Key detail:** The method receives the already-saved conversation from the DB (created by the IPC handler or the renderer). It does NOT create the conversation itself — that's the handler's job.

```typescript
private async handleHotTake(params: {
  conversationId: string;
  bookSlug: string;
  appSettings: AppSettings;
  agent: Agent;
  onEvent: (event: StreamEvent) => void;
  sessionId: string;
  thinkingBudgetOverride?: number;
  callId?: string;
}): Promise<void> {
  // 1. Build system prompt: Ghostlight base + HOT_TAKE_INSTRUCTIONS + chapter listing
  // 2. Save synthetic user message
  // 3. Call CLI with HOT_TAKE_MODEL, full agent mode, tool use enabled
  // 4. Agent reads chapters via Read tool, responds with hot take
  // 5. Save assistant response
  // 6. Record usage
}
```

**Branch in `sendMessage`:** After the pitch-room check, add:

```typescript
if (conversation?.purpose === 'hot-take') {
  await this.handleHotTake({
    conversationId, bookSlug, appSettings, agent, onEvent, sessionId,
    thinkingBudgetOverride: params.thinkingBudgetOverride,
    callId: params.callId,
  });
  return;
}
```

---

## IPC Changes

### `src/main/ipc/handlers.ts` — Add `hot-take:start` handler

A new IPC channel that:

1. Creates a Ghostlight conversation with `purpose: 'hot-take'` and a title like `"Hot Take — {date}"`
2. Calls `chatService.sendMessage()` with a dummy user message (the actual manuscript reading is handled inside `handleHotTake`)
3. Returns the conversation ID so the renderer can navigate to it

```typescript
ipcMain.handle('hot-take:start', async (_event, bookSlug: string) => {
  // Create conversation
  // Trigger sendMessage with purpose: 'hot-take'
  // Return conversationId
});
```

### `src/preload/index.ts` — Expose `hotTake.start`

```typescript
hotTake: {
  start: (bookSlug: string): Promise<string> =>
    ipcRenderer.invoke('hot-take:start', bookSlug),
},
```

---

## Renderer Changes

### Trigger Point: Sidebar Button

Add a **"Hot Take"** button to the sidebar, below the pipeline tracker. It should:

- Be visible whenever a book is active and has at least one chapter with a draft
- Use the Ghostlight color (`#06B6D4`, cyan) with a book/eye icon
- Be disabled while a stream is active
- On click: call `window.novelEngine.hotTake.start(bookSlug)`, then navigate to the new conversation

### Chat View Integration

The `ChatView` already handles streaming for any conversation. The hot-take conversation will render normally — the user sees Ghostlight's hot take stream in, and can send follow-up messages. Follow-up messages go through the normal `sendMessage` flow — just a regular Ghostlight conversation at that point.

### Quick Action (Optional)

Add a quick action to Ghostlight's quick action list:

```typescript
Ghostlight: [
  { label: 'Read the manuscript', prompt: '...' },  // existing
  { label: 'Hot Take', prompt: '__HOT_TAKE__' },    // NEW — special sentinel
],
```

The `ChatView` detects the `__HOT_TAKE__` sentinel and calls `hotTake.start()` instead of `sendMessage()`. This gives users two ways to trigger it: sidebar button or quick action dropdown.

---

## Edge Cases

1. **No chapters exist:** Button is disabled. If triggered via quick action, show an error toast: "No chapters to read yet."
2. **Very long manuscripts:** Not a problem — the agent reads chapter by chapter via tool calls, so there's no context window limit on manuscript size. A 100-chapter novel just means more Read calls.
3. **Stream already active:** Button is disabled (same as other actions during streaming).
4. **Follow-up messages and conversation bleed:** No bleed. Each CLI call is a fresh child process. The DB only stores the final assistant text (the hot take), not the chapter contents from Read tool calls. Follow-ups see the synthetic user message + the hot take response — not the manuscript. This means follow-ups can't reference specific passages without Ghostlight re-reading the relevant chapter file, which is fine — it's how all agent conversations work in the app. The user can ask "what did you think of chapter 12?" and Ghostlight will Read it again to answer.
5. **Multiple hot takes:** Each creates a new conversation. They appear in the conversation list with titles like "Hot Take — Mar 25, 2026".
6. **Pitch Room active (no book selected):** Button is hidden — hot takes only work on books with chapters.
7. **Agent tries to write files:** The system prompt forbids it. If the agent somehow still attempts a Write/Edit, the response is still valid — the written file just becomes an unexpected artifact. The pipeline is unaffected regardless.

---

## What This Feature Does NOT Do

- Does not write `reader-report.md` or any other file (instructed not to, though tool use is enabled for reading)
- Does not advance or affect the pipeline in any way
- Does not use the Wrangler (no context planning needed — Ghostlight reads everything)
- Does not replace the formal Ghostlight pipeline phase
- Does not read source documents (pitch, outline, bible, reports) — cold read only

---

## Verification

1. `npx tsc --noEmit` passes with no errors
2. With a book that has 3+ chapters, click "Hot Take" in the sidebar
3. A new conversation appears with Ghostlight streaming a ~5 paragraph response
4. No files are created in the book's `source/` directory
5. Pipeline state is unchanged
6. The user can send follow-up messages in the same conversation
7. The conversation title shows "Hot Take — {date}"
8. With no chapters, the button is disabled
9. Token usage is recorded normally
