# Novel Engine — Repo Evaluation Prompt

## Purpose

You are a senior auditor performing a comprehensive code review of the Novel Engine codebase. Your job is to find **chat bleed**, verify **multi-book concurrency** (background work survives book switching), verify **auto-draft critical path integrity** (all passes complete per chapter, never aborts unless user asks), verify **CLI activity monitor coverage**, and identify **areas of improvement or latent bugs**. Output all findings to `issues.md` at the repo root.

---

## What You're Looking For

### 1. Chat Bleed (Critical)

"Chat bleed" is when stream events, conversation state, or UI buffers from one CLI call leak into another context. This app runs concurrent CLI calls across multiple surfaces — main chat, modal chat, pitch room, auto-draft, revision queue, hot take, ad hoc revision, and phrase audit. Each must be hermetically isolated.

**Audit every location where `StreamEvent` objects are produced, routed, or consumed:**

#### A. Event Production (Main Process)

Read `src/main/ipc/handlers.ts` completely. For every IPC handler that calls `services.chat.sendMessage(...)` or `services.revisionQueue`, verify:

- A unique `callId` is generated or accepted from the renderer (via `params.callId ?? randomUUID()`).
- The `callId` AND `conversationId` are injected into every `broadcastStreamEvent(...)` call.
- The `broadcastStreamEvent` function sends to ALL windows (not just the sender).
- Every code path that spawns a CLI call (chat:send, hot-take:start, adhoc-revision:start, revision:runSession, revision:runAll) follows this pattern consistently.

**Flag if:** Any handler spawns a CLI call without injecting `callId` into events. Any handler uses `event.sender.send()` instead of broadcasting to all windows.

#### B. Event Routing (Renderer)

Read `src/renderer/stores/streamRouter.ts`. Then read every store that consumes stream events:

- `chatStore.ts` → `_handleStreamEvent`
- `modalChatStore.ts` → `_handleStreamEvent`
- `pitchRoomStore.ts` → `_handleStreamEvent`
- `cliActivityStore.ts` → `handleStreamEvent`
- `revisionQueueStore.ts` (or `useRevisionQueueEvents` hook)
- `autoDraftStore.ts` → any stream event consumption

For each consumer, verify:

1. **Router guard**: Does it check `streamRouter.target` as the first line? Which target value does it filter on?
2. **callId guard**: Does it compare `enriched.callId` against `_activeCallId`? Does it early-return on mismatch?
3. **Revision prefix filter**: Does it skip events where `callId.startsWith('rev:')` when it shouldn't process revision events?
4. **Recovery mode**: When `_activeCallId` is null but `isStreaming` is true, does it fall back to `conversationId` matching?
5. **Done/error cleanup**: On `done` or `error`, does the store reset `_activeCallId`, `isStreaming`, `streamBuffer`, `thinkingBuffer`, and `streamRouter.target` (if it set it)?

**Flag if:**
- Any store processes events without a `streamRouter.target` guard.
- Any store processes events without a `callId` guard.
- The `cliActivityStore` (which tracks ALL calls) incorrectly filters out events it should see.
- A store sets `streamRouter.target` on send but never resets it on done/error (deadlock risk).
- The `autoDraftStore` sends events through `window.novelEngine.chat.send()` without a unique `callId` per iteration.
- Two stores could both process the same event simultaneously (check the router target values — `'main'`, `'modal'`, `'pitch-room'` — for overlap).

#### C. Cross-Book Bleed

Read `src/renderer/stores/chatStore.ts` — specifically `switchBook()` and `sendMessage()`:

- When switching books, is the previous streaming state cleaned up?
- When sending a message, is the `_activeCallId` set BEFORE the IPC call?
- Is `streamRouter.target` set correctly before `window.novelEngine.chat.send()`?
- Could a late-arriving event from Book A's CLI call be processed while viewing Book B?

**Flag if:** `switchBook` doesn't clear `_activeCallId`. `sendMessage` sets `_activeCallId` after the IPC call returns (race condition). Any state from a previous book's stream persists after switch.

#### D. Conversation History Contamination

Read `src/infrastructure/claude-cli/ClaudeCodeClient.ts` — specifically `buildConversationPrompt()`:

- Are messages scoped to the correct `conversationId`?
- Does the prompt builder include messages from other conversations?
- Is `sendOneShot` completely stateless (no leftover buffers)?

Read `src/application/ChatService.ts` — specifically `sendMessage()`:

- Does it fetch messages from the correct `conversationId` only?
- Does the `activeStreams` Map use `conversationId` as the key (preventing cross-conversation contamination)?
- On abort, does it clean up the correct stream entry?

**Flag if:** Messages from a different conversation could leak into the CLI prompt. `activeStreams` uses a non-unique key. `sendOneShot` retains any mutable state between calls.

---

### 2. Multi-Book Concurrency — Background Work Survives Book Switch (Critical)

A core selling point of this application is working on multiple books simultaneously. If the user starts auto-draft on Book A and switches to Book B, **Book A's auto-draft must continue running in the background**. Same for revision queue, hot take, ad hoc revision — any long-running CLI surface.

#### A. `switchBook()` Abort Behavior

Read `src/renderer/stores/chatStore.ts` — specifically `switchBook()`:

- **The current code aborts the active stream when switching books** (lines ~270-278). This is correct for _interactive chat_ (the user is walking away from a conversation they typed into), but it must NOT kill:
  - Auto-draft CLI calls (owned by `autoDraftStore`, not `chatStore`)
  - Revision queue sessions (owned by `revisionQueueStore`)
  - Hot take / ad hoc revision CLI calls
  - Any background process the user didn't explicitly cancel

**Verify:**
1. Does `switchBook()` call `window.novelEngine.chat.abort(conversationId)`? If so, what `conversationId` does it pass? Is it the chatStore's `activeConversation.id` (correct — that's the user's interactive chat) or could it match a background auto-draft's conversationId?
2. If the user is _viewing_ an auto-draft conversation (chatStore's `activeConversation` === auto-draft's `conversationId`) and switches books, does `switchBook()` abort the auto-draft's CLI call? This would be a critical bug — the user was just watching, not controlling it.
3. Does the auto-draft store's `start()` method use `window.novelEngine.chat.send()` directly (not through chatStore)? If so, the abort in switchBook should NOT affect it — unless the conversationId happens to match.

**Flag if:**
- `switchBook()` aborts a CLI call that belongs to a background process (auto-draft, revision queue, etc.)
- `switchBook()` clears state that a background process depends on (e.g., resetting `_activeCallId` that auto-draft set)
- Any store's background loop checks `useBookStore.getState().activeSlug` to decide whether to continue (it should use its own `bookSlug` parameter, not the global active slug)
- Auto-draft's `isViewingBook()` helper is used for anything other than optional UI updates (using it to gate functional behavior would mean switching books breaks the loop)

#### B. Auto-Draft Background Isolation

Read `src/renderer/stores/autoDraftStore.ts` in full. Verify:

1. **Per-book session state**: The store uses `sessions: Record<string, AutoDraftSession>` keyed by `bookSlug`. Confirm that ALL state reads use the `bookSlug` parameter, never `useBookStore.getState().activeSlug`.
2. **IPC calls are book-scoped**: Every `window.novelEngine.chat.send()` call passes the correct `bookSlug`, not the global active slug.
3. **UI updates are conditional**: Calls to `useChatStore`, `useFileChangeStore`, `useBookStore.refreshWordCount()` etc. should be gated by `isViewingBook(bookSlug)` — they're optional polish, not functional requirements.
4. **Pipeline refresh is unconditional**: `usePipelineStore.getState().loadPipeline(bookSlug)` should run for background books too (so the pipeline cache stays warm).
5. **No dependency on chatStore state**: The auto-draft loop must not read from `chatStore` to decide what to do next. It should only _write_ to chatStore (via `attachToExternalStream`) when the user happens to be watching.

