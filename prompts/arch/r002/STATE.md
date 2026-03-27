# Issue Fixes — State Tracker (r002)

> Generated from `issues.md` on 2026-03-27.
> This file tracks progress across all fix prompts.
> Updated by the agent at the end of each prompt execution.

---

## Source

Issues evaluated from: `issues.md`
Evaluation date: 2026-03-27
Total findings: 19 (11 actionable, 4 positive observations, 4 informational/by-design)
Prompts generated: 9

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
| 1 | FIX-01 — Fix send error paths in all three chat stores | 🟠 High | done | 2026-03-27 | Clean fix — both defects resolved in all three stores |
| 2 | FIX-02 — Inject conversationId in revision event forwarding | 🟡 Medium | done | 2026-03-27 | Added conversationId to type, emissions, and handler forwarding |
| 3 | FIX-03 — Emit callStart for Verity audit/fix/motif-audit calls | 🟡 Medium | done | 2026-03-27 | Added emitVerityCallStart helper + 4 call sites in handlers.ts |
| 4 | FIX-04 — Deduplicate polling intervals in cliActivityStore recovery | 🟡 Medium | done | 2026-03-27 | Module-level timer refs + clear-before-create pattern |
| 5 | FIX-05 — Add logging for silent error paths in ClaudeCodeClient | 🟡 Medium | done | 2026-03-27 | Added console.warn for EPIPE + first-failure logging for DB persistence |
| 6 | FIX-06 — Extract shared stream event handler utility | 🟡 Medium | done | 2026-03-27 | Created streamHandler.ts with lazy init IIFE to avoid circular type ref |
| 7 | FIX-07 — Abort active stream on switchBook | 🟡 Medium | done | 2026-03-27 | Added abort call before state clear in switchBook |
| 8 | FIX-08 — Modal close-on-stream-end UX | 🟢 Low | done | 2026-03-27 | Added _closeRequested flag, honored in done/error handlers |
| 9 | FIX-09 — System prompt size guard | 🟢 Low | done | 2026-03-27 | Added 500KB byte-length guard before CLI spawn |

---

## Dependency Graph

```
FIX-01 ──┬── FIX-06  (shared handler depends on error path fixes)
         └── FIX-07  (switchBook abort depends on chatStore changes)

FIX-02 ──┐
FIX-03 ──┤
FIX-04 ──┤ (all independent — can run in any order)
FIX-05 ──┤
FIX-08 ──┤
FIX-09 ──┘
```

- **7 prompts are independent** and can execute in any order: FIX-01 through FIX-05, FIX-08, FIX-09
- **2 prompts depend on FIX-01**: FIX-06 (extracts the stream handler that FIX-01 modifies) and FIX-07 (modifies chatStore switchBook, same file FIX-01 touches)

---

## Findings Not Addressed

| Issues.md Ref | Title | Reason |
|---------------|-------|--------|
| 1.1 | No streamRouter exists — callId-only isolation | Positive observation — current design is correct |
| 1.6 | Cross-book conversation history is correctly scoped | Positive observation — correctly implemented |
| 2.2 | sendOneShot does not exist — Context Wrangler is synchronous | Informational — the concern is moot |
| 3.7 | callId convention uses string prefixes instead of typed discriminators | Low priority — convention works, refactor cost exceeds benefit |
| 3.8 | --add-dir exposes entire booksDir, not just the active book | By design — agents need access to shared resources across books |
| 3.9 | Auto-draft audit/fix calls share conversationId with drafting conversation | Intentional — audit/fix is part of the drafting workflow context |
| 3.10 | activeStreams cleanup verified — all terminal paths covered | Positive observation — no action needed |

---

## Handoff Notes

> Agents write freeform notes here after each prompt to communicate context to the next run.

### Last completed prompt: FIX-09 (ALL DONE)

### Observations:
- All 9 prompts completed in one run
- FIX-06 required lazy IIFE initialization pattern to avoid circular TypeScript type inference when `createStreamHandler` callbacks reference the store being defined
- All other fixes were clean and straightforward

### Warnings:
