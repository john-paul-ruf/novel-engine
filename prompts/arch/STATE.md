# Architecture Refactor — State Tracker

> This file tracks progress across all architecture refactor prompts.
> Updated by the agent at the end of each prompt execution.
> Read by the master loop to determine what to run next.

---

## Status Key

- `pending` — Not started
- `in-progress` — Started but not verified
- `done` — Completed and verified
- `blocked` — Cannot proceed (see notes)
- `skipped` — Intentionally skipped (see notes)

---

## Prompt Status

| # | Prompt | Status | Completed | Notes |
|---|--------|--------|-----------|-------|
| 1 | ARCH-01 — Extract prompt templates from constants.ts | done | 2026-03-27 | 9 prompt constants extracted to agent .md files. constants.ts reduced from 755→466 lines. |
| 2 | ARCH-02 — Extract status messages from constants.ts | done | 2026-03-27 | constants.ts reduced from 466→273 lines. statusMessages.ts created with zero imports. |
| 3 | ARCH-03 — Add IChatService and IUsageService interfaces | done | 2026-03-27 | IChatService: 14 methods. IUsageService: 3 methods. Handlers now depend on interfaces only. |
| 4 | ARCH-04 — Extract stream lifecycle helpers from ChatService | done | 2026-03-27 | StreamManager + resolveThinkingBudget extracted. All 4 stream patterns in ChatService replaced. |
| 5 | ARCH-05 — Extract AuditService from ChatService | done | 2026-03-27 | 3 methods extracted (~320 lines). ChatService: 1121→637 lines. AuditService: 350 lines. |
| 6 | ARCH-06 — Extract PitchRoomService from ChatService | done | 2026-03-27 | PitchRoomService: 109 lines. ChatService: 637→559 lines. StreamManager now created externally and shared. |
| 7 | ARCH-07 — Extract HotTakeService from ChatService | done | 2026-03-27 | HotTakeService: 98 lines. ChatService: 559→487 lines. |
| 8 | ARCH-08 — Extract AdhocRevisionService from ChatService | done | 2026-03-27 | AdhocRevisionService: 105 lines. ChatService: 487→407 lines. |
| 9 | ARCH-09 — Slim ChatService to router | done | 2026-03-27 | ChatService decomposition complete. 1,218→403 lines (67% reduction). Removed unused IAuditService and IUsageService deps. |
| 10 | ARCH-10 — Document renderer value imports exception | done | 2026-03-27 | Documented in ARCHITECTURE.md and RENDERER.md. Comment added to constants.ts. |
| 11 | ARCH-11 — Clean up Wrangler vestige | done | 2026-03-27 | Role updated to 'Revision Plan Parser'. No dead code found — two-call pattern references were already absent from code. |
| 12 | ARCH-12 — Audit and fix silent error swallowing | done | 2026-03-27 | Audited 115 bare catches. 82 already had comments. Added comments to 12 in priority files. 33 remaining are ENOENT patterns or already logging. |
| 13 | ARCH-13 — Add database migration system | done | 2026-03-27 | Forward-only migration runner with v0 baseline and v1 purpose-column migration. Ad hoc ALTER TABLE removed from schema.ts. |
| 14 | ARCH-14 — Standardize agent filenames | done | 2026-03-27 | FORGE.MD→FORGE.md, Quill.md→QUILL.md. Rename migration added to bootstrap. |

---

## Dependency Graph

```
ARCH-01 ──┐
ARCH-02 ──┤ (independent, can run in any order)
ARCH-03 ──┤
ARCH-10 ──┤
ARCH-11 ──┤
ARCH-12 ──┤
ARCH-13 ──┤
ARCH-14 ──┘

ARCH-04 ──┐
ARCH-05 ──┤
ARCH-06 ──┼── all must complete ──→ ARCH-09
ARCH-07 ──┤
ARCH-08 ──┘
```

- ARCH-01 through ARCH-03 and ARCH-10 through ARCH-14 are independent of each other.
- ARCH-04 through ARCH-08 are independent of each other but all must complete before ARCH-09.
- ARCH-03 (interfaces) should ideally run before ARCH-04–08 so the new services can implement the interfaces.

---

## Handoff Notes

> Agents write freeform notes here after each prompt to communicate context to the next run.

### Last completed prompt: ARCH-12

### Observations:
- StreamManager owns all stream lifecycle: register → accumulate → save → record usage → cleanup.
- `resolveThinkingBudget()` extracted to `src/application/thinkingBudget.ts` — shared by all callers.
- Four stream patterns replaced: `sendMessage`, `handleHotTake`, `handleAdhocRevision`, `handlePitchRoomMessage`.
- `runMotifAudit` is a lightweight sub-call that doesn't use active-stream tracking — removed its stale `this.lastChangedFiles` reference.
- ChatService no longer has `private activeStreams` or `private lastChangedFiles` fields.
- `handlePitchRoomMessage` had a `streamSucceeded` flag that was set but never read — eliminated naturally by the extraction.

### Warnings:
