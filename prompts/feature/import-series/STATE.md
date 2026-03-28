# Feature Build — State Tracker (import-series)

> Generated from intake documents on 2026-03-28.
> This file tracks progress across all session prompts.
> Updated by the agent at the end of each session execution.

---

## Feature

**Name:** import-series
**Intent:** Allow importing multiple manuscript files at once and grouping them as volumes in a new or existing series.
**Source documents:** `prompts/feature-requests/import-series.md`
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
| 1 | SESSION-01 — Domain Types for Series Import | Domain | pending | | |
| 2 | SESSION-02 — SeriesImportService | Application | pending | | |
| 3 | SESSION-03 — IPC Wiring, Preload, Composition Root | IPC / Main | pending | | |
| 4 | SESSION-04 — Renderer Store and UI Components | Renderer | pending | | |

---

## Dependency Graph

```mermaid
flowchart TD
    S1["SESSION-01<br/>Domain Types"] --> S2["SESSION-02<br/>Application Service"]
    S2 --> S3["SESSION-03<br/>IPC Wiring"]
    S3 --> S4["SESSION-04<br/>Renderer Store + UI"]
```

- Strictly linear dependency chain. Each session depends on the previous one.
- No parallelism possible — each layer depends on the one above it.

---

## Scope Summary

### Domain Changes
- New types: `SeriesImportVolume`, `SeriesImportPreview`, `SeriesImportCommitConfig`, `SeriesImportResult`
- New interface: `ISeriesImportService`

### Infrastructure Changes
- None — reuses existing `ManuscriptImportService` and `SeriesService`

### Application Changes
- New service: `SeriesImportService` — orchestrates batch import + series creation

### IPC Changes
- New channels: `import:selectFiles`, `import:seriesPreview`, `import:seriesCommit`
- New preload bridge namespace: `window.novelEngine.seriesImport`

### Renderer Changes
- New store: `seriesImportStore.ts`
- New components: `ImportSeriesWizard.tsx`, `VolumePreviewList.tsx`
- Modified: `BookSelector.tsx` — "Import Series" button + wizard rendering

### Database Changes
- None

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| New service (`SeriesImportService`) vs. extending `ManuscriptImportService` | Orthogonal concern — series import orchestrates multiple single-book imports. `ManuscriptImportService` stays focused on individual files. |
| Sequential book creation (not parallel) | Avoids filesystem contention, simpler error handling, and series volume ordering depends on sequential commits. |
| No rollback on partial failure | If book 3 of 5 fails, books 1-2 remain. User gets value from successful imports. Full rollback would be complex and destructive. |
| Common-prefix series name detection | Handles "Series Name: Book 1" / "Series Name: Book 2" patterns naturally. Falls back to parent directory name, then "Imported Series". |
| Separate preload namespace (`seriesImport`) | Keeps the `import` namespace clean. Series import has different return types and flow. |
| No source generation step in series import wizard | Source generation is per-book and can take 10+ minutes per volume. User can run it individually after import. Keeps the import flow fast. |

---

## Handoff Notes

> Agents write freeform notes here after each session to communicate context to the next run.

### Last completed session: (none yet)

### Observations:

### Warnings:
