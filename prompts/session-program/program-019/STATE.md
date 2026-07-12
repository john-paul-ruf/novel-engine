# State Tracker — Novel Engine / query-manager

## Program
Novel Engine

## Feature
query-manager

## Intent
Add a query management system: a new pipeline phase `query-agents` (after `publish`) that unlocks a standalone Query Manager view. Authors research submission targets (agents, publishers, platforms), generate personalized AI query letters per target, track the full submission lifecycle (Drafting → Queried → Partial Request → Full Request → Offer → Rejected → Withdrawn), and persist everything in per-book markdown files (`source/query-tracker.md` + `source/query-letters/{slug}.md`).

## Sessions
7

## Session Status

| # | Session | Modules | Status | Completed | Notes |
|---|---------|---------|--------|-----------|-------|
| 01 | Domain types, constants, and pipeline phase registration | M01 | done | 2026-07-12 | Types added: QueryTargetType, QueryStatus, QuerySubmissionMethod, QueryTarget, QueryTracker, QueryLetter. IQueryService interface added. PipelinePhaseId extended with 'query-agents'. PIPELINE_PHASES has 15 entries. PHASE_OUTPUT_FILES has 'query-agents' entry. Quill quick actions: 'Analyze for queries' + 'Find agents for this book'. Also fixed exhaustiveness guard in PipelineService.ts markPhaseComplete switch. |
| 02 | QueryService — tracker I/O, target CRUD, query letter generation | M08 | pending | | |
| 03 | IPC handlers + preload bridge for query namespace | M09, M01 | pending | | |
| 04 | Composition root wiring + Quill agent prompt update | M08, agents/ | pending | | |
| 05 | Renderer store (queryStore) | M10 | pending | | |
| 06 | QueryManagerView component + IconRail entry | M10 | pending | | |
| 07 | PipelineSpine integration + docs + changelog | M10, M01 | pending | | |

(Status: pending | in-progress | done | blocked | skipped)

## Dependency Graph

```
SESSION-01 ──> SESSION-02 ──> SESSION-03 ──> SESSION-04
                                                  │
                                                  v
SESSION-05 ──> SESSION-06 ──> SESSION-07
```

SESSION-01 (domain types) must complete before everything else.
SESSION-02 (QueryService) depends on 01's types.
SESSION-03 (IPC + preload) depends on 02's interface.
SESSION-04 (wiring + agent prompt) depends on 02 and 03.
SESSION-05 (store) depends on 03's preload bridge shape.
SESSION-06 (view + rail) depends on 05's store.
SESSION-07 (pipeline spine + docs) depends on 06 and 01.

## Architecture Reference (feature-specific)

- **M01 domain** — New types (`QueryTargetType`, `QueryStatus`, `QuerySubmissionMethod`, `QueryTarget`, `QueryTracker`, `QueryLetter`), new `IQueryService` interface, `PipelinePhaseId` extended with `'query-agents'`, `PIPELINE_PHASES` gets one new entry, `PHASE_OUTPUT_FILES` gets `'query-agents'` entry.
- **M08 application** — New `QueryService.ts` implementing `IQueryService`. Depends on `IFileSystemService`, `IChatService` (for letter generation via Quill), `IAgentService`. Tracker file parser/serializer in `src/application/query/` subdirectory.
- **M09 main/preload** — New IPC channels under `query:*` namespace. New `query` namespace on preload bridge. `QueryService` added to handler services object and composition root.
- **M10 renderer** — New `queryStore` (Zustand), new `QueryManagerView` component, new `'query-manager'` ViewID in viewStore, new IconRail entry, PipelineSpine updated to include the new phase.
- **agents/QUILL.md** — Extended with Phase 6: query letter personalization guidance.
- Full config: `FORGE-CONFIG.md` at project root.

## Scope Summary

| Module | Files | Nature of change |
|--------|-------|------------------|
| M01 domain | `src/domain/types.ts`, `src/domain/interfaces.ts`, `src/domain/constants.ts` | New query types, IQueryService interface, pipeline phase + output file entries |
| M08 application | `src/application/QueryService.ts` (new), `src/application/query/` (new subdirectory), `src/application/index.ts` | New service: tracker parsing, CRUD, letter generation |
| M09 main | `src/main/ipc/handlers.ts`, `src/main/index.ts`, `src/preload/index.ts` | IPC channels, composition root wiring, preload bridge |
| M10 renderer | `src/renderer/stores/queryStore.ts` (new), `src/renderer/components/QueryManager/` (new, includes `FilterBar.tsx`), `src/renderer/stores/viewStore.ts`, `src/renderer/components/Rail/IconRail.tsx`, `src/renderer/components/Layout/AppLayout.tsx`, `src/renderer/components/PipelineSpine/stages.ts` | Store, view, rail entry, view routing, filter bar (method/status/type filters) |
| agents/ | `agents/QUILL.md` | Phase 6: personalized query letter generation guidance |

## Design Decisions

1. **Per-book markdown files, not SQLite.** The `source/query-tracker.md` file uses YAML front matter + structured markdown sections. Rationale: matches the existing book-directory convention (pitch.md, scene-outline.md, etc.); author can hand-edit; version control friendly; no schema migration needed.
2. **Single tracker file, individual letter files.** `source/query-tracker.md` holds the index/state; `source/query-letters/{target-slug}.md` holds each letter. Rationale: keeps the tracker file small; letters can be long; they're independently editable.
3. **Quill is the query phase agent.** Quill already has query letter and synopsis quick actions. Extending it with Phase 6 (personalized query generation) is additive and consistent with its publisher identity.
4. **Pipeline phase after `publish`.** The `query-agents` phase comes after Quill's publish phase. Detection: `source/query-tracker.md` exists with substantive content. Rationale: queries are a post-publication activity (manuscript is final, metadata is ready).
5. **Letter generation reuses ChatService streaming.** `generateQueryLetter` creates a Quill conversation, sends the prompt with target context, and streams the response. The letter file is written by Quill (tool-use) or by QueryService (non-tool-use extraction). Rationale: follows the existing pattern used by pipeline phases.
6. **Standalone view, not workspace phase.** The `query-agents` phase appears in PipelineSpine but clicking it navigates to a dedicated `QueryManagerView` rather than the standard chat workspace. Rationale: query management has its own UI (target list, status badges, letter editor) that doesn't fit the chat-centric workspace.

## Handoff Notes

### SESSION-01 → SESSION-02
- All query types are in `src/domain/types.ts` after the RevisionQueueEvent section: `QueryTargetType`, `QueryStatus`, `QuerySubmissionMethod`, `QueryTarget`, `QueryTracker`, `QueryLetter`.
- `IQueryService` interface is in `src/domain/interfaces.ts` after `IStatisticsService`.
- The `query-agents` pipeline phase uses Quill as its agent. Detection file is `source/query-tracker.md`.
- Quill has two new quick actions: 'Analyze for queries' and 'Find agents for this book'.
- PipelineService.ts `markPhaseComplete` already handles `'query-agents'` (creates stub `source/query-tracker.md`).
- WARNING: The `markPhaseComplete` fix in PipelineService.ts was necessary because the exhaustiveness guard caught the new phase. SESSION-02 should be aware that the pipeline service already handles the new phase's stub creation.