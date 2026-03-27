# Novel Engine — Repo Evaluation Report

**Generated**: 2026-03-27
**Auditor**: Claude (automated evaluation)

## Summary

The codebase demonstrates strong isolation between CLI call surfaces. The `callId`-per-send pattern is consistently applied across main chat, modal chat, pitch room, hot take, ad hoc revision, auto-draft, and revision queue. The activity monitor has good coverage but missing `conversationId` on forwarded revision events creates a minor gap. The most significant findings are: (1) no `streamRouter` exists — the original architecture evolved into a callId-only guard system that's actually more robust, (2) revision queue event forwarding strips `conversationId`, and (3) the `cliActivityStore` recovery path can create duplicate polling intervals on rapid navigation.

### Severity Legend
- 🔴 **Critical**: Active bug or data corruption risk. Fix immediately.
- 🟠 **High**: Likely to cause user-visible issues. Fix soon.
- 🟡 **Medium**: Code smell or architectural concern. Plan to address.
- 🟢 **Low**: Improvement opportunity. Nice to have.

---

## 1. Chat Bleed Findings

### 1.1 No streamRouter exists — callId-only isolation
**Severity**: 🟢 **Low** (informational — this is a positive observation)
**Location**: All renderer stores
**Description**: The evaluation prompt references a `streamRouter.ts` with a `streamRouter.target` mechanism. This file does not exist in the codebase. Instead, the architecture uses a **callId-only guard** pattern: each store generates a `crypto.randomUUID()` per send call, passes it to the IPC layer, and filters incoming events by comparing `enriched.callId` against `_activeCallId`. This is actually a stronger isolation model — there's no shared mutable global to manage or accidentally forget to reset.
**Impact**: None — the current design is correct.
**Fix**: None needed. The evaluation prompt's streamRouter references are outdated.

### 1.2 Revision event forwarding strips conversationId
**Severity**: 🟡 **Medium**
**Location**: `src/main/ipc/handlers.ts:693`
**Description**: When forwarding `session:streamEvent` from the revision queue to `chat:streamEvent`, the handler spreads `event.event` and adds `callId: rev:${event.sessionId}`. However, `event.event` is a raw `StreamEvent` which does NOT contain a `conversationId` field. The `conversationId` from the revision session is not injected.
**Evidence**:
```typescript
// handlers.ts:693
win.webContents.send('chat:streamEvent', { ...event.event, callId: `rev:${event.sessionId}` });
// Missing: conversationId is not added to the forwarded event
```
**Impact**: The `cliActivityStore` creates `CliCall` entries with an empty `conversationId` for revision queue calls (line 328: `event.conversationId ?? ''`). This means abort via the activity monitor would fail for revision sessions since `chat:abort` requires a valid conversationId. The `chatStore`, `modalChatStore`, and `pitchRoomStore` all correctly filter these out via `callId.startsWith('rev:')`, so there's no bleed — just a gap in the activity monitor's ability to abort revision calls.
**Fix**: Include `conversationId` from the revision session when forwarding. The `session:streamEvent` event type in `RevisionQueueEvent` should carry `conversationId`, or the handler should look it up from the active plan's session state.

### 1.3 chatStore sendMessage error path doesn't clear _activeCallId
**Severity**: 🟡 **Medium**
**Location**: `src/renderer/stores/chatStore.ts:186-204`
**Description**: In `chatStore.sendMessage`, when the `window.novelEngine.chat.send()` IPC call itself throws (e.g., IPC channel not available, renderer crash), the catch block resets `isStreaming`, `streamBuffer`, and `thinkingBuffer` but does **not** clear `_activeCallId`.
**Evidence**:
```typescript
// chatStore.ts:196-203
set((state) => ({
  messages: [...state.messages, errorMessage],
  isStreaming: false,
  isThinking: false,
  streamBuffer: '',
  thinkingBuffer: '',
  toolActivity: [],
  // Missing: _activeCallId: null
}));
```
**Impact**: After a send failure, `_activeCallId` retains the stale UUID. Since `isStreaming` is also false, the secondary guard (`if (!_activeCallId) { if (!isStreaming) return; }`) rejects all incoming events, which is actually correct behavior. The next `sendMessage` call overwrites `_activeCallId` anyway. This is a benign leak, but unclean.
**Fix**: Add `_activeCallId: null` to the catch block's `set()` call.

### 1.4 pitchRoomStore and modalChatStore error paths don't clear _activeCallId
**Severity**: 🟡 **Medium**
**Location**: `src/renderer/stores/pitchRoomStore.ts:190-197`, `src/renderer/stores/modalChatStore.ts:134-141`
**Description**: Same issue as 1.3 — the catch block in `sendMessage` resets streaming state but not `_activeCallId`.
**Evidence**:
```typescript
// pitchRoomStore.ts:190-196
set((state) => ({
  messages: [...state.messages, errorMessage],
  isStreaming: false,
  isThinking: false,
  streamBuffer: '',
  thinkingBuffer: '',
  // Missing: _activeCallId: null
}));
```
**Impact**: Same benign leak as 1.3.
**Fix**: Add `_activeCallId: null` to both stores' catch blocks.

### 1.5 switchBook clears _activeCallId but doesn't abort the active CLI stream
**Severity**: 🟡 **Medium**
**Location**: `src/renderer/stores/chatStore.ts:259-327`
**Description**: `switchBook()` sets `_activeCallId: null` and `isStreaming: false`, which correctly stops the UI from rendering events from the old book. However, it does NOT call `window.novelEngine.chat.abort()` on the old conversation's stream. The CLI process continues running in the background, consuming tokens and potentially writing files to the old book.
**Evidence**:
```typescript
// chatStore.ts:268-285
set({
  activeConversation: null,
  // ... all state cleared
  isStreaming: false,
  _activeCallId: null,
});
// No abort call for the old book's active stream
```
**Impact**: The old stream runs to completion silently. Token costs are incurred, files may be written. When the stream completes, the `done` event arrives but is filtered out by the callId guard (since `_activeCallId` is now null or belongs to the new book). The `StreamManager` in the main process correctly saves the response and records usage, so no data is lost — but the user may not realize a background stream is still running.
**Fix**: This may be intentional — the user likely wants the stream to finish (they started it). The recovery logic in Step 4 of `switchBook` handles re-attachment when switching back. If abort is desired, add `window.novelEngine.chat.abort(oldConversationId)` before clearing state.

### 1.6 Cross-book conversation history is correctly scoped
**Severity**: 🟢 **Low** (positive observation)
**Location**: `src/application/ChatService.ts:197`, `src/infrastructure/claude-cli/ClaudeCodeClient.ts:301`
**Description**: Messages are loaded by `conversationId` (`this.db.getMessages(conversationId)`), and conversations are scoped to books via `bookSlug`. The `buildConversationPrompt` method operates only on the messages array passed to it — no global state. The `activeStreams` map in `StreamManager` is keyed by `conversationId`, which is unique per conversation. No cross-conversation contamination is possible.
**Impact**: None — correctly implemented.

---

## 2. CLI Activity Monitor Coverage

### Coverage Matrix

| Surface | callId Injected | callStart Emitted | Events Broadcast | Visible in Monitor | Status |
|---------|:-:|:-:|:-:|:-:|--------|
| Main chat | ✅ | ✅ (via StreamManager) | ✅ (broadcastStreamEvent) | ✅ | OK |
| Modal chat | ✅ | ✅ (via StreamManager) | ✅ (broadcastStreamEvent) | ✅ | OK |
| Pitch room | ✅ | ✅ (via StreamManager) | ✅ (broadcastStreamEvent) | ✅ | OK |
| Auto-draft | ✅ (per iteration) | ✅ (via StreamManager) | ✅ (broadcastStreamEvent) | ✅ | OK |
| Hot take | ✅ | ✅ (via StreamManager) | ✅ (broadcastStreamEvent) | ✅ | OK |
| Ad hoc revision | ✅ | ✅ (via StreamManager) | ✅ (broadcastStreamEvent) | ✅ | OK |
| Revision sessions | ✅ (`rev:{sessionId}`) | ✅ (via session:streamEvent → callStart forwarding) | ✅ (forwarded to chat:streamEvent) | ✅ | OK |
| Revision verification | ✅ | ✅ (goes through chat:send → StreamManager) | ✅ | ✅ | OK |
| Plan loading (Wrangler) | ✅ (`rev:__plan-load__`) | ✅ (explicit emit in RevisionQueueService:359) | ✅ (forwarded via session:streamEvent) | ✅ | OK |
| Verity audit (auto-draft) | ✅ (renderer-provided callId) | ⚠️ Depends on AuditService impl | ✅ (via broadcastVerityEvent) | ⚠️ PARTIAL | ISSUE |
| Verity fix (auto-draft) | ✅ (renderer-provided callId) | ⚠️ Depends on AuditService impl | ✅ (via broadcastVerityEvent) | ⚠️ PARTIAL | ISSUE |
| Motif audit | ✅ (renderer-provided callId) | ⚠️ Depends on AuditService impl | ✅ (via broadcastVerityEvent) | ⚠️ PARTIAL | ISSUE |
| Context Wrangler (sendOneShot) | N/A | N/A | N/A | N/A | N/A — not implemented |

### 2.1 Verity audit/fix and motif audit calls may lack callStart events
**Severity**: 🟡 **Medium**
**Location**: `src/main/ipc/handlers.ts:553-614` (broadcastVerityEvent)
**Description**: The `broadcastVerityEvent` helper forwards all stream events from audit/fix/motif-audit calls to `chat:streamEvent`. The `callStart` event that creates a new `CliCall` entry in the activity monitor is normally emitted by `StreamManager.startStream()` (line 82 of StreamManager.ts). If the `AuditService` calls `claude.sendMessage()` directly without `StreamManager`, no `callStart` is emitted. The `ClaudeCodeClient.processStreamEvent()` does NOT emit `callStart` — that responsibility belongs to `StreamManager`.

The `cliActivityStore` handles this gracefully via its fallback (lines 348-376): if no call exists for a callId, non-`callStart` events either fall back to the most recently active call or (for `status` events) create a default call with "Wrangler" as the agent name and "Unknown" as the model.
**Impact**: Audit/fix calls may appear in the activity monitor with incorrect metadata (wrong agent name and model) or may be attributed to whichever call happens to be most recently active. Not a data corruption issue, but confusing UX.
**Fix**: Have the AuditService use `StreamManager` for its CLI calls, or manually emit a `callStart` event before the first stream event reaches `broadcastVerityEvent`.

### 2.2 sendOneShot does not exist — Context Wrangler is synchronous
**Severity**: 🟢 **Low** (informational)
**Location**: `src/application/ContextBuilder.ts`
**Description**: The evaluation prompt asks about `sendOneShot` for the Wrangler/ContextBuilder. This method does not exist in the codebase. The `ContextBuilder` is a pure synchronous class that builds context using token estimation and string manipulation — no CLI calls. The Wrangler pattern described in the architecture (two-call pattern) was replaced with a single-call pattern using the `ContextBuilder`. The only CLI call that performs "wrangling" is `RevisionQueueService.loadPlan()` which calls the Wrangler agent to parse revision plans, and that IS tracked via `session:streamEvent` forwarding.
**Impact**: None — the concern is moot.

---

## 3. Areas of Improvement

### 3.1 Optimistic message not cleaned up on send error
**Severity**: 🟠 **High**
**Category**: Race Condition
**Location**: `src/renderer/stores/chatStore.ts:157-204`
**Description**: `sendMessage` adds a temporary user message (id: `'temp-' + Date.now()`) optimistically before the IPC call. If the IPC call throws, the catch block adds an error message but does NOT remove the temporary user message. The user sees both: their original message and an error, which looks correct at first.

