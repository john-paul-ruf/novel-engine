# SESSION-11 — Chapter Deep Dive: Backend

> **Feature:** small-queue-intake
> **Layer(s):** M01 (domain), M08 (application), M09 (IPC/main)
> **Depends on:** Nothing
> **Estimated effort:** 30 min

---

## Context

A "Deep Dive" is a per-chapter focused craft analysis by Lumen. Unlike a full manuscript assessment, it loads only the target chapter, its notes.md (if present), and the relevant scene outline entry. Output stays in chat — no files written.

This session wires the backend: domain interface extension, application service method, IPC handler, and preload bridge. The UI (FilesView button) is SESSION-12.

---

## Files to Read First

- `src/domain/interfaces.ts` — IChatService
- `src/application/ChatService.ts` — sendMessage implementation to understand the pattern
- `src/main/ipc/handlers.ts` — existing chat handlers
- `src/preload/index.ts` — current window.novelEngine.chat namespace
- `src/domain/constants.ts` — AGENT_REGISTRY for Lumen, AGENT_READ_GUIDANCE

---

## Step 1: Domain — Extend IChatService

In `src/domain/interfaces.ts`, add a new method to `IChatService`:

```ts
/**
 * Run a chapter deep dive — a scoped Lumen analysis of a single chapter.
 *
 * Loads: target chapter draft + notes.md (if present) + scene outline entry
 * for that chapter. Creates a new Lumen conversation and sends the analysis
 * prompt. Returns the conversationId so the UI can navigate to it.
 *
 * Does NOT use the Wrangler context assembly — context is assembled inline.
 * Does NOT write files — output is chat-only.
 */
deepDive(params: {
  bookSlug: string;
  chapterSlug: string;
  callId?: string;
  onEvent: (event: StreamEvent) => void;
}): Promise<{ conversationId: string }>;
```

---

## Step 2: Application — Implement deepDive in ChatService

In `src/application/ChatService.ts`, implement the `deepDive` method:

```ts
async deepDive({ bookSlug, chapterSlug, callId, onEvent }) {
  // 1. Load the Lumen agent
  const agent = await this.agents.load('Lumen');
  const settings = await this.settings.load();

  // 2. Create a new conversation
  const conversation = await this.createConversation({
    bookSlug,
    agentName: 'Lumen',
    pipelinePhase: null,
    purpose: 'pipeline',   // or 'adhoc' if that purpose exists — check ConversationPurpose
  });

  // 3. Build context inline — no Wrangler
  // Read chapter draft
  let chapterContent = '';
  try {
    chapterContent = await this.filesystem.readFile(bookSlug, `chapters/${chapterSlug}/draft.md`);
  } catch { /* chapter not found — proceed without */ }

  // Read chapter notes
  let notesContent = '';
  try {
    notesContent = await this.filesystem.readFile(bookSlug, `chapters/${chapterSlug}/notes.md`);
  } catch { /* no notes — that is fine */ }

  // Read scene outline for context
  let sceneOutline = '';
  try {
    sceneOutline = await this.filesystem.readFile(bookSlug, 'source/scene-outline.md');
  } catch { /* no outline — proceed */ }

  // 4. Assemble the user message
  const chapterNumber = chapterSlug.match(/^(\d+)/)?.[1] ?? '?';
  const userMessage = [
    `## Chapter Deep Dive Request`,
    ``,
    `**Chapter:** ${chapterSlug} (Chapter ${chapterNumber})`,
    ``,
    `### Chapter Draft`,
    ``,
    chapterContent || '*(draft not found)*',
    ``,
    notesContent ? `### Author Notes\n\n${notesContent}` : '',
    sceneOutline ? `### Scene Outline (full — find the relevant entry)\n\n${sceneOutline}` : '',
    ``,
    `---`,
    ``,
    `Conduct a surgical craft assessment of this single chapter only. Evaluate:`,
    `- Opening line — does it earn attention?`,
    `- Tension arc — where does tension spike, where does it go flat?`,
    `- Scene change — does the chapter open and close on different emotional territory?`,
    `- Proportion — action vs interiority vs dialogue balance for this scene's purpose`,
    `- Specific actionable notes — quote the text when identifying issues`,
    ``,
    `Do not read or reference any other chapters. Do not write any files.`,
  ].filter(Boolean).join('\n');

  // 5. Save the user message to DB
  this.db.saveMessage({
    conversationId: conversation.id,
    role: 'user',
    content: userMessage,
    thinking: '',
  });

  // 6. Stream Lumen's response
  const sessionId = `deep-dive-${Date.now()}`;
  await this.providers.sendMessage({
    model: settings.model,
    systemPrompt: agent.systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: settings.maxTokens,
    thinkingBudget: settings.enableThinking ? agent.thinkingBudget : 0,
    maxTurns: 3,   // deep dive is read-only, minimal turns needed
    bookSlug,
    sessionId,
    conversationId: conversation.id,
    onEvent: (event) => {
      onEvent(event);
    },
  });

  return { conversationId: conversation.id };
}
```

Note: `this.filesystem` — check how ChatService accesses the filesystem (it may be through IFileSystemService injected in the constructor, or it may not have direct filesystem access). If ChatService does not already have `IFileSystemService` injected, add it to the constructor signature and update the composition root in `src/main/index.ts` accordingly.

Read `ChatService.ts` carefully before writing — match its existing patterns exactly (error handling, session tracking, etc.).

---

## Step 3: IPC — Add handler

In `src/main/ipc/handlers.ts`, add:

```ts
ipcMain.handle('chat:deepDive', (_e, params: { bookSlug: string; chapterSlug: string; callId?: string }) => {
  return chatService.deepDive({
    ...params,
    onEvent: (event) => mainWindow.webContents.send(`chat:stream:${params.callId ?? 'default'}`, event),
  });
});
```

---

## Step 4: Preload — Expose on bridge

In `src/preload/index.ts`, add to the `chat` namespace:

```ts
deepDive: (params: { bookSlug: string; chapterSlug: string; callId?: string }) =>
  ipcRenderer.invoke('chat:deepDive', params),
```

---

## Architecture Compliance

- [x] Domain: IChatService method addition — pure interface, no runtime values
- [x] Application: ChatService implementation — depends on injected interfaces only
- [x] IPC: one-liner handler in handlers.ts
- [x] Preload: typed bridge method
- [x] No new domain types required — reuses existing `StreamEvent`, `Conversation`

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `grep "deepDive" src/domain/interfaces.ts` returns the method signature
3. `grep "deepDive" src/main/ipc/handlers.ts` returns the handler
4. `grep "deepDive" src/preload/index.ts` returns the bridge method

---

## State Update

Set SESSION-11 to `done` in STATE.md.
