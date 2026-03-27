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
| 1 | ARCH-01 — Extract prompt templates from constants.ts | pending | | |
| 2 | ARCH-02 — Extract status messages from constants.ts | pending | | |
| 3 | ARCH-03 — Add IChatService and IUsageService interfaces | pending | | |
| 4 | ARCH-04 — Extract stream lifecycle helpers from ChatService | pending | | |
| 5 | ARCH-05 — Extract AuditService from ChatService | pending | | |
| 6 | ARCH-06 — Extract PitchRoomService from ChatService | pending | | |
| 7 | ARCH-07 — Extract HotTakeService from ChatService | pending | | |
| 8 | ARCH-08 — Extract AdhocRevisionService from ChatService | pending | | |
| 9 | ARCH-09 — Slim ChatService to router | pending | | Depends on 4–8 |
| 10 | ARCH-10 — Document renderer value imports exception | pending | | |
| 11 | ARCH-11 — Clean up Wrangler vestige | pending | | |
| 12 | ARCH-12 — Audit and fix silent error swallowing | pending | | |
| 13 | ARCH-13 — Add database migration system | pending | | |
| 14 | ARCH-14 — Standardize agent filenames | pending | | |

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

### Last completed prompt: (none yet)

### Observations:

### Warnings:
