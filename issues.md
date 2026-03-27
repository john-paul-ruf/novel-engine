# Novel Engine — Repo Evaluation Report

**Generated**: 2026-03-27
**Auditor**: Claude (automated evaluation)

## Summary

The codebase demonstrates strong architectural discipline in its stream event isolation — the `callId`-per-send pattern, `createStreamHandler` shared guard logic, and broadcast-to-all-windows approach are well-engineered. However, there are **critical issues** around `switchBook()` aborting background auto-draft streams, a race in shared singleton state (`lastDiagnostics`, `lastChangedFiles`) during concurrent CLI calls, and the pitchRoomStore lacking a store-level listener lifecycle (relying on component-level `useEffect` instead). The auto-draft critical path is mostly solid but has a silent-catch gap in the audit/fix pass that could skip error recovery.

### Severity Legend
- 🔴 **Critical**: Active bug or data corruption risk. Fix immediately.
- 🟠 **High**: Likely to cause user-visible issues. Fix soon.
- 🟡 **Medium**: Code smell or architectural concern. Plan to address.
- 🟢 **Low**: Improvement opportunity. Nice to have.

---

## 1. Chat Bleed Findings

### 1.1 No streamRouter — Architecture Evolved to Shared Handler Pattern
**Severity**: 🟢
**Location**: `src/renderer/stores/streamHandler.ts`
**Description**: The eval prompt references a `streamRouter` singleton, but this codebase uses `createStreamHandler` instead — a factory that returns a handler with shared guard logic. Each store (chatStore, modalChatStore, pitchRoomStore) creates its own handler instance. There is no mutable global `streamRouter.target` — the routing is implicit via `callId` and `conversationId` matching per-store.
**Impact**: None. This is a superior design to the `streamRouter` pattern. No target-setting/resetting bugs are possible.
**Status**: ✅ Architecture is cleaner than expected.

### 1.2 All Three Chat Stores Correctly Filter on callId
**Severity**: 🟢
**Location**: `src/renderer/stores/streamHandler.ts:60-91`
**Description**: The `createStreamHandler` factory implements a three-layer guard:
1. Skip `rev:*` callIds (revision events handled elsewhere)
2. Primary: `activeCallId && callId && callId !== activeCallId → return` (line 73)
3. Secondary: when `!activeCallId`, reject unless `isStreaming` AND `conversationId` matches (recovery mode)

All three consuming stores (chatStore, modalChatStore, pitchRoomStore) use this handler. The `alwaysCheckConversationId` flag adds an extra conversationId check for modal and pitch room.
**Impact**: Cross-call bleed is correctly prevented by the callId UUID guard.
**Status**: ✅ Correct.

### 1.3 All Stores Reset _activeCallId on Done and Error
**Severity**: 🟢
**Location**: `src/renderer/stores/chatStore.ts:411`, `src/renderer/stores/modalChatStore.ts:187,235`, `src/renderer/stores/pitchRoomStore.ts:244,288`
**Description**: Every `onDone` and `onError` callback sets `_activeCallId: null`. No store leaves a stale callId on terminal events.
**Status**: ✅ Correct.

### 1.4 Event Production — All CLI Surfaces Inject callId and conversationId
**Severity**: 🟢
**Location**: `src/main/ipc/handlers.ts:202-273` (`chat:send`), `446-489` (`hot-take:start`), `493-549` (`adhoc-revision:start`), `554-626` (Verity audit/fix/motif)
**Description**: Every IPC handler that spawns a CLI call:
- Generates a `callId` via `randomUUID()` (or accepts one from the renderer)
- Injects `callId` and `conversationId` into every `broadcastStreamEvent` call
- Broadcasts to ALL windows via `BrowserWindow.getAllWindows()`

The Verity audit/fix handlers also emit a synthetic `callStart` via `emitVerityCallStart()` (line 567).
**Status**: ✅ Correct and consistent.

### 1.5 Revision Queue Events Correctly Forwarded with rev: Prefix
**Severity**: 🟢
**Location**: `src/main/ipc/handlers.ts:698-721`
**Description**: The `revisionQueue.onEvent` listener forwards `session:streamEvent` events as `chat:streamEvent` with `callId: rev:${event.sessionId}`. The `createStreamHandler` guard (line 66) skips events with `callId.startsWith('rev:')`, so revision events never bleed into chatStore/modalChatStore/pitchRoomStore.
**Status**: ✅ Correct.

### 1.6 cliActivityStore Correctly Processes ALL Events Without Filtering
**Severity**: 🟢
**Location**: `src/renderer/stores/cliActivityStore.ts:318-542`
**Description**: The `handleStreamEvent` method does NOT filter on `rev:` prefix — it processes all events regardless of source. It creates new `CliCall` entries on `callStart`, tracks events through completion. The fallback logic (lines 356-362) tries to match events to the most recently started active call when the callId doesn't match an existing entry.
**Status**: ✅ Correct — the activity monitor sees everything.

### 1.7 Conversation History Is Scoped by conversationId
**Severity**: 🟢
**Location**: `src/application/ChatService.ts:197`, `src/infrastructure/claude-cli/ClaudeCodeClient.ts:319-329`
**Description**: `ChatService.sendMessage()` fetches messages via `this.db.getMessages(conversationId)` — scoped to the correct conversation. `buildConversationPrompt()` only processes the messages array it's given. No cross-conversation contamination is possible.
**Status**: ✅ Correct.

---

## 2. Multi-Book Concurrency — Background Work Isolation

### Book Switch Safety Matrix

| Background Surface | Survives switchBook()? | Events Isolated? | State Independent? | Status |
|---|:-:|:-:|:-:|--------|
| Auto-draft (Book A) | ❌ (conditional) | ✅ | ✅ | ISSUE |
| Revision queue (Book A) | ✅ | ✅ | ✅ | OK |
| Hot take (Book A) | ❌ | ✅ | ✅ | ISSUE |
| Ad hoc revision (Book A) | ❌ | ✅ | ✅ | ISSUE |

### 2.1 switchBook() Aborts Active Stream — May Kill Background Processes
**Severity**: 🔴
**Location**: `src/renderer/stores/chatStore.ts:271-278`
**Description**: `switchBook()` checks `isStreaming && activeConversation` and calls `window.novelEngine.chat.abort(activeConversation.id)`. The abort targets the chatStore's `activeConversation.id`.

This is safe for **interactive chat** (the user typed a message and is walking away). However, it becomes dangerous when:

1. **Auto-draft attaches to chatStore**: When `attachToExternalStream(callId, conversationId)` is called (autoDraftStore.ts:304), chatStore's `activeConversation.id` becomes the auto-draft's conversationId. If the user then switches books, `switchBook()` will abort the auto-draft's CLI call.

2. **Hot take / ad hoc revision**: These create their own conversations and the user may navigate to view them in chatStore. If `chatStore.activeConversation` is set to the hot take's conversation and the user switches books, the hot take CLI call is aborted.

**Evidence**: `autoDraftStore.ts:300-304`:
```typescript
const chatState = useChatStore.getState();
const userIsWatching = chatState.activeConversation?.id === conversationId;
if (userIsWatching) {
  useChatStore.getState().attachToExternalStream(callId, conversationId, AUTO_DRAFT_PROMPT);
}
```
After `attachToExternalStream`, `chatStore.isStreaming = true` and `activeConversation.id === auto-draft conversationId`. Then `switchBook()` at line 274 calls `abort(activeConversation.id)` — which aborts the auto-draft's CLI child process.

**Impact**: Switching books while viewing an auto-draft conversation kills the background auto-draft. The user loses the in-progress chapter.

**Fix**: `switchBook()` should only abort streams that were initiated by chatStore's own `sendMessage()`. Add a `_streamOrigin: 'self' | 'external' | null` field to chatStore. Set it to `'self'` in `sendMessage()` and `'external'` in `attachToExternalStream()`. Only abort when `_streamOrigin === 'self'`.

### 2.2 Auto-Draft Uses Independent IPC Calls — Events Isolated
**Severity**: 🟢
**Location**: `src/renderer/stores/autoDraftStore.ts:307-314`
**Description**: Auto-draft calls `window.novelEngine.chat.send()` directly with its own `callId = crypto.randomUUID()`. It does NOT go through chatStore's `sendMessage()`. The callId isolation ensures events from this CLI call never bleed into other stores.
**Status**: ✅ Correct design.

