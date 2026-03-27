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
| 1 | FIX-01 — switchBook() Aborts Background Streams | 🔴 Critical | pending | | |
| 2 | FIX-02 — Auto-Draft Audit/Fix Failure Should Pause Loop | 🟠 High | pending | | |
| 3 | FIX-03 — lastDiagnostics Singleton Race | 🟠 High | pending | | |
| 4 | FIX-04 — lastChangedFiles Singleton Race in StreamManager | 🟠 High | pending | | |
| 5 | FIX-05 — PitchRoomStore Listener Lifecycle | 🟡 Medium | pending | | |
| 6 | FIX-06 — EPIPE Guard Diagnostic Logging | 🟡 Medium | pending | | |
| 7 | FIX-07 — Type-Safe Stream Event Source Discriminator | 🟡 Medium | pending | | |
| 8 | FIX-08 — Batch Stream Event DB Persistence | 🟡 Medium | pending | | |

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

### Last completed prompt: (none yet)

### Observations:

### Warnings:
