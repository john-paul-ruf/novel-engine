# SESSION-09 — Documentation Update

> **Program:** Novel Engine
> **Feature:** query-auto-populate
> **Modules:** M-DOCS (architecture docs, CHANGELOG)
> **Depends on:** SESSION-01 through SESSION-08 (all code changes)
> **Estimated effort:** 15–20 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M-DOCS | `CHANGELOG.md` | Append section | Document the feature |
| M-DOCS | `docs/architecture/DOMAIN.md` | Query Manager types section | Add new types |
| M-DOCS | `docs/architecture/APPLICATION.md` | QueryService section | Add new methods |
| M-DOCS | `docs/architecture/IPC.md` | Query channels section | Add new channels |
| M-DOCS | `docs/architecture/INFRASTRUCTURE.md` | Claude CLI section | Note WebSearch tool addition |
| M-DOCS | `docs/architecture/RENDERER.md` | Query Manager components section | Add ResearchPanel, note TargetCard changes |

## Context

All code changes are complete. Per AGENTS.md rules, update the architecture docs and changelog to reflect what changed.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `CHANGELOG.md` | Modify | Append entry for today |
| `docs/architecture/DOMAIN.md` | Modify | Add `QueryFillableField`, `QueryResearchResult`, `QueryFieldFillResult` to types catalog |
| `docs/architecture/APPLICATION.md` | Modify | Add `researchTargets()` and `fillTargetField()` to QueryService section |
| `docs/architecture/IPC.md` | Modify | Add `query:researchTargets` and `query:fillTargetField` to channel registry |
| `docs/architecture/INFRASTRUCTURE.md` | Modify | Update Claude CLI allowed tools note to include `WebSearch` |
| `docs/architecture/RENDERER.md` | Modify | Add `ResearchPanel.tsx` to component inventory, note TargetCard AI buttons |

## Implementation

### 1. CHANGELOG.md

Append today's entry following the format in AGENTS.md:

```markdown
## [YYYY-MM-DD] — Query Manager auto-populate and per-field AI fill

### Summary
Quill can now research and auto-populate submission targets in bulk using web search, and any individual field on a target can be AI-filled on demand. This eliminates manual data entry for the Query Manager.

### Added
- `src/renderer/components/QueryManager/ResearchPanel.tsx` — Streaming panel showing Quill's research progress
- `src/domain/types.ts` — Added `QueryFillableField`, `QueryResearchResult`, `QueryFieldFillResult` types
- `src/domain/interfaces.ts` — Added `researchTargets()` and `fillTargetField()` to `IQueryService`
- `src/application/QueryService.ts` — Added `researchTargets()` and `fillTargetField()` methods with prompt builders
- `src/main/ipc/handlers.ts` — Added `query:researchTargets` and `query:fillTargetField` IPC handlers
- `src/preload/index.ts` — Added `researchTargets` and `fillTargetField` to query bridge namespace
- `src/renderer/stores/queryStore.ts` — Added `researchTargets`, `fillTargetField` actions + `isResearching`, `fillingFor` state
- `agents/QUILL.md` — Added Phase 7 (target research & field fill), updated Phase 6 personalization rules, updated red lines

### Changed
- `src/infrastructure/claude-cli/ClaudeCodeClient.ts` — Added `WebSearch` to `--allowedTools` argument
- `src/renderer/components/QueryManager/QueryManagerView.tsx` — Added "Research Targets" button and ResearchPanel
- `src/renderer/components/QueryManager/TargetCard.tsx` — Added per-field AI fill buttons

### Architecture Impact
- New IPC channels: `query:researchTargets`, `query:fillTargetField`
- CLI tool access: `WebSearch` now available to all agents (not just Quill)
- Agent behavioral change: Quill can now use web search for target research and query letter personalization

### Migration Notes
None — all additions are backward compatible. Existing query tracker files are unchanged.
```

### 2. docs/architecture/DOMAIN.md

In the types catalog, after the existing Query Manager types section, add:

```markdown
### Query Research & Field Fill

| Type | Shape | Used By |
|------|-------|---------|
| `QueryFillableField` | `'contact' \| 'method' \| 'link' \| 'personalizationNotes' \| 'notes'` | QueryService, queryStore, TargetCard |
| `QueryResearchResult` | `{ addedTargets, targetNames, conversationId }` | QueryService, queryStore |
| `QueryFieldFillResult` | `{ targetId, field, oldValue, newValue, conversationId }` | QueryService, queryStore |
```

Also add the two new methods to the `IQueryService` interface table:

```markdown
| `researchTargets` | `(bookSlug, onEvent)` | `Promise<QueryResearchResult>` |
| `fillTargetField` | `(bookSlug, targetId, field, onEvent)` | `Promise<QueryFieldFillResult>` |
```

### 3. docs/architecture/APPLICATION.md

In the QueryService section, add to the methods table:

```markdown
| `researchTargets(bookSlug)` | Spawns Quill conversation to web-search agents/publishers, writes targets to tracker, streams response |
| `fillTargetField(bookSlug, targetId, field)` | Spawns Quill conversation to research and fill a single field on a target |
```

### 4. docs/architecture/IPC.md

Add to the `query:*` channel table:

```markdown
| `query:researchTargets` | invoke | `queryService.researchTargets(bookSlug, onStream)` | `QueryResearchResult` (streams) |
| `query:fillTargetField` | invoke | `queryService.fillTargetField(bookSlug, targetId, field, onStream)` | `QueryFieldFillResult` (streams) |
```

### 5. docs/architecture/INFRASTRUCTURE.md

In the Claude CLI section, update the allowed tools description to include `WebSearch`.

### 6. docs/architecture/RENDERER.md

Add `ResearchPanel.tsx` to the Query Manager component group, and note that `TargetCard.tsx` now has per-field AI fill buttons.

## Verification

1. `CHANGELOG.md` has today's entry
2. All six architecture docs reflect the changes
3. Every file path in the changelog exists in the codebase
4. No stale references to "cannot access the internet" in docs
5. `npx tsc --noEmit` still passes

## State Update

Update `prompts/session-program/program-021/STATE.md`:
- Set SESSION-09 status to `done`
- Add completion date
- Handoff: All sessions complete. Feature is ready for testing.