### 2.3 Auto-Draft State Is Per-Book
**Severity**: 🟢
**Location**: `src/renderer/stores/autoDraftStore.ts:101`, `192-210`
**Description**: `sessions: Record<string, AutoDraftSession>` is keyed by `bookSlug`. The `start()` method takes `bookSlug` as a parameter, not from `useBookStore.getState().activeSlug`. All loop logic reads from `session()` (which reads `sessions[bookSlug]`), not from the global active book.
**Status**: ✅ Correct — multiple books can auto-draft concurrently.

### 2.4 isViewingBook() Used Only for Optional UI Updates
**Severity**: 🟢
**Location**: `src/renderer/stores/autoDraftStore.ts:167-169`, `252`, `426-429`, `469`
**Description**: `isViewingBook(bookSlug)` checks `useBookStore.getState().activeSlug === bookSlug`. It's used to gate:
- Conversation list refresh in chatStore (line 252)
- FileChangeStore/WordCount refresh (lines 426-429, 469)
None of these are functional requirements for the loop. Pipeline refresh (line 424) is unconditional.
**Status**: ✅ Correct — switching books doesn't break the loop's logic.

### 2.5 Revision Queue Survives Book Switch — Per-Book Cache
**Severity**: 🟢
**Location**: `src/renderer/stores/revisionQueueStore.ts:59-110`, `133-216`
**Description**: The revision queue store maintains a `bookStateCache` Map that snapshots state before switching and restores on return. The `switchToBook()` method also reconciles with the backend (`getQueueStatus`) to detect if the queue finished while the user was away. Events in `useRevisionQueueEvents` are filtered by `sessionBelongsToCurrentPlan()`.
**Status**: ✅ Well-designed.

### 2.6 Stream Event Routing After Book Switch — Recovery Path
**Severity**: 🟡
**Location**: `src/renderer/stores/chatStore.ts:313-339`
**Description**: When switching to a new book, `switchBook()` calls `getActiveStreamForBook(newBookSlug)` (line 317) to detect and recover an active CLI stream for that book. If found, it restores `_activeCallId` and `isStreaming` so events resume flowing.

However, the recovery path uses `active.callId || null` (line 331). If the active stream was started by auto-draft (which generates its own callId), the recovered `_activeCallId` will be a callId that the auto-draft generated — but the auto-draft loop may have already moved on to the next iteration with a new callId. Events from the *current* iteration won't match the recovered callId.

**Impact**: After switching back to a book running auto-draft, the chatStore may briefly show stale streaming state until the current iteration completes and the next one calls `attachToExternalStream` with the new callId. Minor UI glitch, not data corruption.

**Fix**: When auto-draft's `attachToExternalStream` is called, it already updates `_activeCallId`. The issue self-corrects on the next iteration.

---

## 3. Auto-Draft Critical Path — Pass Completion

### Per-Chapter Pass Matrix

| Pass | Awaits Completion? | Error Handling | stopRequested Checked After? | Status |
|------|:-:|--------|:-:|--------|
| Draft (Verity) | ✅ | Pause on no response | ✅ | OK |
| Audit | ✅ | Silent catch ⚠️ | ✅ | ISSUE |
| Fix | ✅ | Silent catch ⚠️ | ✅ | ISSUE |
| Motif Audit | ✅ | Silent catch | ✅ | ACCEPTABLE |

### External Interference Matrix

| External Actor | Can Abort Auto-Draft? | Mechanism | Status |
|---|:-:|--------|--------|
| `chatStore.switchBook()` | ✅ | Aborts `activeConversation.id` which may be auto-draft's conversationId | **ISSUE (see 2.1)** |
| `chatStore.sendMessage()` | ❌ | Uses its own conversationId | OK |
| App close | ✅ | OS kills all child processes | OK (expected) |

