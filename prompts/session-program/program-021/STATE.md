# State Tracker — Novel Engine / query-auto-populate

## Program / Feature / Intent / Sessions
- **Program:** Novel Engine
- **Feature:** query-auto-populate
- **Intent:** Make the Query Manager AI-driven — Quill researches and populates submission targets in bulk, and any field on a target can be AI-filled on demand
- **Sessions:** 9

## Session Status
| # | Session | Modules | Status | Completed | Notes |
|---|---------|---------|--------|-----------|-------|
| 01 | Add WebSearch to Claude CLI | M-CLI | done | 2026-07-12 | One-line change to allowedTools |
| 02 | Domain types & interface | M-DOMAIN | done | 2026-07-12 | Pure type additions |
| 03 | QueryService research + fill | M-APP | done | 2026-07-12 | Depends on 02 |
| 04 | IPC handlers + preload bridge | M-IPC, M-PRELOAD | done | 2026-07-12 | Depends on 03 |
| 05 | queryStore actions | M-RENDERER | done | 2026-07-12 | Depends on 04 |
| 06 | ResearchPanel + View integration | M-RENDERER | done | 2026-07-12 | Depends on 05 |
| 07 | TargetCard per-field AI buttons | M-RENDERER | done | 2026-07-12 | Depends on 05 |
| 08 | Quill agent prompt Phase 7 | M-AGENTS | done | 2026-07-12 | Depends on 03 |
| 09 | Documentation update | M-DOCS | pending | | Depends on 01–08 |

## Dependency Graph
```
01 (WebSearch) ──────────────────────┐
                                     ├──→ 08 (Quill prompt)
02 (Domain types) ──→ 03 (QueryService) ──→ 04 (IPC) ──→ 05 (Store) ──┬──→ 06 (ResearchPanel)
                                                                    └──→ 07 (TargetCard)
08 ──────────────────────────────────────────────────────────────→ 09 (Docs)
06 ──→ 09
07 ──→ 09
```

## Architecture Reference
- **Layers touched:** Infrastructure → Domain → Application → IPC → Preload → Renderer → Agents
- **New IPC channels:** `query:researchTargets`, `query:fillTargetField`
- **New CLI tool:** `WebSearch` added to `--allowedTools` (affects all agents)
- **New store actions:** `researchTargets`, `fillTargetField` on `queryStore`
- **New component:** `ResearchPanel.tsx`
- **Modified agent:** `QUILL.md` — Phase 7 added, Phase 6 updated

## Scope Summary
| Module | ID | Files Affected |
|--------|-----|----------------|
| ClaudeCodeClient | M-CLI | `src/infrastructure/claude-cli/ClaudeCodeClient.ts` |
| types.ts | M-DOMAIN | `src/domain/types.ts` |
| interfaces.ts | M-DOMAIN | `src/domain/interfaces.ts` |
| QueryService | M-APP | `src/application/QueryService.ts` |
| handlers | M-IPC | `src/main/ipc/handlers.ts` |
| preload | M-PRELOAD | `src/preload/index.ts` |
| queryStore | M-RENDERER | `src/renderer/stores/queryStore.ts` |
| QueryManagerView | M-RENDERER | `src/renderer/components/QueryManager/QueryManagerView.tsx` |
| ResearchPanel (new) | M-RENDERER | `src/renderer/components/QueryManager/ResearchPanel.tsx` |
| TargetCard | M-RENDERER | `src/renderer/components/QueryManager/TargetCard.tsx` |
| QUILL.md | M-AGENTS | `agents/QUILL.md` |
| CHANGELOG + docs | M-DOCS | `CHANGELOG.md`, 5 architecture docs |

## Design Decisions
- **WebSearch for all agents:** Adding to CLI allowedTools affects every agent, not just Quill. Decision: acceptable — other agents can benefit from research too, and it's already on the path for potential future features. Not scoped per-agent.
- **Quill writes tracker.md directly:** Rather than QueryService parsing Quill's chat response and writing the file, Quill uses its existing Write tool to append entries to `source/query-tracker.md`. This follows the pattern already used for `generateQueryLetter` where Quill writes the letter file directly.
- **Per-field fill also writes to tracker.md:** Same approach — Quill updates the specific field in the file, and QueryService reloads the tracker after the conversation completes.
- **Streaming reuses `query:onStream`:** Both new channels push stream events through the existing `query:onStream` push event — no new push channel needed.

## Handoff Notes

### SESSION-01 (done 2026-07-12)
Added `WebSearch` to `--allowedTools` in `ClaudeCodeClient.ts`. All agents now have web search access. Ollama-cli comment in `tools.ts` says "These fully match the tool set that ClaudeCodeClient exposes" — skipped updating because Ollama's ToolExecutor doesn't support WebSearch. That comment is now slightly out of sync but not functionally wrong (Ollama deliberately implements a subset).

### SESSION-02 (done 2026-07-12)
Added `QueryFillableField`, `QueryResearchResult`, `QueryFieldFillResult` types to `types.ts`. Added `researchTargets()` and `fillTargetField()` methods to `IQueryService` interface. NOTE: `npx tsc --noEmit` shows 2 errors — `QueryService` doesn't implement the new methods yet. This is expected; SESSION-03 implements them.

### SESSION-03 (done 2026-07-12)
Implemented `researchTargets()` and `fillTargetField()` on `QueryService`. Both follow the `generateQueryLetter` pattern: create conversation → send prompt → Quill writes to tracker.md → reload tracker. Added `buildResearchPrompt()`, `buildFieldFillPrompt()`, and `fieldToLabel()` private helpers. Type check and lint both pass.

### SESSION-04 (done 2026-07-12)
Added `query:researchTargets` and `query:fillTargetField` IPC handlers in `handlers.ts`. Added `researchTargets` and `fillTargetField` bridge methods in `preload/index.ts`. Both streaming handlers follow the `query:generateLetter` pattern (BrowserWindow.fromWebContents → send `query:onStream`). Type check passes.

### SESSION-05 (done 2026-07-12)
Added `researchTargets()` and `fillTargetField()` actions to `queryStore`. New state fields: `isResearching`, `researchBuffer`, `fillingFor`. Updated `initStreamListener` to accumulate into `researchBuffer` when researching. Updated `clear` to reset new fields. Imported `useBookStore` for active slug access.

### SESSION-06 (done 2026-07-12)
Created `ResearchPanel.tsx` — streaming panel showing Quill's research progress with "Research again" button. Added "Research Targets" button to `QueryManagerView.tsx` next to "+ Add Target". Button disabled while researching.

### SESSION-07 (done 2026-07-12)
Added `AiFillButton` component to `TargetCard.tsx` — small "AI" button next to each fillable field (contact, method, link, personalization, notes). Shows "…" while filling. Restructured info display from inline flex-wrap to structured field rows.

### SESSION-08 (done 2026-07-12)
Updated QUILL.md: Phase 6 personalization now allows WebSearch. Added Phase 7 with research workflow, research rules, and per-field fill instructions. Updated Red Lines to allow writing `source/query-tracker.md`. Added Query Tracker to "Files Owned by This Agent" table.