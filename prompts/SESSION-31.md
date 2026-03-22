# Session 31 — Revision Queue Verification: "Verify" Button at 100% Completion

## Context

Novel Engine Electron app. The revision queue (Sessions 24–27) lets the author run Forge's revision sessions through Verity, approve/reject/skip each session, and advance the pipeline. Currently, when all sessions reach a terminal state (approved/skipped), the queue shows 100% but there's no structured way to confirm the tasks were actually done.

The problem: **100% completion doesn't mean the tasks are actually done.** Verity might have skipped a subtask, partially addressed a note, or introduced a new issue. The author has no structured way to verify this — they'd have to manually re-read `project-tasks.md` and compare it against the manuscript, which defeats the purpose of the queue system.

This session adds a **"Verify" button** that appears when the queue hits 100%. Clicking it opens a verification chat with **Forge** (the task master) in the revision session panel. Forge reads the current `project-tasks.md`, the manuscript, and any reports, then produces a verification assessment: which tasks are genuinely complete, which need more work, and what's still outstanding. The author can then discuss findings and make final revisions.

**Note:** Archiving of revision files (project-tasks.md, revision-prompts.md) is an agent action, not a user-facing button. The "Complete & Archive" button has been removed. The pipeline advances when all revisions are complete — archiving is handled as part of the agent workflow.

---

## Design

### Concept

The Verify button is **optional** — but it provides structured AI audit for authors who want confidence that every task was truly addressed before moving on.

The verification flow:

1. Author completes all revision sessions (queue hits 100%)
2. "Verify" button appears in the controls
3. Clicking "Verify" opens the revision session panel with a new **verification conversation** with Forge
4. Forge automatically receives a verification prompt that instructs it to:
   - Read `project-tasks.md` and check each task marked `[x]`
   - Read the relevant chapters to verify changes were actually made
   - Produce a verification report: confirmed, partial, not addressed
   - Recommend whether more work is needed
5. The author can chat with Forge to discuss findings, ask for details, or request re-checks

### Key Architectural Decision: Reuse the Chat Infrastructure

Rather than building a parallel chat system, the verification conversation uses the existing `ChatService.send()` flow. It creates a real conversation (bookSlug, agent: Forge, purpose: 'pipeline') and opens it in the revision session panel's chat area. This means:

- Full streaming support (thinking blocks, tool use indicators)
- Conversation is saved to the database (can be reviewed later)
- Forge has full tool access (can read files, check chapters)
- No new IPC channels needed for the chat itself

The only new pieces are:
1. A verification prompt constant in `constants.ts`
2. A `startVerification()` action in the revision queue store
3. A "Verify" button in `QueueControls`
4. Wiring in the revision session panel to display the verification conversation

### UI Layout

When the queue is at 100% and "Verify" is clicked:

```
+--------------------------------------------------------------------------+
|  Revision Queue                                          [Verify]        |
|  15/15 sessions | 47/47 tasks | 100% complete                           |
|  ====================================================================    |
+---------------------+----------------------------------------------------+
|  S1: Ch 20-26       |  Forge — Verification                              |
|  S2: Ch 27-30       |                                                    |
|  S3: Timeline       |  [Forge]: I've reviewed all 47 tasks against the   |
|  S4: Ch 1-5         |  current manuscript. Here's my assessment:          |
|  S5: Ch 6-12        |                                                    |
|  ...                |  ## Verification Report                            |
|                     |                                                    |
|  -----------------  |  41/47 tasks confirmed complete                    |
|  Verification       |  4 tasks partially addressed                       |
|  (active)           |  2 tasks not addressed                             |
|                     |                                                    |
|                     |  ### Partially Addressed                           |
|                     |  - Task 12: Timeline consistency...                |
|                     |  ...                                               |
|                     +----------------------------------------------------+
|                     |  [Ask Forge about the findings...]        [Send]   |
+---------------------+----------------------------------------------------+
```

The verification conversation appears as a special entry below the session list — visually distinct from the numbered sessions. It uses Forge's color (orange) and shows as "Verification" rather than a numbered session.

---

## Task 1: Domain — Verification Prompt Constant

### Update `src/domain/constants.ts`

Add a new constant for the verification prompt. This is the system prompt addition that Forge receives when running a verification check:

```typescript
export const REVISION_VERIFICATION_PROMPT = `You are verifying whether all revision tasks have been genuinely completed.

## Your Job

Read \`source/project-tasks.md\` carefully. For every task marked \`[x]\` (complete), verify that the work was actually done by reading the relevant chapters and source files. Produce a verification report.

## Process

1. Read \`source/project-tasks.md\` to get the full task list
2. For each completed task (\`[x]\`), read the chapters or files it references
3. Check whether the described change is actually present in the current text
4. Categorize each task:
   - **Confirmed** — the change is clearly present and well-executed
   - **Partial** — some work was done but the task isn't fully addressed (explain what's missing)
   - **Not Done** — the task is marked complete but the change is not evident in the text
5. For any tasks still marked \`[ ]\` (incomplete), note them as **Skipped**

## Output Format

Produce a structured verification report:

### Summary
- X/Y tasks confirmed complete
- N tasks partially addressed
- M tasks not addressed
- K tasks skipped (still unchecked)

### Confirmed Tasks
Brief list of task numbers that passed verification.

### Issues Found

For each partial or unaddressed task:
- **Task N: [title]** — [status] [explanation of what's missing or wrong]
  - Referenced files: [which chapters/files you checked]
  - Recommendation: [what needs to happen to complete this task]

### Recommendation
State clearly whether more work is needed. If more work is needed, prioritize the outstanding items.

## Important
- Be thorough but efficient — you don't need to quote entire chapters, just verify the changes exist
- Focus on substance, not style — if the task asked for a structural change, verify the structure changed
- If a task is ambiguous about what "done" looks like, use your judgment and note the ambiguity
- Be honest — the author needs to know if something slipped through
`;
```

### Update `src/domain/types.ts`

Add an optional `verificationConversationId` field to `RevisionPlan`:

```typescript
export type RevisionPlan = {
  id: string;
  bookSlug: string;
  sessions: RevisionSession[];
  totalTasks: number;
  completedTaskNumbers: number[];
  phases: RevisionPlanPhase[];
  mode: QueueMode;
  createdAt: string;
  verificationConversationId: string | null;  // <- NEW
};
```

---

## Task 2: Application — RevisionQueueService Verification Method

### Update `src/application/RevisionQueueService.ts`

Add a `startVerification()` method that creates a Forge conversation and sends the verification prompt:

```typescript
async startVerification(planId: string): Promise<string> {
  const plan = this.plans.get(planId);
  if (!plan) throw new Error('Plan not found');

  // If a verification conversation already exists, return it
  if (plan.verificationConversationId) {
    return plan.verificationConversationId;
  }

  const forge = await this.agents.load('Forge' as AgentName);
  const settings = await this.settings.load();

  // Create a conversation for the verification
  const conversation = this.db.createConversation({
    id: nanoid(),
    bookSlug: plan.bookSlug,
    agentName: 'Forge' as AgentName,
    pipelinePhase: null,
    purpose: 'pipeline',
    title: 'Revision Verification',
  });

  plan.verificationConversationId = conversation.id;

  // Save the verification prompt as the first user message
  const verificationMessage = 'Verify that all revision tasks marked as complete in project-tasks.md have been genuinely addressed in the manuscript. Produce a full verification report.';

  this.db.saveMessage({
    conversationId: conversation.id,
    role: 'user',
    content: verificationMessage,
    thinking: '',
  });

  return conversation.id;
}
```

This method only creates the conversation and saves the first message. The actual CLI call happens through the normal `ChatService.send()` flow — the renderer calls `chat:send` with the conversation ID, and ChatService handles the rest (context building, streaming, etc.).

### Update `src/domain/interfaces.ts`

Add `startVerification` to `IRevisionQueueService`:

```typescript
export interface IRevisionQueueService {
  // ... existing methods ...

  /**
   * Create a verification conversation with Forge for the completed queue.
   * Returns the conversation ID. If a verification conversation already
   * exists for this plan, returns the existing one.
   *
   * The conversation is created with the verification prompt as the first
   * user message. The caller should then use ChatService.send() to trigger
   * the actual agent call.
   */
  startVerification(planId: string): Promise<string>;
}
```

### Wire the IPC handler

Add to `src/main/ipc/handlers.ts`:

```typescript
ipcMain.handle('revision:startVerification', (_, planId: string) =>
  services.revisionQueue.startVerification(planId),
);
```

### Wire the preload bridge

Add to `src/preload/index.ts` inside the `revision` namespace:

```typescript
startVerification: (planId: string): Promise<string> =>
  ipcRenderer.invoke('revision:startVerification', planId),
```

---

## Task 3: Application — Forge System Prompt Augmentation

### Update `src/application/ChatService.ts`

When ChatService processes a message for a conversation titled "Revision Verification" (or more robustly: when the conversation was created by `startVerification`), it should append the `REVISION_VERIFICATION_PROMPT` to Forge's system prompt. 

The cleanest approach: check if the conversation's `agentName` is `'Forge'` and the conversation title is `'Revision Verification'`. If so, append the verification instructions to the system prompt:

```typescript
// In the send() method, after building the base system prompt:
if (conversation.agentName === 'Forge' && conversation.title === 'Revision Verification') {
  systemPrompt += '\n\n' + REVISION_VERIFICATION_PROMPT;
}
```

Import `REVISION_VERIFICATION_PROMPT` from `@domain/constants`.

This is lightweight and doesn't require any schema changes or new fields on Conversation. The title-based detection is safe because the title is set programmatically by `startVerification()` and the author never types it manually.

---

## Task 4: Renderer — Store and UI

### Update `src/renderer/stores/revisionQueueStore.ts`

Add state and actions for verification:

```typescript
// New state fields:
verificationConversationId: string | null;
isVerifying: boolean;  // true while the verification conversation is being created

// New actions:
startVerification: () => Promise<void>;
```

Add these to the initial state, CachedBookState, and snapshotState.

Implementation of `startVerification`:

```typescript
startVerification: async () => {
  const { planId } = get();
  if (!planId) return;

  set({ isVerifying: true, error: null });
  try {
    const conversationId = await window.novelEngine.revision.startVerification(planId);
    set({
      verificationConversationId: conversationId,
      viewingSessionId: '__verification__',
      isVerifying: false,
    });

    // Load the verification conversation messages into the panel
    await get().loadPanelMessages(conversationId);
  } catch (err) {
    set({
      error: err instanceof Error ? err.message : String(err),
      isVerifying: false,
    });
  }
},
```

Using `viewingSessionId: '__verification__'` as a sentinel value to indicate the verification panel is open (rather than a specific session). The `RevisionSessionPanel` will detect this and render the verification chat.

### Update `src/renderer/components/RevisionQueue/QueueControls.tsx`

Add a "Verify" button that appears when the queue is at 100%:

```tsx
const {
  plan, isRunning, isPaused, isLoading,
  setMode, runNext, runAll, pause, clearCache,
  startVerification, isVerifying, verificationConversationId,
} = useRevisionQueueStore();

const allDone = plan.sessions.length > 0 && plan.sessions.every(
  s => s.status === 'approved' || s.status === 'skipped',
);
const canVerify = allDone && !isRunning;

{canVerify && (
  <>
    {/* Verify button — only shown when no verification has been started yet */}
    {!verificationConversationId && (
      <button
        onClick={startVerification}
        disabled={isVerifying}
        title="Run Forge to verify all tasks were genuinely completed"
        className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition-colors"
      >
        {isVerifying ? 'Starting...' : 'Verify'}
      </button>
    )}
    {/* If verification exists, show a button to view it */}
    {verificationConversationId && (
      <button
        onClick={() => useRevisionQueueStore.getState().setViewingSession('__verification__')}
        className="flex items-center gap-1.5 bg-orange-500/20 text-orange-300 border border-orange-500/30 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors hover:bg-orange-500/30"
      >
        View Verification
      </button>
    )}
  </>
)}
```

### Update `src/renderer/components/RevisionQueue/RevisionQueueView.tsx`

Add a verification entry below the session list in the sidebar:

```tsx
{/* After the session cards map */}
{verificationConversationId && (
  <button
    onClick={() => useRevisionQueueStore.getState().setViewingSession('__verification__')}
    className={`w-full text-left border rounded-lg transition-colors mt-2 ${
      viewingSessionId === '__verification__'
        ? 'border-orange-500 bg-orange-500/10 ring-1 ring-orange-500/30'
        : 'border-orange-500/30 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
    }`}
  >
    <div className="flex items-center gap-3 p-3">
      <div className="flex-1 min-w-0">
        <span className="font-medium text-sm text-orange-400">Verification</span>
        <span className="text-xs text-zinc-500 ml-2">Forge</span>
      </div>
    </div>
  </button>
)}
```

### Update `src/renderer/components/RevisionQueue/RevisionSessionPanel.tsx`

The session panel needs to handle the `__verification__` sentinel. When `viewingSessionId === '__verification__'`:

1. Use the `verificationConversationId` from the store
2. Display the conversation messages and streaming state using the existing `panelMessages`
3. Show a chat input at the bottom for follow-up messages to Forge
4. When the author sends a follow-up, call `window.novelEngine.chat.send()` with the verification conversation ID and agent `'Forge'`

Read the current `RevisionSessionPanel.tsx` to understand its structure, then add a branch for the verification view. The key difference from a normal session panel is:
- Header shows "Verification — Forge" instead of a session title
- The chat input sends to `chat:send` (like a normal ChatView would) rather than using the revision queue's gate system
- The streaming events come from `chat:stream` rather than `revision:event`

**Important implementation note:** Since the verification conversation uses the normal `ChatService.send()` flow, the panel should subscribe to `chat:stream` events (using `window.novelEngine.chat.onStreamEvent`) for the verification conversation specifically. It needs to:
1. Listen for stream events where the bookSlug matches and accumulate them
2. Show thinking blocks and text streaming in real-time
3. When the stream completes, reload the panel messages from the database

The simplest approach: when in verification mode, the panel renders a lightweight inline chat that mirrors the ChatView's streaming logic but without all the pipeline/agent-selection UI. It should:
- Display `panelMessages` from the store (loaded via `loadPanelMessages`)
- Show a streaming response area (subscribe to `chat:stream` and accumulate)
- Provide a text input for follow-ups
- Style the header with Forge's orange color

---

## Task 5: Revision Plan Serialization

### Update `src/application/RevisionQueueService.ts` — State Persistence

The `verificationConversationId` should be persisted in the session state file so it survives app restarts:

1. Add `verificationConversationId` to the `SessionStateFile` type
2. Save it in `writeState()` from the plan
3. Restore it in `loadPlan()` when merging saved state

This ensures that if the author starts verification, restarts the app, and comes back, the verification conversation is still accessible.

Also update `loadPlan()` to initialize `verificationConversationId: null` on the plan object, and restore it from saved state if present.

---

## Verification

### Manual Test

1. Open a book with a completed revision queue (all sessions approved/skipped, 100% progress)
2. Verify the "Verify" button appears in the controls
3. Click "Verify" — the session panel opens with a "Verification" entry and a chat with Forge
4. Forge streams a verification report checking all tasks against the manuscript
5. Send a follow-up message asking about a specific task — Forge responds in the same conversation
6. The verification entry persists across app restarts (verificationConversationId in state file)
7. The Verify button changes to "View Verification" after the first verification is started

### Type Check

```bash
npx tsc --noEmit
```

All new types should compile cleanly.

### Layer Boundary Check

- `REVISION_VERIFICATION_PROMPT` is a pure string constant in domain — no imports
- `startVerification()` in RevisionQueueService imports only from domain interfaces + nanoid
- ChatService detects verification by conversation title (string comparison) — no new domain types needed
- IPC handler is a one-liner delegation
- Renderer accesses backend only through `window.novelEngine`

---

## Files Created/Modified

| File | Action |
|------|--------|
| `src/domain/constants.ts` | Add `REVISION_VERIFICATION_PROMPT` |
| `src/domain/types.ts` | Add `verificationConversationId` to `RevisionPlan` |
| `src/domain/interfaces.ts` | Add `startVerification()` to `IRevisionQueueService` |
| `src/application/RevisionQueueService.ts` | Add `startVerification()`, update state persistence |
| `src/application/ChatService.ts` | Append verification prompt for Forge verification conversations |
| `src/main/ipc/handlers.ts` | Add `revision:startVerification` handler |
| `src/preload/index.ts` | Add `startVerification` to revision bridge |
| `src/renderer/stores/revisionQueueStore.ts` | Add verification state + `startVerification()` action |
| `src/renderer/components/RevisionQueue/QueueControls.tsx` | Add Verify button |
| `src/renderer/components/RevisionQueue/RevisionQueueView.tsx` | Add verification entry in sidebar |
| `src/renderer/components/RevisionQueue/RevisionSessionPanel.tsx` | Handle `__verification__` mode with inline chat |
