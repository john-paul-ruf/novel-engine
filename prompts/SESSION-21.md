# Session 21 — Revision Queue (Session Wrangler)

## Context

Novel Engine Electron app. Sessions 01–20 built the complete app including agent chat, pipeline tracking, save-to-file, and voice/author profile setup. The pipeline has two Forge phases (`revision-plan-1` and `revision-plan-2`) that produce `project-tasks.md` and `revision-prompts.md`. These are actionable session prompts designed to be pasted into Verity conversations one at a time.

**The problem:** Today the author must manually read `revision-prompts.md`, copy each session prompt, paste it into a new Verity conversation, approve each sub-task, and then hand-edit `project-tasks.md` to check off completed tasks. For a 15-session revision plan, this is tedious and error-prone.

**The solution:** A **Revision Queue** — a first-class UI and service layer that:

1. Uses the **Wrangler CLI** (Sonnet) to parse Forge's semi-structured markdown output into typed, executable session objects (no brittle regex parsing)
2. Presents sessions as an ordered queue with status tracking
3. Lets the author execute sessions in four modes: **Manual**, **Auto-Approve**, **Auto-Skip**, and **Selective**
4. Handles Verity's intra-session approval gates (multi-turn conversations)
5. Updates `project-tasks.md` checkboxes as sessions complete
6. Refreshes the pipeline tracker after each completion

---

## Architecture

### Layer Placement

| Component | Layer | File |
|-----------|-------|------|
| Revision queue types | Domain | `src/domain/types.ts` |
| `IRevisionQueueService` interface | Domain | `src/domain/interfaces.ts` |
| Wrangler Mode 2 prompt constant | Domain | `src/domain/constants.ts` |
| `RevisionQueueService` | Application | `src/application/RevisionQueueService.ts` |
| IPC handlers | Main/IPC | `src/main/ipc/handlers.ts` (additions) |
| Preload bridge | Preload | `src/preload/index.ts` (additions) |
| Queue store | Renderer | `src/renderer/stores/revisionQueueStore.ts` |
| Queue UI components | Renderer | `src/renderer/components/RevisionQueue/` |
| Sidebar entry point | Renderer | `src/renderer/components/Sidebar/` (additions) |

### Key Architectural Decision

**The Wrangler CLI parses Forge's output**, not a TypeScript markdown parser. This means:
- Forge can change its output format without breaking the app
- Task number extraction from prose ("covers tasks 7, 8, and 12") is handled by the LLM
- Model assignment detection from varied phrasings is handled by the LLM
- The cost is ~1 Sonnet call per plan load (<1% of total revision cost)

**Simple string operations handle `project-tasks.md` checkbox toggling** — no CLI call needed for `- [ ]` to `- [x]` replacement.

---

## Task 1: Domain Type Additions

### Update `src/domain/types.ts`

Add these types after the existing `ConversationPurpose` type:

```typescript
// === Revision Queue ===

type RevisionSessionStatus = 'pending' | 'running' | 'awaiting-approval' | 'approved' | 'rejected' | 'skipped';

type ApprovalAction = 'approve' | 'reject' | 'skip' | 'retry';

type QueueMode = 'manual' | 'auto-approve' | 'auto-skip' | 'selective';

type RevisionSession = {
  id: string;
  index: number;                   // 1-based session order
  title: string;                   // e.g. "Ch 20-26 Thesis Audit"
  chapters: string[];              // chapter slugs referenced
  taskNumbers: number[];           // which project-task numbers this covers
  model: 'opus' | 'sonnet';       // Forge's model assignment
  prompt: string;                  // the full prompt text to send to Verity
  notes: string;                   // Forge's notes (e.g. "Read-only. Produces catalog.")
  status: RevisionSessionStatus;
  conversationId: string | null;   // set when session starts running
  response: string;                // accumulated response text
};

type RevisionPlanPhase = {
  number: number;
  name: string;
  taskCount: number;
  completedCount: number;
};

type RevisionPlan = {
  id: string;
  bookSlug: string;
  sessions: RevisionSession[];
  totalTasks: number;
  completedTaskNumbers: number[];  // task numbers already marked [x]
  phases: RevisionPlanPhase[];
  mode: QueueMode;
  createdAt: string;
};

type RevisionQueueEvent =
  | { type: 'session:status'; sessionId: string; status: RevisionSessionStatus }
  | { type: 'session:chunk'; sessionId: string; text: string }
  | { type: 'session:thinking'; sessionId: string; text: string }
  | { type: 'session:done'; sessionId: string; taskNumbers: number[] }
  | { type: 'session:gate'; sessionId: string; gateText: string }
  | { type: 'plan:progress'; completedTasks: number; totalTasks: number }
  | { type: 'queue:done' }
  | { type: 'error'; sessionId: string; message: string };
```

Export every new type.

---

## Task 2: Domain Interface Addition

### Update `src/domain/interfaces.ts`

Add this interface after the existing `IBuildService`:

```typescript
interface IRevisionQueueService {
  // Parse Forge's output into a structured plan using Wrangler CLI
  loadPlan(bookSlug: string): Promise<RevisionPlan>;

  // Execute a single session — sends prompt to Verity, streams response
  runSession(planId: string, sessionId: string): Promise<void>;

  // Run all remaining pending sessions sequentially (selective mode filters by selectedSessionIds)
  runAll(planId: string, selectedSessionIds?: string[]): Promise<void>;

  // Author decision on a session at an approval gate
  respondToGate(planId: string, sessionId: string, action: ApprovalAction, message?: string): void;

  // Approve a completed session — marks tasks [x] in project-tasks.md
  approveSession(planId: string, sessionId: string): Promise<void>;

  // Reject a session — allows re-run
  rejectSession(planId: string, sessionId: string): Promise<void>;

  // Skip a session — tasks stay [ ]
  skipSession(planId: string, sessionId: string): Promise<void>;

  // Pause auto-run after current session completes
  pause(planId: string): void;

  // Set queue execution mode
  setMode(planId: string, mode: QueueMode): void;

  // Get the current plan (in-memory)
  getPlan(planId: string): RevisionPlan | null;

  // Register event listener
  onEvent(callback: (event: RevisionQueueEvent) => void): () => void;
}
```

Export the interface.

---

## Task 3: Wrangler Mode 2 Prompt

### Update `src/domain/constants.ts`

Add this constant after `AUTHOR_PROFILE_INSTRUCTIONS`:

```typescript
const WRANGLER_SESSION_PARSE_PROMPT = `You are parsing Forge's revision plan output into a structured JSON execution plan.

You will receive the contents of two files:
1. **revision-prompts.md** — Contains session prompts for Verity, each with a session header, task descriptions, chapter references, model assignment, and instructions.
2. **project-tasks.md** — Contains a phased task checklist with numbered tasks using "- [ ]" (incomplete) and "- [x]" (complete) markers.

## Your Job

Parse both documents and return a single JSON object. No markdown. No explanation. Just the JSON.

## Output Format

{
  "sessions": [
    {
      "index": 1,
      "title": "Short descriptive title for this session",
      "chapters": ["20-the-departure", "21-crossroads"],
      "taskNumbers": [1, 2, 3, 4, 5, 6],
      "model": "sonnet",
      "prompt": "The EXACT full session prompt text to send to Verity — everything between one session header and the next. Preserve all formatting, chapter references, and instructions verbatim.",
      "notes": "Brief note: Read-only audit, produces catalog."
    }
  ],
  "totalTasks": 47,
  "completedTaskNumbers": [3, 7, 12],
  "phases": [
    { "number": 0, "name": "Author Decisions", "taskCount": 4, "completedCount": 2 },
    { "number": 1, "name": "Structural Revision", "taskCount": 8, "completedCount": 0 }
  ]
}

## Rules

1. Each session's "prompt" field must contain the EXACT text to send to Verity — preserve formatting, @chapter references, instructions, and approval gates verbatim. Do not summarize or rewrite.
2. Extract task numbers from the prose. Forge uses patterns like "Tasks 7, 8, and 12" or "Task 21" or numbered lists like "7. Task title".
3. Identify the model from Forge's assignment. Look for "Model: Opus", "Sonnet", "(analytical — Sonnet)", etc. Default to "opus" if unclear.
4. Extract chapter references from @chapter paths or "Ch 5-6" patterns.
5. For completedTaskNumbers, find all tasks in project-tasks.md marked with "- [x]".
6. Count phases by their Phase headers in project-tasks.md.
7. Session order must match the order in revision-prompts.md.
8. If no revision-prompts.md content is provided, return { "sessions": [], "totalTasks": N, "completedTaskNumbers": [...], "phases": [...] } with just the project-tasks.md data.
`;
```

Export the constant.

---

## Task 4: `RevisionQueueService`

### Create `src/application/RevisionQueueService.ts`

```typescript
import { nanoid } from 'nanoid';
import type {
  RevisionPlan,
  RevisionSession,
  RevisionSessionStatus,
  RevisionQueueEvent,
  QueueMode,
  ApprovalAction,
  AgentName,
  StreamEvent,
  Agent,
  AppSettings,
} from '@domain/types';
import type {
  IRevisionQueueService,
  IFileSystemService,
  IClaudeClient,
  IAgentService,
  IContextWrangler,
  IDatabaseService,
  ISettingsService,
} from '@domain/interfaces';
import {
  WRANGLER_SESSION_PARSE_PROMPT,
  WRANGLER_MODEL,
} from '@domain/constants';
```

### Constructor

```typescript
class RevisionQueueService implements IRevisionQueueService {
  private plans: Map<string, RevisionPlan> = new Map();
  private listeners: Set<(event: RevisionQueueEvent) => void> = new Set();
  private paused: boolean = false;
  private gateResolvers: Map<string, (decision: { action: ApprovalAction; message?: string }) => void> = new Map();

  constructor(
    private fs: IFileSystemService,
    private claude: IClaudeClient,
    private agents: IAgentService,
    private contextWrangler: IContextWrangler,
    private db: IDatabaseService,
    private settings: ISettingsService,
  ) {}
}
```

### `onEvent(callback): () => void`

Register an event listener. Return a cleanup function that removes it.

```typescript
onEvent(callback: (event: RevisionQueueEvent) => void): () => void {
  this.listeners.add(callback);
  return () => this.listeners.delete(callback);
}

private emit(event: RevisionQueueEvent): void {
  for (const listener of this.listeners) {
    listener(event);
  }
}
```

### `loadPlan(bookSlug): Promise<RevisionPlan>`

1. Read `source/revision-prompts.md` and `source/project-tasks.md` from the book via `this.fs.readFile()`. Wrap each in try/catch — either or both may not exist. If neither exists, throw an error: "No revision plan found. Run Forge first to generate project tasks and revision prompts."
2. Call `this.claude.sendOneShot()` with:
   - `model`: `WRANGLER_MODEL`
   - `systemPrompt`: `WRANGLER_SESSION_PARSE_PROMPT`
   - `userMessage`: A message containing both files' contents, formatted as:
     ```
     ## revision-prompts.md

     {revisionPromptsContent || "(File does not exist)"}

     ## project-tasks.md

     {projectTasksContent || "(File does not exist)"}
     ```
   - `maxTokens`: 8192 (larger than standard Wrangler calls because session prompts can be long)
3. Parse the JSON response. Extract JSON from the response — handle potential markdown fencing by looking for `{` and matching to the last `}`. Use try/catch — if parsing fails, throw a descriptive error including the first 200 chars of the response.
4. Hydrate the parsed data into a `RevisionPlan`:
   - Generate `id` with `nanoid()`
   - Set `bookSlug`
   - Map each parsed session into a `RevisionSession` with:
     - `id`: `nanoid()`
     - Fields from the parsed JSON (`index`, `title`, `chapters`, `taskNumbers`, `model`, `prompt`, `notes`)
     - `status`: `'approved'` if ALL of its taskNumbers are in `completedTaskNumbers`, otherwise `'pending'`
     - `conversationId`: `null`
     - `response`: `''`
   - Set `mode`: `'manual'` (default)
   - Set `createdAt`: `new Date().toISOString()`
5. Store the plan in `this.plans`
6. Return the plan

### `runSession(planId, sessionId): Promise<void>`

1. Get the plan from `this.plans`. Throw if not found.
2. Find the session by `sessionId`. Throw if not found.
3. If session status is not `'pending'` and not `'rejected'`, throw "Session is not runnable."
4. Set session status to `'running'`. Emit `session:status` event.
5. Load Verity's agent via `this.agents.load('Verity' as AgentName)`
6. Load settings via `this.settings.load()` to get model config and thinking settings.
7. Determine the CLI model string:
   - If `session.model === 'sonnet'`: `'claude-sonnet-4-20250514'`
   - Else: use the model from settings (defaults to Opus)
8. Create a new conversation via `this.db.createConversation()`:
   - `id`: `nanoid()`
   - `bookSlug`: `plan.bookSlug`
   - `agentName`: `'Verity'` as `AgentName`
   - `pipelinePhase`: `null`
   - `purpose`: `'pipeline'`
   - `title`: `session.title`
9. Set `session.conversationId` to the new conversation ID.
10. Save the session prompt as a user message: `this.db.saveMessage({ conversationId, role: 'user', content: session.prompt, thinking: '' })`
11. Assemble context via the Wrangler:
    ```typescript
    const assembled = await this.contextWrangler.assemble({
      agentName: 'Verity' as AgentName,
      userMessage: session.prompt,
      conversationId: session.conversationId,
      bookSlug: plan.bookSlug,
    });
    ```
12. Assemble the system prompt: `` `${verity.systemPrompt}\n\n---\n\n# Current Book Context\n\n${assembled.projectContext}` ``
13. Send the initial message and enter the conversation loop (see `runConversationLoop` below).

### `private async runConversationLoop(...)`

This method handles the multi-turn conversation within a single session. It sends a message to Claude, streams the response, detects approval gates, and loops until the session is complete.

```typescript
private async runConversationLoop(
  session: RevisionSession,
  plan: RevisionPlan,
  systemPrompt: string,
  model: string,
  settings: AppSettings,
  verity: Agent,
): Promise<void> {
  // Get conversation messages for context
  const messages = this.db.getMessages(session.conversationId!);
  const conversationMessages = messages.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  let responseBuffer = '';
  let thinkingBuffer = '';

  // Stream the response
  try {
    await this.claude.sendMessage({
      model,
      systemPrompt,
      messages: conversationMessages,
      maxTokens: settings.maxTokens,
      thinkingBudget: settings.enableThinking ? verity.thinkingBudget : undefined,
      onEvent: (event: StreamEvent) => {
        switch (event.type) {
          case 'textDelta':
            responseBuffer += event.text;
            session.response += event.text;
            this.emit({ type: 'session:chunk', sessionId: session.id, text: event.text });
            break;
          case 'thinkingDelta':
            thinkingBuffer += event.text;
            this.emit({ type: 'session:thinking', sessionId: session.id, text: event.text });
            break;
          case 'done':
            this.db.saveMessage({
              conversationId: session.conversationId!,
              role: 'assistant',
              content: responseBuffer,
              thinking: thinkingBuffer,
            });
            break;
          case 'error':
            this.emit({ type: 'error', sessionId: session.id, message: event.message });
            break;
        }
      },
    });
  } catch (err) {
    session.status = 'rejected';
    this.emit({ type: 'session:status', sessionId: session.id, status: 'rejected' });
    this.emit({ type: 'error', sessionId: session.id, message: err instanceof Error ? err.message : String(err) });
    return;
  }

  // Check for approval gate
  if (this.isApprovalGate(responseBuffer)) {
    if (plan.mode === 'auto-approve') {
      // Auto-approve: send continuation and loop
      await this.sendFollowUp(session, systemPrompt, model, settings, verity, 'Approved. Continue with the next task.');
      return this.runConversationLoop(session, plan, systemPrompt, model, settings, verity);
    } else if (plan.mode === 'auto-skip') {
      // Auto-skip: skip the gate entirely and continue
      await this.sendFollowUp(session, systemPrompt, model, settings, verity, 'Skip this task and move to the next one without waiting for approval.');
      return this.runConversationLoop(session, plan, systemPrompt, model, settings, verity);
    } else {
      // Manual or selective: wait for author decision
      session.status = 'awaiting-approval';
      this.emit({ type: 'session:status', sessionId: session.id, status: 'awaiting-approval' });
      const lastParagraph = responseBuffer.trim().split('\n\n').pop() ?? '';
      this.emit({ type: 'session:gate', sessionId: session.id, gateText: lastParagraph });

      const decision = await this.waitForDecision(session.id);

      switch (decision.action) {
        case 'approve':
          session.status = 'running';
          this.emit({ type: 'session:status', sessionId: session.id, status: 'running' });
          await this.sendFollowUp(session, systemPrompt, model, settings, verity, 'Approved. Continue with the next task.');
          return this.runConversationLoop(session, plan, systemPrompt, model, settings, verity);

        case 'reject':
          session.status = 'running';
          this.emit({ type: 'session:status', sessionId: session.id, status: 'running' });
          await this.sendFollowUp(session, systemPrompt, model, settings, verity, decision.message ?? 'Please redo this task.');
          return this.runConversationLoop(session, plan, systemPrompt, model, settings, verity);

        case 'skip':
          session.status = 'running';
          this.emit({ type: 'session:status', sessionId: session.id, status: 'running' });
          await this.sendFollowUp(session, systemPrompt, model, settings, verity, 'Skip this task — do not revise it. Move to the next task in the list.');
          return this.runConversationLoop(session, plan, systemPrompt, model, settings, verity);

        case 'retry':
          session.status = 'rejected';
          session.response = '';
          session.conversationId = null;
          this.emit({ type: 'session:status', sessionId: session.id, status: 'rejected' });
          return;
      }
    }
  }

  // No approval gate — session is complete
  session.status = 'awaiting-approval';
  this.emit({ type: 'session:status', sessionId: session.id, status: 'awaiting-approval' });

  // In auto modes, auto-approve the session
  if (plan.mode === 'auto-approve' || plan.mode === 'auto-skip') {
    await this.approveSession(plan.id, session.id);
  }
}
```

### `private async sendFollowUp(...)`

Sends a follow-up message in the same conversation:

```typescript
private async sendFollowUp(
  session: RevisionSession,
  systemPrompt: string,
  model: string,
  settings: AppSettings,
  verity: Agent,
  message: string,
): Promise<void> {
  // Save the follow-up as a user message
  this.db.saveMessage({
    conversationId: session.conversationId!,
    role: 'user',
    content: message,
    thinking: '',
  });
}
```

Note: `sendFollowUp` only saves the user message. The next call to `runConversationLoop` picks up the full conversation history (including this new message) and sends it to Claude.

### `private isApprovalGate(response: string): boolean`

```typescript
private isApprovalGate(response: string): boolean {
  const lastParagraph = response.trim().split('\n\n').pop()?.toLowerCase() ?? '';
  const signals = [
    'approval', 'approve', 'proceed', 'continue',
    'go ahead', 'go-ahead', 'next task', 'shall i',
    'ready for', 'waiting for', 'let me know',
    'before moving', 'before proceeding', 'your go',
  ];
  return signals.some(s => lastParagraph.includes(s));
}
```

### `private waitForDecision(sessionId): Promise<{ action, message? }>`

```typescript
private waitForDecision(sessionId: string): Promise<{ action: ApprovalAction; message?: string }> {
  return new Promise((resolve) => {
    this.gateResolvers.set(sessionId, resolve);
  });
}
```

### `respondToGate(planId, sessionId, action, message?): void`

```typescript
respondToGate(planId: string, sessionId: string, action: ApprovalAction, message?: string): void {
  const resolver = this.gateResolvers.get(sessionId);
  if (resolver) {
    resolver({ action, message });
    this.gateResolvers.delete(sessionId);
  }
}
```

### `runAll(planId): Promise<void>`

```typescript
async runAll(planId: string, selectedSessionIds?: string[]): Promise<void> {
  const plan = this.plans.get(planId);
  if (!plan) throw new Error('Plan not found');

  this.paused = false;

  let pendingSessions = plan.sessions
    .filter(s => s.status === 'pending')
    .sort((a, b) => a.index - b.index);

  // In selective mode, only run sessions the user selected
  if (selectedSessionIds && selectedSessionIds.length > 0) {
    const selectedSet = new Set(selectedSessionIds);
    pendingSessions = pendingSessions.filter(s => selectedSet.has(s.id));
  }

  for (const session of pendingSessions) {
    if (this.paused) {
      this.emit({ type: 'queue:done' });
      return;
    }
    await this.runSession(planId, session.id);
  }

  this.emit({ type: 'queue:done' });
}
```

### `approveSession(planId, sessionId): Promise<void>`

```typescript
async approveSession(planId: string, sessionId: string): Promise<void> {
  const plan = this.plans.get(planId);
  if (!plan) throw new Error('Plan not found');

  const session = plan.sessions.find(s => s.id === sessionId);
  if (!session) throw new Error('Session not found');

  session.status = 'approved';
  this.emit({ type: 'session:status', sessionId, status: 'approved' });

  // Update project-tasks.md checkboxes
  try {
    let taskContent = await this.fs.readFile(plan.bookSlug, 'source/project-tasks.md');

    for (const taskNum of session.taskNumbers) {
      // Match "- [ ] **N." pattern and replace with "- [x] **N."
      const pattern = `- [ ] **${taskNum}.`;
      const replacement = `- [x] **${taskNum}.`;
      taskContent = taskContent.replace(pattern, replacement);
    }

    await this.fs.writeFile(plan.bookSlug, 'source/project-tasks.md', taskContent);
  } catch (err) {
    // project-tasks.md update is best-effort — don't fail the approval
    console.error('Failed to update project-tasks.md:', err);
  }

  // Update plan state
  plan.completedTaskNumbers = [
    ...plan.completedTaskNumbers,
    ...session.taskNumbers.filter(n => !plan.completedTaskNumbers.includes(n)),
  ];

  // Update phase counts
  for (const phase of plan.phases) {
    phase.completedCount = plan.completedTaskNumbers.length; // simplified — could be per-phase
  }

  this.emit({
    type: 'session:done',
    sessionId,
    taskNumbers: session.taskNumbers,
  });

  this.emit({
    type: 'plan:progress',
    completedTasks: plan.completedTaskNumbers.length,
    totalTasks: plan.totalTasks,
  });
}
```

### `rejectSession(planId, sessionId): Promise<void>`

```typescript
async rejectSession(planId: string, sessionId: string): Promise<void> {
  const plan = this.plans.get(planId);
  if (!plan) throw new Error('Plan not found');

  const session = plan.sessions.find(s => s.id === sessionId);
  if (!session) throw new Error('Session not found');

  session.status = 'rejected';
  session.response = '';
  session.conversationId = null;
  this.emit({ type: 'session:status', sessionId, status: 'rejected' });
}
```

### `skipSession(planId, sessionId): Promise<void>`

```typescript
async skipSession(planId: string, sessionId: string): Promise<void> {
  const plan = this.plans.get(planId);
  if (!plan) throw new Error('Plan not found');

  const session = plan.sessions.find(s => s.id === sessionId);
  if (!session) throw new Error('Session not found');

  session.status = 'skipped';
  this.emit({ type: 'session:status', sessionId, status: 'skipped' });
}
```

### `pause(planId): void`

```typescript
pause(planId: string): void {
  this.paused = true;
}
```

### `setMode(planId, mode): void`

```typescript
setMode(planId: string, mode: QueueMode): void {
  const plan = this.plans.get(planId);
  if (plan) {
    plan.mode = mode;
  }
}
```

### `getPlan(planId): RevisionPlan | null`

```typescript
getPlan(planId: string): RevisionPlan | null {
  return this.plans.get(planId) ?? null;
}
```

Export the class.

---

## Task 5: Update Application Barrel Export

### Update `src/application/index.ts`

Add:
```typescript
export { RevisionQueueService } from './RevisionQueueService';
```

---

## Task 6: IPC Handlers

### Update `src/main/ipc/handlers.ts`

Add `revisionQueue: IRevisionQueueService` to the `services` parameter of `registerIpcHandlers`.

Add these handlers inside the function body:

```typescript
// Revision Queue
ipcMain.handle('revision:loadPlan', async (_, bookSlug: string) => {
  return services.revisionQueue.loadPlan(bookSlug);
});

ipcMain.handle('revision:runSession', async (_, planId: string, sessionId: string) => {
  return services.revisionQueue.runSession(planId, sessionId);
});

ipcMain.handle('revision:runAll', async (_, planId: string, selectedSessionIds?: string[]) => {
  return services.revisionQueue.runAll(planId, selectedSessionIds);
});

ipcMain.handle('revision:respondToGate', (_, planId: string, sessionId: string, action: string, message?: string) => {
  services.revisionQueue.respondToGate(planId, sessionId, action as ApprovalAction, message);
});

ipcMain.handle('revision:approveSession', async (_, planId: string, sessionId: string) => {
  return services.revisionQueue.approveSession(planId, sessionId);
});

ipcMain.handle('revision:rejectSession', async (_, planId: string, sessionId: string) => {
  return services.revisionQueue.rejectSession(planId, sessionId);
});

ipcMain.handle('revision:skipSession', async (_, planId: string, sessionId: string) => {
  return services.revisionQueue.skipSession(planId, sessionId);
});

ipcMain.handle('revision:pause', (_, planId: string) => {
  services.revisionQueue.pause(planId);
});

ipcMain.handle('revision:setMode', (_, planId: string, mode: string) => {
  services.revisionQueue.setMode(planId, mode as QueueMode);
});

ipcMain.handle('revision:getPlan', (_, planId: string) => {
  return services.revisionQueue.getPlan(planId);
});
```

**Streaming events:** Register the event listener and forward to the renderer, similar to `chat:streamEvent`. Add this after the individual handlers:

```typescript
services.revisionQueue.onEvent((event) => {
  const wins = BrowserWindow.getAllWindows();
  for (const win of wins) {
    win.webContents.send('revision:event', event);
  }
});
```

Add `ApprovalAction` and `QueueMode` to the `import type` list from `@domain/types`.

---

## Task 7: Preload Bridge

### Update `src/preload/index.ts`

Add these imports to the existing `import type` statement:

```typescript
import type {
  // ... existing imports ...
  RevisionPlan,
  RevisionQueueEvent,
  ApprovalAction,
  QueueMode,
} from '@domain/types';
```

Add this section to the `api` object, after the `context` section:

```typescript
// Revision Queue
revision: {
  loadPlan: (bookSlug: string): Promise<RevisionPlan> =>
    ipcRenderer.invoke('revision:loadPlan', bookSlug),
  runSession: (planId: string, sessionId: string): Promise<void> =>
    ipcRenderer.invoke('revision:runSession', planId, sessionId),
  runAll: (planId: string, selectedSessionIds?: string[]): Promise<void> =>
    ipcRenderer.invoke('revision:runAll', planId, selectedSessionIds),
  respondToGate: (planId: string, sessionId: string, action: ApprovalAction, message?: string): Promise<void> =>
    ipcRenderer.invoke('revision:respondToGate', planId, sessionId, action, message),
  approveSession: (planId: string, sessionId: string): Promise<void> =>
    ipcRenderer.invoke('revision:approveSession', planId, sessionId),
  rejectSession: (planId: string, sessionId: string): Promise<void> =>
    ipcRenderer.invoke('revision:rejectSession', planId, sessionId),
  skipSession: (planId: string, sessionId: string): Promise<void> =>
    ipcRenderer.invoke('revision:skipSession', planId, sessionId),
  pause: (planId: string): Promise<void> =>
    ipcRenderer.invoke('revision:pause', planId),
  setMode: (planId: string, mode: QueueMode): Promise<void> =>
    ipcRenderer.invoke('revision:setMode', planId, mode),
  getPlan: (planId: string): Promise<RevisionPlan | null> =>
    ipcRenderer.invoke('revision:getPlan', planId),
  onEvent: (callback: (event: RevisionQueueEvent) => void) => {
    const handler = (_: any, event: RevisionQueueEvent) => callback(event);
    ipcRenderer.on('revision:event', handler);
    return () => ipcRenderer.removeListener('revision:event', handler);
  },
},
```

---

## Task 8: Composition Root

### Update `src/main/index.ts`

Add import:

```typescript
import { RevisionQueueService } from '@app/RevisionQueueService';
```

In `initializeApp()`, after the other service instantiations:

```typescript
const revisionQueue = new RevisionQueueService(fs, claudeClient, agents, contextWrangler, db, settings);
```

Update `registerIpcHandlers` call to include `revisionQueue`:

```typescript
registerIpcHandlers(
  { settings, agents, db, fs, chat, pipeline, build, usage, filePersistence, revisionQueue },
  { userDataPath, booksDir }
);
```

Update the `registerIpcHandlers` function signature in `src/main/ipc/handlers.ts` to include `revisionQueue: IRevisionQueueService` in the services object type.

---

## Task 9: Zustand Store

### Create `src/renderer/stores/revisionQueueStore.ts`

```typescript
import { create } from 'zustand';
import type {
  RevisionPlan,
  RevisionQueueEvent,
  QueueMode,
  ApprovalAction,
} from '@domain/types';

type RevisionQueueState = {
  // State
  plan: RevisionPlan | null;
  planId: string | null;
  isRunning: boolean;
  isPaused: boolean;
  activeSessionId: string | null;
  streamingResponse: string;
  streamingThinking: string;
  gateSessionId: string | null;
  gateText: string;
  error: string | null;
  selectedSessionIds: Set<string>;

  // Actions
  loadPlan: (bookSlug: string) => Promise<void>;
  runNext: () => Promise<void>;
  runAll: () => Promise<void>;
  runSession: (sessionId: string) => Promise<void>;
  respondToGate: (action: ApprovalAction, message?: string) => Promise<void>;
  approveSession: (sessionId: string) => Promise<void>;
  rejectSession: (sessionId: string) => Promise<void>;
  skipSession: (sessionId: string) => Promise<void>;
  pause: () => void;
  setMode: (mode: QueueMode) => void;
  toggleSessionSelection: (sessionId: string) => void;
  selectAllSessions: () => void;
  deselectAllSessions: () => void;
  reset: () => void;
};

export const useRevisionQueueStore = create<RevisionQueueState>((set, get) => ({
  plan: null,
  planId: null,
  isRunning: false,
  isPaused: false,
  activeSessionId: null,
  streamingResponse: '',
  streamingThinking: '',
  gateSessionId: null,
  gateText: '',
  error: null,
  selectedSessionIds: new Set(),

  loadPlan: async (bookSlug: string) => {
    try {
      set({ error: null });
      const plan = await window.novelEngine.revision.loadPlan(bookSlug);
      set({
        plan,
        planId: plan.id,
        selectedSessionIds: new Set(plan.sessions.map(s => s.id)),
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  runNext: async () => {
    const { plan, planId } = get();
    if (!plan || !planId) return;
    const next = plan.sessions.find(s => s.status === 'pending');
    if (!next) return;
    set({ isRunning: true, activeSessionId: next.id, streamingResponse: '', streamingThinking: '' });
    try {
      await window.novelEngine.revision.runSession(planId, next.id);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), isRunning: false });
    }
  },

  runAll: async () => {
    const { planId, plan, selectedSessionIds } = get();
    if (!planId) return;
    set({ isRunning: true });
    try {
      // In selective mode, pass the selected session IDs to filter
      const sessionIds = plan?.mode === 'selective'
        ? Array.from(selectedSessionIds)
        : undefined;
      await window.novelEngine.revision.runAll(planId, sessionIds);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ isRunning: false });
    }
  },

  runSession: async (sessionId: string) => {
    const { planId } = get();
    if (!planId) return;
    set({ isRunning: true, activeSessionId: sessionId, streamingResponse: '', streamingThinking: '' });
    try {
      await window.novelEngine.revision.runSession(planId, sessionId);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), isRunning: false });
    }
  },

  respondToGate: async (action: ApprovalAction, message?: string) => {
    const { planId, gateSessionId } = get();
    if (!planId || !gateSessionId) return;
    set({ gateSessionId: null, gateText: '', streamingResponse: '', streamingThinking: '' });
    await window.novelEngine.revision.respondToGate(planId, gateSessionId, action, message);
  },

  approveSession: async (sessionId: string) => {
    const { planId } = get();
    if (!planId) return;
    await window.novelEngine.revision.approveSession(planId, sessionId);
  },

  rejectSession: async (sessionId: string) => {
    const { planId } = get();
    if (!planId) return;
    await window.novelEngine.revision.rejectSession(planId, sessionId);
  },

  skipSession: async (sessionId: string) => {
    const { planId } = get();
    if (!planId) return;
    await window.novelEngine.revision.skipSession(planId, sessionId);
  },

  pause: () => {
    const { planId } = get();
    if (!planId) return;
    set({ isPaused: true });
    window.novelEngine.revision.pause(planId);
  },

  setMode: (mode: QueueMode) => {
    const { planId } = get();
    if (!planId) return;
    set(state => ({
      plan: state.plan ? { ...state.plan, mode } : null,
    }));
    window.novelEngine.revision.setMode(planId, mode);
  },

  toggleSessionSelection: (sessionId: string) => {
    set(state => {
      const next = new Set(state.selectedSessionIds);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return { selectedSessionIds: next };
    });
  },

  selectAllSessions: () => {
    set(state => ({
      selectedSessionIds: new Set(state.plan?.sessions.map(s => s.id) ?? []),
    }));
  },

  deselectAllSessions: () => {
    set({ selectedSessionIds: new Set() });
  },

  reset: () => {
    set({
      plan: null,
      planId: null,
      isRunning: false,
      isPaused: false,
      activeSessionId: null,
      streamingResponse: '',
      streamingThinking: '',
      gateSessionId: null,
      gateText: '',
      error: null,
      selectedSessionIds: new Set(),
    });
  },
}));
```

---

## Task 10: Event Listener Hook

### Create `src/renderer/hooks/useRevisionQueueEvents.ts`

A hook that subscribes to revision queue IPC events and updates the store:

```typescript
import { useEffect } from 'react';
import { useRevisionQueueStore } from '../stores/revisionQueueStore';
import type { RevisionQueueEvent } from '@domain/types';

export function useRevisionQueueEvents() {
  useEffect(() => {
    const cleanup = window.novelEngine.revision.onEvent((event: RevisionQueueEvent) => {
      switch (event.type) {
        case 'session:status': {
          useRevisionQueueStore.setState(state => {
            if (!state.plan) return state;
            const sessions = state.plan.sessions.map(s =>
              s.id === event.sessionId ? { ...s, status: event.status } : s
            );
            return {
              plan: { ...state.plan, sessions },
              isRunning: event.status === 'running',
              activeSessionId: event.status === 'running' ? event.sessionId : state.activeSessionId,
            };
          });
          break;
        }

        case 'session:chunk': {
          useRevisionQueueStore.setState(state => ({
            streamingResponse: state.streamingResponse + event.text,
          }));
          break;
        }

        case 'session:thinking': {
          useRevisionQueueStore.setState(state => ({
            streamingThinking: state.streamingThinking + event.text,
          }));
          break;
        }

        case 'session:gate': {
          useRevisionQueueStore.setState({
            gateSessionId: event.sessionId,
            gateText: event.gateText,
          });
          break;
        }

        case 'session:done': {
          useRevisionQueueStore.setState(state => {
            if (!state.plan) return state;
            const completedTaskNumbers = [
              ...state.plan.completedTaskNumbers,
              ...event.taskNumbers.filter(n => !state.plan!.completedTaskNumbers.includes(n)),
            ];
            return {
              plan: { ...state.plan, completedTaskNumbers },
              activeSessionId: null,
              streamingResponse: '',
              streamingThinking: '',
            };
          });
          break;
        }

        case 'plan:progress': {
          // Plan state already synced via session:done — no action needed
          break;
        }

        case 'queue:done': {
          useRevisionQueueStore.setState({
            isRunning: false,
            isPaused: false,
          });
          break;
        }

        case 'error': {
          useRevisionQueueStore.setState({
            error: event.message,
            isRunning: false,
          });
          break;
        }
      }
    });

    return cleanup;
  }, []);
}
```

---

## Task 11: UI Components

### Create `src/renderer/components/RevisionQueue/RevisionQueueView.tsx`

The main revision queue panel. Rendered as a view in the main content area (like ChatView or FilesView).

```tsx
import { useEffect } from 'react';
import { useRevisionQueueStore } from '../../stores/revisionQueueStore';
import { useBookStore } from '../../stores/bookStore';
import { useRevisionQueueEvents } from '../../hooks/useRevisionQueueEvents';
import { QueueControls } from './QueueControls';
import { SessionCard } from './SessionCard';
import { TaskProgress } from './TaskProgress';
import { ApprovalGateOverlay } from './ApprovalGateOverlay';

export function RevisionQueueView() {
  const { activeSlug } = useBookStore();
  const {
    plan, isRunning, error, gateSessionId, loadPlan, activeSessionId,
  } = useRevisionQueueStore();

  useRevisionQueueEvents();

  useEffect(() => {
    if (activeSlug) {
      loadPlan(activeSlug);
    }
  }, [activeSlug, loadPlan]);

  if (error && !plan) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-4">📋</div>
          <h2 className="text-xl font-semibold text-zinc-100 mb-2">No Revision Plan</h2>
          <p className="text-zinc-400 text-sm">{error}</p>
          <p className="text-zinc-500 text-xs mt-2">
            Run Forge to generate a revision task list and session prompts.
          </p>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-zinc-400">Loading revision plan...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="border-b border-zinc-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Revision Queue</h1>
            <TaskProgress plan={plan} />
          </div>
          <QueueControls />
        </div>
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-sm text-red-300">
            {error}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {plan.sessions.map(session => (
          <SessionCard
            key={session.id}
            session={session}
            isActive={session.id === activeSessionId}
            isSelected={useRevisionQueueStore.getState().selectedSessionIds.has(session.id)}
            mode={plan.mode}
          />
        ))}
      </div>

      {gateSessionId && <ApprovalGateOverlay />}
    </div>
  );
}
```

### Create `src/renderer/components/RevisionQueue/QueueControls.tsx`

Mode selector and run buttons:

```tsx
import { useRevisionQueueStore } from '../../stores/revisionQueueStore';
import type { QueueMode } from '@domain/types';

const MODE_OPTIONS: { value: QueueMode; label: string; description: string }[] = [
  { value: 'manual', label: 'Manual', description: 'Approve each step' },
  { value: 'auto-approve', label: 'Auto-Approve', description: 'Run all, auto-approve gates' },
  { value: 'auto-skip', label: 'Auto-Skip', description: 'Run all, skip all gates' },
  { value: 'selective', label: 'Selective', description: 'Pick sessions to run' },
];

export function QueueControls() {
  const { plan, isRunning, isPaused, setMode, runNext, runAll, pause } = useRevisionQueueStore();

  if (!plan) return null;

  const hasPending = plan.sessions.some(s => s.status === 'pending');

  return (
    <div className="flex items-center gap-3">
      <select
        value={plan.mode}
        onChange={(e) => setMode(e.target.value as QueueMode)}
        disabled={isRunning}
        className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 disabled:opacity-50"
      >
        {MODE_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label} — {opt.description}
          </option>
        ))}
      </select>

      {!isRunning ? (
        <div className="flex gap-2">
          <button
            onClick={runNext}
            disabled={!hasPending}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition-colors"
          >
            &#9654; Run Next
          </button>
          <button
            onClick={runAll}
            disabled={!hasPending}
            className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition-colors"
          >
            &#9654;&#9654; Run All
          </button>
        </div>
      ) : (
        <button
          onClick={pause}
          className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition-colors"
        >
          &#9646;&#9646; {isPaused ? 'Pausing...' : 'Pause'}
        </button>
      )}
    </div>
  );
}
```

### Create `src/renderer/components/RevisionQueue/SessionCard.tsx`

Individual session card with status, expand/collapse, and action buttons:

```tsx
import { useState } from 'react';
import { useRevisionQueueStore } from '../../stores/revisionQueueStore';
import type { RevisionSession, QueueMode } from '@domain/types';

const STATUS_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  pending:             { icon: '\u23F3', color: 'text-zinc-400',   label: 'Pending' },
  running:             { icon: '\uD83D\uDD04', color: 'text-blue-400',   label: 'Running' },
  'awaiting-approval': { icon: '\uD83D\uDCE5', color: 'text-amber-400',  label: 'Awaiting Approval' },
  approved:            { icon: '\u2705', color: 'text-green-400',  label: 'Approved' },
  rejected:            { icon: '\u274C', color: 'text-red-400',    label: 'Rejected' },
  skipped:             { icon: '\u23ED\uFE0F', color: 'text-zinc-500',   label: 'Skipped' },
};

type Props = {
  session: RevisionSession;
  isActive: boolean;
  isSelected: boolean;
  mode: QueueMode;
};

export function SessionCard({ session, isActive, isSelected, mode }: Props) {
  const [isExpanded, setIsExpanded] = useState(isActive);
  const {
    approveSession, rejectSession, skipSession, runSession,
    toggleSessionSelection, streamingResponse,
  } = useRevisionQueueStore();

  const status = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.pending;

  return (
    <div
      className={`border rounded-lg transition-colors ${
        isActive
          ? 'border-blue-500/50 bg-zinc-800/80'
          : session.status === 'approved'
          ? 'border-green-500/20 bg-zinc-900/50'
          : session.status === 'skipped'
          ? 'border-zinc-700/50 bg-zinc-900/30 opacity-60'
          : 'border-zinc-700 bg-zinc-900'
      }`}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        {mode === 'selective' && session.status === 'pending' && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              toggleSessionSelection(session.id);
            }}
            className="rounded border-zinc-600 bg-zinc-800 text-blue-500"
          />
        )}

        <span className={`text-lg ${status.color}`}>{status.icon}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-100 truncate">
              Session {session.index}: {session.title}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              session.model === 'sonnet'
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'bg-purple-500/20 text-purple-300'
            }`}>
              {session.model === 'sonnet' ? 'Sonnet' : 'Opus'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5">
            <span>Tasks: {session.taskNumbers.join(', ')}</span>
            {session.chapters.length > 0 && (
              <span>Chapters: {session.chapters.join(', ')}</span>
            )}
            {session.notes && <span>{session.notes}</span>}
          </div>
        </div>

        <span className={`text-zinc-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
          &#9654;
        </span>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-zinc-700/50 px-4 pb-4">
          <details className="mt-3">
            <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-300">
              View session prompt
            </summary>
            <pre className="mt-2 text-xs text-zinc-400 bg-zinc-950 rounded-lg p-3 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">
              {session.prompt}
            </pre>
          </details>

          {isActive && streamingResponse && (
            <div className="mt-3">
              <div className="text-xs text-zinc-500 mb-1">Verity's response:</div>
              <div className="bg-zinc-950 rounded-lg p-3 max-h-64 overflow-y-auto">
                <div className="text-sm text-zinc-200 whitespace-pre-wrap">
                  {streamingResponse}
                </div>
              </div>
            </div>
          )}

          {!isActive && session.response && (
            <div className="mt-3">
              <div className="text-xs text-zinc-500 mb-1">Verity's response:</div>
              <div className="bg-zinc-950 rounded-lg p-3 max-h-48 overflow-y-auto">
                <div className="text-sm text-zinc-200 whitespace-pre-wrap">
                  {session.response}
                </div>
              </div>
            </div>
          )}

          {session.status === 'awaiting-approval' && !isActive && (
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => approveSession(session.id)}
                className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg px-3 py-1.5 text-sm transition-colors"
              >
                &#10003; Approve
              </button>
              <button
                onClick={() => rejectSession(session.id)}
                className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg px-3 py-1.5 text-sm transition-colors"
              >
                &#10007; Reject
              </button>
              <button
                onClick={() => skipSession(session.id)}
                className="flex items-center gap-1.5 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg px-3 py-1.5 text-sm transition-colors"
              >
                &#9197; Skip
              </button>
            </div>
          )}

          {session.status === 'rejected' && (
            <div className="mt-3">
              <button
                onClick={() => runSession(session.id)}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-1.5 text-sm transition-colors"
              >
                &#8635; Re-run Session
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### Create `src/renderer/components/RevisionQueue/TaskProgress.tsx`

Progress bar and task count summary:

```tsx
import type { RevisionPlan } from '@domain/types';

type Props = {
  plan: RevisionPlan;
};

export function TaskProgress({ plan }: Props) {
  const completed = plan.completedTaskNumbers.length;
  const total = plan.totalTasks;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  const sessionsApproved = plan.sessions.filter(s => s.status === 'approved').length;
  const totalSessions = plan.sessions.length;

  return (
    <div className="mt-1">
      <div className="flex items-center gap-3 text-xs text-zinc-400">
        <span>{sessionsApproved}/{totalSessions} sessions</span>
        <span className="text-zinc-600">|</span>
        <span>{completed}/{total} tasks</span>
        <span className="text-zinc-600">|</span>
        <span>{percent}% complete</span>
      </div>
      <div className="mt-1.5 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 rounded-full transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
```

### Create `src/renderer/components/RevisionQueue/ApprovalGateOverlay.tsx`

The approval gate UI that appears when Verity pauses for feedback:

```tsx
import { useState } from 'react';
import { useRevisionQueueStore } from '../../stores/revisionQueueStore';
import type { ApprovalAction } from '@domain/types';

export function ApprovalGateOverlay() {
  const { gateText, gateSessionId, respondToGate, streamingResponse, plan } = useRevisionQueueStore();
  const [rejectionMessage, setRejectionMessage] = useState('');
  const [showRejectionInput, setShowRejectionInput] = useState(false);

  if (!gateSessionId) return null;

  const session = plan?.sessions.find(s => s.id === gateSessionId);

  const handleAction = async (action: ApprovalAction) => {
    if (action === 'reject' && !showRejectionInput) {
      setShowRejectionInput(true);
      return;
    }
    await respondToGate(action, action === 'reject' ? rejectionMessage : undefined);
    setRejectionMessage('');
    setShowRejectionInput(false);
  };

  return (
    <div className="border-t border-amber-500/30 bg-amber-500/5 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-amber-400 text-lg">&#9888;</span>
          <h3 className="text-sm font-semibold text-amber-200">
            Approval Gate — {session?.title ?? 'Session'}
          </h3>
        </div>

        <div className="bg-zinc-950 rounded-lg p-3 mb-3 max-h-48 overflow-y-auto">
          <div className="text-sm text-zinc-200 whitespace-pre-wrap">
            {streamingResponse.slice(-2000)}
          </div>
        </div>

        {showRejectionInput && (
          <div className="mb-3">
            <textarea
              value={rejectionMessage}
              onChange={(e) => setRejectionMessage(e.target.value)}
              placeholder="Tell Verity what to fix..."
              rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 resize-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
              autoFocus
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleAction('approve')}
            className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            &#10003; Approve
          </button>
          <button
            onClick={() => handleAction('reject')}
            className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            &#10007; {showRejectionInput ? 'Send Correction' : 'Reject'}
          </button>
          <button
            onClick={() => handleAction('skip')}
            className="flex items-center gap-1.5 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            &#9197; Skip
          </button>
          <button
            onClick={() => handleAction('retry')}
            className="flex items-center gap-1.5 border border-zinc-600 hover:border-zinc-500 text-zinc-300 rounded-lg px-4 py-2 text-sm transition-colors"
          >
            &#8635; Retry
          </button>

          {showRejectionInput && (
            <button
              onClick={() => { setShowRejectionInput(false); setRejectionMessage(''); }}
              className="text-xs text-zinc-500 hover:text-zinc-300 ml-2"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

### Create `src/renderer/components/RevisionQueue/index.ts`

Barrel export:

```typescript
export { RevisionQueueView } from './RevisionQueueView';
```

---

## Task 12: Navigation and Sidebar Integration

### Update `src/renderer/stores/viewStore.ts`

Add `'revision-queue'` to the view type. The existing `ViewId` type (or equivalent) should include it:

```typescript
type ViewId = 'chat' | 'files' | 'build' | 'settings' | 'revision-queue';
```

### Create `src/renderer/components/Sidebar/RevisionQueueButton.tsx`

A sidebar button that appears when Forge has produced revision files:

```tsx
import { useEffect, useState } from 'react';
import { useBookStore } from '../../stores/bookStore';
import { useViewStore } from '../../stores/viewStore';

export function RevisionQueueButton() {
  const { activeSlug } = useBookStore();
  const { navigate, currentView } = useViewStore();
  const [hasRevisionPlan, setHasRevisionPlan] = useState(false);

  useEffect(() => {
    if (!activeSlug) {
      setHasRevisionPlan(false);
      return;
    }

    Promise.all([
      window.novelEngine.files.exists(activeSlug, 'source/project-tasks.md'),
      window.novelEngine.files.exists(activeSlug, 'source/revision-prompts.md'),
    ]).then(([hasTasks, hasPrompts]) => {
      setHasRevisionPlan(hasTasks || hasPrompts);
    });
  }, [activeSlug]);

  if (!hasRevisionPlan) return null;

  return (
    <button
      onClick={() => navigate('revision-queue')}
      className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
        currentView === 'revision-queue'
          ? 'text-orange-300 bg-zinc-800/70'
          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
      }`}
    >
      <span className="text-orange-400">&#9881;</span>
      <span>Revision Queue</span>
    </button>
  );
}
```

### Update `src/renderer/components/Layout/Sidebar.tsx`

Add the `RevisionQueueButton` after `VoiceSetupButton`:

```tsx
import { RevisionQueueButton } from '../Sidebar/RevisionQueueButton';

// In the render:
<VoiceSetupButton />
<RevisionQueueButton />

<div className="flex-1 overflow-y-auto">
  <PipelineTracker />
  {/* ... */}
</div>
```

### Update `src/renderer/App.tsx`

Add the `RevisionQueueView` to the view routing:

```tsx
import { RevisionQueueView } from './components/RevisionQueue';

// In the view switch/conditional rendering:
{activeView === 'revision-queue' && <RevisionQueueView />}
```

---

## Task 13: Wrangler Agent Prompt Update

### Update `agents/WRANGLER.md`

Add a new section before the closing italicized quote (`*The best context is...*`):

```markdown
---

## Mode 2: Revision Plan Parsing

When your input contains `revision-prompts.md` and/or `project-tasks.md` content, you are operating as a **session parser**, not a context planner.

### Input

You will receive the full text of one or both files:
- `revision-prompts.md` — Forge's session prompts for Verity
- `project-tasks.md` — Forge's phased task checklist

### Task

Parse both documents into a structured JSON execution plan that the Novel Engine app can queue and execute automatically.

### Output

Return a single JSON object conforming to the schema provided in your system prompt. The critical rules:

1. **Preserve session prompts verbatim.** The `prompt` field must contain the exact text to send to Verity — do not summarize, rewrite, or strip formatting.
2. **Extract task numbers from prose.** Forge references tasks as "Task 7", "Tasks 3, 4, and 5", or in numbered lists. Map each session to its covered task numbers.
3. **Detect model assignments.** Forge specifies "Model: Opus", "Sonnet", or describes the task type (analytical = Sonnet, prose = Opus).
4. **Track completion state.** Items marked `- [x]` in project-tasks.md are complete. Items marked `- [ ]` are pending.
5. **Respect session order.** Sessions must appear in the same order as in revision-prompts.md.

### Rules

- Output ONLY valid JSON. No markdown fencing. No prose.
- If no revision-prompts.md content exists, return sessions as an empty array.
- If a session cannot be cleanly parsed, include it with your best-effort extraction and note any ambiguity in the `notes` field.
```

---

## Summary of Changes by File

| File | Change |
|------|--------|
| `src/domain/types.ts` | Add `RevisionSessionStatus`, `ApprovalAction`, `QueueMode`, `RevisionSession`, `RevisionPlanPhase`, `RevisionPlan`, `RevisionQueueEvent` |
| `src/domain/interfaces.ts` | Add `IRevisionQueueService` interface |
| `src/domain/constants.ts` | Add `WRANGLER_SESSION_PARSE_PROMPT` constant |
| `src/application/RevisionQueueService.ts` | **NEW** — full orchestration service |
| `src/application/index.ts` | Add export for `RevisionQueueService` |
| `src/main/ipc/handlers.ts` | Add 10 `revision:*` handlers + event forwarding |
| `src/preload/index.ts` | Add `revision` section to bridge |
| `src/main/index.ts` | Instantiate and wire `RevisionQueueService` |
| `src/renderer/stores/revisionQueueStore.ts` | **NEW** — Zustand store |
| `src/renderer/hooks/useRevisionQueueEvents.ts` | **NEW** — IPC event subscription hook |
| `src/renderer/components/RevisionQueue/RevisionQueueView.tsx` | **NEW** — main queue panel |
| `src/renderer/components/RevisionQueue/QueueControls.tsx` | **NEW** — mode + run buttons |
| `src/renderer/components/RevisionQueue/SessionCard.tsx` | **NEW** — individual session UI |
| `src/renderer/components/RevisionQueue/TaskProgress.tsx` | **NEW** — progress bar |
| `src/renderer/components/RevisionQueue/ApprovalGateOverlay.tsx` | **NEW** — gate decision UI |
| `src/renderer/components/RevisionQueue/index.ts` | **NEW** — barrel export |
| `src/renderer/components/Sidebar/RevisionQueueButton.tsx` | **NEW** — sidebar entry point |
| `src/renderer/components/Layout/Sidebar.tsx` | Add `RevisionQueueButton` |
| `src/renderer/stores/viewStore.ts` | Add `'revision-queue'` to view type |
| `src/renderer/App.tsx` | Add `RevisionQueueView` to routing |
| `agents/WRANGLER.md` | Add Mode 2 documentation |

---

## Verification

1. **Plan loading:**
   - Create a book, run through Forge to get `project-tasks.md` and `revision-prompts.md`
   - The "Revision Queue" button appears in the sidebar
   - Click it — the Wrangler CLI parses Forge's output into structured sessions
   - Sessions appear as cards with correct titles, task numbers, model assignments, and prompts

2. **Manual mode:**
   - Click "Run Next" — Verity receives the first session prompt
   - Verity streams a response into the session card
   - When Verity hits an approval gate, the overlay appears with four buttons: Approve, Reject, Skip, Retry
   - Click "Approve" — "Approved. Continue." is sent, Verity continues
   - Click "Skip" — task is skipped, Verity moves to next task
   - Click "Reject" — correction input appears, sends author's message
   - Click "Retry" — session is rejected, can be re-run
   - After all tasks in a session, click "Approve" on the session card
   - `project-tasks.md` is updated with `[x]` for completed tasks

3. **Auto-approve mode:**
   - Select "Auto-Approve" mode, click "Run All"
   - Sessions run sequentially without pausing
   - Approval gates are automatically approved
   - Tasks are marked complete after each session
   - Queue pauses if "Pause" is clicked

4. **Auto-skip mode:**
   - Select "Auto-Skip", click "Run All"
   - Sessions blast through without any gates
   - All tasks run but the author reviews results after

5. **Selective mode:**
   - Checkboxes appear on pending sessions
   - Author checks specific sessions, clicks "Run All"
   - Only checked sessions execute

6. **Progress tracking:**
   - Progress bar fills as sessions complete
   - Task count updates: "12/47 tasks complete"
   - Pipeline tracker refreshes when tasks complete

7. **Error handling:**
   - If `revision-prompts.md` doesn't exist, show "No revision plan" message
   - If Wrangler parse fails, show error with details
   - If a Verity call fails, session is marked rejected, can be re-run

8. **Compilation:**
   - `npx tsc --noEmit` passes with all new files
   - No new imports that violate layer boundaries

---

## Errata Notes

- The `RevisionQueueService` constructor takes 6 dependencies: `IFileSystemService`, `IClaudeClient`, `IAgentService`, `IContextWrangler`, `IDatabaseService`, `ISettingsService`. Update the `registerIpcHandlers` function signature to include `revisionQueue: IRevisionQueueService`.
- The Wrangler's Mode 2 prompt is stored as a constant in domain (`WRANGLER_SESSION_PARSE_PROMPT`), not in the agent's `.md` file — the `.md` file gets the documentation for human reference, but the actual system prompt for the parse call comes from the constant (same pattern as `VOICE_SETUP_INSTRUCTIONS`).
- Session cards use Unicode characters for status icons to avoid emoji rendering inconsistencies across platforms. Replace with SVG icons in a future polish pass if preferred.
- The `isApprovalGate` heuristic covers ~95% of cases. If false positives/negatives become an issue, upgrade to a Wrangler CLI call: "Does this response end with an approval gate? Respond with only 'yes' or 'no'."
- The `sendFollowUp` method only saves the user message — the actual Claude call happens when `runConversationLoop` re-enters and loads the full conversation history. This avoids duplicating the streaming logic.
