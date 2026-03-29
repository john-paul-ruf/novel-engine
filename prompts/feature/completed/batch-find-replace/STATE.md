# Feature Build — State Tracker (batch-find-replace)

> Generated from intake documents on 2026-03-28.
> This file tracks progress across all session prompts.
> Updated by the agent at the end of each session execution.

---

## Feature

**Name:** batch-find-replace
**Intent:** Allow authors to search across all chapter drafts and replace text in bulk, with per-chapter preview, selective application, and automatic version snapshots for safe revert.
**Source documents:** `prompts/feature-requests/_queue/small/batch-find-replace.md`
**Sessions generated:** 4

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
| 1 | SESSION-01 — Domain types and service interface | Domain | done | 2026-03-28 | Types appended after `// === Guided Tour ===`; 3 types added to interfaces.ts import block alphabetically after FileVersionSummary |
| 2 | SESSION-02 — FindReplaceService implementation | Application | done | 2026-03-28 | Created; `buildRegex` as module-level function; regex.lastIndex reset before each use as called out in notes |
| 3 | SESSION-03 — IPC handlers, preload bridge, composition root | IPC / Main | done | 2026-03-28 | `findReplace` injected after `version` in composition root; handlers appended at end of file before closing brace; `findReplace` namespace added before `helper` in preload |
| 4 | SESSION-04 — FindReplaceModal component and FilesView integration | Renderer | done | 2026-03-28 | Modal created; `onFindReplace` prop added to FilesHeader; modal mounted conditionally before root closing div |

---

## Dependency Graph

```
SESSION-01 (Domain)
    └── SESSION-02 (Application)
            └── SESSION-03 (IPC/Main)
                    └── SESSION-04 (Renderer)
```

All sessions are strictly sequential. Each session depends on the previous one. No parallelism is possible.

---

## Scope Summary

### Domain Changes
- `src/domain/types.ts` — New: `FindReplaceOptions`, `FindReplaceMatchLocation`, `FindReplacePreviewItem`, `FindReplacePreviewResult`, `FindReplaceApplyResult`
- `src/domain/interfaces.ts` — New: `IFindReplaceService` (preview + apply methods)

### Infrastructure Changes
- None — uses existing `IFileSystemService` (readFile, writeFile, listDirectory) and `IVersionService` (snapshotContent)

### Application Changes
- `src/application/FindReplaceService.ts` — New: implements `IFindReplaceService`; depends on `IFileSystemService` and `IVersionService`

### IPC Changes
- New channels: `findReplace:preview`, `findReplace:apply`
- New preload bridge namespace: `window.novelEngine.findReplace.{ preview, apply }`
- `src/main/index.ts` — instantiates `FindReplaceService`; passes to `registerIpcHandlers`
- `src/main/ipc/handlers.ts` — registers two new handlers
- `src/preload/index.ts` — exposes `findReplace` namespace

### Renderer Changes
- `src/renderer/components/Files/FindReplaceModal.tsx` — New: full find/replace modal
- `src/renderer/components/Files/FilesHeader.tsx` — Modified: add `onFindReplace` prop and button
- `src/renderer/components/Files/FilesView.tsx` — Modified: add modal state and mounting

### Database Changes
- None — version snapshots use the existing `file_versions` table; no schema migration required

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Scope chapters only** | The spec says "chapters one-by-one" and "entire manuscript." Source docs (story-bible, pitch) are rarely bulk-edited; scoping to `chapters/*/draft.md` keeps the operation safe and fast. Can be extended later. |
| **Preview caps at 20 match locations per file** | Enough detail for the author to confirm the search is targeting the right text. The exact count is always shown. Prevents the modal from becoming unusable on a hit like "the". |
| **Sort preview results by match count descending** | Most useful ordering — author sees the most-impacted chapters first. |
| **Snapshot before apply, source='user'** | Creates a named restore point the author can find in the History panel. Using 'user' (not 'agent') is correct — this is an author-initiated operation, not an AI write. |
| **No new Zustand store** | The modal is a one-shot flow with no state that needs to persist across book switches or view changes. Local state in `FindReplaceModal.tsx` is sufficient. |
| **Button always visible in FilesHeader (not just browser mode)** | Find & Replace is a manuscript-wide tool, not tied to any specific file. Available from any FilesView sub-mode reduces friction. |
| **`handleApply` rebuilds regex from the current `searchTerm`/`options`** | The same options used in preview are used in apply. This is safe because the user cannot change inputs after preview without going back to the input phase. |

---

## Handoff Notes

> Agents write freeform notes here after each session to communicate context to the next run.

### Last completed session: SESSION-04

### Observations:
- All four sessions completed in a single run on 2026-03-28.
- `IVersionService.snapshotContent()` worked exactly as described — no interface additions required.
- `regex.lastIndex` is reset before every use of the shared RegExp object in both `preview()` and `apply()`.
- `FindReplaceModal` was written entirely with local state — no Zustand store needed (as planned).
- `FilesHeader` button uses `⇄ Find &amp; Replace` (JSX HTML entity) to avoid unescaped ampersand lint warnings.
- `npx tsc --noEmit` passes with zero errors after all four sessions.

### Warnings:
- `src/main/index.ts` is the composition root — read it fully before SESSION-03 to get the exact variable names for `fileSystemService` and `versionService`. Do not guess.
- `handlers.ts` is large. Read the full file before editing to find the right insertion location and avoid duplicate variable names.
