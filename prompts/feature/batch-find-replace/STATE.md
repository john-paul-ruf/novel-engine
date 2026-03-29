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
| 1 | SESSION-01 — Domain types and service interface | Domain | pending | | |
| 2 | SESSION-02 — FindReplaceService implementation | Application | pending | | |
| 3 | SESSION-03 — IPC handlers, preload bridge, composition root | IPC / Main | pending | | |
| 4 | SESSION-04 — FindReplaceModal component and FilesView integration | Renderer | pending | | |

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

### Last completed session: (none yet)

### Observations:
- `IVersionService.snapshotContent()` already exists and does exactly what is needed for the safety snapshot — no new interface methods required.
- `IFileSystemService.listDirectory(bookSlug, 'chapters')` returns `FileEntry[]`; the service needs to filter for `isDirectory: true` and construct `chapters/{name}/draft.md` paths.
- The `regex` object must have `lastIndex` reset before each use because the `g` flag is stateful. The SESSION-02 prompt calls this out explicitly.

### Warnings:
- `src/main/index.ts` is the composition root — read it fully before SESSION-03 to get the exact variable names for `fileSystemService` and `versionService`. Do not guess.
- `handlers.ts` is large. Read the full file before editing to find the right insertion location and avoid duplicate variable names.