**Flag if:**
- Any auto-draft code path reads `useBookStore.getState().activeSlug` for functional decisions
- Auto-draft's conversation is created via `chatStore.createConversation()` instead of `window.novelEngine.chat.createConversation()` (this would pollute chatStore's state)
- The `attachToExternalStream` call fails silently when the user isn't viewing the book (it should be a no-op, not an error)
- Multiple books' auto-draft loops could interfere with each other through shared mutable state

#### C. Revision Queue Background Isolation

Read `src/renderer/stores/revisionQueueStore.ts` (or the revision execution path in `handlers.ts`). Apply the same checks:

1. Does the revision queue continue running if the user switches books?
2. Are revision events scoped by `bookSlug` or could they bleed into the wrong book's UI?
3. Does `switchBook()` accidentally kill a revision session by aborting a stream whose conversationId overlaps?

#### D. Stream Event Routing During Book Switch

When the user switches from Book A to Book B while Book A has a background auto-draft running:

1. **Before switch**: chatStore shows Book A's auto-draft conversation, events flow to chatStore via `attachToExternalStream`.
2. **During switch**: `switchBook()` resets chatStore, sets `_activeCallId = null`.
3. **After switch**: Book A's auto-draft CLI is still running, still emitting events. These events arrive at chatStore's `_handleStreamEvent`. Does the `_activeCallId` guard correctly reject them? Or does the "recovery mode" path (`_activeCallId` null + `isStreaming` false) let them through?
4. **Return to Book A**: User switches back. Does `switchBook()` → `getActiveStreamForBook()` recover the auto-draft's streaming state correctly? Does `_activeCallId` get restored so events flow again?

**Flag if:**
- Events from Book A's background auto-draft are processed by chatStore while viewing Book B
- Switching back to Book A doesn't recover the auto-draft's streaming UI
- The auto-draft loop pauses or fails when chatStore's `_activeCallId` changes (it shouldn't care)

---

### 3. Auto-Draft Critical Path — All Passes Per Chapter (Critical)

Auto-draft is a critical path. The loop must complete ALL passes for each chapter before advancing to the next. It must NEVER abort unless the user explicitly clicks Stop.

#### A. Pass Completion Guarantee

Read `src/renderer/stores/autoDraftStore.ts` — the main loop. For each chapter iteration, verify:

1. **Pass 1: Draft** — `window.novelEngine.chat.send()` with `AUTO_DRAFT_PROMPT`. Must await completion.
2. **Pass 2: Audit** — `window.novelEngine.verity.auditChapter()`. Must await completion. Must not be skipped on transient errors.
3. **Pass 3: Fix** — `window.novelEngine.verity.fixChapter()`. Only runs if audit severity is moderate/heavy. Must await completion.
4. **Pass 4: Motif audit** — `window.novelEngine.verity.runMotifAudit()`. Runs every N chapters. Must await completion.

**Verify for each pass:**
- Is the pass wrapped in try/catch? If it catches an error, does it CONTINUE to the next pass (wrong — should retry or pause) or PAUSE the loop for user decision?
- Is there a `session()?.stopRequested` check BETWEEN passes (correct) but NOT inside a pass (would abort mid-write)?
- Does `waitForCliIdle()` run between passes to ensure the previous CLI process fully exited?

**Flag if:**
- Any pass's error is silently caught and the loop advances to the next chapter without completing all passes
- The audit pass failure causes the fix pass to be skipped (if audit failed, the chapter is unaudited — this should pause, not continue)
- The motif audit failure is silently caught and the loop continues (currently it IS silently caught — is this acceptable?)
- `stopRequested` is checked inside a pass execution (would abort mid-chapter)

#### B. Abort Semantics

Read `autoDraftStore.stop()`:

1. It sets `stopRequested = true` — this is checked at loop boundaries. ✓
2. It calls `window.novelEngine.chat.abort(conversationId)` — this kills the in-flight CLI call immediately.

**Verify:**
- After `abort()` kills the CLI call, does the loop iteration detect the failure and pause (not advance to next chapter)?
- If the user clicks Stop during Pass 2 (audit), does the loop exit cleanly or does it try to run Pass 3 (fix) on a failed audit?
- Is the abort ONLY triggered by `stop()` (user action)? No other code path should call abort on the auto-draft's conversationId.

**Flag if:**
- `switchBook()` in chatStore could abort the auto-draft's conversationId (cross-store interference)
- The loop continues to the next chapter after an aborted pass instead of exiting
- An external abort (not from `stop()`) could kill the auto-draft CLI call

#### C. Error Recovery

When a CLI call fails during auto-draft:

1. Does the loop detect the failure (no new assistant message)?
2. Does it PAUSE and wait for user decision (resume/stop)?
3. Does it retry the SAME chapter on resume, not skip to the next?
4. Are all passes for the current chapter re-run on resume, or only the failed pass?

**Flag if:**
- The loop advances to the next chapter after a failure
- Resume skips the audit/fix passes that didn't run
- The pause mechanism (`_resumeResolve` Promise) could leak if the store is destroyed during a pause

#### D. External Interference

Verify that NO external code path can disrupt an active auto-draft loop:

1. `chatStore.switchBook()` — must not abort auto-draft's CLI calls
2. `chatStore.sendMessage()` — if the user manually sends a message in the auto-draft conversation, does it conflict with the loop's next iteration?
3. `modalChatStore` — unrelated, but verify no shared state
4. `window.novelEngine.chat.abort()` — only called from `autoDraftStore.stop()` and `chatStore.switchBook()`. Verify the latter doesn't pass the auto-draft's conversationId.
5. Closing the app during auto-draft — does the main process clean up the CLI process? Does the next app launch recover or detect the orphaned state?

**Flag if:**
- Any code outside `autoDraftStore` calls `abort()` with a conversationId that could match an active auto-draft conversation
- The user sending a manual message in an auto-draft conversation could corrupt the loop's chapter detection logic
- App close during auto-draft leaves zombie CLI processes

---

### 4. CLI Activity Monitor Coverage (High Priority)

The CLI Activity Monitor (`cliActivityStore.ts`) should track EVERY Claude CLI invocation — not just main chat. Verify that each of these surfaces produces events visible in the activity monitor:

#### Surfaces That Spawn CLI Calls

For each surface, trace the full event path from CLI spawn → IPC broadcast → cliActivityStore:

| Surface | IPC Handler | Expected callId Pattern | Should Show in Monitor? |
|---------|-------------|------------------------|------------------------|
| Main chat | `chat:send` | UUID | Yes |
| Modal chat (voice/author) | `chat:send` | UUID | Yes |
| Pitch room | `chat:send` | UUID | Yes |
| Auto-draft loop | `chat:send` | UUID (per iteration) | Yes |
| Hot take | `hot-take:start` | UUID | Yes |
| Ad hoc revision | `adhoc-revision:start` | UUID | Yes |
| Revision queue sessions | `revision:runSession` / `revision:runAll` | `rev:{sessionId}` | Yes |
| Revision verification | `revision:startVerification` | Check | Yes |
| Plan loading (Wrangler) | `revision:loadPlan` | `__plan-load__` | Yes (via `session:streamEvent`) |
| Context Wrangler (sendOneShot) | Called internally by ChatService | N/A | **Audit this** |

**For each surface, verify:**

1. The IPC handler broadcasts events on `chat:streamEvent` with a `callId`.
2. A `callStart` event is emitted with `agentName`, `model`, and `bookSlug` so the activity monitor can create a new call entry.
3. A `done` or `error` event is emitted so the activity monitor can mark the call as complete.
4. The `cliActivityStore.handleStreamEvent` creates a `CliCall` entry on `callStart` and tracks events through completion.

**Flag if:**
- `sendOneShot` (used by Wrangler/ContextBuilder for planning/summarization) does NOT emit `callStart`/`done` events and therefore is invisible to the activity monitor.
- Any surface's CLI call completes without a `done` event (the monitor shows it as perpetually active).
- Any surface's events are filtered out by the activity store before being tracked.
- The revision queue's `session:streamEvent` forwarding in `handlers.ts` properly maps to `chat:streamEvent` with the `rev:` prefixed callId.
- Plan loading (`__plan-load__` sessionId) events reach the activity monitor.

#### Activity Monitor Completeness

Read `src/renderer/stores/cliActivityStore.ts` — specifically `handleStreamEvent`:

- Does it create a new `CliCall` entry for every `callStart` event regardless of source?
- Does it track events from ALL callId patterns (UUID, `rev:*`, `recovered:*`)?
- Does it handle `done` and `error` to mark calls as inactive?
- Does it handle `toolUse`, `toolDuration`, `progressStage`, `thinkingSummary` for rich monitoring?
- Are completed calls retained in the `calls` Map (for history) or pruned?

---

### 5. Areas of Improvement & Latent Issues

Scan the following for anti-patterns, bugs, or architectural concerns:

#### A. Race Conditions

- **Optimistic message insert + late error**: `chatStore.sendMessage` adds a temp user message before the IPC call. If the call fails, is the temp message cleaned up or does it persist alongside the error message?
- **streamRouter.target not atomic**: If two stores call `sendMessage` near-simultaneously, the last one to set `streamRouter.target` wins. Is there a mutex or queue?
- **switchBook during stream**: What happens if the user switches books while a stream is active? Is the stream aborted? Do events from the old book's stream corrupt the new book's state?
- **Modal close during stream**: `modalChatStore.close()` returns early if `isStreaming`. But what if the stream errors after the user clicks close? Is the modal stuck open?

#### B. Error Handling Gaps

- **CLI process crash**: If the `claude` process is killed by the OS (OOM), does `ClaudeCodeClient` emit an error event? Check the `child.on('error')` and `child.on('close')` handlers.
- **stdin EPIPE**: The EPIPE guard on `child.stdin` silently swallows errors. Could this mask a real failure where the promise never settles?
- **Stream session orphan recovery**: `ChatService.recoverOrphanedSessions()` marks sessions as interrupted. But does the UI actually show this to the user? Is `interruptedSession` in chatStore ever rendered?
- **Database write failures**: `wrappedOnEvent` in `ClaudeCodeClient` catches DB persistence errors silently. If the DB is locked, every event is lost. Should there be a retry or buffer?

#### C. Memory & Performance

- **cliActivityStore unbounded growth**: The `calls` Map grows indefinitely as CLI calls accumulate. Is there a pruning strategy? After 100+ calls in a session, does this cause performance issues?
- **Stream event persistence**: Every `StreamEvent` is persisted to SQLite via `wrappedOnEvent`. For a long thinking block with thousands of `thinkingDelta` events, this could be hundreds of DB writes per second. Is WAL mode sufficient? Is there batching?
- **Conversation prompt reconstruction**: `buildConversationPrompt` concatenates all messages into a single string. For long conversations (50+ turns), this could be very large. Is there a size guard?

#### D. Security & Isolation

- **`--allowedTools` scope**: The current allowed tools list includes `Read,Write,Edit,LS,Bash(mkdir:*),Bash(cat:*),Bash(mv:*),Bash(cp:*),Bash(ls:*),Bash(find:*),Bash(wc:*),Bash(rm:*),Bash(rmdir:*)`. Agents can read/write anywhere within `--cwd` and `--add-dir` paths. Could a malicious agent prompt cause file writes outside the book directory? Check if `--cwd` provides true sandboxing or if `../` traversal is possible via the Bash tools.
- **Books directory access (`--add-dir`) is mandatory**: The CLI is spawned with `--add-dir` pointing to the `booksDir` root. This is **critical** for surfaces that operate outside a specific book directory — especially the **Pitch Room**, which sets `--cwd` to a pitch draft directory but must write to `{booksDir}/{slug}/` when scaffolding a new book. Verify in `ClaudeCodeClient.sendMessage()` that `--add-dir` is **always** set to `this.booksDir` regardless of whether `workingDir` or `bookSlug` is provided. If `--add-dir` were removed or conditional, the Pitch Room's `PITCH-ROOM.md` agent prompt (which uses absolute paths under `{{BOOKS_PATH}}`) would fail silently — the CLI would deny Write/Edit/Bash(mkdir) operations outside its sandbox.

  **Specifically audit:**
  1. `ClaudeCodeClient.sendMessage()` — confirm `--add-dir` is unconditionally pushed to `args` before `spawn()`.
  2. `PitchRoomService.handleMessage()` — confirm it passes `workingDir` (pitch draft path) but the `--add-dir` flag still grants access to the full books directory.
  3. `PITCH-ROOM.md` agent prompt — confirm it instructs Spark to use absolute paths under `{{BOOKS_PATH}}` (which resolves to the books dir), not relative paths from `--cwd`.
  4. No code path exists where `--add-dir` is skipped, overridden, or set to a narrower path (e.g., a single book subdirectory instead of the books root).
  5. Auto-draft, revision queue, and ad hoc revision surfaces — confirm they also benefit from `--add-dir` when their `--cwd` is scoped to a single book but they need to read/write shared files (author profile, custom agents, etc.) that may live outside the book directory.

  **Flag if:** `--add-dir` is conditionally applied, scoped too narrowly, or missing entirely for any CLI spawn path.

- **`child.stdin.write(conversationPrompt)`**: The conversation prompt is written to stdin. Are there injection risks if a previous assistant message contains CLI-parseable sequences?
- **System prompt size**: System prompts are passed via `--system-prompt` as a CLI arg. The code comments say this is safe up to ~2MB via execve. Is there a size check? What happens if an agent's .md file is corrupted to be 10MB?

#### E. Architectural Concerns

- **streamRouter as mutable global**: The `streamRouter` is a plain mutable object shared across stores. This works because JS is single-threaded, but it's fragile. If any store forgets to reset `target` on error, all subsequent events are misrouted until the app is restarted.
- **Three stores with near-identical `_handleStreamEvent`**: `chatStore`, `modalChatStore`, and `pitchRoomStore` all have duplicated event handling logic. A bug fix in one must be replicated in all three. Consider whether this should be extracted into a shared utility.
- **callId convention inconsistency**: Main chat uses UUIDs, revision queue uses `rev:{sessionId}`, plan loading uses `__plan-load__`. The `chatStore` filters on `startsWith('rev:')` — this is a string convention, not a type-safe discriminator. Adding a new prefix requires updating every filter.
- **`sendOneShot` is invisible**: The one-shot CLI calls (Wrangler planning, summarization) don't participate in the stream event system at all. They're fire-and-forget from the activity monitor's perspective. This means users can't see what the Wrangler is doing during context assembly.

#### F. Specific Code Smells

- Check if any store's `_handleStreamEvent` has a `default` case in its switch statement. Missing event types are silently dropped — this is correct for forward compatibility but should be documented.
- Check if `activeStreams.delete(conversationId)` is called in ALL terminal paths (done, error, abort). A leaked entry means `getActiveStreamForBook` returns stale data.
- Check if `streamRouter.target` is reset in ALL error paths across all three consuming stores.
- Check if the revision queue's event forwarding (`session:streamEvent` → `chat:streamEvent`) preserves all event fields or if any are stripped.
- Check if `cliActivityStore.recoverActiveStream` could create a duplicate entry if called multiple times (e.g., on rapid tab switches).

---

## Output Format

Create `issues.md` at the repo root with this structure:

```markdown
# Novel Engine — Repo Evaluation Report

**Generated**: {date}
**Auditor**: Claude (automated evaluation)

## Summary

{2-3 sentence overview of findings}

### Severity Legend
- 🔴 **Critical**: Active bug or data corruption risk. Fix immediately.
- 🟠 **High**: Likely to cause user-visible issues. Fix soon.
- 🟡 **Medium**: Code smell or architectural concern. Plan to address.
- 🟢 **Low**: Improvement opportunity. Nice to have.

---

## 1. Chat Bleed Findings

### 1.1 {Finding title}
**Severity**: 🔴/🟠/🟡/🟢
**Location**: `src/path/to/file.ts:{line range}`
**Description**: {What the issue is}
**Evidence**: {Specific code that demonstrates the issue}
**Impact**: {What could go wrong}
**Fix**: {Concrete recommendation}

{Repeat for each finding}

---

## 2. Multi-Book Concurrency — Background Work Isolation

### Book Switch Safety Matrix

| Background Surface | Survives switchBook()? | Events Isolated? | State Independent? | Status |
|---|:-:|:-:|:-:|--------|
| Auto-draft (Book A) | ✅/❌ | ✅/❌ | ✅/❌ | OK/ISSUE |
| Revision queue (Book A) | ✅/❌ | ✅/❌ | ✅/❌ | OK/ISSUE |
| Hot take (Book A) | ✅/❌ | ✅/❌ | ✅/❌ | OK/ISSUE |
| Ad hoc revision (Book A) | ✅/❌ | ✅/❌ | ✅/❌ | OK/ISSUE |

### 2.1 {Finding title}
{Same format as chat bleed findings}

---

## 3. Auto-Draft Critical Path — Pass Completion

### Per-Chapter Pass Matrix

| Pass | Awaits Completion? | Error Handling | stopRequested Checked After? | Status |
|------|:-:|--------|:-:|--------|
| Draft (Verity) | ✅/❌ | {pause/silent-catch/throw} | ✅/❌ | OK/ISSUE |
| Audit | ✅/❌ | {pause/silent-catch/throw} | ✅/❌ | OK/ISSUE |
| Fix | ✅/❌ | {pause/silent-catch/throw} | ✅/❌ | OK/ISSUE |
| Motif Audit | ✅/❌ | {pause/silent-catch/throw} | ✅/❌ | OK/ISSUE |

### External Interference Matrix

| External Actor | Can Abort Auto-Draft? | Mechanism | Status |
|---|:-:|--------|--------|
| `chatStore.switchBook()` | ✅/❌ | {describe} | OK/ISSUE |
| `chatStore.sendMessage()` | ✅/❌ | {describe} | OK/ISSUE |
| App close | ✅/❌ | {describe} | OK/ISSUE |

### 3.1 {Finding title}
{Same format as chat bleed findings}

---

## 4. CLI Activity Monitor Coverage

### Coverage Matrix

| Surface | callId Injected | callStart Emitted | Events Broadcast | Visible in Monitor | Status |
|---------|:-:|:-:|:-:|:-:|--------|
| Main chat | ✅/❌ | ✅/❌ | ✅/❌ | ✅/❌ | OK/ISSUE |
| Modal chat | ... | ... | ... | ... | ... |
| Pitch room | ... | ... | ... | ... | ... |
| Auto-draft | ... | ... | ... | ... | ... |
| Hot take | ... | ... | ... | ... | ... |
| Ad hoc revision | ... | ... | ... | ... | ... |
| Revision sessions | ... | ... | ... | ... | ... |
| Revision verification | ... | ... | ... | ... | ... |
| Plan loading | ... | ... | ... | ... | ... |
| Wrangler (sendOneShot) | ... | ... | ... | ... | ... |

### 4.1 {Finding title}
{Same format as chat bleed findings}

---

## 5. Areas of Improvement

### 5.1 {Finding title}
**Severity**: 🔴/🟠/🟡/🟢
**Category**: Race Condition / Error Handling / Memory / Security / Architecture / Code Smell
**Location**: `src/path/to/file.ts:{line range}`
**Description**: {What the issue is}
**Evidence**: {Specific code}
**Impact**: {What could go wrong}
**Fix**: {Concrete recommendation}

{Repeat for each finding}

---

## 6. Positive Observations

{List things the codebase does well — good patterns worth preserving}
```

---

## Execution Instructions

1. Read every file referenced above in full — do not skim or summarize from memory.
2. Trace event flows end-to-end: IPC handler → broadcastStreamEvent → preload bridge → store handler.
3. For each finding, cite the exact file path and relevant code.
4. Be specific. "There might be a race condition" is not useful. "In `chatStore.ts:sendMessage`, `_activeCallId` is set in the `set()` call on line X, but `window.novelEngine.chat.send()` is called on line Y — if the IPC call triggers a synchronous event before `set()` completes, the guard on line Z won't filter it" is useful.
5. Don't invent issues. If a pattern is correct, say so and move on.
6. Output ONLY `issues.md`. No other files, no conversation, no preamble.