The real issue: `ChatService.sendMessage()` saves the user message to DB (`this.db.saveMessage()` at line 134 of ChatService.ts) BEFORE spawning the CLI. So if the CLI spawn fails, the user message IS persisted in DB but the temp message in the UI has a different ID (`temp-*` vs the DB's nanoid). When the next `done` handler reloads messages from DB, or on refresh, the temp message disappears and the real DB record appears — causing a visual "flash" or apparent message duplication.
**Evidence**:
```typescript
// chatStore.ts:158-165 — temp message added
const tempMessage: Message = {
  id: 'temp-' + Date.now(),  // Not a real DB id
  // ...
};
// chatStore.ts:186-204 — catch adds error but doesn't remove temp
```
**Impact**: After a send error, the message list shows: `[temp user msg] + [error msg]`. On next successful interaction, messages reload from DB, replacing temp with the real one. Minor UX inconsistency.
**Fix**: In the error catch, filter out the temp message:
```typescript
set((state) => ({
  messages: [...state.messages.filter(m => m.id !== tempMessage.id), errorMessage],
  isStreaming: false,
  _activeCallId: null,
  // ...
}));
```

### 3.2 Modal close during stream returns early — minor UX friction
**Severity**: 🟢 **Low**
**Category**: Race Condition
**Location**: `src/renderer/stores/modalChatStore.ts:85-89`
**Description**: `close()` checks `isStreaming` and returns early if true, preventing the user from closing the modal during an active stream. When the stream completes via `done`, `isStreaming` is set to false but `isOpen` is NOT set to false. The user must click close again.
**Evidence**:
```typescript
// modalChatStore.ts:85-89
close: () => {
  const { isStreaming } = get();
  if (isStreaming) return;  // Returns silently
  set({ isOpen: false });
},
```
**Impact**: If user tries to close during streaming, the close button appears unresponsive. After the stream finishes, they have to click again.
**Fix**: Add a `_closeRequested` flag. If set, auto-close when `done` or `error` arrives.

### 3.3 cliActivityStore recovery creates duplicate polling intervals
**Severity**: 🟡 **Medium**
**Category**: Race Condition / Memory
**Location**: `src/renderer/stores/cliActivityStore.ts:617-637`
**Description**: `recoverActiveStream()` creates a polling interval to detect stream completion. If called multiple times (e.g., rapid view switches that each trigger recovery), each call creates a new `setInterval`. Previous intervals are NOT cleaned up. The 10-minute safety timeout is per-interval.
**Evidence**:
```typescript
// cliActivityStore.ts:617-634
const pollTimer = setInterval(async () => { ... }, 2000);
// No cleanup of previous pollTimer if recoverActiveStream is called again
setTimeout(() => clearInterval(pollTimer), 10 * 60 * 1000);
```
**Impact**: After N rapid navigations, N concurrent poll intervals run simultaneously, each hitting `getActiveStream()` every 2 seconds. Not a crash risk but creates unnecessary IPC traffic.
**Fix**: Store the poll timer reference in a module-level variable (like chatStore's `_recoveryPollTimer`) and clear it before starting a new one:
```typescript
let _activityRecoveryPollTimer: ReturnType<typeof setInterval> | null = null;
// In recoverActiveStream():
if (_activityRecoveryPollTimer) clearInterval(_activityRecoveryPollTimer);
_activityRecoveryPollTimer = setInterval(...);
```

### 3.4 EPIPE guard on stdin silently swallows errors without logging
**Severity**: 🟡 **Medium**
**Category**: Error Handling
**Location**: `src/infrastructure/claude-cli/ClaudeCodeClient.ts:213-220`
**Description**: The `child.stdin.on('error')` handler silently returns for `EPIPE` and `ERR_STREAM_DESTROYED`. These indicate the CLI process exited before stdin was fully written. In most cases, the `close` event fires with a non-zero code and emits an error. But there's zero logging for the EPIPE case.
**Evidence**:
```typescript
// ClaudeCodeClient.ts:213-216
child.stdin.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') {
    return; // Silently swallowed — no log
  }
```
**Impact**: Debugging CLI startup failures is harder when EPIPE events leave no trace.
**Fix**: Add `console.warn('[ClaudeCodeClient] stdin EPIPE — CLI process may have exited early');`.

### 3.5 wrappedOnEvent catches all DB persistence errors silently
**Severity**: 🟡 **Medium**
**Category**: Error Handling
**Location**: `src/infrastructure/claude-cli/ClaudeCodeClient.ts:131-143`
**Description**: Every stream event is persisted to SQLite. If the DB write fails (disk full, locked), the error is silently caught. If the DB is in a degraded state, EVERY event fails with zero diagnostics.
**Evidence**:
```typescript
// ClaudeCodeClient.ts:131-143
try {
  this.db.persistStreamEvent({ ... });
} catch {
  // Event persistence is best-effort — don't fail the stream
}
```
**Impact**: Complete loss of stream event history with no indication to the user.
**Fix**: Log the first failure per stream session, then suppress duplicates:
```typescript
let persistErrorLogged = false;
// In catch:
if (!persistErrorLogged) {
  console.error('[ClaudeCodeClient] Stream event persistence failed:', err);
  persistErrorLogged = true;
}
```

### 3.6 Three stores with near-identical _handleStreamEvent
**Severity**: 🟡 **Medium**
**Category**: Architecture / Code Smell
**Location**: `src/renderer/stores/chatStore.ts:329-530`, `src/renderer/stores/modalChatStore.ts:144-248`, `src/renderer/stores/pitchRoomStore.ts:200-318`
**Description**: All three stores duplicate the same event handling logic: callId guard → `rev:` prefix filter → event type switch → buffer accumulation → done/error cleanup. Findings 1.3 and 1.4 (missing `_activeCallId` cleanup) affect all three identically, demonstrating the maintenance burden.
**Impact**: Bug fixes and new event types must be replicated three times.
**Fix**: Extract a shared `createStreamHandler()` utility that accepts store-specific callbacks for done (message reload) and error (message creation), but handles common guards, buffer accumulation, and cleanup in one place.

### 3.7 callId convention uses string prefixes instead of typed discriminators
**Severity**: 🟢 **Low**
**Category**: Architecture
**Location**: Multiple stores and `src/main/ipc/handlers.ts:693`
**Description**: CallId uses string conventions: plain UUIDs for main chat, `rev:{sessionId}` for revision, `audit:{uuid}` for audits, `fix:{uuid}` for fixes, `motif-audit:{uuid}` for motif audits, `recovered:{conversationId}` for recovery, and `__plan-load__` for plan loading. The `chatStore` filters via `callId.startsWith('rev:')`. Adding a new prefix requires updating every filter.
**Impact**: Low — the convention is simple and works. Fragile if new surfaces are added without updating all filters.
**Fix**: Consider adding a `callSource` field to the enriched event type rather than encoding it in the callId string.

### 3.8 --add-dir exposes entire booksDir, not just the active book
**Severity**: 🟡 **Medium**
**Category**: Security
**Location**: `src/infrastructure/claude-cli/ClaudeCodeClient.ts:157`
**Description**: The CLI is spawned with `--add-dir` pointing to `this.booksDir` (the parent directory containing ALL books), not the specific book's directory. Combined with file operation tools, an agent could theoretically read or modify another book's files.
**Evidence**:
```typescript
// ClaudeCodeClient.ts:157
'--add-dir', this.booksDir,
```
**Impact**: Cross-book file access is possible. Risk is low since users control prompts and agents use fixed system prompts, but it violates least privilege.
**Fix**: Use `--add-dir` with the specific book path. If shared resources (custom-agents, author-profile.md) are needed, add them as separate `--add-dir` entries.

### 3.9 Auto-draft audit/fix calls share conversationId with drafting conversation
**Severity**: 🟡 **Medium**
**Category**: Architecture
**Location**: `src/renderer/stores/autoDraftStore.ts:361-365`
**Description**: The auto-draft loop passes the drafting `conversationId` to `verity.auditChapter()` and `verity.fixChapter()`. Audit/fix messages are saved to the same conversation as draft messages, creating an interleaved history.
**Evidence**:
```typescript
// autoDraftStore.ts:362-365
const auditResult = await window.novelEngine.verity.auditChapter(
  bookSlug, newChapterSlug,
  { callId: auditCallId, conversationId }, // conversationId = drafting conversation
);
```
**Impact**: Confusing conversation history that mixes drafting with auditing. Not a data corruption issue.
**Fix**: Either create separate conversations for audit/fix, or accept this as intentional (audit/fix is part of the drafting workflow and contextually useful).

### 3.10 activeStreams cleanup verified — all terminal paths covered
**Severity**: 🟢 **Low** (positive observation)
**Category**: Code Verification
**Location**: `src/application/StreamManager.ts:117-149`
**Description**: Verified that `activeStreams.delete(conversationId)` is called in all three terminal paths:
- `done` event: line 137
- `error` event: line 148
- Abort: `cleanupAbortedStream()` at line 219

Additionally, `cleanupErroredStream()` (line 228) handles the catch block in `ChatService.sendMessage()`. No leaked entries are possible.

### 3.11 System prompt size has no explicit guard
**Severity**: 🟢 **Low**
**Category**: Security
**Location**: `src/infrastructure/claude-cli/ClaudeCodeClient.ts:155`
**Description**: The system prompt is passed via `--system-prompt` as a CLI argument with no size check. An extremely large agent `.md` file could cause spawn failure with `E2BIG`.
**Impact**: The CLI would fail to spawn, the error handler would fire, and the user sees an error. Not a crash but an unhelpful error message.
**Fix**: Add a size check:
```typescript
if (systemPrompt.length > 1_000_000) {
  onEvent({ type: 'error', message: 'System prompt exceeds 1MB limit' });
  return;
}
```

---

## 4. Positive Observations

- **callId-per-send isolation is robust**: Every surface generates a unique `callId` per CLI call and injects it into all broadcast events. The callId guard in each store is the primary filter. This is stronger than the `streamRouter.target` approach described in the evaluation prompt — there's no shared mutable global to manage or forget to reset.

- **Broadcast-to-all-windows pattern is correct**: `broadcastStreamEvent` iterates `BrowserWindow.getAllWindows()` instead of `event.sender.send()`. This ensures renderer refreshes continue receiving events. Try/catch around each send handles closing windows gracefully.

- **Recovery after renderer refresh is well-implemented**: Both `chatStore.recoverActiveStream()` and `cliActivityStore.recoverActiveStream()` query the main process for active streams, restore UI state, and start polling fallbacks. The `_recoveryPollTimer` cleanup in `chatStore` is properly managed via a module-level variable with `clearRecoveryPoll()`.

- **StreamManager centralizes stream lifecycle**: `StreamManager.startStream()` handles the repetitive register → accumulate → save → cleanup pattern. It emits `callStart` on every start, ensuring consistent activity monitor coverage. The `activeStreams` map is cleaned up on all terminal paths.

- **Revision queue event isolation**: `useRevisionQueueEvents` uses `sessionBelongsToCurrentPlan()` to scope events to the active plan, preventing cross-book revision bleed.

- **Auto-draft per-book sessions**: The `autoDraftStore` uses a `sessions` record keyed by `bookSlug`, supporting concurrent auto-draft loops. Each iteration generates its own callId. `attachToExternalStream` correctly connects the chatStore only when the user is watching.

- **Completed call pruning**: `MAX_COMPLETED_CALLS = 10` with `pruneCompletedCalls()` prevents unbounded growth in the activity store. `MAX_ENTRIES_PER_CALL = 500` caps per-call memory.

- **`rev:` prefix filter is consistently applied**: All three consuming stores filter out `rev:*` events first. The `cliActivityStore` does NOT filter these, correctly tracking all calls.

- **switchBook recovery is thorough**: After clearing state, `switchBook` checks for an active stream on the new book and restores streaming UI state, including callId for proper event scoping. The conversation list is loaded and the most recent conversation is auto-selected.
