# Hot Take & Ad Hoc Revisions — Session Prompt

## Goal

Rearrange the sidebar so that **Hot Take** and a new **Ad Hoc Revisions** button sit above the Chat nav button in the bottom nav section, separated from the pipeline tracker area. The Ad Hoc Revisions button launches an instant revision queue — skipping the formal pipeline entirely — by generating `project-tasks.md` and `revision-prompts.md` on-the-fly from whatever the author tells it, then opening the standard Revision Queue view.

---

## Motivation

### Hot Take relocation

Hot Take currently lives below the pipeline tracker in the scrollable middle section of the sidebar. This buries it under 14 pipeline phases. It's a quick-access action — it should feel like a peer of Chat and Files, not a pipeline sub-feature. Moving it to the bottom nav section, directly above Chat, makes it a first-class sidebar action.

### Ad Hoc Revisions

The existing Revision Queue requires the formal pipeline: Ghostlight reads → Lumen assesses → Forge generates tasks → Queue runs sessions. This is great for structured revision cycles, but authors often want to run targeted revisions *right now* — after a Hot Take flags something, after re-reading a chapter themselves, or at any point in the writing process.

Ad Hoc Revisions let the author describe what they want changed in plain text. The system:
1. Opens a short conversation with Forge to generate tasks and session prompts from the author's request
2. Writes `source/project-tasks.md` and `source/revision-prompts.md` (or appends to them if they exist)
3. Opens the standard Revision Queue view with the freshly-loaded plan

This reuses the entire existing Revision Queue infrastructure — no new queue system needed. The only new piece is a Forge conversation that produces the plan files.

---

## Architecture

### Sidebar Layout Change

Current bottom nav section:
```
─────────────────
💬 Chat
📁 Files
📦 Build
⚙️ Settings
─────────────────
  CLI Activity
```

New bottom nav section:
```
─────────────────
👁 Hot Take
🔧 Ad Hoc Revisions
─────────────────
💬 Chat
📁 Files
📦 Build
⚙️ Settings
─────────────────
  CLI Activity
```

Hot Take moves out of the scrollable pipeline area and into the bottom nav section, above the Chat/Files/Build/Settings buttons. The Ad Hoc Revisions button sits directly below it. Both are separated from the nav buttons by a subtle divider.

Both buttons are **contextual to the active book** — they hide when no book is active or when in the Pitch Room.

### Hot Take — No Behavioral Changes

The Hot Take button retains its exact current behavior. The only change is its position in the sidebar. Remove it from the scrollable middle section (between PipelineTracker and the divider) and place it in the new action section above the bottom nav.

### Ad Hoc Revisions — New Feature

The Ad Hoc Revisions button is a new sidebar action. Clicking it:

1. **Opens a modal dialog** (or inline prompt area) asking the author to describe the revisions they want. This is a simple text area with a "Generate Plan" button. Examples of what the author might type:
   - "Rewrite chapters 12-15 to fix the pacing issues Ghostlight flagged"
   - "The antagonist's motivation needs to be clearer in act 2"  
   - "Add foreshadowing for the twist in chapter 20 — seed it in chapters 5, 8, and 14"
   - "Tighten the prose everywhere — cut 10% word count, eliminate adverbs, sharpen dialogue"

2. **Sends the description to Forge** in a special ad-hoc conversation. Forge receives:
   - The author's revision request
   - The current project manifest (file listing with word counts)
   - Instructions to produce `project-tasks.md` and `revision-prompts.md` in the standard format
   - If these files already exist, instructions to either append or replace (author's choice)

3. **Forge generates the plan files** via tool use — writes `source/project-tasks.md` and `source/revision-prompts.md` directly to disk.

4. **Navigates to the Revision Queue view** and triggers `loadPlan()`, which picks up the freshly-written files through the normal flow (Wrangler parses them, sessions are built, etc.).

The author then runs the queue exactly as they would in the pipeline flow — approve/reject/skip sessions, use manual or auto-approve mode, verify at the end.

---

## Domain Changes

### `src/domain/types.ts` — Extend `ConversationPurpose`

```typescript
export type ConversationPurpose = 'pipeline' | 'voice-setup' | 'author-profile' | 'pitch-room' | 'hot-take' | 'adhoc-revision';
```

### `src/domain/constants.ts` — Add Ad Hoc Revision prompt

Add an `ADHOC_REVISION_INSTRUCTIONS` constant — the purpose-specific instructions injected into Forge's system prompt for ad hoc revision plan generation:

```typescript
export const ADHOC_REVISION_INSTRUCTIONS = `You are generating an ad hoc revision plan based on the author's specific request.

INSTRUCTIONS:
1. Read the author's revision request carefully. They are describing targeted changes they want made to the manuscript.
2. Use the Read tool to examine the relevant chapters and source files to understand the current state of what needs changing.
3. Produce TWO files:

**source/project-tasks.md** — A phased task checklist in the standard format:
\`\`\`
# Project Tasks — Ad Hoc Revision

## Phase 0: Author Decisions
- [ ] 1. [Any decisions the author needs to make before revisions begin]

## Phase 1: [Name based on the revision scope]
- [ ] 2. [Specific, actionable task]
- [ ] 3. [Another task]
...
\`\`\`

**source/revision-prompts.md** — Session prompts for Verity in the standard format:
\`\`\`
# Revision Prompts — Ad Hoc Revision

## SESSION 1: [Title]

**Model: Opus** (or Sonnet for analytical/mechanical tasks)

[Full prompt text for Verity — chapter references, specific instructions, what to change and how]

---

## SESSION 2: [Title]
...
\`\`\`

RULES:
- Each session should be focused — one logical unit of work (a chapter, a theme, a character arc fix)
- Reference chapters by their actual directory names (e.g., @chapters/05-the-departure/draft.md)
- Assign Model: Opus for creative/structural work, Model: Sonnet for mechanical/analytical tasks
- Keep sessions ordered by dependency — if session 3 depends on session 1's changes, put session 1 first
- Task numbers must be sequential starting from 1
- Every task must map to at least one session

HANDLING EXISTING FILES:
- If project-tasks.md and/or revision-prompts.md already exist, READ them first
- If the existing files are from a previous revision cycle (e.g., marked mostly [x]), REPLACE them entirely with the new plan
- If the existing files have pending work, ASK the author whether to append or replace before writing

After writing both files, confirm what you created: how many tasks, how many sessions, and a brief summary of the revision plan.`;
```

---

## Application Changes

### `src/application/ChatService.ts` — Handle `adhoc-revision` purpose

Add a `handleAdhocRevision` private method, similar to `handleHotTake`:

1. Loads the Forge agent and builds a system prompt from the base Forge prompt + `ADHOC_REVISION_INSTRUCTIONS`
2. Includes the project manifest in the system prompt so Forge knows the chapter structure
3. The author's message (their revision description) is the user message
4. Calls the CLI in **full agent mode** (tool use enabled) so Forge can read chapters and write the plan files
5. Uses the global model setting (not hardcoded like Hot Take) — Forge works well on Sonnet for planning
6. After Forge writes the files, saves the response and records usage normally

```typescript
private async handleAdhocRevision(params: {
  conversationId: string;
  bookSlug: string;
  message: string;           // the author's revision description
  appSettings: AppSettings;
  agent: Agent;              // Forge
  onEvent: (event: StreamEvent) => void;
  sessionId: string;
  thinkingBudgetOverride?: number;
  callId?: string;
}): Promise<void> {
  // 1. Build system prompt: Forge base + ADHOC_REVISION_INSTRUCTIONS + project manifest
  // 2. Save user message (the author's revision request)
  // 3. Call CLI with global model, full agent mode, tool use enabled
  // 4. Forge reads chapters, writes project-tasks.md and revision-prompts.md
  // 5. Save assistant response
  // 6. Record usage
}
```

**Branch in `sendMessage`:** After the hot-take check, add:

```typescript
if (conversation?.purpose === 'adhoc-revision') {
  await this.handleAdhocRevision({
    conversationId, bookSlug, message: params.message, appSettings, agent, onEvent, sessionId,
    thinkingBudgetOverride: params.thinkingBudgetOverride,
    callId: params.callId,
  });
  return;
}
```

---

## IPC Changes

### `src/main/ipc/handlers.ts` — Add `adhoc-revision:start` handler

A new IPC channel that:

1. Creates a Forge conversation with `purpose: 'adhoc-revision'` and a title like `"Ad Hoc Revision — {date}"`
2. Returns the conversation ID and call ID so the renderer can navigate to chat and attach to the stream

```typescript
ipcMain.handle('adhoc-revision:start', async (_event, bookSlug: string, description: string) => {
  // Create Forge conversation with purpose: 'adhoc-revision'
  // Call chatService.sendMessage() with the description as the user message
  // Return { conversationId, callId }
});
```

### `src/preload/index.ts` — Expose `adhocRevision.start`

```typescript
adhocRevision: {
  start: (bookSlug: string, description: string): Promise<{ conversationId: string; callId: string }> =>
    ipcRenderer.invoke('adhoc-revision:start', bookSlug, description),
},
```

---

## Renderer Changes

### `src/renderer/components/Layout/Sidebar.tsx` — Restructure

1. **Remove** `<HotTakeButton />` from the scrollable middle section (between PipelineTracker and the divider)
2. **Add** a new "Quick Actions" section above the bottom nav buttons:

```tsx
{/* Quick actions — above nav, below scrollable area */}
<div className="shrink-0 border-t border-zinc-200 dark:border-zinc-800 px-2 py-1">
  <HotTakeButton />
  <AdhocRevisionButton />
</div>

{/* Bottom nav */}
<div className="shrink-0 border-t border-zinc-200 dark:border-zinc-800 p-2">
  {NAV_ITEMS.map(...)}
  ...
</div>
```

Both buttons should only render when a book is active and `currentView !== 'pitch-room'`.

### `src/renderer/components/Sidebar/AdhocRevisionButton.tsx` — New Component

A button that:
- Shows when a book is active and has at least one chapter
- Uses Forge's color (`#F97316`, orange) with a wrench/gear icon
- Is disabled while a stream is active
- On click: opens a **modal dialog** with:
  - A text area for the revision description (placeholder: "Describe the revisions you want...")
  - A "Generate Plan" submit button
  - A "Cancel" button
- On submit:
  1. Calls `window.novelEngine.adhocRevision.start(bookSlug, description)`
  2. Navigates to the chat view and attaches to the Forge stream (so the author can watch Forge read files and generate the plan)
  3. When the stream completes (Forge has written the plan files), the author clicks through to the Revision Queue view — OR — auto-navigate to revision-queue after stream ends

**Important UX decision:** After Forge finishes generating the plan, the user should land in the Revision Queue view where they can see the sessions and start running them. The simplest approach:

1. Start the stream in chat view (so the author watches Forge work)
2. When the stream `done` event fires, show a toast/banner: "Revision plan ready — 8 sessions, 23 tasks" with a "Open Queue" button
3. Clicking "Open Queue" navigates to `revision-queue` and calls `loadPlan()`

Alternatively, skip the chat view entirely and show a loading state in the Ad Hoc modal while Forge works, then navigate straight to the queue. This is simpler but the author can't see what Forge is doing.

**Recommended approach:** Show the stream in chat view. The author sees Forge reading chapters and writing files in real-time (tool use indicators). When done, auto-navigate to revision-queue with a short delay (1-2s).

### `src/renderer/components/Sidebar/HotTakeButton.tsx` — No Changes to Behavior

The component itself doesn't change. Only its position in the Sidebar layout changes (moved from middle section to bottom action section).

---

## Revision Queue Integration

The Ad Hoc Revisions feature does NOT modify the Revision Queue infrastructure at all. It only produces the input files (`project-tasks.md` and `revision-prompts.md`) that the existing queue consumes. The flow:

```
Author describes revisions
  → Forge generates plan files (via adhoc-revision conversation)
    → User navigates to Revision Queue
      → loadPlan() reads the files
        → Wrangler parses them (or cache hit)
          → Sessions appear in the queue
            → Normal queue execution
```

The only thing the `RevisionQueueButton` needs to handle is the fact that these files might now appear at any point — not just after the `revision-plan-1` or `revision-plan-2` pipeline phases. The button's visibility check already looks for `source/project-tasks.md` OR `source/revision-prompts.md`, so it will automatically appear once Forge writes the files.

---

## Edge Cases

1. **Plan files already exist:** Forge is instructed to read them first. If they're from a completed cycle (mostly `[x]`), replace. If they have pending work, ask the author. The `ADHOC_REVISION_INSTRUCTIONS` prompt covers this.

2. **Revision Queue already loaded with a different plan:** When the user navigates to the queue after ad hoc plan generation, the queue detects the file content changed (hash mismatch) and re-parses via Wrangler. The existing cache invalidation handles this automatically.

3. **No chapters exist:** Button is hidden (same as Hot Take).

4. **Stream already active:** Button is disabled.

5. **Author cancels mid-stream:** Forge may have partially written files. The queue will attempt to load whatever exists — if the files are incomplete, the Wrangler parse will fail with a clear error, and the author can re-run the ad hoc generation.

6. **Pipeline-driven revision plan in progress:** The ad hoc generation overwrites the files. This is by design — the author explicitly chose to replace the formal plan with their own. The queue re-parses and shows the new sessions.

7. **Second revision cycle (post-copy-edit):** The cycle detection in `loadPlan()` handles this — it checks for `audit-report.md` and `project-tasks-v1.md` to determine which cycle we're in. Ad hoc revisions at any point in the pipeline will be treated as the appropriate cycle.

---

## What This Feature Does NOT Do

- Does not create a new queue system — reuses the entire existing Revision Queue
- Does not bypass the Wrangler parse — plan files still go through the standard Wrangler → sessions flow
- Does not modify pipeline state — ad hoc revisions are pipeline-agnostic
- Does not auto-advance any pipeline phase — the author is working outside the formal pipeline
- Does not store the "ad hoc" vs "pipeline" origin — once the plan files exist, the queue doesn't care how they got there

---

## Files Created/Modified

### New Files
- `src/renderer/components/Sidebar/AdhocRevisionButton.tsx` — New sidebar button + modal

### Modified Files
- `src/domain/types.ts` — Add `'adhoc-revision'` to `ConversationPurpose`
- `src/domain/constants.ts` — Add `ADHOC_REVISION_INSTRUCTIONS` constant
- `src/application/ChatService.ts` — Add `handleAdhocRevision()` method + branch in `sendMessage()`
- `src/main/ipc/handlers.ts` — Add `adhoc-revision:start` handler
- `src/preload/index.ts` — Expose `adhocRevision.start`
- `src/renderer/components/Layout/Sidebar.tsx` — Move HotTakeButton, add AdhocRevisionButton to bottom action section

---

## Verification

1. `npx tsc --noEmit` passes with no errors
2. Hot Take button appears above Chat in the bottom nav section (not in the scrollable pipeline area)
3. Hot Take behavior is unchanged — clicking it starts a Ghostlight manuscript read
4. Ad Hoc Revisions button appears below Hot Take in the bottom nav section
5. Clicking Ad Hoc Revisions opens a modal with a text area
6. Submitting a revision description creates a Forge conversation and streams the response
7. Forge reads relevant chapters and writes `source/project-tasks.md` and `source/revision-prompts.md`
8. After Forge finishes, navigating to the Revision Queue shows the generated sessions
9. The queue runs normally — sessions can be approved, rejected, skipped
10. With no book active or no chapters, both buttons are hidden
11. While streaming, both buttons are disabled
12. Ad Hoc Revisions with existing plan files: Forge reads them and handles appropriately
