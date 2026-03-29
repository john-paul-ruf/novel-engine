# Feature Build — State Tracker (saved-prompt-library)

> Generated from intake documents on 2026-03-28.
> This file tracks progress across all session prompts.
> Updated by the agent at the end of each session execution.

---

## Feature

**Name:** saved-prompt-library
**Intent:** A user-managed bank of reusable prompts accessible from the Quick Actions dropdown, persisted globally in userData as a JSON file.
**Source documents:** `prompts/feature-requests/_queue/small/saved-prompt-library.md`
**Sessions generated:** 3

---

## Status Key

- `pending` — Not started
- `in-progress` — Started but not verified
- `done` — Completed and verified
- `blocked` — Cannot proceed (see notes)
- `skipped` — Intentionally skipped (see notes)

---

## Session Status

| # | Session | Layer(s) | Status | Completed | Notes |
|---|---------|----------|--------|-----------|-------|
| 1 | SESSION-01 — Domain Types + Saved Prompt Infrastructure | Domain, Infrastructure | pending | | |
| 2 | SESSION-02 — IPC Wiring + Main Composition | IPC / Main | pending | | |
| 3 | SESSION-03 — Renderer: Store + QuickActions Refactor + Prompt Editor | Renderer | pending | | |

---

## Dependency Graph

```
SESSION-01
    └── SESSION-02
            └── SESSION-03
```

All sessions are strictly sequential. SESSION-02 cannot start until SESSION-01 is done (needs the type and interface). SESSION-03 cannot start until SESSION-02 is done (needs the preload bridge).

---

## Scope Summary

### Domain Changes
- New type: `SavedPrompt` in `src/domain/types.ts`
- New interface: `ISavedPromptService` in `src/domain/interfaces.ts`

### Infrastructure Changes
- New module: `src/infrastructure/saved-prompts/` with `SavedPromptService.ts` and `index.ts`

### Application Changes
- None — no application service layer needed. The infrastructure service is simple enough to wire directly via IPC.

### IPC Changes
- New channels: `savedPrompts:list`, `savedPrompts:create`, `savedPrompts:update`, `savedPrompts:delete`
- New preload bridge namespace: `window.novelEngine.savedPrompts`

### Renderer Changes
- New store: `src/renderer/stores/savedPromptsStore.ts`
- New component: `src/renderer/components/Chat/SavedPromptEditor.tsx`
- Modified component: `src/renderer/components/Chat/QuickActions.tsx` — tabbed layout

### Database Changes
- None — persistence is a flat JSON file (`{userData}/saved-prompts.json`), not SQLite.

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| JSON file storage, not SQLite | Saved prompts are a small, user-managed list with no relational requirements. A flat JSON file in userData matches the pattern used by `SettingsService` and avoids a schema migration. |
| No application service layer | `SavedPromptService` is simple CRUD on a JSON file with no business logic that needs testing in isolation. Wiring it directly via IPC (infrastructure → IPC, skipping application) is the right call for this scope. |
| `duplicate` handled client-side | Duplicate is just `create({ ...source, name: source.name + ' (copy)' })`. No dedicated IPC channel or service method needed — the store action calls `create`. |
| Fixed dropdown width (`w-64`) | The two-tab layout with action buttons needs a consistent width. The original `min-w-[10rem]` was fine for a single-column list but cramped for the row-action icons. |
| Editor as fixed-position overlay | The QuickActions dropdown uses `relative` positioning and `overflow-hidden` may be applied by parents. A `fixed` overlay escapes any stacking context, ensuring the modal renders above everything without portal complexity. |

---

## Handoff Notes

> Agents write freeform notes here after each session to communicate context to the next run.

### Last completed session: (none yet)

### Observations:

### Warnings:
