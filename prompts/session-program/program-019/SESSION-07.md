# SESSION-07 — PipelineSpine Integration + PipelineService Detection + Docs + Changelog

> **Program:** Novel Engine
> **Feature:** query-manager
> **Modules:** M10 (renderer), M08 (application), M01 (domain)
> **Depends on:** SESSION-06, SESSION-01
> **Estimated effort:** 25 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M10 | renderer/components | `src/renderer/components/PipelineSpine/PipelineSpine.tsx`, `src/renderer/components/PipelineSpine/stages.ts`, `src/renderer/components/PipelineSpine/PhaseNode.tsx` | How phases are rendered, stage mapping, click behavior |
| M08 | application | `src/application/PipelineService.ts` (isPhaseComplete, markPhaseComplete) | Add detection + completion stub for `query-agents` phase |
| M10 | renderer/stores | `src/renderer/stores/viewStore.ts` (navigateToPhase) | Phase→view navigation |

## Context

The backend and UI are complete. This session ties everything together:
1. **PipelineService** — Add `query-agents` detection (checks `source/query-tracker.md` existence), add `markPhaseComplete` stub creation
2. **PipelineSpine** — The new phase will automatically appear (it's in `PIPELINE_PHASES` from SESSION-01), but we need to verify the spine renders it and add any stage metadata
3. **Phase→View navigation** — Clicking the `query-agents` phase in the PipelineSpine should navigate to the QueryManagerView, not the standard workspace chat
4. **Documentation** — Update architecture docs and CHANGELOG per AGENTS.md

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/application/PipelineService.ts` | Modify | Add `query-agents` case to `isPhaseComplete` and `markPhaseComplete` |
| `src/renderer/components/PipelineSpine/stages.ts` | Modify | Add stage metadata for `query-agents` (if needed) |
| `src/renderer/components/PipelineSpine/PhaseNode.tsx` | Modify | Navigate to `query-manager` view when `query-agents` phase clicked (if click handler is here) |
| `CHANGELOG.md` | Modify | Append entry for this feature |
| `docs/architecture/ARCHITECTURE.md` | Modify | Update source tree + dependency graph if needed |
| `docs/architecture/DOMAIN.md` | Modify | Add query types to catalog |
| `docs/architecture/APPLICATION.md` | Modify | Add QueryService to service inventory |
| `docs/architecture/IPC.md` | Modify | Add `query:*` channels + push event |
| `docs/architecture/RENDERER.md` | Modify | Add queryStore, QueryManagerView, IconRail entry |

## Implementation

### 1. PipelineService: add `query-agents` detection

Read `src/application/PipelineService.ts`, focusing on `isPhaseComplete` (line ~563) and `markPhaseComplete` (line ~200).

**1a. `isPhaseComplete`** — Add a case after the `publish` case (line ~706):

```typescript
      case 'query-agents':
        return this.hasSubstantiveFile(bookSlug, 'source/query-tracker.md');
```

**1b. `markPhaseComplete`** — Add a case after the `publish` case (line ~273):

```typescript
      case 'query-agents':
        await this.ensureStubFile(bookSlug, 'source/query-tracker.md', 'Query Tracker');
        break;
```

Note: `ensureStubFile` already writes a file with enough content to pass the `hasSubstantiveFile` word count check. It auto-confirms the phase (line 286).

### 2. PipelineSpine: verify and update click behavior

Read `src/renderer/components/PipelineSpine/stages.ts` — check if it has per-phase metadata (icons, labels, colors). If it does, add a `query-agents` entry.

Read `src/renderer/components/PipelineSpine/PhaseNode.tsx` — find the click handler. If it uses `useWorkspaceStore` to select the phase in the workspace, we need to intercept the `query-agents` phase to navigate to the `query-manager` view instead.

The likely pattern: PhaseNode calls something like `workspaceStore.setSelectedPhase(phaseId)`. For `query-agents`, we should call `viewStore.navigate('query-manager')` instead.

```typescript
// In the click handler:
if (phase.id === 'query-agents') {
  useViewStore.getState().navigate('query-manager');
} else {
  // existing behavior — select phase in workspace
}
```

### 3. Documentation updates

**3a. CHANGELOG.md** — Read the existing file. Append a new entry:

```markdown
## [YYYY-MM-DD] — Query Manager feature

### Summary
Added a complete query management system: a new `query-agents` pipeline phase (after `publish`), a standalone QueryManagerView accessible from the IconRail, per-book markdown tracker file (`source/query-tracker.md`), individual query letters in `source/query-letters/`, and personalized AI-generated query letters via Quill. Authors can track submission targets (agents, publishers, platforms) through the full lifecycle: Drafting → Queried → Partial Request → Full Request → Offer → Rejected → Withdrawn.

### Added
- `src/domain/types.ts` — Added `QueryTargetType`, `QueryStatus`, `QuerySubmissionMethod`, `QueryTarget`, `QueryTracker`, `QueryLetter` types
- `src/domain/interfaces.ts` — Added `IQueryService` interface
- `src/domain/constants.ts` — Added `'query-agents'` to `PIPELINE_PHASES` and `PHASE_OUTPUT_FILES`; added Quill quick actions for query analysis and agent research
- `src/application/QueryService.ts` — New service: tracker parsing/serialization, target CRUD, personalized query letter generation via Quill
- `src/main/ipc/handlers.ts` — Added 9 IPC handlers under `query:*` namespace
- `src/preload/index.ts` — Added `query` namespace on preload bridge (8 invoke methods + 1 stream listener)
- `src/renderer/stores/queryStore.ts` — New Zustand store for query management state
- `src/renderer/components/QueryManager/QueryManagerView.tsx` — Main query management view
- `src/renderer/components/QueryManager/TargetCard.tsx` — Single target card with status badge and actions
- `src/renderer/components/QueryManager/AddTargetForm.tsx` — Form for adding new submission targets
- `src/renderer/components/QueryManager/LetterPreview.tsx` — Modal letter preview with inline editing
- `agents/QUILL.md` — Added Phase 6: personalized query letter generation guidance

### Changed
- `src/domain/types.ts` — Added `'query-agents'` to `PipelinePhaseId` union
- `src/application/PipelineService.ts` — Added `query-agents` detection (`isPhaseComplete`) and completion (`markPhaseComplete`)
- `src/application/index.ts` — Added `QueryService` export
- `src/main/index.ts` — Instantiated `QueryService` in composition root, added to handler registration
- `src/renderer/stores/viewStore.ts` — Added `'query-manager'` to `ViewId` union
- `src/renderer/components/Rail/IconRail.tsx` — Added query-manager rail item with mail icon
- `src/renderer/components/common/Icon.tsx` — Added `'mail'` icon
- `src/renderer/components/Layout/AppLayout.tsx` — Added `QueryManagerView` to ViewContent
- `src/renderer/components/PipelineSpine/PhaseNode.tsx` — Phase `query-agents` click navigates to query-manager view

### Architecture Impact
- New pipeline phase: `query-agents` (15th phase, after `publish`)
- New IPC channel: `query:*` namespace (9 channels)
- New IPC push event: `query:onStream`
- New Zustand store: `queryStore`
- New service: `QueryService` (depends on `IFileSystemService`, `IChatService`, `IAgentService`, `ISettingsService`, `IProviderRegistry`)
- New view: `QueryManagerView` (accessible from IconRail)
- New book file structure: `source/query-tracker.md` + `source/query-letters/{slug}.md` directory

### Migration Notes
- Existing books will see the `query-agents` phase as `locked` until `publish` is complete. No breaking changes.
- No schema migration needed (tracker is file-based, not SQLite).
```

**3b-3f.** Update the five architecture doc files following the patterns in AGENTS.md. Only update docs that have changes:
- `docs/architecture/DOMAIN.md` — Add query types and `IQueryService` interface
- `docs/architecture/APPLICATION.md` — Add `QueryService` to service inventory
- `docs/architecture/IPC.md` — Add `query:*` channels and push event
- `docs/architecture/RENDERER.md` — Add `queryStore`, `QueryManagerView` components
- `docs/architecture/ARCHITECTURE.md` — Update source tree (add new files), add `QueryService` to dependency graph

## Verification

1. Run `npx tsc --noEmit` — must pass with zero errors
2. Verify `isPhaseComplete` has a `query-agents` case
3. Verify `markPhaseComplete` has a `query-agents` case
4. Verify the pipeline phase shows up in the PipelineSpine (it will — it's in `PIPELINE_PHASES`)
5. Verify clicking `query-agents` in PipelineSpine navigates to `query-manager` view
6. Verify CHANGELOG.md has the new entry
7. Verify all architecture docs that were touched are updated (read them back)
8. Full end-to-end desk check: with a book that has `publish` complete, the `query-agents` phase should be active. Clicking it should open the Query Manager view. Adding a target should create a tracker file. Generating a letter should invoke Quill and create a letter file.

## State Update

Update `prompts/session-program/program-019/STATE.md`:
- Set SESSION-07 status to `done`
- Add completion date
- Add handoff notes: All 7 sessions complete. Feature is fully implemented. Final verification: `npx tsc --noEmit` passes. The feature can be tested by running `npm start` and navigating to a book with `publish` phase complete.