### 3.1 Audit/Fix Pass Errors Are Silently Caught — Loop Continues
**Severity**: 🟠
**Location**: `src/renderer/stores/autoDraftStore.ts:395-398`
**Description**: The entire audit/fix block (lines 348-398) is wrapped in a try/catch that silently logs and continues:
```typescript
} catch (err) {
  console.warn('[auto-draft] Audit/fix pass failed:', err);
}
```
If the audit CLI call fails (network error, CLI crash, overloaded), the chapter is written but **never audited**. The loop advances to the next chapter with an unaudited draft.

**Impact**: Chapters can accumulate without quality checks. The user won't know the audit was skipped unless they check the console. This defeats the purpose of the audit/fix pipeline.

**Fix**: On audit failure, pause the loop (same as the "no response" pause mechanism at line 440). Let the user decide: retry audit, skip audit for this chapter, or stop. At minimum, track a `skippedAudits: string[]` in the session so the user knows which chapters need manual audit.

### 3.2 Motif Audit Failure Is Silently Caught — Acceptable
**Severity**: 🟢
**Location**: `src/renderer/stores/autoDraftStore.ts:417-419`
**Description**: The motif audit (periodic, every N chapters) is also silently caught. This is less critical because:
1. It's periodic (every 3 chapters), not per-chapter
2. Missing one doesn't leave a chapter unaudited
3. The next cadence will catch up
**Status**: Acceptable.

### 3.3 stopRequested Is Checked Between Passes — Correct
**Severity**: 🟢
**Location**: `src/renderer/stores/autoDraftStore.ts:276`, `323`, `348`, `373`, `407`
**Description**: `stopRequested` is checked:
- At the top of the while loop (line 276)
- After the draft send completes (line 323)
- Before audit (line 348)
- Before fix (line 373)
- Before motif audit (line 407)
It is NOT checked inside any pass — the CLI call runs to completion. This is correct.
**Status**: ✅ Correct.

### 3.4 stop() Sets stopRequested AND Aborts CLI — Correct Dual Signal
**Severity**: 🟢
**Location**: `src/renderer/stores/autoDraftStore.ts:483-501`
**Description**: `stop()` sets `stopRequested = true` (checked at loop boundaries) AND calls `abort(conversationId)` (kills the in-flight CLI call). If paused, it also unblocks the resume promise. This is a clean dual-signal mechanism: immediate CLI kill + loop exit at next boundary.
**Status**: ✅ Correct.

### 3.5 Error Recovery Retries Same Chapter — Correct
**Severity**: 🟢
**Location**: `src/renderer/stores/autoDraftStore.ts:438-452`
**Description**: When no assistant message is received (CLI error), the loop pauses with a `Promise<void>`. On `resume()`, the loop re-enters the while loop at the same iteration — it retries the same chapter. No chapters are skipped.
**Status**: ✅ Correct.

### 3.6 _resumeResolve Leak on Store Destruction
**Severity**: 🟡
**Location**: `src/renderer/stores/autoDraftStore.ts:440-446`
**Description**: If the Zustand store is destroyed (e.g., app close) while the loop is paused, the `Promise<void>` at line 440 will never resolve. The `_resumeResolve` function reference will be garbage-collected along with the store. This is technically a leak, but since app close kills all processes anyway, it's benign.
**Impact**: None in practice — Zustand stores persist for the app's lifetime.
**Status**: Acceptable.

---

## 4. CLI Activity Monitor Coverage

### Coverage Matrix

| Surface | callId Injected | callStart Emitted | Events Broadcast | Visible in Monitor | Status |
|---------|:-:|:-:|:-:|:-:|--------|
| Main chat | ✅ | ✅ | ✅ | ✅ | OK |
| Modal chat | ✅ | ✅ | ✅ | ✅ | OK |
| Pitch room | ✅ | ✅ | ✅ | ✅ | OK |
| Auto-draft | ✅ | ✅ | ✅ | ✅ | OK |
| Hot take | ✅ | ✅ | ✅ | ✅ | OK |
| Ad hoc revision | ✅ | ✅ | ✅ | ✅ | OK |
| Revision sessions | ✅ (`rev:*`) | ✅ (via forwarding) | ✅ | ✅ | OK |
| Revision verification | ✅ | ✅ | ✅ | ✅ | OK |
| Verity audit/fix | ✅ | ✅ (synthetic `emitVerityCallStart`) | ✅ | ✅ | OK |
| Motif audit | ✅ | ✅ (synthetic `emitVerityCallStart`) | ✅ | ✅ | OK |
| Wrangler (ContextBuilder) | N/A | N/A | N/A | N/A | N/A (not a CLI call) |

### 4.1 ContextBuilder / Wrangler Calls Are Not CLI Calls
**Severity**: 🟢
**Location**: `src/application/ContextBuilder.ts`
**Description**: The original eval prompt asks about `sendOneShot` for Wrangler calls. This codebase uses a `ContextBuilder` class that is **pure TypeScript** — it builds context using heuristic rules (file manifests, token budgets) without spawning a CLI process. There is no `sendOneShot` method. Therefore, there is no invisible CLI call to track.
**Status**: N/A — ContextBuilder is not a CLI call.

### 4.2 Activity Monitor Has Pruning — Bounded Growth
**Severity**: 🟢
**Location**: `src/renderer/stores/cliActivityStore.ts:123-124`, `189-202`
**Description**: `MAX_ENTRIES_PER_CALL = 500` caps entries per call. `MAX_COMPLETED_CALLS = 10` prunes old completed calls. The `pruneCompletedCalls()` function runs on every `callStart` event. Active calls are never pruned.
**Status**: ✅ Bounded growth.

### 4.3 Recovery Creates `recovered:` Prefixed CallId — No Duplicate Risk
**Severity**: 🟢
**Location**: `src/renderer/stores/cliActivityStore.ts:597`
**Description**: `recoverActiveStream()` creates a call entry with `callId = recovered:${active.conversationId}`. Since the callOrder filter deduplicates (`callOrder.filter(id => id !== callId)`), rapid tab switches won't create duplicate entries.
**Status**: ✅ Correct.

---

## 5. Areas of Improvement

### 5.1 lastDiagnostics Is a Singleton — Concurrent Calls Overwrite
**Severity**: 🟠
**Category**: Race Condition
**Location**: `src/application/ChatService.ts:45,248,400`
**Description**: `ChatService.lastDiagnostics` is a single field. When multiple CLI calls run concurrently (e.g., main chat + auto-draft + hot take), each `sendMessage()` call overwrites `this.lastDiagnostics` at line 248. The `context:getLastDiagnostics` IPC handler returns whichever was written last.
**Evidence**:
```typescript
private lastDiagnostics: ContextDiagnostics | null = null;
// ...
this.lastDiagnostics = assembled.diagnostics;  // line 248 — any concurrent call overwrites
```
**Impact**: The CLI Activity Monitor's `loadDiagnostics()` may show diagnostics from the wrong call. The diagnostics panel could display context information for Book A's auto-draft while the user is viewing a hot take for Book B.
**Fix**: Key diagnostics by `callId` or `conversationId` — e.g., `Map<string, ContextDiagnostics>` with pruning.

### 5.2 lastChangedFiles Is a Singleton — Concurrent Calls Overwrite
**Severity**: 🟠
**Category**: Race Condition
**Location**: `src/application/StreamManager.ts:36,116,165-167,193`
**Description**: `StreamManager.lastChangedFiles` is a single `string[]`. Each `filesChanged` event from ANY active stream overwrites it (line 116). The IPC handler reads it after the `chat:send` promise resolves (handlers.ts:263), but if another stream's `filesChanged` arrives between the target stream's `filesChanged` and the handler's read, the wrong files are reported.
**Evidence**: `StreamManager.ts:116`:
```typescript
} else if (event.type === 'filesChanged' && trackFilesChanged) {
  this.lastChangedFiles = event.paths;  // any concurrent stream overwrites
```
Then `handlers.ts:263`:
```typescript
const changedFiles = services.chat.getLastChangedFiles();  // reads whichever was written last
```
**Impact**: The `chat:filesChanged` notification to the renderer may report files from the wrong CLI call. The pipeline refresh would target the wrong book's files. This is partially mitigated because `handlers.ts:267` always passes the correct `params.bookSlug`, but the `changedFiles` paths could belong to a different book.
**Fix**: Return `changedFiles` from the stream's `done` event (which already has `filesTouched`) instead of relying on a singleton.

### 5.3 resetChangedFiles() Called Before Stream Start — Clears Other Streams' Data
**Severity**: 🟡
**Category**: Race Condition
**Location**: `src/application/ChatService.ts:115`
**Description**: `sendMessage()` calls `this.streamManager.resetChangedFiles()` as its first step. If another stream is currently in-flight and has already emitted `filesChanged`, this reset clears those files before the other stream's handler reads them.
**Impact**: The IPC handler for the other concurrent stream may see `[]` instead of the actual changed files. Mitigated by the fact that each stream's `done` event also carries `filesTouched`.
**Fix**: Remove the singleton pattern. Each stream should track its own changed files.

### 5.4 PitchRoomStore Has No Store-Level Listener Lifecycle
**Severity**: 🟡
**Category**: Architecture
**Location**: `src/renderer/stores/pitchRoomStore.ts`, `src/renderer/components/PitchRoom/PitchRoomView.tsx:186-189`
**Description**: Unlike chatStore and modalChatStore, pitchRoomStore does NOT have `initStreamListener`/`destroyStreamListener` methods. Instead, the `PitchRoomView` component registers the listener directly:
```typescript
useEffect(() => {
  const cleanup = window.novelEngine.chat.onStreamEvent(handleStreamEvent);
  return () => { cleanup(); };
}, [handleStreamEvent]);
```
This means:
1. When the PitchRoomView is unmounted (user navigates away), the listener is cleaned up.
2. If a pitch room CLI call is in-flight and the user navigates to another view, the `done` event is missed. The store gets stuck with `isStreaming: true`.
3. When the user returns to the pitch room, the old stream's events are lost.

