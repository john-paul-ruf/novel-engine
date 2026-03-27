# Issue Fixes — State Tracker (r003)

> Generated from `issues.md` on 2026-03-27.
> This file tracks progress across all fix prompts.
> Updated by the agent at the end of each prompt execution.

---

## Source

Issues evaluated from: `issues.md`
Evaluation date: 2026-03-27
Total findings: 30
Prompts generated: 8

---

## Status Key

- `pending` — Not started
- `in-progress` — Started but not verified
- `done` — Completed and verified
- `blocked` — Cannot proceed (see notes)
- `skipped` — Intentionally skipped (see notes)
- `deferred` — Moved to next revision (see notes)

---

## Prompt Status

| # | Prompt | Severity | Status | Completed | Notes |
|---|--------|----------|--------|-----------|-------|
| 1 | FIX-01 — switchBook() Aborts Background Streams | 🔴 Critical | done | 2026-03-27 | Added `_streamOrigin` discriminator. Guard only aborts 'self' streams. All 10 reset points updated. |
| 2 | FIX-02 — Auto-Draft Audit/Fix Failure Should Pause Loop | 🟠 High | done | 2026-03-27 | Added `skippedAudits` tracking + pause-on-failure. Uses existing pause/resume mechanism. |
| 3 | FIX-03 — lastDiagnostics Singleton Race | 🟠 High | done | 2026-03-27 | Replaced singleton with Map<conversationId, ContextDiagnostics> + pruning. Updated interface, handler, preload, and renderer caller. |
| 4 | FIX-04 — lastChangedFiles Singleton Race in StreamManager | 🟠 High | done | 2026-03-27 | Eliminated singleton. Per-stream changedFiles via closure. sendMessage returns { changedFiles }. adhoc-revision captures from stream events. |
| 5 | FIX-05 — PitchRoomStore Listener Lifecycle | 🟡 Medium | done | 2026-03-27 | Added initStreamListener/destroyStreamListener to pitchRoomStore. Moved from PitchRoomView useEffect to AppLayout StreamManager component. |
| 6 | FIX-06 — EPIPE Guard Diagnostic Logging | 🟡 Medium | done | 2026-03-27 | Added stdinBytes + writableFinished/writableEnded to EPIPE warning. No behavioral change. |
| 7 | FIX-07 — Type-Safe Stream Event Source Discriminator | 🟡 Medium | done | 2026-03-27 | Added StreamEventSource type. Injected source in all IPC broadcast sites. streamHandler uses source='revision' as primary guard with prefix fallback. |
| 8 | FIX-08 — Batch Stream Event DB Persistence | 🟡 Medium | done | 2026-03-27 | Added persistStreamEventBatch with transaction. Batching in wrappedOnEvent: 100ms timer, max 20 events, critical flush. flushBatch on close. |

---

## Dependency Graph

```
FIX-01 (🔴 Critical)  ──── independent
FIX-02 (🟠 High)      ──── independent
FIX-03 (🟠 High)      ──── independent
FIX-04 (🟠 High)      ──── independent
FIX-05 (🟡 Medium)    ──── independent
FIX-06 (🟡 Medium)    ──── independent
FIX-07 (🟡 Medium)    ──── independent
FIX-08 (🟡 Medium)    ──── depends on FIX-06
```

- FIX-01 through FIX-07 are all independent and can be executed in any order.
- FIX-08 depends on FIX-06 because both modify `ClaudeCodeClient.ts` — FIX-06 enhances the EPIPE handler in the same file area where FIX-08 restructures the `wrappedOnEvent` callback.
- Within same severity, execution order follows prompt numbering.

---

## Findings Not Addressed

| Issues.md Ref | Title | Reason |
|---------------|-------|--------|
| 1.1 | No streamRouter — Architecture Evolved | ✅ Architecture is cleaner than expected. No action needed. |
| 1.2 | All Three Chat Stores Correctly Filter on callId | ✅ Correct. No action needed. |
| 1.3 | All Stores Reset _activeCallId on Done and Error | ✅ Correct. No action needed. |
| 1.4 | Event Production — All CLI Surfaces Inject callId | ✅ Correct and consistent. No action needed. |
| 1.5 | Revision Queue Events Correctly Forwarded | ✅ Correct. No action needed. |
| 1.6 | cliActivityStore Correctly Processes ALL Events | ✅ Correct. No action needed. |
| 1.7 | Conversation History Is Scoped by conversationId | ✅ Correct. No action needed. |
| 2.2 | Auto-Draft Uses Independent IPC Calls | ✅ Correct design. No action needed. |
| 2.3 | Auto-Draft State Is Per-Book | ✅ Correct. No action needed. |
| 2.4 | isViewingBook() Used Only for Optional UI Updates | ✅ Correct. No action needed. |
| 2.5 | Revision Queue Survives Book Switch | ✅ Well-designed. No action needed. |
| 2.6 | Stream Event Routing After Book Switch — Recovery Path | 🟡 Self-correcting on next auto-draft iteration. Minor UI glitch. |
| 3.2 | Motif Audit Failure Is Silently Caught | ✅ Acceptable — periodic, non-critical. |
| 3.3 | stopRequested Is Checked Between Passes | ✅ Correct. No action needed. |
| 3.4 | stop() Sets stopRequested AND Aborts CLI | ✅ Correct. No action needed. |
| 3.5 | Error Recovery Retries Same Chapter | ✅ Correct. No action needed. |
| 3.6 | _resumeResolve Leak on Store Destruction | 🟡 Benign — Zustand stores persist for app lifetime. |
| 4.1 | ContextBuilder / Wrangler Calls Are Not CLI Calls | N/A — not a CLI call. No action needed. |
| 4.2 | Activity Monitor Has Pruning | ✅ Bounded growth. No action needed. |
| 4.3 | Recovery Creates recovered: Prefixed CallId | ✅ Correct. No action needed. |
| 5.6 | System Prompt Size Guard | ✅ Good defensive coding. No action needed. |
| 5.7 | --add-dir Is Unconditionally Set | ✅ Correct. No action needed. |
| 5.10 | Modal Close During Stream — Deferred Close | ✅ Correct. No action needed. |
| 5.11 | buildConversationPrompt — No Injection Risk | ✅ Not a real injection risk. No action needed. |

---

## Handoff Notes

> Agents write freeform notes here after each prompt to communicate context to the next run.

### Last completed prompt: FIX-08 (all done)

### Observations:
- FIX-01: chatStore had 7 distinct places that reset `_activeCallId: null` — all now also reset `_streamOrigin: null`. Recovered streams stay `_streamOrigin: null` (intentional — not `'self'`, so won't be aborted).
- FIX-02: The `skippedAudits` array persists for the session lifetime so the user can review which chapters need manual audit after the run.
- FIX-03: Fallback in `getLastDiagnostics()` iterates the Map for backwards compat when no conversationId is passed.
- FIX-04: The adhoc-revision handler captures `filesChanged` from stream events directly rather than from a return value, since `sendMessage()` is fire-and-forget there.
- FIX-05: pitchRoomStore's `initStreamListener` has an early-return guard (`if (_cleanupListener) return`) to prevent double-registration.
- FIX-06: Only diagnostic logging change — no behavioral impact.
- FIX-07: Backwards-compatible: `source` is optional, the `rev:` prefix fallback guard remains.
- FIX-08: Critical events flush immediately; delta events batch. The `close` handler flushes first to prevent event loss.

### Warnings:
