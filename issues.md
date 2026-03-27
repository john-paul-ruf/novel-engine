# Novel Engine — Repo Evaluation Report

**Generated**: 2026-03-27
**Auditor**: Claude (automated evaluation)

## Summary

The codebase demonstrates strong stream isolation architecture. The `streamHandler.ts` factory provides a shared guard pattern with callId-based filtering, and all three chat-like stores use it consistently. The revision queue uses `sessionBelongsToCurrentPlan()` for cross-book isolation. The primary issues found are: `AdhocRevisionService`'s internal motif audit is invisible to the activity monitor, `pitchRoomStore` lacks stream listener lifecycle methods, chatStore's `onError` handler doesn't clean up temp messages, and DB event persistence failures are silently swallowed. No critical chat bleed bugs were found — the isolation model is fundamentally sound.

### Severity Legend
- 🔴 **Critical**: Active bug or data corruption risk. Fix immediately.
- 🟠 **High**: Likely to cause user-visible issues. Fix soon.
- 🟡 **Medium**: Code smell or architectural concern. Plan to address.
- 🟢 **Low**: Improvement opportunity. Nice to have.

---

## 1. Chat Bleed Findings

### 1.1 No `streamRouter` — Architecture Changed (Informational)
**Severity**: 🟢
**Location**: `src/renderer/stores/streamHandler.ts`
**Description**: The evaluation prompt references a `streamRouter` mutable global for routing events to `'main'`, `'modal'`, or `'pitch-room'` targets. This pattern does not exist in the codebase. Instead, all three stores (`chatStore`, `modalChatStore`, `pitchRoomStore`) independently register their own `onStreamEvent` listeners via `window.novelEngine.chat.onStreamEvent()`. Each receives ALL events broadcast on `chat:streamEvent`. Isolation is achieved via the shared `createStreamHandler()` factory in `streamHandler.ts`, which applies callId + optional conversationId guards per-store.
**Impact**: The deadlock risk described in the evaluation prompt (forgetting to reset `streamRouter.target` on error) does not apply to this architecture. This is a positive finding.

### 1.2 All Three Stores Receive Every Event — Potential Double-Processing
**Severity**: 🟡
**Location**: `src/renderer/stores/chatStore.ts:501`, `src/renderer/stores/modalChatStore.ts:251`, `src/renderer/stores/pitchRoomStore.ts` (no explicit listener init)
**Description**: `chatStore` and `modalChatStore` both register `onStreamEvent` listeners in `initStreamListener()`. `pitchRoomStore` has a `_handleStreamEvent` but never calls `initStreamListener` — it has no listener setup method. This means:
1. `chatStore` and `modalChatStore` both receive every `chat:streamEvent`.
2. `pitchRoomStore` does NOT receive events via its own listener — it likely relies on an external component calling `_handleStreamEvent` directly, or the component that hosts PitchRoom explicitly subscribes.

The `callId` guard in `streamHandler.ts` (line 73: `if (activeCallId && callId && callId !== activeCallId) return;`) prevents actual double-processing because each store tracks its own `_activeCallId`. Two stores will never have the same `_activeCallId` simultaneously because UUIDs are unique per `sendMessage` call.

However, if `chatStore` happens to have `_activeCallId === null` and `isStreaming === true` (recovery mode), the secondary guard (line 78-82) falls through to conversationId matching. A modal chat event could theoretically pass this guard if the chatStore's active conversation matches the modal's conversation (impossible in practice since modals use `voice-setup`/`author-profile` purposes, not pipeline conversations).
**Impact**: Negligible in practice. The guard logic is sufficient. No actual bleed.
**Fix**: Consider adding `pitchRoomStore.initStreamListener()` and `destroyStreamListener()` methods like the other two stores for consistency, or document why PitchRoom is different.

### 1.3 chatStore `alwaysCheckConversationId: false` — Intentional and Correct
**Severity**: 🟢
**Location**: `src/renderer/stores/chatStore.ts:353`
**Description**: chatStore sets `alwaysCheckConversationId: false`, meaning it does NOT reject events that mismatch the active conversation. The code comment explains this is intentional: "the user may switch conversations mid-stream, lifecycle events must still be processed. The callId guard is sufficient."

This is correct. The callId guard (UUID per send) is the primary isolation mechanism. A user switching conversations mid-stream should still see the `done` event processed so `isStreaming` resets. If conversationId were checked, switching conversations would leave the chat in a stuck streaming state.
**Impact**: None — this is correct behavior.

### 1.4 `rev:` Prefix Filter Prevents chatStore from Processing Revision Events ✅
**Severity**: 🟢
**Location**: `src/renderer/stores/streamHandler.ts:66`
**Description**: `createStreamHandler` skips events where `callId.startsWith('rev:')` on line 66. This prevents revision queue stream events (which are forwarded by `handlers.ts:705` with `callId: 'rev:${event.sessionId}'`) from being processed by chatStore, modalChatStore, or pitchRoomStore. Correct.
**Impact**: None — working as intended.

### 1.5 Verity Audit/Fix Events Use `audit:` and `fix:` Prefixes — Not Filtered by streamHandler
**Severity**: 🟡
**Location**: `src/main/ipc/handlers.ts:575`, `src/renderer/stores/streamHandler.ts:66`
**Description**: The `verity:auditChapter` and `verity:fixChapter` handlers generate callIds with `audit:${randomUUID()}` and `fix:${sessionId}` prefixes (lines 575, 588). The `streamHandler.ts` only filters the `rev:` prefix (line 66). Audit/fix events are NOT filtered out. However, this is correct in the auto-draft context: `autoDraftStore` explicitly calls `attachToExternalStream(auditCallId, conversationId)` which sets `chatStore._activeCallId` to the audit callId. The callId guard then correctly accepts audit events.

For standalone audit/fix calls (via the Verity pipeline UI), if the user is NOT in the auto-draft flow and hasn't attached to the stream, chatStore's `_activeCallId` will be null. If `isStreaming` is also false, the secondary guard (line 78-79: `if (!isStreaming) return;`) correctly drops the event.

Edge case: if the user manually triggers an audit while chatStore has `isStreaming: true` and `_activeCallId: null` (recovery mode), and the audit's conversationId matches chatStore's active conversation, the event would pass the recovery guard and contaminate chatStore. This requires: (1) a renderer refresh during an active stream, (2) the user immediately triggering an audit against the same conversation, (3) the audit event arriving before recovery completes. Extremely unlikely.
**Impact**: Negligible. The audit events are correctly handled in all practical scenarios.
**Fix**: Consider adding `audit:` and `fix:` to the prefix filter in `streamHandler.ts:66` for defense-in-depth:
```typescript
if (callId && (callId.startsWith('rev:') || callId.startsWith('audit:') || callId.startsWith('fix:') || callId.startsWith('motif-audit:'))) return;
```

### 1.6 `switchBook` Correctly Clears All State Including `_activeCallId` ✅
**Severity**: 🟢
**Location**: `src/renderer/stores/chatStore.ts:261-298`
**Description**: `switchBook()` aborts any active stream (line 274), then clears ALL state including `_activeCallId: null` (line 297). After clearing, it loads conversations for the new book and checks for an in-flight stream via `getActiveStreamForBook()`. If found, it restores `_activeCallId` from the active stream's `callId`. This correctly prevents late events from Book A's CLI from contaminating Book B's UI.
**Impact**: None — working correctly.

### 1.7 Conversation History Is Correctly Scoped ✅
**Severity**: 🟢
**Location**: `src/application/ChatService.ts:197`, `src/infrastructure/claude-cli/ClaudeCodeClient.ts:319`
**Description**: `ChatService.sendMessage()` calls `this.db.getMessages(conversationId)` (line 197) — scoped to the correct conversation. `buildConversationPrompt()` (line 319) concatenates only the messages passed to it — no cross-conversation leakage. The `activeStreams` Map in `StreamManager` is keyed by `conversationId`, preventing cross-conversation contamination. `abortStream()` also uses `conversationId` as the key.
**Impact**: None — clean implementation.

---

## 2. CLI Activity Monitor Coverage

### Coverage Matrix

| Surface | callId Injected | callStart Emitted | Events Broadcast | Visible in Monitor | Status |
|---------|:-:|:-:|:-:|:-:|--------|
| Main chat | ✅ | ✅ (via StreamManager) | ✅ (broadcastStreamEvent) | ✅ | OK |
| Modal chat (voice/author) | ✅ | ✅ (via StreamManager) | ✅ (broadcastStreamEvent) | ✅ | OK |
| Pitch room | ✅ | ✅ (via StreamManager) | ✅ (broadcastStreamEvent) | ✅ | OK |
| Auto-draft loop | ✅ (per iteration) | ✅ (via StreamManager) | ✅ (broadcastStreamEvent) | ✅ | OK |
| Hot take | ✅ | ✅ (via StreamManager) | ✅ (broadcastStreamEvent) | ✅ | OK |
| Ad hoc revision | ✅ | ✅ (via StreamManager) | ✅ (broadcastStreamEvent) | ✅ | OK |
| Revision sessions | ✅ (`rev:{sessionId}`) | ✅ (via RevisionQueueService emit) | ✅ (handlers.ts:705) | ✅ | OK |
| Revision verification | ✅ | ✅ (via StreamManager in ChatService) | ✅ (broadcastStreamEvent) | ✅ | OK |
| Plan loading (Wrangler) | ✅ (`rev:__plan-load__`) | ✅ (explicit `callStart` in RevisionQueueService:357) | ✅ (handlers.ts:705) | ✅ | OK |
| Verity audit/fix | ✅ (`audit:*`/`fix:*`) | ✅ (synthetic `emitVerityCallStart` in handlers.ts:567) | ✅ (broadcastVerityEvent) | ✅ | OK |
| Motif audit (Lumen) | ✅ (`motif-audit:*`) | ✅ (synthetic `emitVerityCallStart` in handlers.ts:619) | ✅ (broadcastVerityEvent) | ✅ | OK |
| AdhocRevision pre-step motif audit | ❌ | ❌ | ❌ | ❌ | **ISSUE** |

### 2.1 AdhocRevisionService Internal Motif Audit Is Invisible to Activity Monitor
**Severity**: 🟡
**Location**: `src/application/AdhocRevisionService.ts:52-58`
**Description**: `AdhocRevisionService.handleMessage()` calls `this.audit.runMotifAudit()` as a pre-step (line 52) before the main Forge call. This motif audit goes through `AuditService.runMotifAudit()` which calls `this.claude.sendMessage()` directly — NOT through `StreamManager`. This means no `callStart` event is emitted.

Standalone motif audits triggered via the `verity:runMotifAudit` IPC handler (handlers.ts:615-626) ARE visible because the handler creates a synthetic `callStart` via `emitVerityCallStart`. But the `AdhocRevisionService` path bypasses the IPC handler entirely — it calls `AuditService` directly as a service dependency.

The motif audit's stream events reach the renderer (via the parent's `onEvent` callback which chains to `broadcastStreamEvent`), but they lack a dedicated `callId` and there's no `callStart` for the activity monitor to create a `CliCall` entry.
**Impact**: During ad hoc revision, the motif audit pre-step (~5-30 seconds) is invisible in the CLI activity monitor. The user sees "Motif audit complete" status messages in the chat but can't track the Lumen CLI call's thinking, tool use, or progress in the activity panel.
**Fix**: Either (1) have `AdhocRevisionService` emit a synthetic `callStart` before calling `this.audit.runMotifAudit()`, or (2) have `AuditService.runMotifAudit()` emit `callStart`/`done` events internally so all callers benefit.

### 2.2 cliActivityStore Correctly Handles All callId Patterns ✅
**Severity**: 🟢
**Location**: `src/renderer/stores/cliActivityStore.ts:318-542`
**Description**: `handleStreamEvent` creates a new `CliCall` on `callStart` (line 324) regardless of callId pattern. For non-callStart events without a matching callId, it falls back to the most recently started active call (line 357-361). It handles `done` and `error` to mark calls inactive (lines 496-529). Completed calls are pruned via `pruneCompletedCalls` (MAX_COMPLETED_CALLS = 10). Tool use, thinking, progress stages, and filesChanged are all tracked.
**Impact**: The activity monitor has comprehensive coverage of all event types.

---

## 3. Areas of Improvement

### 3.1 chatStore `onError` Doesn't Clean Up Temp User Message
**Severity**: 🟡
**Category**: Error Handling
**Location**: `src/renderer/stores/chatStore.ts:463-485`
**Description**: In `sendMessage()`, a temp user message (id: `'temp-' + Date.now()`) is added optimistically at line 168. If the IPC call rejects (the `catch` block at line 187), the temp message IS correctly removed via `state.messages.filter(m => m.id !== tempMessage.id)` (line 198).

However, if the CLI stream emits an `error` event (a different path — the stream starts successfully but errors mid-stream), the `onError` handler (line 463) appends an error message to the message list but does NOT remove the temp user message. The temp message (with its `'temp-'` id prefix) persists alongside the real DB-saved version. On the next `setActiveConversation` call (which reloads from DB), the temp is replaced. But until then, the user sees a duplicate user message.

Additionally, the error message itself (id: `'error-' + Date.now()`) is not persisted to DB. It exists only in-memory. On refresh, it disappears — the user loses the error context.
**Impact**: On stream error: (1) temp user message persists as a visual duplicate until navigation, (2) error message is lost on refresh. Minor UX issues.
**Fix**: In `onError`, reload messages from DB (like `onDone` does), or at minimum filter out `'temp-'` prefixed messages from the state.

### 3.2 `pitchRoomStore` Missing Stream Listener Lifecycle Methods
**Severity**: 🟡
**Category**: Architecture
**Location**: `src/renderer/stores/pitchRoomStore.ts`
**Description**: Unlike `chatStore` (which has `initStreamListener()`/`destroyStreamListener()`) and `modalChatStore` (same), `pitchRoomStore` defines `_handleStreamEvent` but has no `initStreamListener()`, `destroyStreamListener()`, or `_cleanupListener` field. The store cannot self-manage its stream event subscription.

The PitchRoom component likely subscribes manually in a `useEffect`. But this inconsistency means:
1. If the component forgets to subscribe, streaming won't work in the Pitch Room
2. Cleanup on unmount must be handled in the component, not the store
3. The pattern doesn't match the other two stores, making it harder to maintain
**Impact**: If the PitchRoom component's subscription is missing or incorrect, stream events won't reach the store and the Pitch Room will show a stuck "streaming" state. The current code works if the component subscribes correctly, but the architecture is fragile.
**Fix**: Add `initStreamListener()`, `destroyStreamListener()`, and `_cleanupListener` to `pitchRoomStore`, matching the pattern in `chatStore` and `modalChatStore`.

### 3.3 EPIPE Guard Is Safe — `close` Handler Always Settles the Promise ✅
**Severity**: 🟢
**Category**: Error Handling
**Location**: `src/infrastructure/claude-cli/ClaudeCodeClient.ts:230-238`
**Description**: The `child.stdin.on('error')` handler silently returns on `EPIPE` or `ERR_STREAM_DESTROYED`. This is safe because the `child.on('close')` handler (line 260) always fires after the child process terminates, and it always calls `settle()` — either `resolve()` for exit code 0, or `reject()` for non-zero. The promise cannot hang.
**Impact**: None — correct behavior.

### 3.4 `cliActivityStore.recoverActiveStream` Handles Rapid Calls Correctly ✅
**Severity**: 🟢
**Category**: Race Condition
**Location**: `src/renderer/stores/cliActivityStore.ts:590-660`
**Description**: `recoverActiveStream()` uses `callId: 'recovered:${active.conversationId}'`. If called twice for the same stream, the second call overwrites the first (same callId key). The `callOrder` filter (line 620) deduplicates. The poll timer is cleared before creating a new one (line 625). No ghost entries or accumulated timers.
**Impact**: None — deduplication is correct.

### 3.5 `cliActivityStore` Growth Is Bounded ✅
**Severity**: 🟢
**Category**: Memory / Performance
**Location**: `src/renderer/stores/cliActivityStore.ts:123-124, 189-202`
**Description**: `MAX_COMPLETED_CALLS = 10` and `MAX_ENTRIES_PER_CALL = 500`. Completed calls beyond the limit are pruned. Active calls are never pruned (correct — you can't drop a running call). Each call's entries are capped. This provides adequate memory bounds for any realistic session.
**Impact**: No unbounded growth issue.

### 3.6 DB Event Persistence Failures Are Silently Swallowed
**Severity**: 🟡
**Category**: Error Handling
**Location**: `src/infrastructure/claude-cli/ClaudeCodeClient.ts:141-148`
**Description**: `wrappedOnEvent` catches DB persistence errors and logs only the first failure per session (line 144: `if (!persistErrorLogged)`). If the DB is locked or corrupted, ALL events for that stream session are lost from the `stream_events` table. The events are still forwarded to the UI (line 149: `params.onEvent(streamEvent)`), so the streaming UI continues working. But:
1. Stream event history is incomplete — orphan recovery won't have accurate event data
2. If this happens consistently (e.g., WAL corruption), the user has no visibility
3. The one-log-per-session approach prevents log spam but masks recurring failures
**Impact**: Stream events lost from DB during lock contention. UI is unaffected. Orphan recovery data is incomplete. Not user-visible unless they inspect the DB.
**Fix**: Consider emitting a diagnostic event (e.g., `{ type: 'status', message: 'Warning: stream events could not be persisted' }`) after N consecutive failures, or implementing a small retry buffer.

### 3.7 `buildConversationPrompt` Has No Explicit Size Guard
**Severity**: 🟢
**Category**: Memory / Performance
**Location**: `src/infrastructure/claude-cli/ClaudeCodeClient.ts:319-329`
**Description**: `buildConversationPrompt()` concatenates all messages into a single string with no size limit. The system prompt has a 500KB guard (line 183-189), but the conversation prompt (written to stdin) has no equivalent.

In practice, the `ContextBuilder` in `ChatService` compacts conversations before passing them to `claude.sendMessage()`, so message lists are already budget-constrained. Direct callers of `ClaudeCodeClient.sendMessage()` (like `AuditService`, `RevisionQueueService`) pass small message sets. No realistic path produces an oversized prompt.
**Impact**: Low — implicit bounds from upstream callers. A defensive warning log would be a nice-to-have.

### 3.8 `--add-dir` Is Unconditionally Set — Security Model Is Correct ✅
**Severity**: 🟢
**Category**: Security
**Location**: `src/infrastructure/claude-cli/ClaudeCodeClient.ts:163`
**Description**: `'--add-dir', this.booksDir` is pushed to `args` unconditionally on line 163, before the `cwd` calculation. This is correct:
- PitchRoomService sets `workingDir` to the pitch draft path, but `--add-dir` still grants access to the full books directory so Spark can scaffold new books under `{{BOOKS_PATH}}`.
- Auto-draft, revision queue, and ad hoc revision surfaces all benefit from `--add-dir` when their `--cwd` is scoped to a single book.
- No code path exists where `--add-dir` is skipped, overridden, or set to a narrower path.
**Impact**: Security model is correct. All CLI spawn paths include `--add-dir`.

### 3.9 System Prompt Size Guard Is Correct ✅
**Severity**: 🟢
**Category**: Security
**Location**: `src/infrastructure/claude-cli/ClaudeCodeClient.ts:183-189`
**Description**: A 500KB guard with a clear error message prevents oversized system prompts from hitting the OS `execve` argument size limit.
**Impact**: Correct safeguard. Handles the "corrupted 10MB agent file" scenario.

### 3.10 `child.stdin.write(conversationPrompt)` — No Injection Risk ✅
**Severity**: 🟢
**Category**: Security
**Location**: `src/infrastructure/claude-cli/ClaudeCodeClient.ts:310-311`
**Description**: The CLI treats stdin as message content only in `--print` mode. Previous assistant messages containing CLI-like sequences (e.g., `--model opus`) are part of the conversation context, not parsed as arguments. The `--system-prompt` is a separate CLI argument. No injection vector.
**Impact**: None.

### 3.11 `callId` Convention Is String-Based — Type Safety Opportunity
**Severity**: 🟢
**Category**: Architecture
**Location**: Various
**Description**: CallId patterns: UUID (main chat), `rev:*` (revision), `audit:*`, `fix:*`, `motif-audit:*`, `recovered:*`. The `streamHandler.ts` only filters `rev:`. Adding a new prefix requires updating the filter. A typed discriminator would be more robust, but the current convention works.
**Impact**: Maintainability concern only. Document the convention somewhere.

### 3.12 `activeStreams.delete()` Called in All Terminal Paths ✅
**Severity**: 🟢
**Category**: Code Smell
**Location**: `src/application/StreamManager.ts:137, 148, 219, 229`
**Description**: `activeStreams.delete(conversationId)` is called in:
- `done` event handler (line 137)
- `error` event handler (line 148)
- `cleanupAbortedStream()` (line 219)
- `cleanupErroredStream()` (line 229)

All terminal paths are covered. No leaked entries possible.
**Impact**: None — complete cleanup.

### 3.13 `modalChatStore.close()` Deferred Close Pattern Is Correct ✅
**Severity**: 🟢
**Category**: Race Condition
**Location**: `src/renderer/stores/modalChatStore.ts:90-97, 174-213`
**Description**: `close()` sets `_closeRequested: true` if streaming. The `onDone` and `onError` handlers check `_closeRequested` and include `isOpen: false` in the state update. The modal correctly closes when the stream completes or errors, even if the user clicked close during streaming.
**Impact**: None — pattern is clean.

### 3.14 Revision Queue Event Forwarding Preserves All Fields ✅
**Severity**: 🟢
**Category**: Code Smell
**Location**: `src/main/ipc/handlers.ts:703-709`
**Description**: The forwarding at line 705 spreads `event.event` (the raw StreamEvent) and adds `callId` and `conversationId`. All original fields from the StreamEvent are preserved via the spread operator. No fields are stripped.
**Impact**: None — complete field preservation.

### 3.15 `streamHandler.ts` Switch Statement Has No `default` Case — Intentional
**Severity**: 🟢
**Category**: Code Smell
**Location**: `src/renderer/stores/streamHandler.ts:92-141`
**Description**: The switch statement handles: `status`, `blockStart`, `thinkingDelta`, `textDelta`, `blockEnd`, `toolUse`, `progressStage`, `thinkingSummary`, `toolDuration`, `filesChanged`, `done`, `error`. Missing from the switch: `callStart` (only relevant to `cliActivityStore`). Unknown/new event types fall through silently. This is correct for forward compatibility — the chat stores don't need to handle all event types.
**Impact**: None — intentional design.

---

## 4. Positive Observations

1. **`createStreamHandler` factory is excellent architecture.** The shared guard logic in `streamHandler.ts` eliminates duplicated `_handleStreamEvent` code. Store-specific behavior is cleanly separated into callbacks (`onDone`, `onError`, `onBlockStart`). A bug fix in the guard logic propagates to all three stores automatically.

2. **`StreamManager` centralizes stream lifecycle.** The `startStream → accumulate → save → cleanup` pattern is owned by a single class. All five services (ChatService, PitchRoomService, HotTakeService, AdhocRevisionService, and RevisionQueueService) use it consistently. This eliminates the class of bugs where one service forgets to save the assistant message or clean up the active stream entry.

3. **callId-per-send is the right isolation primitive.** UUIDs generated per `sendMessage` call provide hermetic isolation without a mutable global router. Multiple concurrent streams (auto-draft for Book A, main chat for Book B, revision queue for Book C) can run simultaneously without interference.

4. **`broadcastStreamEvent` to ALL windows is correct.** Broadcasting to all `BrowserWindow` instances (not just `event.sender`) ensures that a renderer refresh (Cmd+R) doesn't lose stream events. The fresh page's listener immediately receives events from the still-running CLI process.

5. **Three-tier recovery model is well-designed.** (1) Primary: callId guard matches events to the originating call. (2) Secondary: recovery mode allows events through when `_activeCallId` is null but `isStreaming` is true. (3) Tertiary: poll fallback (every 2s) catches missed `done` events during the brief reload gap.

6. **`pruneCompletedCalls` prevents unbounded memory growth** in the activity monitor. `MAX_COMPLETED_CALLS = 10` and `MAX_ENTRIES_PER_CALL = 500` provide practical bounds without losing useful history.

7. **Synthetic `emitVerityCallStart` for audit/fix/motif-audit calls** ensures these IPC-initiated CLI calls (which bypass `StreamManager`) still appear in the activity monitor. This was a deliberate design choice that shows attention to monitoring completeness.

8. **`sessionBelongsToCurrentPlan()` guard in `useRevisionQueueEvents`** prevents cross-book revision event contamination. Each event is checked against the currently-loaded plan's session list before being applied to store state.

9. **`switchBook()` aborts the active stream** before clearing state. This prevents the old book's CLI call from continuing to consume tokens and write files in the background — a genuine resource waste issue that was proactively addressed.

10. **Per-book auto-draft sessions** in `autoDraftStore` (keyed by `bookSlug`) allow concurrent auto-draft loops for different books. Each generates its own `callId` per iteration, providing complete stream isolation. The `attachToExternalStream` pattern elegantly connects the auto-draft's CLI calls to chatStore's UI without coupling the two stores.