**Impact**: Navigating away from pitch room during an active stream leaves the store in a broken state. The chat input will appear disabled (isStreaming = true) with no way to recover except refreshing the app.
**Fix**: Add `initStreamListener`/`destroyStreamListener` to pitchRoomStore (matching chatStore's pattern) and register the listener at the AppLayout level, not the component level.

### 5.5 EPIPE Guard on stdin May Mask Failures
**Severity**: 🟡
**Category**: Error Handling
**Location**: `src/infrastructure/claude-cli/ClaudeCodeClient.ts:230-238`
**Description**: The EPIPE/ERR_STREAM_DESTROYED guard on `child.stdin` returns early without emitting an error event. If the CLI process exits before the conversation prompt is fully written, the `child.on('close')` handler will fire with a non-zero exit code and emit the error. However, if the process exits with code 0 (e.g., it read partial stdin and decided to respond anyway), the error is truly swallowed.
**Impact**: Unlikely in practice — a partial stdin write would almost certainly cause the CLI to fail.
**Fix**: Log the amount of data written vs. expected to aid debugging.

### 5.6 System Prompt Size Guard — Correct
**Severity**: 🟢
**Location**: `src/infrastructure/claude-cli/ClaudeCodeClient.ts:183-189`
**Description**: The system prompt is capped at 500KB via `MAX_SYSTEM_PROMPT_BYTES`. This is appropriate — most OS limits are 128KB-2MB for total argv. The check emits an error event and returns early.
**Status**: ✅ Good defensive coding.

### 5.7 --add-dir Is Unconditionally Set — Correct
**Severity**: 🟢
**Location**: `src/infrastructure/claude-cli/ClaudeCodeClient.ts:163`
**Description**: `'--add-dir', this.booksDir` is hardcoded in the `args` array, not behind any conditional. Every CLI spawn gets access to the full books directory regardless of `--cwd`.
**Status**: ✅ Correct — pitch room, auto-draft, revision queue all work because `--add-dir` grants access to the books root.

### 5.8 callId Convention Inconsistency — String Prefixes
**Severity**: 🟡
**Category**: Architecture
**Location**: `src/renderer/stores/streamHandler.ts:66`, `src/main/ipc/handlers.ts:706`
**Description**: callId patterns:
- Main/modal/pitch/auto-draft/hot-take/adhoc: UUID
- Revision queue: `rev:{sessionId}`
- Verity audit: `audit:{uuid}` or renderer-provided UUID
- Verity fix: `fix:{uuid}` or renderer-provided UUID
- Motif audit: `motif-audit:{uuid}`
- Recovery: `recovered:{conversationId}`

The streamHandler filters on `startsWith('rev:')` (line 66). Adding a new prefix requires updating this filter. The other prefixes (audit, fix, motif-audit, recovered) are NOT filtered — they flow through to all stores but are rejected by the callId guard since no store sets `_activeCallId` to those patterns (unless attached via `attachToExternalStream`).
**Impact**: Fragile but functional. A new prefix that collides with an active callId UUID is astronomically unlikely.
**Fix**: Consider a type-safe discriminator in the event payload (e.g., `source: 'chat' | 'revision' | 'audit'`) instead of string prefix conventions.

### 5.9 Stream Event DB Persistence — Per-Event Writes
**Severity**: 🟡
**Category**: Performance
**Location**: `src/infrastructure/claude-cli/ClaudeCodeClient.ts:128-150`
**Description**: Every `StreamEvent` is persisted to SQLite via `wrappedOnEvent`. For long thinking blocks with many `thinkingDelta` events, this could be hundreds of DB writes per second. WAL mode helps, but there's no batching.
**Impact**: Potential I/O pressure during heavy thinking sessions. The `persistErrorLogged` flag (line 141) logs only the first failure per session, which is good — but if the DB is under pressure, ALL subsequent events are lost silently.
**Fix**: Consider batching events (e.g., flush every 100ms or every 10 events) for non-critical event types like `thinkingDelta`.

### 5.10 Modal Close During Stream — Deferred Close Works Correctly
**Severity**: 🟢
**Location**: `src/renderer/stores/modalChatStore.ts:90-97,176,218`
**Description**: `close()` sets `_closeRequested = true` if streaming, then both `onDone` and `onError` check `_closeRequested` and set `isOpen: false` in their cleanup.
**Status**: ✅ Correct.

### 5.11 buildConversationPrompt — No Injection Risk
**Severity**: 🟢
**Location**: `src/infrastructure/claude-cli/ClaudeCodeClient.ts:319-329`
**Description**: The conversation prompt uses `Human:` / `Assistant:` prefixes written to stdin. The CLI reads stdin as a single prompt (not as structured conversation turns), so previous assistant messages containing these prefixes won't cause injection.
**Status**: ✅ Not a real injection risk.

---

## 6. Positive Observations

1. **`createStreamHandler` factory pattern**: Eliminates the mutable global `streamRouter` anti-pattern. Each store gets its own handler instance with shared guard logic. Bug fixes in the handler automatically apply to all three stores.

2. **callId-per-send isolation**: Every `sendMessage()` generates a fresh UUID callId. This is the primary defense against cross-call bleed and it's applied consistently across all surfaces.

3. **Broadcast to ALL windows**: `BrowserWindow.getAllWindows()` ensures a refreshed renderer picks up events immediately. No sender-specific routing that breaks on refresh.

4. **Per-book auto-draft sessions**: `sessions: Record<string, AutoDraftSession>` with all state reads using the `bookSlug` parameter is excellent multi-book concurrency design.

5. **Revision queue per-book caching**: `bookStateCache` in revisionQueueStore with backend reconciliation on switch-back is well-thought-out.

6. **Synthetic callStart for audit/fix**: `emitVerityCallStart()` ensures audit and fix CLI calls appear in the activity monitor even though they're not standard chat flows.

7. **StreamManager centralizes lifecycle**: The `StreamManager` class owns the `activeStreams` map and handles the repetitive register→accumulate→save→cleanup pattern. This prevents each service from reimplementing stream lifecycle management.

8. **MAX_COMPLETED_CALLS pruning**: The activity monitor prunes old completed calls, preventing unbounded memory growth during long sessions.

9. **Recovery polling with timeout**: Both chatStore and cliActivityStore implement polling fallbacks for detecting stream completion after a renderer refresh, with safety timeouts (chatStore: 2s intervals, cliActivityStore: 10min max).

10. **Clean DI architecture**: Application services depend on interfaces. Concrete classes are instantiated only in `src/main/index.ts`. This makes testing straightforward and prevents layer boundary violations.
