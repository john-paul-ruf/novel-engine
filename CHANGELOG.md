# Changelog

All notable changes to Novel Engine are documented here.

---

## [2026-07-18] — Forge program for Ollama about.json corruption

### Summary

Built Forge session program `program-027` to fix the `ToolExecutor.extractStringValue` bug that strips JSON file contents to their first inner string when Ollama- or llama-server-backed agents write to `.json` files. Reproduced against live Ollama: `qwen3.5:cloud` (3/8 corrupt) and `llama3.1:8b` (4/6 corrupt) when run with the `SPARK_METADATA_PROMPT` from `src/renderer/components/Files/AboutJsonViewer.tsx`. The model sent valid escaped JSON content as the `Write` tool's `content` argument; the recursive parse-and-extract path in `extractStringValue` walked into it and salvaged only the title, writing the bare title to disk. Claude CLI and Codex CLI are unaffected (they don't use `ToolExecutor`). No source files modified in this session — only the Forge program was created.

### Added

- `prompts/session-program/program-027/MASTER.md` — Execution protocol, crash recovery, final report shape
- `prompts/session-program/program-027/STATE.md` — Session status, dependency graph, design decisions, handoff notes scaffold
- `prompts/session-program/program-027/SESSION-01.md` — Root fix: add `raw` flag to `requireString`/`extractStringValue`; pass `raw=true` only at the Write `content` extraction site. Modifies `src/infrastructure/ollama-cli/ToolExecutor.ts`
- `prompts/session-program/program-027/SESSION-02.md` — Defense in depth: add a `.json` file guard in `executeWrite` that restores the raw argument when extraction produces non-JSON; co-locates `src/infrastructure/ollama-cli/ToolExecutor.test.ts` with four regression tests. Installs Vitest if program-026 has not shipped its harness yet
- `prompts/session-program/program-027/SESSION-03.md` — Renderer-only: tighten `SPARK_METADATA_PROMPT` in `src/renderer/components/Files/AboutJsonViewer.tsx` to require valid JSON output, name preserved canonical fields, and forbid prose wrapping
- `prompts/session-program/program-027/input-files/REPRODUCTION_NOTES.md` — Source material: symptom, trigger path, root cause, reproduction rates, raw arg dump, required fix, scope decisions

### Architecture Impact

- None — no source files modified in this session. The 3 sessions in program-027, when executed, will affect M07 (ollama-cli `ToolExecutor`), transitively benefit M07-adjacent (llama-server via shared `ToolExecutor`), and one M10 renderer string. No new IPC channels, stores, or modules.

### Migration Notes

none — no source changes this session; downstream migrations (if any) are documented inside each SESSION-NN.md.

---

## [2026-07-13] — Deployment prep: release notes, README update, website rebuild

### Summary

Executed the full deployment prep pipeline for v0.9.0. Generated `RELEASE_NOTES.md` cataloging all 33 commits since v0.8.0 — 3 feature groups (Query Manager, WebSearch, query auto-populate), 3 improvement groups, 9 Codex CLI bug fixes, 2 documentation items. Updated `README.md` with pipeline 14→15 phases, Query Manager and WebSearch features, expanded Quill role. Rebuilt all 6 GitHub Pages HTML files — version v0.9.0, 2 new feature cards on landing page, updated stats (197 files, 142 IPC channels, 15 phases, 25 stores), 3 new changelog highlight cards, 21 new changelog entries, 2 new press kit differentiator cards, evaluation page phase count corrected.

### Added

- `RELEASE_NOTES.md` — Release notes for v0.9.0 with categorized changes, highlights, and full commit log
- `docs/releases/v0.9.0-RELEASE_NOTES.md` — Archive copy of v0.9.0 release notes

### Changed

- `README.md` — Pipeline phase count 14→15; "Pitch to Published" bullet includes query letters; Quill agent description expanded; Ship stage row updated; 2 new "What Else Is In The Box" items (Query Manager, Web search)
- `docs/index.html` — Version v0.9.0; meta description 15 phases; Quill agent card updated; pipeline heading 15 phases; Ship stage includes Query Agents chip; 2 new feature cards (Query Manager, Web search)
- `docs/architecture.html` — Version v0.9.0; file count 170→197; dependency graph added QueryService; source tree added QueryService.ts + WebSearcher + QueryManager components; IPC channels 131→142; component groups 24→25
- `docs/changelog.html` — Version v0.9.0; stats updated (99 entries, 197 files, 35+ bug fixes); 3 new highlight cards (Query Manager, WebSearch, Codex CLI hardening); 21 new changelog entries
- `docs/evaluation.html` — Version v0.9.0; evaluator disclosure phase count 14→15
- `docs/press.html` — Version v0.9.0; OG description 15 phases + 10 published novels; Quill description includes query letters; 2 new differentiator cards (Query Manager, Web search); By The Numbers updated (15 phases, 142 IPC, 197 files, ~50K LOC); quotable line "Fifteen phases"
- `docs/contact.html` — Version v0.9.0; footer tagline "Fifteen phases"

### Architecture Impact

None — no source code changes. All changes are to documentation and website HTML files only.

### Migration Notes

None — no breaking changes, schema migrations, or renamed IPC channels.

---

## [2026-07-13] — Codex CLI standalone_web_search flag

### Summary

The Codex CLI's native `web_search` tool must be explicitly enabled via `--enable standalone_web_search` on each `codex exec` spawn. The prior session's Codex `web_search` work wired up event parsing and tool-name recognition but missed adding the CLI flag, so the tool was never actually offered to the model. This small change passes the flag on every Codex CLI invocation, completing cross-provider WebSearch parity (Claude CLI, Ollama, llama-server, and Codex).

### Changed
- `src/infrastructure/codex-cli/CodexCliClient.ts` — Added `'--enable', 'standalone_web_search'` to the `args` array in `runCodexAttempt()` (line ~390). Always on; the CLI only activates its `web_search` tool when the agent prompt requests research (e.g. Quill's Query Manager prompts).

### Architecture Impact
- Codex CLI now has functional WebSearch parity with the other providers; prior Codex `web_search` parsing code in `extractToolInfo` / `normalizeToolName` was already in place but inert without the flag.

### Migration Notes
None — additive change, no behavior change for agents that don't request web search.

---

## [2026-07-12] — WebSearch for all CLIs + Query Manager activity in CLI panel

### Summary

All model providers (Ollama, llama-server, Codex) now support WebSearch for query-manager research. Previously only Claude CLI had web search capabilities. Additionally, all Query Manager streaming activity (research, generate letter, fill field) now broadcasts to the CLI Activity panel via `chat:streamEvent`, so users can monitor Quill's CLI calls alongside all other agent activity.

### Added
- `src/infrastructure/ollama-cli/WebSearcher.ts` — DuckDuckGo HTML-based web search executor for Ollama/llama-server agents (no API key, best-effort)
- `src/infrastructure/ollama-cli/tools.ts` — Added `WebSearch` tool definition to `OLLAMA_TOOLS`
- `src/infrastructure/ollama-cli/ToolExecutor.ts` — Added `executeWebSearch()` case and `getWebSearcher()` lazy singleton
- `src/domain/types.ts` — Added `'query'` to `StreamEventSource` union

### Changed
- `src/infrastructure/ollama-cli/OllamaCodeClient.ts` — Tool event extraction now includes `query`/`q` argument names for WebSearch call events
- `src/infrastructure/llama-server/LlamaServerClient.ts` — Tool event extraction now includes `query`/`q` argument names for WebSearch call events
- `src/infrastructure/codex-cli/CodexCliClient.ts` — `extractToolInfo` recognizes `web_search`/`websearch` item types; `normalizeToolName` returns `'WebSearch'`; `extractToolFilePath` returns the `action.query`/`query` field for web search items
- `src/infrastructure/claude-cli/StreamSessionTracker.ts` — `inferStage` treats `WebSearch` as a reading-stage tool (same as Read/LS)
- `src/main/ipc/handlers.ts` — Query handlers now broadcast stream events to both `query:onStream` and `chat:streamEvent` channels; each handler generates a unique `callId` for the CLI Activity panel
- `src/infrastructure/ollama-cli/index.ts` — Exported `WebSearcher`

### Architecture Impact
- Cross-provider capability parity: Ollama, llama-server, and Codex CLIs all support WebSearch
- Query Manager events now visible in CLI Activity panel via `chat:streamEvent` (previously only `query:onStream`)
- `StreamEventSource` union gains `'query'` value; CLI Activity store filters these like any other call

### Migration Notes
None — additions are backward compatible. Existing `query:onStream` channel still works for the query store; `chat:streamEvent` is a parallel broadcast for CLI Activity.

---

## [2026-07-12] — Query Manager auto-populate and per-field AI fill

### Summary

Quill can now research and auto-populate submission targets in bulk using web search, and any individual field on a target can be AI-filled on demand. This eliminates manual data entry for the Query Manager.

### Added
- `src/renderer/components/QueryManager/ResearchPanel.tsx` — Streaming panel showing Quill's research progress with "Research again" button
- `src/domain/types.ts` — Added `QueryFillableField`, `QueryResearchResult`, `QueryFieldFillResult` types
- `src/domain/interfaces.ts` — Added `researchTargets()` and `fillTargetField()` to `IQueryService`
- `src/application/QueryService.ts` — Added `researchTargets()` and `fillTargetField()` methods with `buildResearchPrompt()`, `buildFieldFillPrompt()`, `fieldToLabel()` helpers
- `src/main/ipc/handlers.ts` — Added `query:researchTargets` and `query:fillTargetField` IPC handlers
- `src/preload/index.ts` — Added `researchTargets` and `fillTargetField` to query bridge namespace
- `src/renderer/stores/queryStore.ts` — Added `researchTargets`, `fillTargetField` actions + `isResearching`, `researchBuffer`, `fillingFor` state
- `agents/QUILL.md` — Added Phase 7 (target research & field fill), updated Phase 6 personalization, updated Red Lines, added Query Tracker to Files Owned table

### Changed
- `src/infrastructure/claude-cli/ClaudeCodeClient.ts` — Added `WebSearch` to `--allowedTools` argument
- `src/renderer/components/QueryManager/QueryManagerView.tsx` — Added "Research Targets" button and ResearchPanel integration
- `src/renderer/components/QueryManager/TargetCard.tsx` — Added per-field AI fill buttons (`AiFillButton`), restructured info display to structured field rows

### Architecture Impact
- New IPC channels: `query:researchTargets`, `query:fillTargetField`
- CLI tool access: `WebSearch` now available to all agents (not just Quill)
- Agent behavioral change: Quill can now use web search for target research and query letter personalization

### Migration Notes
None — all additions are backward compatible. Existing query tracker files are unchanged.

---

## [2026-07-12] — PipelineSpine integration + pipeline detection for query-agents

### Summary

Integrated the `query-agents` phase into the PipelineSpine UI: added it to the SHIP stage, wired the phase click to navigate to the QueryManagerView instead of the workspace, and added `isPhaseComplete` detection via `source/query-tracker.md`. All architecture docs updated.

### Changed
- `src/application/PipelineService.ts` — Added `case 'query-agents'` to `isPhaseComplete` checking `source/query-tracker.md` via `hasSubstantiveFile`
- `src/renderer/components/PipelineSpine/stages.ts` — Added `'query-agents'` to SHIP stage phase IDs (now 3 phases: build, publish, query-agents)
- `src/renderer/components/PipelineSpine/PipelineSpine.tsx` — Intercepted `query-agents` phase click: navigates to `query-manager` view via `useViewStore` instead of `selectPhase`
- `docs/architecture/ARCHITECTURE.md` — Updated last-updated, added queryStore + QueryManager/ + PipelineSpine/ to source tree, added query-tracker.md + query-letters/ to book directory structure
- `docs/architecture/DOMAIN.md` — Updated last-updated, fixed IQueryService status from planned to implemented
- `docs/architecture/APPLICATION.md` — Updated last-updated
- `docs/architecture/IPC.md` — Updated last-updated
- `docs/architecture/RENDERER.md` — Updated last-updated

### Architecture Impact
- New pipeline phase clickable behavior: `query-agents` phase navigates to `query-manager` view, all other phases select in workspace
- PipelineSpine SHIP stage now has 3 phases (build, publish, query-agents)
- `markPhaseComplete` for `query-agents` was already in place from SESSION-01 (creates `source/query-tracker.md` stub)

### Migration Notes
- None — existing books show `query-agents` as `locked` until `publish` is complete. No breaking changes.

---

## [2026-07-12] — QueryManagerView, components, IconRail entry, view routing

### Summary

Built the full Query Manager UI: 5 React components (QueryManagerView, TargetCard, AddTargetForm, LetterPreview, FilterBar), added `'query-manager'` to ViewId union, added `'mail'` icon, added IconRail entry with book requirement, wired QueryManagerView into AppLayout's ViewContent.

### Added
- `src/renderer/components/QueryManager/QueryManagerView.tsx` — Book-scoped view: tracker load on mount, stats summary, filtered target list, add-target form toggle, letter preview modal
- `src/renderer/components/QueryManager/TargetCard.tsx` — Target card with status badge, inline status dropdown, generate/regenerate/view letter buttons, remove action
- `src/renderer/components/QueryManager/AddTargetForm.tsx` — Form with name, type, contact, method, link, personalization notes, general notes
- `src/renderer/components/QueryManager/LetterPreview.tsx` — Modal overlay for viewing/editing a query letter with save support
- `src/renderer/components/QueryManager/FilterBar.tsx` — Filter selectors by method, status, and type with clear-filters action

### Changed
- `src/renderer/stores/viewStore.ts` — Added `'query-manager'` to ViewId union
- `src/renderer/components/common/Icon.tsx` — Added `'mail'` to IconName union and `mail` envelope path to ICON_PATHS
- `src/renderer/components/Rail/IconRail.tsx` — Added `'query-manager'` to RailView type, added rail item with `mail` icon and `needsBook: true`
- `src/renderer/components/Layout/AppLayout.tsx` — Imported QueryManagerView, added always-mounted hidden-when-inactive div in ViewContent

### Architecture Impact
- New view ID: `'query-manager'` in viewStore and RailView
- New icon: `'mail'` in Icon.tsx
- New component group: `QueryManager/` (5 files)
- New IconRail entry after Exports

### Migration Notes
- None — purely additive. Persisted view state unaffected (new view ID, no legacy mapping needed).

---

## [2026-07-12] — Query Manager renderer store (queryStore)

### Summary

Created the `queryStore` Zustand store for the query management feature. Manages tracker/letter state for the active book, calls the `window.novelEngine.query.*` preload bridge, and exposes actions for target CRUD, letter generation streaming, and letter file I/O. All mutations auto-reload the tracker after completion.

### Added
- `src/renderer/stores/queryStore.ts` — Zustand store with tracker/letters/loading/generating/streamBuffer state. Actions: load, addTarget, updateTargetStatus, removeTarget, generateLetter, readLetter, saveLetter, clear, initStreamListener

### Architecture Impact
- New Zustand store: `queryStore` (`useQueryStore`)
- New stream listener: subscribes to `query:onStream` push events via `window.novelEngine.query.onStream`

### Migration Notes
- None — purely additive. No existing stores modified.

---

## [2026-07-12] — Composition root wiring + Quill Phase 6 prompt

### Summary

Cleaned up the composition root to use a named `queryService` variable instead of inline instantiation. Added Phase 6 (Personalized Query Letters) to `agents/QUILL.md` — covers target context, personalization rules, and output path for per-target query letter generation.

### Changed
- `src/main/index.ts` — Moved `new QueryService(fs, chat)` to named variable `queryService` (line 647), passed as `query: queryService` to handlers
- `agents/QUILL.md` — Added Phase 6: Personalized Query Letters section between Phase 5 and Relationship to Other Agents

### Architecture Impact
- Agent prompt change: QUILL.md now has Phase 6 — personalized per-target query letter generation with specific output path `source/query-letters/{target-slug}.md`

### Migration Notes
- None — the inline instantiation from SESSION-03 is replaced by a named variable. No behavioral change.

---

## [2026-07-12] — IPC handlers and preload bridge for query namespace

### Summary

Wired `QueryService` into the IPC layer: 9 new channels under `query:*` namespace (8 invoke + 1 push event for streaming), `query` namespace on the preload bridge with 9 methods. Composition root wiring (instantiation + injection) was done inline to satisfy the type checker since the handler services object now requires `IQueryService`.

### Added
- `src/main/ipc/handlers.ts` — `IQueryService` import, `query` in services param, 9 IPC handlers (loadTracker, saveTracker, addTarget, updateTargetStatus, removeTarget, generateLetter, listLetters, readLetter, saveLetter)
- `src/preload/index.ts` — Query type imports, `query` namespace with 9 methods (8 invoke + onStream listener)
- `src/main/index.ts` — `QueryService` import + inline instantiation `new QueryService(fs, chat)` in registerIpcHandlers call

### Architecture Impact
- New IPC channels: `query:loadTracker`, `query:saveTracker`, `query:addTarget`, `query:updateTargetStatus`, `query:removeTarget`, `query:generateLetter`, `query:listLetters`, `query:readLetter`, `query:saveLetter`
- New push event: `query:onStream` (StreamEvent from query:generateLetter)
- New preload namespace: `window.novelEngine.query`
- New composition root wiring: `QueryService(fs, chat)`

### Migration Notes
- None — purely additive. Existing code unaffected.

---

## [2026-07-12] — QueryService implementation: tracker I/O, CRUD, letter generation

### Summary

Implemented `QueryService` in the application layer. Parses/serializes `source/query-tracker.md` (markdown with `## [Name] — {Status}` sections), manages `source/query-letters/` directory, and generates personalized query letters by creating a Quill conversation and streaming via `IChatService.sendMessage`. Simplified constructor from 5 deps to 2 (IFileSystemService, IChatService) since chat service already handles context assembly internally.

### Added
- `src/application/QueryService.ts` — Full `IQueryService` implementation: tracker parsing/serialization, target CRUD, query letter generation via Quill, letter file management
- `src/application/index.ts` — Added `QueryService` barrel export

### Architecture Impact
- New service: `QueryService` (M08 application layer)
- Dependencies: `IFileSystemService`, `IChatService` (injected in composition root — wiring in SESSION-04)

### Migration Notes
- None — service exists but is not yet wired into the composition root or IPC handlers.

---

## [2026-07-12] — Query Manager domain types and pipeline phase registration

### Summary

Added the domain layer foundation for the query management system: new `PipelinePhaseId` value `'query-agents'` (15th phase, after `publish`), six new query types (`QueryTargetType`, `QueryStatus`, `QuerySubmissionMethod`, `QueryTarget`, `QueryTracker`, `QueryLetter`), the `IQueryService` interface, and two new Quill quick actions for query research. Also fixed the exhaustiveness guard in `PipelineService.markPhaseComplete` to handle the new phase.

### Added
- `src/domain/types.ts` — `QueryTargetType`, `QueryStatus`, `QuerySubmissionMethod`, `QueryTarget`, `QueryTracker`, `QueryLetter` types after the Revision Queue section
- `src/domain/interfaces.ts` — `IQueryService` interface with 9 methods: `loadTracker`, `saveTracker`, `addTarget`, `updateTargetStatus`, `removeTarget`, `generateQueryLetter`, `listQueryLetters`, `readQueryLetter`, `saveQueryLetter`
- `src/domain/constants.ts` — `'query-agents'` entry in `PIPELINE_PHASES` (Quill agent, 15th phase)
- `src/domain/constants.ts` — `'query-agents'` entry in `PHASE_OUTPUT_FILES` mapping to `['source/query-tracker.md']`
- `src/domain/constants.ts` — Two new Quill quick actions: 'Analyze for queries' and 'Find agents for this book'

### Changed
- `src/domain/types.ts` — `PipelinePhaseId` union extended with `| 'query-agents'` (14 → 15 values)
- `src/application/PipelineService.ts` — `markPhaseComplete` switch: added `case 'query-agents'` to satisfy exhaustiveness guard (creates stub `source/query-tracker.md`)

### Architecture Impact
- New pipeline phase: `'query-agents'` (15th phase, after `'publish'`)
- New service interface: `IQueryService` (implementation pending in SESSION-02)
- Quill quick actions expanded from 4 to 6 entries

### Migration Notes
- None — the new phase is additive. Existing books without `source/query-tracker.md` will show `query-agents` as locked until `publish` is confirmed.

---

## [2026-07-02] — Increase context ceiling + add compaction for Ollama/llama-server

### Summary

Large-context models (e.g., `kimi-k2.6:cloud` with 262K tokens) were hitting the 125K hard `MAX_CALL_CONTEXT_TOKENS` cap and the 90% context-ceiling in `OllamaCodeClient`/`LlamaServerClient`, causing the agent loop to break mid-task. Raised the global cap to 250K, softened the ceiling to 98%, added proactive compaction of old tool results at the 80% threshold, and integrated `compactToolHistory` from `contextCompactor` (was never imported) so the loop only stops after compaction fails.

### Changed
- `src/domain/constants.ts` — `MAX_CALL_CONTEXT_TOKENS` raised from `125_000` to `250_000`
- `src/infrastructure/ollama-cli/OllamaCodeClient.ts` — `contextCeiling` raised from 90% to 98%; added 80% compaction threshold that triggers `compactToolHistory` before hard-ceiling check
- `src/infrastructure/llama-server/LlamaServerClient.ts` — same ceiling/compaction changes as OllamaCodeClient
- `src/infrastructure/ollama-cli/contextCompactor.ts` — now imported by both OllamaCodeClient and LlamaServerClient

### Architecture Impact
- `MAX_CALL_CONTEXT_TOKENS` increased to 250K to match modern large-context models.
- Both Ollama and llama-server agents now compact old tool results and assistant messages when context exceeds 80% of window, rather than breaking at 90%.

### Migration Notes
None

---

## [2026-03-29] — Architecture Engine readme

### Summary

Wrote `prompts/meta/architecture-engine/readme.md` explaining what the architecture engine (Forge) does in plain language. Covers purpose, workflow, output structure, and when to use it. Notes the Opus requirement.

### Changed
- `prompts/meta/architecture-engine/readme.md` — Replaced empty heading with full explainer

### Architecture Impact
None — documentation only, no source code changes.

### Migration Notes
None

---

## [2026-03-29] — Sidebar bookshelf + FilesView tabs

### Summary

Restructured the UI in two ways: (1) FilesView's 2-tab layout (Files | Motif Ledger) replaced with 5 category tabs (Source, Chapters, Agents, Explorer, Motif Ledger), each rendering its panel directly without the StructuredBrowser/CollapsibleSection wrappers; (2) Sidebar's BookSelector dropdown + FileTree replaced with a permanently visible BookPanel component featuring an icon toolbar and scrollable book cards.

### Added

- `src/renderer/components/Sidebar/BookPanel.tsx` — Persistent bookshelf: icon toolbar (New Book, Shelved Pitches, Archived Books, Manage Series, Import), scrollable book cards with cover/title/status/wordcount/archive, series grouping via SeriesGroup. Migrates all data loading and management logic from BookSelector.
- `src/renderer/components/Sidebar/ImportChoiceModal.tsx` — Modal with two card choices: Single Book import or Series import.

### Changed

- `src/renderer/components/Files/FilesView.tsx` — 2-tab (Files | Motif Ledger) → 5-tab (Source, Chapters, Agents, Explorer, Motif Ledger). Browser mode renders tab-specific panels directly. Reader/editor mode unchanged. Removed StructuredBrowser import, added direct SourcePanel/ChaptersPanel/AgentOutputPanel imports.
- `src/renderer/components/Layout/Sidebar.tsx` — Removed BookSelector + FileTree. Replaced with BookPanel. PitchHistory capped at max-h-48.
- `src/renderer/tours/tourDefinitions.ts` — `welcome-file-tree` step retargeted from `[data-tour="file-tree"]` to `[data-tour="sidebar-nav"]` with updated body text.

### Removed

- `src/renderer/components/Files/StructuredBrowser.tsx` — Decomposed into individual tabs in FilesView.
- `src/renderer/components/Files/CollapsibleSection.tsx` — No longer used by any component.
- `src/renderer/components/Sidebar/FileTree.tsx` — Replaced by Explorer tab in FilesView.
- `src/renderer/components/Sidebar/BookSelector.tsx` — Replaced by BookPanel.

### Architecture Impact

- No new IPC channels, stores, or services.
- No domain/infrastructure/application changes.
- Tour target changed: `data-tour="file-tree"` removed from DOM, `welcome-file-tree` step retargeted.
- `data-tour="book-selector"` preserved on BookPanel root element.

### Migration Notes

None — renderer-only restructuring, no breaking API changes.

---

## [2026-03-28] — batch-find-replace feature (Sessions 01–04)

### Summary

Adds a bulk Find & Replace feature scoped to all chapter draft files in a book. Authors can search with literal or regex patterns, preview per-chapter match locations with inline highlighting, selectively apply replacements, and rely on automatic version snapshots (source='user') for safe revert. The feature is surfaced via a three-phase modal accessible from the FilesView header. No new Zustand store — all modal state is local.

### Added

- `src/domain/types.ts` — Added `FindReplaceOptions`, `FindReplaceMatchLocation`, `FindReplacePreviewItem`, `FindReplacePreviewResult`, `FindReplaceApplyResult` under new `// === Find & Replace ===` section
- `src/domain/interfaces.ts` — Added `IFindReplaceService` with `preview()` and `apply()` methods; added 3 type imports (`FindReplaceApplyResult`, `FindReplaceOptions`, `FindReplacePreviewResult`) to the import block
- `src/application/FindReplaceService.ts` — New: implements `IFindReplaceService`. Module-level `buildRegex()` helper. `preview()` scans `chapters/*/draft.md`, caps match locations at 20/file, sorts by match count descending. `apply()` snapshots before write (source='user'), skips files with no matches
- `src/renderer/components/Files/FindReplaceModal.tsx` — New: fixed overlay modal with three phases (input/preview/result). Sub-components: `InputSection`, `ToggleButton`, `PreviewSection`, `ChapterMatchRow`, `MatchLine`, `ResultSection`

### Changed

- `src/main/index.ts` — Imported `FindReplaceService`; instantiated `findReplace = new FindReplaceService(fs, version)` after `version`; added `findReplace` to `registerIpcHandlers(...)` call
- `src/main/ipc/handlers.ts` — Added `IFindReplaceService` to interface imports; added `FindReplaceApplyResult`, `FindReplaceOptions`, `FindReplacePreviewResult` to type imports; extended `services` parameter type; registered `findReplace:preview` and `findReplace:apply` handlers at end of function body
- `src/preload/index.ts` — Added `FindReplaceApplyResult`, `FindReplaceOptions`, `FindReplacePreviewResult` to type imports; added `findReplace: { preview, apply }` namespace before `helper`
- `src/renderer/components/Files/FilesHeader.tsx` — Added `onFindReplace?: () => void` to `FilesHeaderProps`; added "⇄ Find & Replace" button before the view mode switcher group
- `src/renderer/components/Files/FilesView.tsx` — Imported `FindReplaceModal`; added `showFindReplace` state; passed `onFindReplace` to `FilesHeader`; mounted `FindReplaceModal` conditionally before root closing div

### Architecture Impact

- New service: `FindReplaceService` → `IFileSystemService` + `IVersionService`
- New IPC channels: `findReplace:preview`, `findReplace:apply`
- New preload namespace: `window.novelEngine.findReplace.{ preview, apply }`

### Migration Notes

None — no schema changes, no renamed channels, no breaking changes.

---

## [2026-03-28] — Deployment Prep: release notes, README update, website rebuild

### Summary

Executed the full deployment prep pipeline. Generated `RELEASE_NOTES.md` (v0.6.0) cataloging all changes since v0.5.8 — 25 commits, 132 files changed, 4 new features. Updated `README.md` with Series Bible, Series Import, In-App Helper, Guided Tours & Tooltips features; corrected file count (136→158), store count (17→20); added new infrastructure/application/component/store entries to the source tree. Rebuilt all 6 GitHub Pages HTML files — updated version to v0.6.0, added 4 feature cards to landing page, updated stats (158 files, 20 stores, ~44K LOC), added 5 new changelog entries to changelog.html, updated architecture.html source tree and dependency graph.

### Added
- `RELEASE_NOTES.md` — Release notes for v0.6.0 with categorized changes, highlights, and full commit log

### Changed
- `README.md` — Added 4 new Key Features sections (Series Bible, Series Import, In-App Helper, Guided Tours & Tooltips); updated source tree with series/, HelperService, SeriesImportService, 4 new stores, 4 new component directories, tours/; corrected counts (158 files, 20 stores)
- `docs/index.html` — Version v0.6.0; added 4 feature cards (Series Bible, Series Import, In-App Helper, Guided Tours & Tooltips)
- `docs/architecture.html` — Version v0.6.0; 158 files; added series/ to infra, HelperService + SeriesImportService to app, updated stores (20), hooks (6), component groups (16), added tours/; updated dependency graph
- `docs/changelog.html` — Version v0.6.0; 63 entries; added 5 new entries + 3 new highlights
- `docs/press.html` — Version v0.6.0; updated stats (158 files, ~44K LOC, 20 stores)
- `docs/contact.html` — Version v0.6.0
- `docs/evaluation.html` — Version v0.6.0

### Architecture Impact
None — documentation and website assets only, no source code changes.

### Migration Notes
None

---

## [2026-03-28] — Add in-app Helper agent (floating help chat)

### Summary

Added a non-creative Helper agent accessible via a floating chat bubble in the bottom-right corner of the app. The helper uses a comprehensive user guide as its knowledge base and answers questions about Novel Engine features, workflows, agents, troubleshooting, and more. The helper conversation persists across book switches and view navigation.

### Added
- `src/domain/types.ts` — Added `'Helper'` to `AgentName`, excluded from `CreativeAgentName`, added `'helper'` to `ConversationPurpose`
- `src/domain/constants.ts` — Added `Helper` entry to `AGENT_REGISTRY` (blue-500, 2K thinking, 5 max turns), `HELPER_SLUG = '__helper__'` constant, `Helper` in `AGENT_RESPONSE_BUFFER`
- `src/domain/interfaces.ts` — Added `IHelperService` interface (sendMessage, getOrCreateConversation, getMessages, abortStream, resetConversation)
- `agents/HELPER.md` — Helper agent system prompt with behavior rules and conversation style
- `docs/USER_GUIDE.md` — Comprehensive 16-section user guide covering all features
- `src/application/HelperService.ts` — Implements `IHelperService`. Loads agent prompt + user guide, manages persistent conversation, delegates to CLI via `IProviderRegistry`
- `src/renderer/stores/helperStore.ts` — Zustand store for helper panel visibility, conversation, messages, streaming state
- `src/renderer/components/Helper/HelperButton.tsx` — Fixed-position floating help button (bottom-right)
- `src/renderer/components/Helper/HelperPanel.tsx` — Slide-up chat panel with header, message list, and input
- `src/renderer/components/Helper/HelperMessageList.tsx` — Scrollable message list with streaming, thinking, and empty state support
- `src/main/bootstrap.ts` — Added `ensureUserGuide()` function to copy USER_GUIDE.md to userData on every startup

### Changed
- `src/main/index.ts` — Instantiates `HelperService` in composition root, passes to IPC handlers, calls `ensureUserGuide` on startup
- `src/main/ipc/handlers.ts` — Added 5 `helper:*` IPC channels (getOrCreateConversation, getMessages, send, abort, reset)
- `src/preload/index.ts` — Added `helper` namespace to preload bridge API
- `src/renderer/components/Layout/AppLayout.tsx` — Added HelperButton, HelperPanel, and helper stream listener
- `src/renderer/components/Chat/ChatModal.tsx` — Added `'helper'` entry to `PURPOSE_LABELS` Record
- `forge.config.ts` — Added `./docs` to `extraResource` for packaged builds

### Architecture Impact
- New type union member: `'Helper'` in `AgentName`, `'helper'` in `ConversationPurpose`
- New constant: `HELPER_SLUG = '__helper__'`
- New interface: `IHelperService` in domain
- New service: `HelperService` in application layer
- New IPC channels: `helper:getOrCreateConversation`, `helper:getMessages`, `helper:send`, `helper:abort`, `helper:reset`
- New Zustand store: `helperStore`
- New components: `Helper/HelperButton`, `Helper/HelperPanel`, `Helper/HelperMessageList`
- New dependency: `HelperService` → `ISettingsService`, `IAgentService`, `IDatabaseService`, `IFileSystemService`, `IProviderRegistry`, `StreamManager`

### Migration Notes
None — no breaking changes. The new `'helper'` ConversationPurpose value and `'Helper'` AgentName are additive.

---

## [2026-03-28] — Onboarding Guide & Tooltips — SESSION-05: Polish, edge cases & documentation

### Summary

Final polish for the onboarding/tooltip system. Tooltips are now suppressed during active guided tours to prevent visual clutter. GuidedTourOverlay handles window resize and element resize (sidebar collapse/expand) via `resize` event listener and `ResizeObserver`. Accessibility improvements: `aria-modal`, `aria-live="polite"` on step body, `aria-describedby` on tooltip triggers, auto-focus on Next button. Added a help "?" button in the sidebar header with a popover to launch tours on demand. Updated all architecture documentation.

### Changed
- `src/renderer/components/common/Tooltip.tsx` — Suppress tooltips during active tours via `useTourStore`; added `aria-describedby` with `useId()`; added `id` to tooltip portal
- `src/renderer/components/common/GuidedTourOverlay.tsx` — Window resize listener; `ResizeObserver` on target element; `aria-modal="true"`; `aria-live="polite"` on step body; auto-focus Next button via ref
- `src/renderer/components/Layout/Sidebar.tsx` — Added `HelpButton` component with "?" icon and popover for launching Welcome Tour and Pipeline Guide
- `docs/architecture/ARCHITECTURE.md` — Updated source tree with tourStore, tours/, common/, useTooltip.ts
- `docs/architecture/RENDERER.md` — Updated Tooltip, GuidedTourOverlay, and Sidebar descriptions

### Architecture Impact
- No new IPC channels, stores, or infrastructure changes
- Tooltip suppression reads existing tourStore state — no new business logic
- Help button uses existing `startTour()` action

### Migration Notes
- None

---

## [2026-03-28] — Onboarding Guide & Tooltips — SESSION-03: Wire tours into app, auto-launch

### Summary

Wired the guided tour system into the app. `TourManager` hydrates the tour store from settings on mount. `TourOverlayRenderer` conditionally renders `GuidedTourOverlay` when a tour is active. The welcome tour auto-launches after onboarding via a 500ms delayed `startTour('welcome')`. Settings now has a "Guided Tours" section with replay buttons for all three tours, showing green checkmarks for completed ones.

### Changed
- `src/renderer/components/Layout/AppLayout.tsx` — Added `TourManager` + `TourOverlayRenderer` components; imports for tourStore, settingsStore, TOUR_DEFINITIONS, GuidedTourOverlay
- `src/renderer/components/Onboarding/OnboardingWizard.tsx` — Auto-launches welcome tour after `navigate('chat')` with 500ms delay
- `src/renderer/components/Settings/SettingsView.tsx` — Added `GuidedToursSection` with replay buttons for all 3 tours, green checkmarks for completed

### Architecture Impact
- No new IPC channels, stores, or infrastructure changes
- Tour lifecycle fully contained in renderer layer

### Migration Notes
- None

---

## [2026-03-28] — Onboarding Guide & Tooltips — SESSION-04: Tooltips everywhere

### Summary

Added contextual tooltips to 14 components across the renderer. Every sidebar button, pipeline phase, nav item, chat control, file view toggle, and window control now has a descriptive tooltip. NavButton and PhaseRow converted to `forwardRef` to support Tooltip's `cloneElement` ref merging. No business logic changes — purely presentational.

### Changed
- `src/renderer/components/Layout/Sidebar.tsx` — Import Tooltip; wrap each NavButton with placement="right" tooltips; convert NavButton to forwardRef
- `src/renderer/components/Layout/TitleBar.tsx` — Tooltips on minimize/maximize/close buttons
- `src/renderer/components/Sidebar/HotTakeButton.tsx` — Tooltip: "Get Ghostlight's unfiltered first impression"
- `src/renderer/components/Sidebar/AdhocRevisionButton.tsx` — Tooltip: "Start a one-off revision session"
- `src/renderer/components/Sidebar/VoiceSetupButton.tsx` — Tooltip: "Set up your writing voice profile"
- `src/renderer/components/Sidebar/CliActivityButton.tsx` — Tooltip: "View active and recent AI agent activity"
- `src/renderer/components/Sidebar/RevisionQueueButton.tsx` — Tooltip: "Open the automated revision queue"
- `src/renderer/components/Sidebar/PipelineTracker.tsx` — Tooltip per phase row showing agent + description; convert PhaseRow to forwardRef
- `src/renderer/components/Chat/ChatInput.tsx` — Tooltip on send button
- `src/renderer/components/Chat/QuickActions.tsx` — Tooltip on quick actions trigger
- `src/renderer/components/Chat/ThinkingBudgetSlider.tsx` — Tooltip on label and reset button
- `src/renderer/components/Files/FilesHeader.tsx` — Tooltips on browser/reader view mode buttons

### Architecture Impact
- None — purely presentational changes. No new state, IPC channels, or stores.

### Migration Notes
- None

---

## [2026-03-28] — Onboarding Guide & Tooltips — SESSION-02: Tour definitions, store, and data-tour attributes

### Summary

Created the three guided tour content definitions (welcome, first-book, pipeline-intro), a Zustand store for tour lifecycle management, and added `data-tour` attributes to 8 existing components for spotlight anchoring. The tour store persists completion state through the existing `settings:update` IPC channel.

### Added
- `src/renderer/tours/tourDefinitions.ts` — Tour step arrays for 3 tours: welcome (6 steps), first-book (3 steps), pipeline-intro (7 steps)
- `src/renderer/stores/tourStore.ts` — Zustand store: `activeTourId`, `completedTours`, `hydrate`, `startTour`, `completeTour`, `dismissTour`, `resetTour`

### Changed
- `src/renderer/components/Layout/Sidebar.tsx` — Added `data-tour="sidebar-nav"` and `data-tour="file-tree"`
- `src/renderer/components/Layout/AppLayout.tsx` — Added `data-tour="main-content"` to `<main>`
- `src/renderer/components/Sidebar/BookSelector.tsx` — Added `data-tour="book-selector"`
- `src/renderer/components/Sidebar/PipelineTracker.tsx` — Added `data-tour="pipeline-tracker"` and per-phase `data-tour="pipeline-phase-{id}"`
- `src/renderer/components/Chat/ChatView.tsx` — Added `data-tour="chat-view"`
- `src/renderer/components/Chat/ChatInput.tsx` — Added `data-tour="chat-input"`
- `src/renderer/components/Chat/QuickActions.tsx` — Added `data-tour="quick-actions"`

### Architecture Impact
- New store: `tourStore` (persists via existing `settings:update` channel)
- New directory: `src/renderer/tours/`
- 8 components gained inert `data-tour` attributes — zero behavioral change

### Migration Notes
- None

---

## [2026-03-28] — Onboarding Guide & Tooltips — SESSION-01: Foundation types and components

### Summary

Added the domain types and renderer foundation for the guided tour and tooltip system. New types (`TourId`, `TourStep`, `TourStepPlacement`, `TourState`) define the tour data model. A reusable `Tooltip` component renders via React portal with configurable placement, delay, and arrow. A `GuidedTourOverlay` component provides a spotlight-based tour engine with clip-path cutouts, keyboard navigation, and step-by-step popovers. `AppSettings` extended with `completedTours` to persist tour completion state.

### Added
- `src/renderer/hooks/useTooltip.ts` — Hook for tooltip positioning via `getBoundingClientRect`, configurable delays, viewport edge clamping
- `src/renderer/components/common/Tooltip.tsx` — Portal-based tooltip with arrow, fade+slide animation, multi-line support
- `src/renderer/components/common/GuidedTourOverlay.tsx` — Spotlight overlay with CSS clip-path, step navigation (keyboard + buttons), view auto-navigation

### Changed
- `src/domain/types.ts` — Added `TourId`, `TourStepPlacement`, `TourStep`, `TourState` types; added `completedTours: TourId[]` to `AppSettings`
- `src/domain/constants.ts` — Added `completedTours: []` to `DEFAULT_SETTINGS`

### Architecture Impact
- New types: `TourId`, `TourStep`, `TourStepPlacement`, `TourState`
- `AppSettings` extended with `completedTours` field
- New directory: `src/renderer/components/common/`
- No new IPC channels — tour state uses existing `settings:update`

### Migration Notes
- None — `completedTours` defaults to `[]`, existing settings files will be backfilled by the settings merge logic

---

## [2026-03-28] — Series Import feature (4 sessions)

### Summary

Added batch manuscript import with series grouping. Users can select multiple files at once, preview them as ordered volumes, edit titles, reorder, skip individual volumes, and either create a new series or add to an existing one. The feature composes the existing `IManuscriptImportService` (single-book import) and `ISeriesService` (series CRUD) through a new `SeriesImportService` in the application layer — no infrastructure changes needed.

### Added
- `src/domain/types.ts` — Added `SeriesImportVolume`, `SeriesImportPreview`, `SeriesImportCommitConfig`, `SeriesImportResult` types
- `src/domain/interfaces.ts` — Added `ISeriesImportService` interface (2 methods: `preview`, `commit`)
- `src/application/SeriesImportService.ts` — Orchestrates batch preview + sequential commit with series name detection (longest-common-prefix strategy)
- `src/renderer/stores/seriesImportStore.ts` — Zustand store managing wizard state, volume editing, reordering, skip toggles
- `src/renderer/components/Import/ImportSeriesWizard.tsx` — Full wizard modal with loading/preview/importing/success/error states
- `src/renderer/components/Import/VolumePreviewList.tsx` — Volume list with inline title editing, reorder arrows, skip toggles

### Changed
- `src/main/index.ts` — Instantiates `SeriesImportService`, passes to `registerIpcHandlers`
- `src/main/ipc/handlers.ts` — Added 3 handlers: `import:selectFiles` (multi-select dialog), `import:seriesPreview`, `import:seriesCommit`
- `src/preload/index.ts` — Added `seriesImport` namespace to preload bridge with `selectFiles`, `preview`, `commit`
- `src/renderer/components/Sidebar/BookSelector.tsx` — Added "Import Series" button and `ImportSeriesWizard` rendering

### Architecture Impact
- New service: `SeriesImportService` → `IManuscriptImportService` + `ISeriesService`
- New IPC channels: `import:selectFiles`, `import:seriesPreview`, `import:seriesCommit`
- New preload bridge namespace: `window.novelEngine.seriesImport`
- New Zustand store: `seriesImportStore`

### Migration Notes
- None — purely additive feature, no breaking changes

---

## [2026-03-28] — Series Bible feature (7 sessions)

### Summary

Added series support — group multiple books into ordered series with a shared story bible that persists across volumes and is automatically loaded into agent context. Series are file-based (JSON manifest + markdown bible), stored in `{userData}/series/{slug}/`. A reverse-lookup cache enables O(1) book→series resolution on every chat message. The ContextBuilder injects the series bible path into agent system prompts when a book belongs to a series. All 7 creative agents have `series-bible.md` added to their `readIfRelevant` guidance.

### Added
- `src/domain/types.ts` — Added `SeriesVolume`, `SeriesMeta`, `SeriesSummary` types
- `src/domain/interfaces.ts` — Added `ISeriesService` interface (12 methods: CRUD, volume management, bible I/O, reverse lookup, cache invalidation)
- `src/infrastructure/series/SeriesService.ts` — Full `ISeriesService` implementation with file-based storage and in-memory reverse-lookup cache
- `src/infrastructure/series/index.ts` — Barrel export
- `src/renderer/stores/seriesStore.ts` — Zustand store with full CRUD, volume management, bible editor state, and modal visibility
- `src/renderer/components/Sidebar/SeriesGroup.tsx` — Collapsible series group for sidebar book list
- `src/renderer/components/Series/SeriesModal.tsx` — Main series management modal (list/create/edit/bible modes)
- `src/renderer/components/Series/SeriesForm.tsx` — Create/edit series name and description form
- `src/renderer/components/Series/VolumeList.tsx` — Volume ordering with up/down arrows, add/remove books
- `src/renderer/components/Series/SeriesBibleEditor.tsx` — Markdown editor for shared series bible

### Changed
- `src/domain/constants.ts` — Added `seriesBible` to `FILE_MANIFEST_KEYS`; added `'series-bible.md'` to `readIfRelevant` for all 7 creative agents
- `src/application/ContextBuilder.ts` — Accepts `seriesBiblePath` param; replaces placeholder in guidance and adds series context block to system prompt
- `src/application/ChatService.ts` — Added `ISeriesService` dependency; resolves series bible path before context assembly
- `src/main/index.ts` — Instantiates `SeriesService`, passes to `ChatService` and `registerIpcHandlers`; invalidates series cache on books directory changes
- `src/main/bootstrap.ts` — Creates `series/` directory on first run
- `src/main/ipc/handlers.ts` — Added 11 `series:*` IPC handlers
- `src/preload/index.ts` — Added `series` namespace to preload bridge (11 methods)
- `src/renderer/components/Sidebar/BookSelector.tsx` — Groups books by series with collapsible headers; added "Manage Series" button; renders SeriesModal

### Architecture Impact
- New domain types: `SeriesVolume`, `SeriesMeta`, `SeriesSummary`
- New interface: `ISeriesService`
- New infrastructure module: `src/infrastructure/series/`
- New dependency: `ChatService` → `ISeriesService`
- New IPC channels: `series:list`, `series:get`, `series:create`, `series:update`, `series:delete`, `series:addVolume`, `series:removeVolume`, `series:reorderVolumes`, `series:getForBook`, `series:readBible`, `series:writeBible`
- New preload bridge namespace: `window.novelEngine.series`
- New Zustand store: `seriesStore`
- New components: `SeriesGroup`, `SeriesModal`, `SeriesForm`, `VolumeList`, `SeriesBibleEditor`

### Migration Notes
None — series data is opt-in. Existing books continue to work as standalone. No schema changes (file-based storage).

---

## [2026-03-28] — Full rebuild of GitHub Pages website (6 pages)

### Summary

Rebuilt the complete 6-page GitHub Pages site in `docs/`. Landing page (`index.html`) rebuilt with hero, 7 agent cards, 14-phase pipeline visualization, 10 feature cards, getting started guide, published books grid, and screenshot gallery. Architecture page (`architecture.html`) rebuilt with CSS-based 5-layer diagram, 14-row tech stack table, service dependency graph, 6 design decision cards, 7-table schema overview, annotated source tree, and contributing guide. Changelog page (`changelog.html`) built from scratch — parsed all 52 CHANGELOG.md entries into collapsible `<details>` elements with categorized sections, summary stats (52 entries, 136 source files), and a 6-item highlight reel. Press page (`press.html`) built from scratch — quotable pitch, 8 differentiator cards, published books grid with Amazon links, evaluation callout (7.0–9.4/10), 8 stats cards (7 agents, 14 phases, 80+ IPC channels, 136 files, ~31K LOC, 17 stores, 7 tables, 5 novels), 5 quotable lines, 5 asset links, and contact block. Contact page (`contact.html`) built from scratch — 3 contact cards, 5-step contribution flow, 6 architecture rules, 4 bug report fields, testers-wanted callout with platform badges, and AGPL-3.0 license block. Evaluation page (`evaluation.html`) left untouched — already has nav/footer from prior session. All pages share identical design tokens, sticky nav with hamburger mobile menu, 3-column footer, IntersectionObserver fade-up animations, and responsive breakpoints (1050px, 760px). No external CSS, no JS frameworks, no tracking.

### Added
- `docs/changelog.html` — Full formatted changelog with 52 collapsible entries, stats, and highlight reel
- `docs/press.html` — Press kit with pitch, differentiators, books, stats, quotes, assets, contact
- `docs/contact.html` — Contact cards, contribution guide, bug reporting, testers-wanted, license

### Changed
- `docs/index.html` — Rebuilt with updated feature cards (Manuscript Import added), corrected stats (17 stores, 136 files), updated screenshots
- `docs/architecture.html` — Rebuilt with current source tree, updated dependency graph, corrected file/store/table counts

### Architecture Impact
None — website assets only, no source code changes

### Migration Notes
None

---

## [2026-03-28] — README deep update from source code analysis

### Summary

Comprehensive rewrite of `README.md` based on a full audit of every source file across all five architecture layers. Every feature, type, service, pipeline phase, agent, and IPC channel was verified against actual code. New features added: Manuscript Import, Source Generation, CLI Activity Monitor, Modal Chat, File Version History, File Watchers, OS Notifications, Book Management (archive/unarchive/covers/catalog export), Multi-Model Provider Support, Chapter Validation. Source tree updated to reflect current 136-file codebase including `import/` subdirectories, `importStore.ts`, and all 17 Zustand stores. Store count corrected from 16 to 17. Application service list updated to include ManuscriptImportService and SourceGenerationService. Removed `VERITY-LEGACY.md` from the custom-agents listing (it's excluded from restoration).

### Changed
- `README.md` — Full rewrite. Verified all 7 agents against `constants.ts`. Verified all 14 pipeline phases against `PipelineService.ts`. Verified all npm scripts against `package.json`. Verified tech stack versions. Updated src/ tree to include `import/ChapterDetector.ts`, `ManuscriptImportService.ts`, `SourceGenerationService.ts`, `Import/` components, `importStore.ts`. Added 8 new Key Features sections (Manuscript Import, CLI Activity Monitor, Modal Chat, File Version History, File Watchers, OS Notifications, Book Management, Multi-Model Provider Support, Chapter Validation). Corrected store count to 17. Corrected application service listing. Preserved Dedication, Book list, and Testers Needed sections verbatim.

### Architecture Impact
None — no wiring changes.

### Migration Notes
None

---

## [2026-03-28] — CLI-based motif ledger schema normalization

### Summary

Replaced the hardcoded field-mapping normalizers in `MotifLedgerService` with a CLI-based normalization step. When `load()` detects a non-canonical JSON shape (agent-written fields like `associatedCharacters`, object-typed `firstAppearance`, `plant`/`payoff` foreshadow objects, etc.), it sends the raw JSON to a Sonnet CLI call with a structured prompt containing the full target schema and mapping rules. The normalized result is saved back to disk so normalization only fires once per malformed file. Falls back to a best-effort parse if the CLI call fails. A spinner in the Motif Ledger UI shows progress during normalization.

### Changed
- `src/application/MotifLedgerService.ts` — Added `IProviderRegistry` dependency. Replaced per-type normalizer functions with `isCanonicalShape()` shape detection + `normalizeViaCli()` CLI call. Added `parseLedgerFromCanonical()` as best-effort fallback. Added `setNormalizationCallback()` for progress events. `load()` now saves normalized data back to disk.
- `src/main/index.ts` — Passes `providerRegistry` to `MotifLedgerService` constructor. Registers normalization callback that broadcasts `motifLedger:normalizing` events to all renderer windows.
- `src/preload/index.ts` — Added `onNormalizing()` event listener to `motifLedger` namespace.
- `src/renderer/stores/motifLedgerStore.ts` — Added `isNormalizing` state and `setNormalizing()` action.
- `src/renderer/components/MotifLedger/MotifLedgerView.tsx` — Subscribes to `motifLedger:normalizing` push events. Shows animated spinner with "Normalizing ledger format via AI..." message during CLI normalization.

### Architecture Impact
- `MotifLedgerService` now depends on `IProviderRegistry` (was `IFileSystemService` only)
- New push event: `motifLedger:normalizing`
- New preload bridge method: `motifLedger.onNormalizing()`

### Migration Notes
None — backward compatible. Existing canonical ledger files are loaded without CLI calls. Non-canonical files are normalized on first load and saved back to disk.

---

## [2026-03-28] — Manuscript Import feature (6 sessions)

### Summary

Added the ability to import an existing manuscript (.md, .markdown, .txt, or .docx) into Novel Engine. The import wizard detects chapter boundaries via pattern matching, lets the user review/rename/merge chapters, then creates the full book directory structure with status set to `first-draft`. After import, the user can optionally trigger multi-agent source document generation (Spark for pitch, Verity for outline/bible/voice/motif) with per-step progress tracking.

### Added
- `src/domain/types.ts` — Added `ImportSourceFormat`, `DetectedChapter`, `ImportPreview`, `ImportCommitConfig`, `ImportResult`, `SourceGenerationStep`, `SourceGenerationEvent` types
- `src/domain/interfaces.ts` — Added `IManuscriptImportService` and `ISourceGenerationService` interfaces
- `src/application/import/ChapterDetector.ts` — Pure utility: detects chapter boundaries by heading patterns, "Chapter N" patterns, or fallback single-chapter. Includes ambiguity detection for uneven splits and short documents.
- `src/application/ManuscriptImportService.ts` — Implements `IManuscriptImportService`. Reads files, converts DOCX via Pandoc, runs chapter detection, commits by creating book structure.
- `src/application/SourceGenerationService.ts` — Implements `ISourceGenerationService`. Runs 4 sequential agent calls (Spark pitch, Verity outline+bible, Verity voice, Verity motif) with per-step progress events.
- `src/renderer/stores/importStore.ts` — Zustand store managing the multi-step import wizard state machine (idle → loading → preview → importing → success → generating → generated).
- `src/renderer/components/Import/ImportWizard.tsx` — Modal wizard with step-based rendering: file analysis, chapter preview with editing, import progress, success, source generation progress.
- `src/renderer/components/Import/ChapterPreviewList.tsx` — Scrollable chapter list with inline rename, merge, and remove controls.

### Changed
- `src/main/index.ts` — Instantiates `ManuscriptImportService` and `SourceGenerationService`, passes to `registerIpcHandlers`
- `src/main/ipc/handlers.ts` — Added `import:selectFile`, `import:preview`, `import:commit`, `import:generateSources` handlers
- `src/preload/index.ts` — Added `window.novelEngine.import` namespace with `selectFile`, `preview`, `commit`, `generateSources`, `onGenerationProgress`
- `src/renderer/components/Sidebar/BookSelector.tsx` — Replaced single "New Book" button with "New Book" + "Import" side-by-side. Renders `ImportWizard` modal.

### Architecture Impact
- New services: `ManuscriptImportService` → `IFileSystemService`, `SourceGenerationService` → `ISettingsService`, `IAgentService`, `IDatabaseService`, `IFileSystemService`, `IProviderRegistry`
- New IPC channels: `import:selectFile`, `import:preview`, `import:commit`, `import:generateSources`
- New push event: `import:generationProgress`
- New preload bridge namespace: `window.novelEngine.import`
- New Zustand store: `importStore`
- New components: `Import/ImportWizard.tsx`, `Import/ChapterPreviewList.tsx`

### Migration Notes
- None — no schema changes, no breaking API changes

---

## [2026-03-28] — Update GitHub Pages website with all latest features

### Summary

Rebuilt all 6 GitHub Pages HTML files to reflect the current state of the codebase. Added multi-model provider support, file version history, and catalog export to landing page feature cards. Updated architecture page with `providers/` infrastructure module, `file_versions` and `schema_version` tables (7 total), 130 source files, 16 stores, and complete service dependency graph including ProviderRegistry. Rebuilt changelog page with all 39 entries (up from 21) including the full multi-model provider series (7 sessions), version history series (6 sessions), and all bug fixes. Updated press page stats (130 files, 16 stores, 7 tables, 80+ IPC channels) and added multi-model differentiator card. Updated contact page architecture rules to match current conventions. Evaluation page unchanged — content is static.

### Changed
- `docs/index.html` — Added Key Features section (9 cards: Pitch Room, Voice Profile, Auto-Draft, Verity Audit, Motif Ledger, Revision Queue, Version History, Multi-Model, Build & Export). Updated subtitle to mention multi-model. Updated export description for catalog export.
- `docs/architecture.html` — Added `providers/` to infrastructure modules. Added `file_versions` and `schema_version` to schema table. Updated file count to 130, store count to 16. Added ProviderRegistry and VersionService to dependency graph. Added multi-model and version history to design decisions. Updated source tree with all current files.
- `docs/changelog.html` — Full rebuild with all 39 entries (was 21). Updated stats: entries 21→39. Added all 2026-03-28 entries (18 new). Expanded highlight reel with version history and multi-model features.
- `docs/press.html` — Updated stats: 130 files, 16 stores, 7 tables, 80+ IPC channels. Added "Multi-model support" differentiator card. Updated source file count in "Open source" card.
- `docs/contact.html` — Updated architecture rules to include barrel export requirement. Minor copy refinements.

### Architecture Impact
- None — website assets only, no source code changes

### Migration Notes
- None

---

## [2026-03-28] — Comprehensive README rewrite

### Summary

Rewrote `README.md` to accurately reflect the current state of the codebase. Updated file count from 121 to 130. Added documentation for three features missing from the previous README: File Version History (VersionService, VersionHistoryPanel, DiffViewer, versionStore), Multi-Model Provider Support (ProviderRegistry, OpenAiCompatibleProvider, ProviderSection, providerStore), and Catalog Export. Updated source tree to include `infrastructure/providers/`, `database/migrations.ts`, `VersionService.ts`, and all new renderer components/stores. Corrected database table count from 5 to 7 (added `file_versions` and `schema_version`). Updated store count from 14 to 16. Added `VERITY-LEGACY.md` to the agent listing. Updated tech stack to include the `diff` library. Refreshed architecture section with accurate service list and provider registry description.

### Changed
- `README.md` — Full rewrite per `prompts/meta/readme-deep-update.md` spec. All sections verified against source code.

### Architecture Impact
- None — no wiring changes. Documentation-only update.

### Migration Notes
- None

---

## [2026-03-28] — Multi-model providers: renderer UI (SESSION-07)

### Summary

Added provider management UI to Settings. New `providerStore` (Zustand) manages provider state. New `ProviderSection` component shows provider cards with status indicators, test connectivity, add/remove/toggle. Updated `ModelSelectionSection` to group models by provider with "Text only" badges for non-tool-use models. Selecting a model from a different provider auto-updates `activeProviderId`.

### Added
- `src/renderer/stores/providerStore.ts` — Zustand store for provider CRUD, status checking
- `src/renderer/components/Settings/ProviderSection.tsx` — Provider management: cards, status dots, add form, enable/disable/remove

### Changed
- `src/renderer/components/Settings/SettingsView.tsx` — Added `ProviderSection` between CLI status and model selection. Rewrote `ModelSelectionSection` to group models by provider, show "Text only" badge, and update `activeProviderId` on cross-provider model selection.

### Architecture Impact
- New Zustand store: `providerStore`
- New component: `ProviderSection`

### Migration Notes
- None

---

## [2026-03-28] — Multi-model providers: IPC channels & preload bridge (SESSION-06)

### Summary

Exposed provider management to the renderer through 7 new `providers:*` IPC channels and a `window.novelEngine.providers` preload namespace. Updated `settings:getAvailableModels` to return `ModelInfo[]` from the registry instead of the deprecated static `AVAILABLE_MODELS` array.

### Changed
- `src/main/ipc/handlers.ts` — Added 7 `providers:*` handlers (list, getConfig, add, update, remove, checkStatus, setDefault). Updated `settings:getAvailableModels` to use `providerRegistry.listAllModels()`. Added `providerRegistry` to services param.
- `src/preload/index.ts` — Added `providers` namespace with 7 bridge methods. Updated `models.getAvailable` return type to `ModelInfo[]`.
- `src/main/index.ts` — Added `providerRegistry` to `registerIpcHandlers` call.

### Architecture Impact
- New IPC channels: `providers:list`, `providers:getConfig`, `providers:add`, `providers:update`, `providers:remove`, `providers:checkStatus`, `providers:setDefault`
- New preload bridge namespace: `window.novelEngine.providers`
- `settings:getAvailableModels` now returns `ModelInfo[]` (breaking for renderer — compatible because `ModelInfo` is a superset)

### Migration Notes
- Renderer code using `models.getAvailable()` now receives `ModelInfo[]` instead of `{id, label, description}[]`. The fields are a superset, so existing destructuring continues to work.

---

## [2026-03-28] — Multi-model providers: service migration + composition root (SESSION-05)

### Summary

Migrated all 6 application services from `IClaudeClient` to `IProviderRegistry`. Rewired the composition root to instantiate `ProviderRegistry`, register the built-in Claude CLI provider, and initialize any user-configured OpenAI-compatible providers from settings. No behavioral changes — all services use the same `sendMessage`/`abortStream` interface.

### Changed
- `src/application/ChatService.ts` — `IClaudeClient` → `IProviderRegistry`, `this.claude` → `this.providers`, `isAvailable()` routes through `getDefaultProvider()`
- `src/application/HotTakeService.ts` — `IClaudeClient` → `IProviderRegistry`
- `src/application/PitchRoomService.ts` — `IClaudeClient` → `IProviderRegistry`
- `src/application/AdhocRevisionService.ts` — `IClaudeClient` → `IProviderRegistry`
- `src/application/AuditService.ts` — `IClaudeClient` → `IProviderRegistry`
- `src/application/RevisionQueueService.ts` — `IClaudeClient` → `IProviderRegistry`
- `src/main/index.ts` — Added ProviderRegistry + OpenAiCompatibleProvider setup between infra and service instantiation. Removed redundant `settings.load()` call.

### Architecture Impact
- All services now depend on `IProviderRegistry` (not `IClaudeClient`)
- Composition root wires `ProviderRegistry` → `ClaudeCodeClient` + user providers
- `IClaudeClient` is no longer imported by any application service

### Migration Notes
- None — behavioral parity maintained

---

## [2026-03-28] — Multi-model providers: OpenAI-compatible provider (SESSION-04)

### Summary

Created `OpenAiCompatibleProvider` — the universal BYOK/self-hosted provider. Implements `IModelProvider` using built-in `fetch` + SSE streaming. Works with any OpenAI Chat Completions-compatible endpoint. No tool-use — text completion + streaming only. Token counts estimated at 4 chars/token.

### Added
- `src/infrastructure/providers/OpenAiCompatibleProvider.ts` — SSE streaming, AbortController cancellation, runtime API key/URL update, `/v1/models` health check

### Changed
- `src/infrastructure/providers/index.ts` — Added `OpenAiCompatibleProvider` export

### Architecture Impact
- New provider class in `providers/` module

### Migration Notes
- None

---

## [2026-03-28] — Multi-model providers: ProviderRegistry infrastructure (SESSION-03)

### Summary

Created `ProviderRegistry` — the central hub that manages all model providers, routes model requests to the correct provider, and persists configurations. Implements `IProviderRegistry` from domain. Uses a reverse model index for O(1) model→provider lookups. Protects built-in providers from deletion and immutable config fields from mutation.

### Added
- `src/infrastructure/providers/ProviderRegistry.ts` — Implements `IProviderRegistry`. Model routing, provider CRUD, config persistence to settings.
- `src/infrastructure/providers/index.ts` — Barrel export

### Architecture Impact
- New infrastructure module: `providers/`
- `ProviderRegistry` depends on `ISettingsService` for config persistence

### Migration Notes
- None

---

## [2026-03-28] — Multi-model providers: ClaudeCodeClient implements IModelProvider (SESSION-02)

### Summary

Made `ClaudeCodeClient` implement `IModelProvider` in addition to `IClaudeClient`. Added `providerId` (`'claude-cli'`) and `capabilities` (`['text-completion', 'tool-use', 'thinking', 'streaming']`) readonly properties. No behavioral changes — purely additive interface conformance.

### Changed
- `src/infrastructure/claude-cli/ClaudeCodeClient.ts` — Now implements both `IClaudeClient` and `IModelProvider`. Added `providerId` and `capabilities` properties.

### Architecture Impact
- `ClaudeCodeClient` can now be used wherever `IModelProvider` is expected

### Migration Notes
- None

---

## [2026-03-28] — Multi-model providers: domain types, interfaces, constants (SESSION-01)

### Summary

Foundation for pluggable AI provider architecture. Added provider-related types (`ProviderId`, `ProviderType`, `ProviderCapability`, `ProviderConfig`, `ModelInfo`, `ProviderStatus`), new interfaces (`IModelProvider`, `IProviderRegistry`), and built-in provider constants. `AppSettings` extended with `providers` and `activeProviderId`. `IClaudeClient` and `AVAILABLE_MODELS` deprecated but retained for backward compatibility.

### Changed
- `src/domain/types.ts` — Added 6 provider types (`ProviderId`, `ProviderType`, `ProviderCapability`, `ProviderStatus`, `ProviderConfig`, `ModelInfo`). Extended `AppSettings` with `providers: ProviderConfig[]` and `activeProviderId: ProviderId`.
- `src/domain/interfaces.ts` — Added `IModelProvider` interface (same shape as `IClaudeClient` plus `providerId` and `capabilities`). Added `IProviderRegistry` interface (router + CRUD + convenience delegates). Deprecated `IClaudeClient` with JSDoc.
- `src/domain/constants.ts` — Added `CLAUDE_CLI_PROVIDER_ID`, `OPENCODE_CLI_PROVIDER_ID`, `BUILT_IN_PROVIDER_CONFIGS`. Deprecated `AVAILABLE_MODELS` with JSDoc. Updated `DEFAULT_SETTINGS` with provider fields. Reordered declarations to avoid forward-reference errors.

### Architecture Impact
- New interfaces: `IModelProvider`, `IProviderRegistry`
- `AppSettings` shape changed (backward-compatible additions)
- `IClaudeClient` deprecated (not removed)

### Migration Notes
- Existing `settings.json` files missing `providers`/`activeProviderId` will get defaults from `DEFAULT_SETTINGS` merge in `SettingsService.load()`.

---

## [2026-03-28] — Add catalog export (ZIP all books)

### Summary

Added the ability to export the entire book catalog as a single ZIP archive from the Settings view. A new `catalog:exportZip` IPC channel zips the full `books/` directory using `archiver` (already a dependency), and a new `CatalogExportSection` component in SettingsView provides the trigger button with success feedback.

### Changed
- `src/main/ipc/handlers.ts` — Added `catalog:exportZip` handler between build and usage sections. Zips `paths.booksDir` into a user-chosen location with default filename `novel-engine-catalog-YYYY-MM-DD.zip`.
- `src/preload/index.ts` — Added `catalog` namespace with `exportZip()` bridge method.
- `src/renderer/components/Settings/SettingsView.tsx` — Added `CatalogExportSection` component between UsageSection and AuthorProfileSection. Shows export button, disabled state during export, and clickable "Saved to:" path on success.

### Architecture Impact
- New IPC channel: `catalog:exportZip`
- New preload bridge namespace: `catalog`

### Migration Notes
- None

---

## [2026-03-28] — Integrate version history into all file views

### Summary

Integrated the `VersionHistoryPanel` into every place files are surfaced in the UI. FileEditor and FilesView reader mode now have a "History" toggle button that opens a split-panel with the version timeline on the right. SourcePanel, ChaptersPanel, and AgentOutputPanel show clock icon buttons on hover that navigate to the file's reader view for history access. This completes the content-version-control feature.

### Modified
- `src/renderer/components/Files/FileEditor.tsx` — History toggle button in toolbar, split-panel with VersionHistoryPanel, auto-reload on revert, close history on file change
- `src/renderer/components/Files/FilesView.tsx` — History toggle button in reader mode, split-panel layout, auto-reload on revert
- `src/renderer/components/Files/SourcePanel.tsx` — Clock icon history button on hover for each source file card
- `src/renderer/components/Files/ChaptersPanel.tsx` — Clock icon history buttons on hover for draft.md and notes.md in both editable and body chapter rows
- `src/renderer/components/Files/AgentOutputPanel.tsx` — Clock icon history button on hover for each agent output file card

### Architecture Impact
- No new files or interfaces — integration only
- All history access uses existing `VersionHistoryPanel` and `versionStore`

### Migration Notes
- None

---

## [2026-03-28] — Add VersionHistoryPanel component

### Summary

Created the `VersionHistoryPanel` — a slide-over panel that displays a file's version history as a timeline with source badges (user/agent/revert), relative timestamps, and byte sizes. Clicking a version computes and displays the diff. Each version entry has a "Revert to this version" button with inline confirmation. Supports paginated loading for files with many versions.

### Added
- `src/renderer/components/Files/VersionHistoryPanel.tsx` — Full version history UI: timeline with `VersionEntry` sub-component, integrated `DiffViewer`, revert with confirmation, pagination, error handling, empty states.

### Architecture Impact
- New component: `VersionHistoryPanel` (in Files/ directory)

### Migration Notes
- None

---

## [2026-03-28] — Add version store and DiffViewer component

### Summary

Created `versionStore` Zustand store with paginated history loading, version selection with auto-diff computation, revert, and error handling. Created `DiffViewer` component that renders `FileDiff` as color-coded unified diff with dual line numbers, hunk headers, and addition/deletion summary bar.

### Added
- `src/renderer/stores/versionStore.ts` — Zustand store with 6 actions: `loadHistory`, `loadMoreHistory`, `selectVersion`, `clearSelection`, `revertToVersion`, `reset`. Paginated at 30 items per page.
- `src/renderer/components/Files/DiffViewer.tsx` — Renders `FileDiff` with green (additions), red (deletions), neutral (context) line coloring. Sub-components: `HunkHeader`, `DiffLineRow`, `DiffSummary`.

### Architecture Impact
- New Zustand store: `versionStore`
- New component: `DiffViewer` (in Files/ directory)

### Migration Notes
- None

---

## [2026-03-28] — Wire VersionService into IPC, preload bridge, and composition root

### Summary

Connected `VersionService` to the Electron app. Instantiated in composition root, exposed through 6 new IPC channels (`versions:*`), and added to the preload bridge as `window.novelEngine.versions`. Auto-snapshot hooks added at 5 capture points: `files:write` (user edits), `chat:send` (pipeline agent writes), `hot-take:start`, `adhoc-revision:start`, and revision queue event forwarding (all agent writes). BookWatcher provides fallback snapshotting for active book. Startup pruning trims old versions on app launch.

### Changed
- `src/main/index.ts` — Import and instantiate `VersionService`. Add startup pruning loop. Add fallback snapshot to BookWatcher callback. Pass `version` to `registerIpcHandlers`.
- `src/main/ipc/handlers.ts` — Add `IVersionService` to services param. Add `snapshotChangedFiles` helper. Add 6 `versions:*` IPC handlers. Modify `files:write` to auto-snapshot. Add snapshot hooks to `chat:send`, `hot-take:start`, `adhoc-revision:start`, and revision queue event forwarding.
- `src/preload/index.ts` — Add `versions` namespace with 6 methods: `getHistory`, `getVersion`, `getDiff`, `revert`, `getCount`, `snapshot`. Add type imports for `FileDiff`, `FileVersion`, `FileVersionSource`, `FileVersionSummary`.

### Architecture Impact
- New IPC channels: `versions:getHistory`, `versions:getVersion`, `versions:getDiff`, `versions:revert`, `versions:getCount`, `versions:snapshot`
- New preload bridge namespace: `window.novelEngine.versions`
- New dependency in composition root: `VersionService(db, fs)`
- Auto-snapshot hooks at 5 capture points across all book-writing flows

### Migration Notes
- None

---

## [2026-03-28] — Add VersionService implementation with diff computation

### Summary

Created `VersionService` in the application layer, implementing all 8 methods of `IVersionService`. Installed `diff` npm package for structured diff computation using `structuredPatch()`. The service handles snapshot dedup via SHA-256 hashing, file extension filtering (`.md`/`.json` only), structured diff output with line numbers, and version pruning.

### Added
- `src/application/VersionService.ts` — Implements `IVersionService`. Depends on `IDatabaseService` and `IFileSystemService` via DI. Uses `node:crypto` for hashing and `diff` package for structured patches.

### Architecture Impact
- New service: `VersionService` — depends on `IDatabaseService` + `IFileSystemService` (interfaces only)
- New npm dependency: `diff` (runtime) + `@types/diff` (dev)

### Migration Notes
- None

---

## [2026-03-28] — Add database migration and version repository for content version control

### Summary

Added SQLite migration v2 creating the `file_versions` table with composite indexes, and extended `IDatabaseService` and `DatabaseService` with 7 new methods for version CRUD: insert, get, list, count, delete-beyond-limit, and get-versioned-paths. All queries use parameterized prepared statements with explicit snake_case→camelCase mapping.

### Changed
- `src/domain/interfaces.ts` — Extended `IDatabaseService` with 7 new methods in a `// File Versions` section: `insertFileVersion`, `getFileVersion`, `getLatestFileVersion`, `listFileVersions`, `countFileVersions`, `deleteFileVersionsBeyondLimit`, `getVersionedFilePaths`
- `src/infrastructure/database/migrations.ts` — Added migration v2: creates `file_versions` table with `idx_file_versions_lookup` and `idx_file_versions_hash` indexes
- `src/infrastructure/database/DatabaseService.ts` — Implemented all 7 new `IDatabaseService` methods. Added 6 prepared statements and 2 private row mappers (`mapFileVersion`, `mapFileVersionSummary`). Added `FileVersion`, `FileVersionSource`, `FileVersionSummary` type imports.

### Architecture Impact
- Schema change: New `file_versions` table (id, book_slug, file_path, content, content_hash, byte_size, source, created_at)
- New indexes: `idx_file_versions_lookup` (book_slug, file_path, id DESC), `idx_file_versions_hash` (book_slug, file_path, content_hash)
- Extended interface: `IDatabaseService` — 7 new methods

### Migration Notes
- Migration v2 runs automatically on next app startup. Creates `file_versions` table and indexes. Non-destructive — no changes to existing tables.

---

## [2026-03-28] — Add domain types and interface for content version control

### Summary

Added version control domain types (`FileVersion`, `FileVersionSummary`, `DiffHunk`, `DiffLine`, `FileDiff`, `FileVersionSource`, `DiffLineType`) and the `IVersionService` interface to `src/domain/`. This is the foundation for the content-version-control feature — snapshot-per-write model with SHA-256 dedup, structured diffs, and revert capability.

### Changed
- `src/domain/types.ts` — Added 7 version control types after the File System section: `FileVersionSource`, `FileVersion`, `FileVersionSummary`, `DiffLineType`, `DiffLine`, `DiffHunk`, `FileDiff`
- `src/domain/interfaces.ts` — Added `IVersionService` interface with 8 methods: `snapshotFile`, `snapshotContent`, `getHistory`, `getVersion`, `getDiff`, `revertToVersion`, `getVersionCount`, `pruneVersions`. Added 4 new type imports.

### Architecture Impact
- New interface: `IVersionService` — will be implemented by `VersionService` in `src/application/` (SESSION-03)
- New types used across future sessions for database, service, IPC, and UI layers

### Migration Notes
- None

---

## [2026-03-28] — Add intake meta-prompt for document-to-session decomposition

### Summary

Created `prompts/meta/intake.md` — a generic meta-prompt that takes any number of attached documents (feature specs, research, design docs, bug reports, RFCs, raw ideas), analyzes them against the current codebase, and decomposes the work into ordered session prompts under `prompts/feature/{feature-name}/`. Generates a complete build-out directory with numbered `SESSION-NN.md` prompts, a `MASTER.md` loop runner with crash recovery and handoff protocol, and a `STATE.md` tracker. Follows the same patterns established by `address-issues.md` and the `arch/r001/MASTER.md` loop, generalized for arbitrary feature work.

### Added
- `prompts/meta/intake.md` — Document intake and feature decomposition prompt. Parses attached documents, researches current codebase, decomposes into layered sessions, generates MASTER/STATE/SESSION files.

### Architecture Impact
- None — no code or wiring changes. Prompt-only addition.

### Migration Notes
- None

---

## [2026-03-28] — Fix MotifLedgerService data loss: remove auto-writeback, harden JSON repair

### Summary

The initial JSON repair implementation (2026-03-27) auto-wrote repaired data back to disk on load. The `repairJson()` regex matched `}{` patterns inside string values (not just between array elements), corrupting the parsed structure. The writeback then overwrote the 133KB original with an empty/corrupt version — total data loss. Fixed by: (1) removing the auto-writeback entirely (`load()` is now read-only), (2) rewriting `repairJson()` to operate line-by-line, only fixing lines that are purely structural (`}` or `]` alone on a line), never touching string content. Recovered the original `motif-ledger.json` (136KB, 6 systems, 52 entries, 35 flagged phrases, 21 audit records) from Claude CLI conversation logs.

### Fixed
- `src/application/MotifLedgerService.ts` — Removed auto-writeback of repaired JSON on load. Rewrote `repairJson()` from global regex to line-by-line structural repair (only matches lines that are purely `}` or `]`). Simplified `safeParse()` return type (removed `repaired` flag).

### Architecture Impact
- None — no wiring changes

### Migration Notes
- None — `load()` no longer writes to disk. The original file is preserved as-is.

---

## [2026-03-27] — Fix Motif Ledger Audit Log crash from agent-written data shape mismatch

### Summary

The Audit Log tab in the Motif Ledger crashed with a `TypeError` when clicking it. Root cause: the MOTIF-AUDIT agent writes audit log records with fields `{ chapter, date, findings }`, but the UI expects `{ id, chapterSlug, auditedAt, entriesAdded, entriesUpdated, notes }`. The sort on line 33 of `AuditLogTab.tsx` called `.localeCompare()` on `undefined`, killing the React render tree. Fixed by normalizing all agent-written data in `MotifLedgerService.load()` and adding a defensive fallback in the component sort.

### Fixed
- `src/application/MotifLedgerService.ts` — Added `normalizeAuditRecord()` to map agent field names (`chapter`→`chapterSlug`, `date`→`auditedAt`, `findings`→`notes`) and fill missing fields (`id`, `entriesAdded`, `entriesUpdated`). Also added `normalizeSystem()` (fills missing `components` array) and `normalizeEntry()` (fills missing `phrase` field). Added `safeArray()` helper to guard against non-array values.
- `src/renderer/components/MotifLedger/AuditLogTab.tsx` — Sort comparison now uses `(b.auditedAt ?? '').localeCompare(a.auditedAt ?? '')` as a defensive fallback.

### Architecture Impact
- None — no wiring changes

### Migration Notes
- None — normalization is transparent; existing JSON files are read correctly without modification

---

## [2026-03-27] — Fix Hot Take button not appearing after chapters are created mid-session

### Summary

`HotTakeButton` only re-checked for chapters when `activeSlug` changed, not when files were created on disk. After auto-drafting chapters, the button stayed hidden until app restart. Fixed by subscribing to `fileChangeStore.revision` — the same pattern `AdhocRevisionButton` already used.

### Fixed
- `src/renderer/components/Sidebar/HotTakeButton.tsx` — Added `fileRevision` from `useFileChangeStore` to the `useEffect` dependency array so the chapter existence check re-runs when files change on disk.

### Architecture Impact
- None — no wiring changes

### Migration Notes
- None

---

## [2026-03-27] — Update GitHub Pages website with latest changelog entries

### Summary

Updated `docs/changelog.html` with 3 new entries added since the last website build: r003 race condition/stream architecture fixes, MotifLedgerView crash fix, and BookSelector/SystemsTab crash fix. Updated stats (18 → 21 entries, added bug fix count), expanded the Quality & Stability highlight reel section. All other pages remain current — no new features since last build, only bug fixes that don't affect feature descriptions.

### Changed
- `docs/changelog.html` — Added 3 new entries at top (r003 fixes, MotifLedgerView crash, BookSelector/SystemsTab crash). Updated stats: entries 18→21, replaced "Architecture Changes" stat with "Bug Fixes: 20+". Added r003 and MotifLedger crash fixes to Quality & Stability highlights.

### Architecture Impact
- None — website assets only

### Migration Notes
- None

---

## [2026-03-27] — Fix nested button DOM warning and SystemsTab crash on undefined components

### Summary

Fixed three console errors: (1) React `validateDOMNesting` warning from a `<button>` nested inside a `<button>` in BookSelector — the outer dropdown trigger is now a `<div role="button">` with keyboard support; (2) `TypeError` crash in SystemsTab when `sys.components` is `undefined` from partially-populated ledger JSON on disk — added `?? []` fallbacks; (3) the 404 on `novel-asset://cover/` is a cosmetic log from the existing `onError` fallback, no code change needed.

### Fixed
- `src/renderer/components/Sidebar/BookSelector.tsx` — Changed outer dropdown trigger from `<button>` to `<div role="button">` with `tabIndex` and `onKeyDown`, eliminating the nested-button DOM warning.
- `src/renderer/components/MotifLedger/SystemsTab.tsx` — Guarded `sys.components` with `?? []` in `startEdit()` (line 42), render loop (line 165), and iteration (line 167) to prevent crash when ledger JSON has systems with missing `components` field.

### Architecture Impact
- None — no wiring changes.

### Migration Notes
- None

---

## [2026-03-27] — Fix crash on startup: MotifLedgerView tab count reads undefined array

### Summary

Fixed a `TypeError: Cannot read properties of undefined (reading 'length')` crash on production app startup. The `MotifLedgerView` tab-count computation assumed all ledger array keys exist when the ledger object is truthy, but partial/empty ledger JSON files leave some keys undefined. Since all views are rendered simultaneously (hidden with CSS), this crashes immediately on app load.

### Fixed
- `src/renderer/components/MotifLedger/MotifLedgerView.tsx` — Tab count computation now guards against undefined ledger arrays with optional chaining (`arr?.length ?? 0`) instead of casting to `unknown[]` and accessing `.length` directly.

### Architecture Impact
- None — no wiring changes.

### Migration Notes
- None

---

## [2026-03-27] — Issue fixes r003: Race conditions, error handling, stream architecture

### Summary

Executed 8 fix prompts from the r003 evaluation. Fixed critical race conditions in concurrent stream management (book switching kills background streams, singleton diagnostics/changedFiles overwritten by concurrent calls), improved error handling in auto-draft audit failures, added proper stream listener lifecycle to pitchRoomStore, enhanced EPIPE diagnostic logging, introduced type-safe `StreamEventSource` discriminator for event routing, and batched stream event DB persistence for reduced I/O pressure.

### Changed
- `src/renderer/stores/chatStore.ts` — Added `_streamOrigin` discriminator (`'self'|'external'|null`). `switchBook()` only aborts `'self'` streams, preserving background auto-draft/hot-take/revision streams.
- `src/renderer/stores/autoDraftStore.ts` — Added `skippedAudits: string[]` to `AutoDraftSession`. Audit/fix catch block now pauses the loop instead of silently continuing. Logs skipped audits on session completion.
- `src/application/ChatService.ts` — Replaced `lastDiagnostics` singleton with `diagnosticsMap: Map<string, ContextDiagnostics>` keyed by conversationId (max 20 entries). `getLastDiagnostics()` accepts optional conversationId. `sendMessage()` now returns `{ changedFiles: string[] }`. Removed `resetChangedFiles()` call and `getLastChangedFiles()` method.
- `src/application/StreamManager.ts` — Removed `lastChangedFiles` singleton, `resetChangedFiles()`, and `getLastChangedFiles()`. Each stream tracks its own `changedFiles` via closure. `startStream()` returns `getChangedFiles()` getter.
- `src/domain/interfaces.ts` — Updated `IChatService.sendMessage` return type to `Promise<{ changedFiles: string[] }>`. Updated `getLastDiagnostics` to accept optional `conversationId`. Removed `getLastChangedFiles()`. Added `persistStreamEventBatch()` to `IDatabaseService`.
- `src/domain/types.ts` — Added `StreamEventSource` type union for event origin discrimination.
- `src/main/ipc/handlers.ts` — `chat:send` reads changedFiles from `sendMessage()` return. `adhoc-revision:start` captures changedFiles from stream events. All broadcast sites inject `source: StreamEventSource`. `context:getLastDiagnostics` passes conversationId. Verity `broadcastVerityEvent` now accepts source parameter.
- `src/preload/index.ts` — `context.getLastDiagnostics` accepts optional conversationId.
- `src/renderer/stores/cliActivityStore.ts` — `loadDiagnostics()` passes conversationId to `getLastDiagnostics()`.
- `src/renderer/stores/streamHandler.ts` — Enriched event type includes `source?: StreamEventSource`. Revision filter uses `source === 'revision'` as primary guard with `callId.startsWith('rev:')` fallback.
- `src/renderer/stores/pitchRoomStore.ts` — Added `initStreamListener()`, `destroyStreamListener()`, `_cleanupListener` field.
- `src/renderer/components/PitchRoom/PitchRoomView.tsx` — Removed inline `useEffect` stream listener registration.
- `src/renderer/components/Layout/AppLayout.tsx` — `StreamManager` component now also initializes pitchRoomStore's stream listener.
- `src/infrastructure/claude-cli/ClaudeCodeClient.ts` — EPIPE handler logs `stdinBytes`, `writableFinished`, `writableEnded`. Replaced per-event DB persistence with batching (100ms flush interval, max 20, critical events flush immediately). `flushBatch()` called on process close.
- `src/infrastructure/database/DatabaseService.ts` — Added `persistStreamEventBatch()` using a transaction-wrapped loop.

### Architecture Impact
- `IChatService.sendMessage` return type changed from `Promise<void>` to `Promise<{ changedFiles: string[] }>`
- `IChatService.getLastChangedFiles()` removed from interface
- `IChatService.getLastDiagnostics()` signature changed to accept optional `conversationId`
- `IDatabaseService.persistStreamEventBatch()` added
- New domain type: `StreamEventSource`
- Stream event enrichment now includes `source` field alongside `callId` and `conversationId`
- pitchRoomStore stream listener moved from component-level to app-level (AppLayout StreamManager)

### Migration Notes
- `IChatService.sendMessage` callers must handle the new `{ changedFiles }` return value (or ignore it)
- `IChatService.getLastChangedFiles()` no longer exists — callers use the return value from `sendMessage()` instead
- `StreamEventSource` is optional on enriched events for backwards compatibility

---

## [2026-03-27] — Build multi-page GitHub Pages website

### Summary

Built a full 6-page GitHub Pages website in `docs/`. Migrated the existing 10-book evaluation from `docs/index.html` to `docs/evaluation.html` (content preserved verbatim) and replaced `docs/index.html` with a new landing page. Created 4 additional pages: architecture (technical docs for developers), changelog (formatted project history), press kit (differentiators, published books, quotable facts), and contact (contributing guide, bug reports, tester callout). All pages share a consistent dark-theme design system with sticky nav, responsive breakpoints, agent color coding, and shared footer. No external JS, no tracking, no analytics.

### Added
- `docs/index.html` — Landing page: hero, 7 agent cards, 14-phase pipeline visualization, getting started guide, screenshots, published books grid
- `docs/evaluation.html` — 10-book dual AI evaluation (migrated from old index.html with nav/footer added)
- `docs/architecture.html` — Technical architecture: 5-layer diagram, tech stack, service dependency graph, design decisions, database schema, source tree, contributing guide
- `docs/changelog.html` — Formatted changelog with summary stats, highlight reel, collapsible entries for all 18 changelog entries
- `docs/press.html` — Press kit: quotable pitch, 7 differentiator cards, published works, by-the-numbers stats, quotable lines, asset links
- `docs/contact.html` — Contact info, contribution guide with architecture rules, bug reporting template, testers-wanted callout with platform badges

### Changed
- `docs/index.html` — Replaced single-page evaluation site with full landing page (evaluation content moved to evaluation.html)

### Architecture Impact
- None — no source code changes, website assets only

### Migration Notes
- The old `docs/index.html` (10-book evaluation) is now at `docs/evaluation.html`. Any external links to the old page will land on the new landing page instead, which links to the evaluation.

---

## [2026-03-27] — README deep update: comprehensive rewrite from codebase analysis

### Summary

Rewrote `README.md` from a full analysis of every source file. Updated file count (102 → 121), corrected agent thinking budgets (Spark 4K not 8K), added Verity Audit Pipeline and Motif Ledger as documented features, updated source tree to reflect `streamHandler.ts` (renamed from `streamRouter.ts`), `migrations.ts`, `statusMessages.ts`, `MotifLedger/` component group, new application services (AuditService, PitchRoomService, HotTakeService, AdhocRevisionService, StreamManager, MotifLedgerService), new hooks (useResizeHandle, useVerticalResize), PitchHistory sidebar component, and expanded custom-agents listing (23 agent files including Verity sub-prompts and utility agents). Preserved dedication and books sections verbatim. Every feature, agent, pipeline phase, and file path verified against actual source code.

### Changed
- `README.md` — Full rewrite. Updated source tree, file count, feature descriptions, agent registry, custom-agents directory listing. Added Verity Audit Pipeline, Motif Ledger, and phase-aware Verity prompt sections. Corrected Spark thinking budget from 8K to 4K. Updated store count to 14. Added all missing component groups and application services.

### Architecture Impact
- None — no wiring changes

### Migration Notes
- None

---

## [2026-03-27] — Issue fixes r002: 9 bug fixes from repo evaluation

### Summary

Executed all 9 fix prompts from `prompts/arch/r002/` addressing findings from the repo evaluation. Fixed error path cleanup (stale `_activeCallId` + orphan temp messages), revision event forwarding missing `conversationId`, missing `callStart` events for Verity audit/fix calls, duplicate polling intervals in cliActivityStore recovery, silent error swallowing in ClaudeCodeClient, extracted shared stream handler to deduplicate logic across three stores, added abort-on-switchBook, modal close-on-stream-end UX, and system prompt size guard.

### Added
- `src/renderer/stores/streamHandler.ts` — Shared `createStreamHandler()` factory encapsulating guard logic and event dispatch for chatStore, modalChatStore, pitchRoomStore

### Changed
- `src/renderer/stores/chatStore.ts` — Error catch clears `_activeCallId` and filters temp message; `_handleStreamEvent` delegates to shared handler; `switchBook()` aborts active stream before clearing state
- `src/renderer/stores/modalChatStore.ts` — Error catch clears `_activeCallId` and filters temp message; `_handleStreamEvent` delegates to shared handler; added `_closeRequested` flag for close-on-stream-end UX
- `src/renderer/stores/pitchRoomStore.ts` — Error catch clears `_activeCallId` and filters temp message; `_handleStreamEvent` delegates to shared handler
- `src/renderer/stores/cliActivityStore.ts` — Recovery polling uses module-level timer refs to prevent duplicate intervals
- `src/domain/types.ts` — `RevisionQueueEvent` `session:streamEvent` variant now includes optional `conversationId`
- `src/application/RevisionQueueService.ts` — Includes `conversationId` when emitting `session:streamEvent`
- `src/main/ipc/handlers.ts` — Forwards `conversationId` in revision event bridge; added `emitVerityCallStart()` helper + 4 call sites for Verity audit/fix/motif-audit
- `src/infrastructure/claude-cli/ClaudeCodeClient.ts` — EPIPE logged with `console.warn`; DB persistence errors logged on first failure per session; 500KB system prompt size guard before spawn

### Architecture Impact
- New utility: `src/renderer/stores/streamHandler.ts` — imported by chatStore, modalChatStore, pitchRoomStore
- New IPC behavior: Verity pipeline handlers emit synthetic `callStart` events
- `RevisionQueueEvent.session:streamEvent` now carries optional `conversationId`

### Migration Notes
- None — all changes are backward-compatible

---

## [2026-03-27] — Repo evaluation: comprehensive audit of chat bleed, activity monitor, and code quality

### Summary

Executed `prompts/standard/repo-eval.md` — a full audit of stream event isolation, CLI activity monitor coverage, and latent bugs. Traced event flows end-to-end across all 10+ surfaces that spawn CLI calls. Found no critical chat bleed issues; the callId-per-send pattern is robust. Identified 12 findings across medium/low severity: missing `_activeCallId` cleanup in error paths (3 stores), revision event forwarding missing `conversationId`, duplicate polling intervals in cliActivityStore recovery, silent EPIPE/DB-error swallowing, and `--add-dir` exposing all books instead of just the active one.

### Added
- `issues.md` — Full repo evaluation report with 12 findings, coverage matrix, and positive observations

### Architecture Impact
- None — no source code changes, audit output only

### Migration Notes
- None

---

## [2026-03-27] — Add update-website standard prompt (multi-page)

### Summary

Created `prompts/standard/update-website.md` — a meta-prompt that reads the changelog, architecture docs, README, and existing GitHub Pages site assets, then builds a full multi-page GitHub Pages website in `docs/`. Produces 6 HTML pages: landing (index), 10-book evaluation (migrated from old index.html), architecture, changelog, press kit, and contact. Targets three audiences: writers, developers, and press. Shared dark-theme design system with per-agent color coding.

### Added
- `prompts/standard/update-website.md` — 8-step prompt: collect source material → define site map (6 pages) → spec each page → design system tokens → content tone rules → screenshot strategy → build all pages → verify 16-point checklist

### Architecture Impact
- None — no source code changes, prompt tooling only

### Migration Notes
- None

---

## [2026-03-27] — Add address-issues standard prompt

### Summary

Created `prompts/standard/address-issues.md` — a meta-prompt that reads `issues.md` (output of `repo-eval.md`), decomposes findings into numbered `FIX-NN.md` prompts in the next available `prompts/arch/r###/` revision, and generates `MASTER.md` + `STATE.md` for loop execution.

### Added
- `prompts/standard/address-issues.md` — 7-step prompt: parse issues → group by affinity → order by severity → generate fix prompts → generate STATE.md → generate MASTER.md → summary report

### Architecture Impact
- None — no source code changes, prompt tooling only

### Migration Notes
- None

---

## [2026-03-27] — ARCH-12: Audit and fix silent error swallowing

### Summary

Audited all 115 bare `catch {}` blocks across the codebase. Added explanatory comments to 12 uncommented catches in priority files (SettingsService, FileSystemService, MotifLedgerService, RevisionQueueService, bootstrap, handlers). Found that 82 catches already had comments, and the remaining 33 are clearly ENOENT-expected patterns or already log with `console.warn`. No behavioral changes — visibility only.

### Changed
- `src/infrastructure/settings/SettingsService.ts` — Added comments to 2 catches (settings load, CLI detection)
- `src/infrastructure/filesystem/FileSystemService.ts` — Added comments to 2 catches (books dir, active book)
- `src/application/MotifLedgerService.ts` — Added comments to 2 catches (load, getUnauditedChapters)
- `src/application/RevisionQueueService.ts` — Added comments to 2 catches (readCache, readState)
- `src/main/bootstrap.ts` — Added comment to 1 catch (needsBootstrap)
- `src/main/ipc/handlers.ts` — Added comment to 1 catch (author profile load)

### Architecture Impact
- None — comments only

---

## [2026-03-27] — ARCH-09: Slim ChatService to router

### Summary

Final cleanup of ChatService after all extractions. Removed unused `IAuditService` and `IUsageService` dependencies (StreamManager handles usage recording). ChatService is now a clean router at 403 lines (down from 1,218 — 67% reduction).

### Changed
- `src/application/ChatService.ts` — Removed `audit: IAuditService` and `usage: IUsageService` constructor params (no longer directly needed). Final line count: 403.
- `src/main/index.ts` — Updated ChatService constructor call.

### Architecture Impact
- ChatService decomposition complete: from god object (1,218 lines) to clean router (403 lines)
- Extracted services: StreamManager (232), AuditService (350), PitchRoomService (109), HotTakeService (98), AdhocRevisionService (105)

---

## [2026-03-27] — ARCH-07 & ARCH-08: Extract HotTakeService and AdhocRevisionService

### Summary

Extracted `handleHotTake()` into HotTakeService and `handleAdhocRevision()` into AdhocRevisionService. Both implement domain interfaces. ChatService now delegates all three special-purpose conversation flows (pitch-room, hot-take, adhoc-revision) to their own services.

### Added
- `src/application/HotTakeService.ts` — `HotTakeService` implementing `IHotTakeService` (98 lines)
- `src/application/AdhocRevisionService.ts` — `AdhocRevisionService` implementing `IAdhocRevisionService` (105 lines)
- `src/domain/interfaces.ts` — `IHotTakeService`, `IAdhocRevisionService` interfaces

### Changed
- `src/application/ChatService.ts` — Removed `handleHotTake()` and `handleAdhocRevision()`. Added `hotTake: IHotTakeService` and `adhocRevision: IAdhocRevisionService` constructor params. ChatService: 559→407 lines.
- `src/main/index.ts` — Instantiate HotTakeService and AdhocRevisionService, inject into ChatService.

### Architecture Impact
- New interfaces: `IHotTakeService`, `IAdhocRevisionService` in domain layer
- New services: `HotTakeService`, `AdhocRevisionService` in application layer
- ChatService reduced from 1,218→407 lines (67% reduction)

### Migration Notes
- None — internal refactor only

---

## [2026-03-27] — ARCH-06: Extract PitchRoomService from ChatService

### Summary

Extracted `handlePitchRoomMessage()` from ChatService into a new `PitchRoomService` behind an `IPitchRoomService` interface. StreamManager is now instantiated externally in main/index.ts and shared between ChatService and PitchRoomService (required for correct active-stream tracking).

### Added
- `src/application/PitchRoomService.ts` — `PitchRoomService` class implementing `IPitchRoomService` (109 lines)
- `src/domain/interfaces.ts` — `IPitchRoomService` interface (handleMessage)

### Changed
- `src/application/ChatService.ts` — Removed `handlePitchRoomMessage()`. Added `pitchRoom: IPitchRoomService` and `streamManager: StreamManager` constructor params. StreamManager no longer created internally. ChatService: 637→559 lines.
- `src/main/index.ts` — StreamManager created externally and injected into both ChatService and PitchRoomService. PitchRoomService instantiated and passed to ChatService.

### Architecture Impact
- New interface: `IPitchRoomService` in domain layer
- New service: `PitchRoomService` in application layer
- StreamManager now externally owned (shared across services)

### Migration Notes
- None — internal refactor only

---

## [2026-03-27] — ARCH-05: Extract AuditService from ChatService

### Summary

Extracted `auditChapter()`, `fixChapter()`, and `runMotifAudit()` from ChatService into a new `AuditService` behind an `IAuditService` interface. These three methods form a cohesive audit-and-fix subsystem. ChatService's `handleAdhocRevision` now delegates to `this.audit.runMotifAudit()`. IPC handlers route audit channels directly to the audit service.

### Added
- `src/application/AuditService.ts` — `AuditService` class implementing `IAuditService` (350 lines)
- `src/domain/interfaces.ts` — `IAuditService` interface (auditChapter, fixChapter, runMotifAudit)

### Changed
- `src/application/ChatService.ts` — Removed 3 method implementations (~320 lines). Added `audit: IAuditService` constructor param. ChatService reduced from 1,121→637 lines.
- `src/domain/interfaces.ts` — Moved audit methods from `IChatService` to new `IAuditService`
- `src/main/ipc/handlers.ts` — Added `audit: IAuditService` to services param. Routed verity:auditChapter, verity:fixChapter, verity:fixChapterWithAudit, verity:runMotifAudit to `services.audit`
- `src/main/index.ts` — Instantiate `AuditService`, inject into ChatService and registerIpcHandlers

### Architecture Impact
- New interface: `IAuditService` in domain layer
- New service: `AuditService` in application layer
- ChatService no longer owns audit/fix logic

### Migration Notes
- None — internal refactor only

---

## [2026-03-27] — ARCH-04: Extract StreamManager from ChatService

### Summary

Extracted `StreamManager` and `resolveThinkingBudget()` from ChatService. StreamManager owns the active-streams map and the repetitive register → accumulate → save → record usage → cleanup lifecycle. All four manual stream patterns in ChatService (`sendMessage`, `handleHotTake`, `handleAdhocRevision`, `handlePitchRoomMessage`) now delegate to `StreamManager.startStream()`.

### Added
- `src/application/StreamManager.ts` — `StreamManager` class: `startStream()`, `resetChangedFiles()`, `getActiveStream()`, `getActiveStreamForBook()`, `getLastChangedFiles()`, `cleanupAbortedStream()`, `cleanupErroredStream()`
- `src/application/thinkingBudget.ts` — `resolveThinkingBudget()` pure function (per-message override → global override → per-agent default → undefined)

### Changed
- `src/application/ChatService.ts` — Removed `private activeStreams` and `private lastChangedFiles` fields. Added `private streamManager: StreamManager`. All four stream handler methods now use `streamManager.startStream()` instead of manual buffer/cleanup patterns. Replaced inline `resolveThinkingBudget` with import from `./thinkingBudget`.

### Architecture Impact
- New classes: `StreamManager` (application layer), `resolveThinkingBudget` (application layer)
- ChatService stream code reduced by ~250 lines of duplicated buffer/cleanup logic
- `handlePitchRoomMessage` dead `streamSucceeded` flag eliminated

### Migration Notes
- None — internal refactor only

---

## [2026-03-27] — ARCH-03: Add IChatService and IUsageService interfaces

### Summary

Added `IChatService` (14 methods) and `IUsageService` (3 methods) interfaces to the domain layer. The IPC handlers now depend on these abstractions instead of concrete application classes. ChatService's constructor now takes `IUsageService` instead of `UsageService`. Both concrete classes have `implements` clauses.

### Added
- `src/domain/interfaces.ts` — `IChatService` interface (sendMessage, createConversation, getConversations, getMessages, abortStream, getActiveStream, getActiveStreamForBook, getLastDiagnostics, getLastChangedFiles, isCliIdle, recoverOrphanedSessions, getRecoveredOrphans, auditChapter, fixChapter, runMotifAudit)
- `src/domain/interfaces.ts` — `IUsageService` interface (recordUsage, getSummary, getByConversation)

### Changed
- `src/domain/interfaces.ts` — Added imports: `ActiveStreamInfo`, `AuditResult`, `ContextDiagnostics`, `ConversationPurpose`
- `src/application/ChatService.ts` — `implements IChatService`. Constructor param `usage: UsageService` → `usage: IUsageService`. Removed concrete `UsageService` import.
- `src/application/UsageService.ts` — `implements IUsageService`
- `src/main/ipc/handlers.ts` — Replaced `import type { ChatService }` and `import type { UsageService }` with `IChatService` and `IUsageService` from `@domain/interfaces`. Updated `registerIpcHandlers` signature.

### Architecture Impact
- New interfaces: `IChatService`, `IUsageService` in domain layer
- IPC handlers no longer import from `@app/` — fully interface-dependent
- ChatService constructor dependency: `UsageService` → `IUsageService`

### Migration Notes
- None — purely additive interface extraction

---

## [2026-03-27] — ARCH-13: Add database migration system

### Summary

Added a forward-only SQLite migration system. Migrations are defined as sequential versioned entries in `migrations.ts`, each running in its own transaction. The system tracks applied versions in a `schema_version` table. Converted the existing ad hoc ALTER TABLE check (conversations.purpose column) into a proper v1 migration.

### Added
- `src/infrastructure/database/migrations.ts` — `Migration` type, `MIGRATIONS` array (v0 baseline + v1 purpose column), `runMigrations()` function

### Changed
- `src/infrastructure/database/schema.ts` — Replaced ad hoc ALTER TABLE check with `runMigrations(db)` call. Added import of `runMigrations`.

### Architecture Impact
- New table: `schema_version` (version INTEGER, applied_at TEXT, description TEXT)
- Future schema changes go in `MIGRATIONS` array instead of ad hoc ALTER TABLE checks

### Migration Notes
- Existing databases get the `schema_version` table created automatically and v0+v1 recorded on next startup. No data loss.

---

## [2026-03-27] — ARCH-14: Standardize agent filenames

### Summary

Standardized all agent prompt filenames to `UPPER-CASE.md` convention. Renamed `FORGE.MD` → `FORGE.md` (extension casing) and `Quill.md` → `QUILL.md` (name casing). Added a rename migration in `bootstrap.ts` so existing user installations get their files renamed automatically on next startup.

### Changed
- `agents/FORGE.MD` → `agents/FORGE.md` — Extension casing standardized
- `agents/Quill.md` → `agents/QUILL.md` — Name casing standardized
- `src/domain/constants.ts` — `AGENT_REGISTRY.Forge.filename`: `'FORGE.MD'` → `'FORGE.md'`, `.Quill.filename`: `'Quill.md'` → `'QUILL.md'`
- `src/main/bootstrap.ts` — Added agent rename migration step in `ensureAgents()` (runs before file copy)
- `docs/architecture/DOMAIN.md` — Agent registry table updated with correct filenames

### Architecture Impact
- None — cosmetic filename change + migration

### Migration Notes
- Users with existing `custom-agents/` directories: `FORGE.MD` is renamed to `FORGE.md` and `Quill.md` is renamed to `QUILL.md` automatically via the bootstrap migration on next startup

---

## [2026-03-27] — ARCH-11: Clean up Wrangler vestige

### Summary

Updated the Wrangler agent's role from 'Context Planner' to 'Revision Plan Parser' to accurately reflect its actual usage. The Wrangler is only used by `RevisionQueueService` for parsing Forge's revision plan output — the two-call context planning pattern was never implemented.

### Changed
- `src/domain/constants.ts` — `AGENT_REGISTRY.Wrangler.role`: `'Context Planner'` → `'Revision Plan Parser'`
- `docs/architecture/DOMAIN.md` — Updated Wrangler role in Agent Registry table

### Architecture Impact
- None — cosmetic label change only

### Migration Notes
- None

---

## [2026-03-27] — ARCH-10: Document renderer value imports exception

### Summary

Documented the formal exception that allows the renderer layer to import pure data constants and pure functions from `@domain/constants` and `@domain/statusMessages`. These are statically defined values with zero Node.js dependencies — routing them through the IPC bridge would add complexity for no safety benefit.

### Changed
- `src/domain/constants.ts` — Added header comment noting the renderer value import exception
- `docs/architecture/ARCHITECTURE.md` — Added "Renderer Value Import Exception" section with criteria, allowed imports list, and exclusions
- `docs/architecture/RENDERER.md` — Added callout noting the exception with link to ARCHITECTURE.md

### Architecture Impact
- Formalized existing practice as a documented exception to the "import type only" rule for renderer↔domain

### Migration Notes
- None — no code changes, documentation only

---

## [2026-03-27] — ARCH-02: Extract status messages from constants.ts

### Summary

Moved ~190 lines of status message arrays and helper functions from `src/domain/constants.ts` into a new `src/domain/statusMessages.ts` file. The new file has zero imports — pure functions over static data. constants.ts is now 273 lines (from 466 after ARCH-01, originally 755).

### Added
- `src/domain/statusMessages.ts` — STATUS_PREPARING, STATUS_WAITING, STATUS_RESPONDING, PITCH_ROOM_FLAVOR arrays and their public accessor functions

### Changed
- `src/domain/constants.ts` — Removed all status message arrays and functions (~190 lines)
- `src/domain/index.ts` — Added `export * from './statusMessages'` to barrel export
- `src/application/ChatService.ts` — Import `randomPreparingStatus`, `randomWaitingStatus` from `@domain/statusMessages`
- `src/renderer/hooks/useRotatingStatus.ts` — Import `randomRespondingStatus` from `@domain/statusMessages`
- `src/renderer/stores/chatStore.ts` — Import `randomRespondingStatus` from `@domain/statusMessages`
- `src/renderer/stores/modalChatStore.ts` — Import `randomRespondingStatus` from `@domain/statusMessages`
- `src/renderer/stores/pitchRoomStore.ts` — Split import: `PITCH_ROOM_SLUG` from constants, `randomRespondingStatus` from statusMessages
- `src/renderer/components/PitchRoom/PitchRoomView.tsx` — Split import: `AGENT_REGISTRY` from constants, `randomPitchRoomFlavor` from statusMessages

### Architecture Impact
- New domain file: `src/domain/statusMessages.ts` (zero imports, pure functions)
- No wiring, IPC, or DI changes

### Migration Notes
- None

---

## [2026-03-27] — ARCH-01: Extract prompt templates from constants.ts

### Summary

Moved 9 long-form prompt template strings out of `src/domain/constants.ts` into standalone `.md` files in the `agents/` directory. These are now loaded at runtime via `AgentService.loadRaw()`. Reduces constants.ts from 755 lines to 466 lines. The domain layer no longer contains natural language prompt text — only pure configuration data.

### Added
- `agents/VOICE-SETUP.md` — Voice profile setup instructions (was `VOICE_SETUP_INSTRUCTIONS`)
- `agents/AUTHOR-PROFILE.md` — Author profile setup instructions (was `AUTHOR_PROFILE_INSTRUCTIONS`)
- `agents/PITCH-ROOM.md` — Pitch room brainstorming instructions with `{{BOOKS_PATH}}` placeholder (was `buildPitchRoomInstructions()`)
- `agents/HOT-TAKE.md` — Hot take assessment instructions (was `HOT_TAKE_INSTRUCTIONS`)
- `agents/MOTIF-AUDIT.md` — Scoped phrase & motif audit instructions (was `MOTIF_AUDIT_INSTRUCTIONS`)
- `agents/ADHOC-REVISION.md` — Direct feedback mode instructions (was `ADHOC_REVISION_INSTRUCTIONS`)
- `agents/REVISION-VERIFICATION.md` — Post-revision verification prompt (was `REVISION_VERIFICATION_PROMPT`)
- `agents/VERITY-FIX.md` — Audit fix mode instructions (was `VERITY_FIX_INSTRUCTIONS`)
- `agents/WRANGLER-PARSE.md` — Revision plan JSON parsing prompt (was `WRANGLER_SESSION_PARSE_PROMPT`)

### Changed
- `src/domain/constants.ts` — Removed 9 exported prompt constants/functions (~289 lines). Updated MOTIF_AUDIT_CADENCE comment to reference agent file instead of deleted constant.
- `src/application/ChatService.ts` — Replaced all 8 prompt constant references with `await this.agents.loadRaw()` calls. `buildPitchRoomInstructions()` replaced with template load + `{{BOOKS_PATH}}` regex replace.
- `src/application/RevisionQueueService.ts` — Replaced `WRANGLER_SESSION_PARSE_PROMPT` with `await this.agents.loadRaw('WRANGLER-PARSE.md')`.

### Architecture Impact
- No new IPC channels, stores, or DI wiring changes
- 9 prompt constants moved from compile-time domain constants to runtime-loaded agent files
- `AgentService.loadRaw()` now used for 9 additional files beyond its original audit-agent use case

### Migration Notes
- Users with existing `custom-agents/` directories will get the new files automatically on next startup via `ensureAgents()` (COPYFILE_EXCL — won't overwrite existing files)

---

## [2026-03-27] — Architecture refactor prompt suite

### Summary

Created a complete set of 14 encapsulated refactoring prompts to address the architectural issues documented in `issues.md`. Includes a state tracker for cross-context handoffs, a dependency graph, and a master loop prompt that drives execution through all prompts in order. No production code changes — this is the planning and orchestration layer for the refactor.

### Added
- `prompts/arch/STATE.md` — State tracker with prompt status, dependency graph, and handoff notes
- `prompts/arch/MASTER.md` — Master loop prompt that reads state, picks next prompt, executes, and loops
- `prompts/arch/ARCH-01.md` — Extract prompt templates from constants.ts to agent .md files
- `prompts/arch/ARCH-02.md` — Extract status messages from constants.ts to statusMessages.ts
- `prompts/arch/ARCH-03.md` — Add IChatService and IUsageService interfaces
- `prompts/arch/ARCH-04.md` — Extract StreamManager from ChatService
- `prompts/arch/ARCH-05.md` — Extract AuditService from ChatService
- `prompts/arch/ARCH-06.md` — Extract PitchRoomService from ChatService
- `prompts/arch/ARCH-07.md` — Extract HotTakeService from ChatService
- `prompts/arch/ARCH-08.md` — Extract AdhocRevisionService from ChatService
- `prompts/arch/ARCH-09.md` — Slim ChatService to router (capstone)
- `prompts/arch/ARCH-10.md` — Document renderer value imports exception
- `prompts/arch/ARCH-11.md` — Clean up Wrangler vestige
- `prompts/arch/ARCH-12.md` — Audit and fix silent error swallowing
- `prompts/arch/ARCH-13.md` — Add database migration system
- `prompts/arch/ARCH-14.md` — Standardize agent filenames

### Architecture Impact
- None — no production code changed. This is a planning artifact.

### Migration Notes
- None

---

## [2026-03-27] — Remove phrase ledger, consolidate into motif ledger

### Summary

Eliminated the standalone phrase ledger (`source/phrase-ledger.md`) as a separate artifact. All phrase/repetition tracking now lives exclusively in the `flaggedPhrases` section of `source/motif-ledger.json`. The motif ledger already had this section — the phrase ledger was a legacy Markdown format that duplicated its function. Lumen's Lens 8 audit now writes directly to the motif ledger's `flaggedPhrases` array instead of producing a separate file. The audit violation type `phrase-ledger-hit` was renamed to `flagged-phrase` across all types, agent prompts, and UI code.

### Changed
- `src/domain/types.ts` — Renamed `AuditViolationType` variant `'phrase-ledger-hit'` → `'flagged-phrase'`
- `src/domain/constants.ts` — Removed `source/phrase-ledger.md` from `AGENT_READ_GUIDANCE` (Verity, Lumen). Removed `phraseLedger` from `FILE_MANIFEST_KEYS`. Renamed `PHRASE_AUDIT_INSTRUCTIONS` → `MOTIF_AUDIT_INSTRUCTIONS` (now writes to motif-ledger.json). Renamed `PHRASE_AUDIT_CADENCE` → `MOTIF_AUDIT_CADENCE`. Updated `VERITY_FIX_INSTRUCTIONS` to use `flagged-phrase` violation type.
- `src/application/ChatService.ts` — Renamed `runPhraseAudit()` → `runMotifAudit()`. Audit chapter now loads `flaggedPhrases` from motif-ledger.json instead of reading phrase-ledger.md. Updated ad hoc revision pre-step.
- `src/main/ipc/handlers.ts` — Renamed IPC channel `verity:runPhraseAudit` → `verity:runMotifAudit`
- `src/preload/index.ts` — Renamed bridge method `runPhraseAudit` → `runMotifAudit`
- `src/renderer/stores/autoDraftStore.ts` — Renamed `PHRASE_AUDIT_CADENCE` → `MOTIF_AUDIT_CADENCE`, updated periodic audit labels and method calls
- `agents/LUMEN.md` — Lens 8 now writes flaggedPhrases to motif-ledger.json instead of phrase-ledger.md. Updated file ownership table.
- `agents/VERITY-AUDIT.md` — Renamed violation type, updated input description and flagging rules
- `agents/VERITY-DRAFT.md` — Removed phrase-ledger.md fallback, references motif ledger only
- `agents/VERITY-REVISION.md` — Removed phrase-ledger.md fallback, references motif ledger categories
- `agents/VERITY-LEDGER.md` — Removed migration instruction from phrase-ledger.md, updated flaggedPhrases description
- `agents/VERITY-LEGACY.md` — Replaced entire Phrase Ledger Format section with Motif Ledger integration. Updated pre-write, post-write, cross-check, and enforcement rules.
- `agents/VERITY-SCAFFOLD.md` — Updated "do not load" instruction

### Removed
- `source/phrase-ledger.md` concept — no longer produced or consumed by any agent or service
- `phraseLedger` key from `FILE_MANIFEST_KEYS`

### Architecture Impact
- Renamed IPC channel: `verity:runPhraseAudit` → `verity:runMotifAudit`
- Renamed bridge method: `verity.runPhraseAudit` → `verity.runMotifAudit`
- Renamed service method: `ChatService.runPhraseAudit()` → `ChatService.runMotifAudit()`
- `FILE_MANIFEST_KEYS` reduced from 14 to 13 entries

### Migration Notes
- Existing books with a `source/phrase-ledger.md` file: the file will be ignored. Its data should be manually migrated to the motif ledger's `flaggedPhrases` section if desired, but the system no longer reads or writes it.
- The IPC channel rename (`verity:runPhraseAudit` → `verity:runMotifAudit`) is a breaking change for any code calling the old channel name.

---

## [2026-03-27] — Create full architecture documentation from scratch

### Summary

Created all six architecture documentation files by reading every source file in the codebase and documenting the actual state. Covers all 5 layers: domain types/interfaces/constants, infrastructure modules and database schema, application services and orchestration logic, IPC channels and preload bridge shape, and renderer stores/components/views. Every file path, method signature, and IPC channel documented matches the actual code.

### Added
- `docs/architecture/ARCHITECTURE.md` — Master overview: layer diagram, source tree, service dependency graph, conventions, tech stack
- `docs/architecture/DOMAIN.md` — All types (60+ types cataloged), all interfaces (11 interfaces with full method tables), all constants
- `docs/architecture/INFRASTRUCTURE.md` — 6 infrastructure modules, 5 database tables with column details, CLI integration protocol, file watcher docs
- `docs/architecture/APPLICATION.md` — 8 application services with method tables, context assembly strategy, conversation compaction rules
- `docs/architecture/IPC.md` — 80+ IPC channels across 17 namespaces, 7 push events, full `window.novelEngine` preload bridge type shape
- `docs/architecture/RENDERER.md` — 13 Zustand stores, 8 views, 12 component groups (50+ components), 5 hooks

### Architecture Impact
- None — no wiring changes. Documentation only.

### Migration Notes
- None

---

## [2026-03-27] — Move architecture docs to docs/architecture/ subfolder

### Summary

Relocated all architecture documentation references from `docs/` to `docs/architecture/`. The `docs/` root already contained a landing page (`index.html`, `og-image.png`), so architecture docs now live in their own subfolder to avoid mixing concerns. Created the `docs/architecture/` directory and updated every reference in `AGENTS.md`.

### Added
- `docs/architecture/` — New directory for all architecture documentation files

### Changed
- `AGENTS.md` — Updated all 20+ references from `docs/*.md` to `docs/architecture/*.md` (Rule section, section headers, Workflow mappings, Edge Cases)

### Architecture Impact
- Documentation path convention changed: `docs/architecture/` is now the canonical location for ARCHITECTURE.md, DOMAIN.md, INFRASTRUCTURE.md, APPLICATION.md, IPC.md, RENDERER.md

### Migration Notes
- Any existing `docs/*.md` architecture files (if created manually) should be moved to `docs/architecture/`

---

## [2026-03-27] — Motif Ledger: full-stack feature from domain to UI

### Summary

Added the Motif Ledger — a structured JSON-backed system for tracking motif systems, character entries, structural devices, foreshadow threads, minor characters, flagged phrases, and audit logs per book. The domain types and application service were already built in a prior session; this session completed the IPC wiring, preload bridge, Zustand store, view routing, sidebar navigation, and all 7 CRUD tab panels.

### Added
- `src/main/ipc/handlers.ts` — Added `motifLedger:load`, `motifLedger:save`, `motifLedger:getUnauditedChapters` IPC handlers
- `src/preload/index.ts` — Added `motifLedger` namespace to the contextBridge API
- `src/renderer/stores/motifLedgerStore.ts` — Zustand store with full CRUD for all 7 ledger sections, dirty tracking, save/load
- `src/renderer/components/MotifLedger/MotifLedgerView.tsx` — Main view with 7-tab navigation, save button, Cmd+S shortcut
- `src/renderer/components/MotifLedger/SystemsTab.tsx` — Motif systems CRUD
- `src/renderer/components/MotifLedger/EntriesTab.tsx` — Character motif entries CRUD with filtering
- `src/renderer/components/MotifLedger/StructuralTab.tsx` — Structural devices CRUD
- `src/renderer/components/MotifLedger/ForeshadowTab.tsx` — Foreshadow registry with status grouping
- `src/renderer/components/MotifLedger/MinorCharactersTab.tsx` — Minor character catch-all CRUD
- `src/renderer/components/MotifLedger/FlaggedPhrasesTab.tsx` — Flagged phrases CRUD with category-specific fields
- `src/renderer/components/MotifLedger/AuditLogTab.tsx` — Audit log with unaudited chapter warnings

### Changed
- `src/main/ipc/handlers.ts` — Added `IMotifLedgerService` to services type, `MotifLedger` to type imports
- `src/preload/index.ts` — Added `MotifLedger` type import
- `src/renderer/stores/viewStore.ts` — Added `'motif-ledger'` to `ViewId`
- `src/renderer/components/Layout/AppLayout.tsx` — Added `MotifLedgerView` to `ViewContent`
- `src/renderer/components/Layout/Sidebar.tsx` — Added motif-ledger nav item

### Architecture Impact
- New IPC channels: `motifLedger:load`, `motifLedger:save`, `motifLedger:getUnauditedChapters`
- New preload bridge namespace: `window.novelEngine.motifLedger`
- New Zustand store: `motifLedgerStore`
- New view: `motif-ledger` in `ViewId`

### Migration Notes
None

---

## [2026-03-29] — Small queue intake: 13-session program for 14 feature requests

### Summary

Processed the full small feature request backlog into a structured 13-session build program at `prompts/feature-requests/intake/small-queue/`. Each session is a discrete, ordered engineering spec. The program covers UI bugs, sidebar/nav restructure, new views (reading mode, chapter deep dive), and smaller feature additions (saved prompts, about.json rich display, query letter mode). No source code was changed this session — only the program structure and prompt files were created.

### Added
- `FORGE-CONFIG.md` — First-run program configuration for Novel Engine. Captures stack, module registry, conventions, verification commands, and custom architecture rules. Used by all future Forge runs.
- `prompts/feature-requests/intake/small-queue/MASTER.md` — Master loop prompt. Instructs the executing agent to iterate through sessions until all are done.
- `prompts/feature-requests/intake/small-queue/STATE.md` — Session state tracker. All 13 sessions start as pending.
- `prompts/feature-requests/intake/small-queue/SESSION-01.md` — Bug cluster: revision queue select overflow, sidebar compression, CLI panel scrollbars.
- `prompts/feature-requests/intake/small-queue/SESSION-02.md` — Done confirm box (first-draft = celebration modal) + onboarding guide pipeline selector fix.
- `prompts/feature-requests/intake/small-queue/SESSION-03.md` — Book dropdown redesign: simplify to books + New Book + Library panel. Hide archived series groups.
- `prompts/feature-requests/intake/small-queue/SESSION-04.md` — Sidebar chat expandable: hot take and adhoc revision nested under Chat. Help button relocated to nav bottom.
- `prompts/feature-requests/intake/small-queue/SESSION-05.md` — Motif Ledger moved from standalone nav item to a tab inside FilesView.
- `prompts/feature-requests/intake/small-queue/SESSION-06.md` — Archive series: single-action UI button in SeriesModal to archive all books in a series.
- `prompts/feature-requests/intake/small-queue/SESSION-07.md` — Settings reorganization: four tabs (Writing, Providers, Appearance, Profile).
- `prompts/feature-requests/intake/small-queue/SESSION-08.md` — Saved prompt library: SavedPrompt domain type, AppSettings field, Saved tab in Quick Actions.
- `prompts/feature-requests/intake/small-queue/SESSION-09.md` — About.json rich display: dynamic key/value card in FilesView when about.json is selected.
- `prompts/feature-requests/intake/small-queue/SESSION-10.md` — Query letter / traditional publishing Quick Actions for Quill + HELPER.md improvements + user_guide meta prompt.
- `prompts/feature-requests/intake/small-queue/SESSION-11.md` — Chapter deep dive backend: IChatService.deepDive, ChatService implementation, IPC handler, preload bridge.
- `prompts/feature-requests/intake/small-queue/SESSION-12.md` — Chapter deep dive UI: Deep Dive button in FilesView chapter toolbar.
- `prompts/feature-requests/intake/small-queue/SESSION-13.md` — Reading mode: ManuscriptAssembly type, IFileSystemService.assembleManuscript, IPC, ReadingModeView component, Build view entry point.

### Architecture Impact
- SESSION-08 (when executed): New type `SavedPrompt` in `src/domain/types.ts`; new field `savedPrompts` in `AppSettings`; updated `DEFAULT_SETTINGS` in `src/domain/constants.ts`
- SESSION-11 (when executed): New method on `IChatService`; new IPC channel `chat:deepDive`; new bridge method `window.novelEngine.chat.deepDive`
- SESSION-13 (when executed): New type `ManuscriptAssembly` in `src/domain/types.ts`; new method on `IFileSystemService`; new IPC channel `books:assembleManuscript`; new view `'reading'` in `ViewId`; new component `src/renderer/components/Reading/ReadingModeView.tsx`
- SESSION-05 (when executed): Removes `'motif-ledger'` from `ViewId`; zustand persist migration needed (version bump)

### Migration Notes
- SESSION-05 removes `'motif-ledger'` from `ViewId`. Requires `version: 2` + `migrate` in viewStore persist config to handle users who have `'motif-ledger'` as their persisted currentView.

---

## [2026-07-02] — Add Codex CLI detection surface

### Summary

Added Codex CLI detection beside the existing Claude and Ollama checks. The settings service now probes `codex --version` non-interactively, persists `hasCodexCli`, and exposes the result through IPC, preload, and the settings Zustand store for future provider switching UI work.

### Changed
- `src/domain/interfaces.ts` — Added `ISettingsService.detectCodexCli()`.
- `src/infrastructure/settings/SettingsService.ts` — Added `detectCodexCli()` using non-interactive `codex --version` with a 10s timeout.
- `src/main/ipc/handlers.ts` — Added `settings:detectCodexCli` IPC handler.
- `src/preload/index.ts` — Added `window.novelEngine.settings.detectCodexCli()` bridge method.
- `src/renderer/stores/settingsStore.ts` — Added `detectCodexCli()` action that refreshes settings after probing.
- `docs/architecture/DOMAIN.md` — Documented the new settings contract and current Codex/Ollama provider/settings shapes.
- `docs/architecture/INFRASTRUCTURE.md` — Documented Codex and Ollama CLI detection behavior in `SettingsService`.
- `docs/architecture/IPC.md` — Documented the new Codex detection channel and preload method.
- `docs/architecture/RENDERER.md` — Documented the new settings store detection action.

### Architecture Impact
- New IPC channel: `settings:detectCodexCli`
- New preload bridge method: `window.novelEngine.settings.detectCodexCli()`
- Extended settings service contract: `ISettingsService.detectCodexCli()`

### Migration Notes
- None

---

## [2026-07-02] — Add Codex CLI provider client

### Summary

Added the infrastructure provider for Codex CLI. `CodexCliClient` implements `IModelProvider`, invokes `codex exec --json` through a non-interactive stdin prompt, streams JSONL assistant output into Novel Engine stream events, persists stream events in SQLite batches, and supports active-process idle checks and abort cleanup.

### Added
- `src/infrastructure/codex-cli/CodexCliClient.ts` — Implements the built-in Codex CLI provider with availability checks, prompt construction, JSONL/text streaming, usage handling, event persistence, and SIGTERM/SIGKILL abort support.
- `src/infrastructure/codex-cli/index.ts` — Barrel export for the Codex CLI provider.

### Changed
- `docs/architecture/ARCHITECTURE.md` — Added `src/infrastructure/codex-cli/` to the source tree and Codex CLI to the technology stack.
- `docs/architecture/INFRASTRUCTURE.md` — Added the `codex-cli/` module inventory and documented the chosen `codex exec --json` invocation.

### Architecture Impact
- New infrastructure module: `src/infrastructure/codex-cli/`
- New provider implementation: `CodexCliClient` implements `IModelProvider`
- New runtime dependency path: Codex CLI provider → local `codex exec --json`

### Migration Notes
- None

---

## [2026-07-02] — Register Codex provider at startup

### Summary

Registered Codex CLI as a built-in provider during app startup. The composition root now instantiates `CodexCliClient`, enables it when `codex --version` succeeds, persists `hasCodexCli`, discovers models from `~/.codex/models_cache.json` when available, and falls back to a built-in `gpt-5.3-codex` model.

### Changed
- `src/main/index.ts` — Imports and registers `CodexCliClient`, adds Codex model discovery, persists Codex CLI availability, and skips Codex in the user-provider loop.
- `src/domain/constants.ts` — Adds fallback Codex model `gpt-5.3-codex` and default model metadata to the built-in Codex provider config.
- `docs/architecture/ARCHITECTURE.md` — Updates the service dependency graph for Codex, Ollama, llama-server, and provider registry startup wiring.
- `docs/architecture/DOMAIN.md` — Documents the current built-in provider IDs and four built-in provider configs.
- `docs/architecture/INFRASTRUCTURE.md` — Documents Codex startup registration and model discovery fallback behavior.

### Architecture Impact
- New composition root wiring: `src/main/index.ts` instantiates `CodexCliClient(booksDir, db)`.
- New startup model discovery path: `~/.codex/models_cache.json` → built-in `gpt-5.3-codex` fallback.
- Settings persistence: startup updates `hasCodexCli` based on `CodexCliClient.isAvailable()`.

### Migration Notes
- None

---

## [2026-07-02] — Polish provider switching UI

### Summary

Updated Settings and onboarding copy so Codex CLI is presented as a first-class built-in backend alongside Claude CLI, Ollama, and llama-server. Provider cards now show clear labels, active-provider state, active switching, and local CLI checks for Claude/Codex without exposing endpoint fields for Codex.

### Changed
- `src/renderer/components/Settings/ProviderSection.tsx` — Added Codex/Ollama type labels, active badges, active-provider switching, provider-neutral copy, and kept endpoint editing scoped to Ollama/llama-server.
- `src/renderer/components/Settings/SettingsView.tsx` — Replaced Claude-only status copy with Claude/Codex built-in CLI checks and clarified model selection switches the active provider.
- `src/renderer/components/Onboarding/OnboardingWizard.tsx` — Updated onboarding setup and ready summary to accept Claude CLI or Codex CLI as local built-in backends.
- `src/renderer/stores/providerStore.ts` — Reloads settings after `setDefault()` so active provider state refreshes cleanly.
- `docs/architecture/RENDERER.md` — Documented provider switching UI, provider store refresh behavior, and Codex-aware onboarding.

### Architecture Impact
- Renderer state flow: `providerStore.setDefault()` now reloads `settingsStore` after `providers:setDefault`.
- No new IPC channels — existing `providers:setDefault`, `settings:detectClaudeCli`, and `settings:detectCodexCli` are reused.

### Migration Notes
- None

---

## [2026-07-02] — Unify Settings model pickers

### Summary

Primary and Secondary Model selection now render from the same available-provider model list exposed by `models.getAvailable()`. Secondary model selection is provider-neutral, persists only `secondaryModel`, and chapter audits now resolve that secondary model through the provider registry before falling back to the primary model.

### Changed
- `src/renderer/components/Settings/SettingsView.tsx` — Removed Claude-only secondary filtering, reused grouped available-provider model buttons for both pickers, added empty-list guidance, and clarified secondary model copy.
- `src/application/AuditService.ts` — Resolves `AppSettings.secondaryModel` through `IProviderRegistry` for chapter audits before falling back to the primary model.
- `docs/architecture/RENDERER.md` — Documented that both Settings model pickers use the same available-provider groups and only primary changes switch the active provider.
- `docs/architecture/APPLICATION.md` — Documented provider-registry secondary model resolution for `AuditService.auditChapter()`.

### Architecture Impact
- Application behavior change: `AuditService.auditChapter()` can route `secondaryModel` to any registered available provider through `IProviderRegistry`.
- Renderer behavior change: `SettingsView.tsx` uses one grouped model list for primary and secondary pickers.
- No new IPC channels or preload bridge methods.

### Migration Notes
- None

---

## [2026-07-02] — Codex add-dir compatibility session program

### Summary

Created a Forge session program for fixing the Codex provider runtime failure where `codex exec` rejects `--add-dir`. The program captures the screenshot bug report, scopes the fix to `CodexCliClient`, and requires infrastructure documentation plus changelog updates during implementation.

### Added
- `prompts/session-program/program-006/input-files/bug-report.md` — Captures the screenshot symptoms, initial code pointers, and expected outcome.
- `prompts/session-program/program-006/SESSION-01.md` — Defines the implementation session for conditional Codex CLI `--add-dir` support.
- `prompts/session-program/program-006/STATE.md` — Tracks session status, scope, design decisions, and handoff notes.
- `prompts/session-program/program-006/MASTER.md` — Defines the execution protocol, recovery steps, and final report requirements.

### Architecture Impact
None — prompt program only, no source wiring changes.

### Migration Notes
None

---

## [2026-07-02] — Codex add-dir compatibility fix

### Summary

`src/infrastructure/codex-cli/CodexCliClient.ts` now detects whether the installed Codex CLI supports `--add-dir` before spawning `codex exec`. Compatible installs keep the broader books-directory workspace, while older installs fall back to `--cd`-scoped access with a main-process warning instead of failing immediately.

### Changed
- `src/infrastructure/codex-cli/CodexCliClient.ts` — Added cached `codex exec --help` detection for `--add-dir`, conditional argument construction, and cache invalidation.
- `docs/architecture/INFRASTRUCTURE.md` — Documented conditional Codex CLI `--add-dir` support and fallback behavior.

### Fixed
- `src/infrastructure/codex-cli/CodexCliClient.ts` — Prevents chat requests from hard-failing on Codex CLI installations that reject `--add-dir`.

### Architecture Impact
- CLI invocation behavior: `CodexCliClient` now branches on local `codex exec --help` output before adding `--add-dir <booksDir>`.
- No domain contracts, IPC channels, renderer stores, or schema changes.

### Migration Notes
None

---

## [2026-07-02] — Harden Codex CLI workspace fallback

### Summary

`./src/infrastructure/codex-cli/CodexCliClient.ts` now validates the Codex CLI working directory before launch and reports the non-`--add-dir` fallback as a stream status event instead of only writing a console warning.

### Changed
- `./src/infrastructure/codex-cli/CodexCliClient.ts` — Added explicit workspace planning for Codex CLI launches, active-book fallback mode, and spawn logging that includes the selected workspace mode.
- `./docs/architecture/INFRASTRUCTURE.md` — Documented Codex CLI workspace planning, early directory validation, and fallback status diagnostics.

### Fixed
- `./src/infrastructure/codex-cli/CodexCliClient.ts` — Emits a clear error before spawn when the planned working directory is missing and emits an observable status event when older Codex CLI installs run with active-book-only workspace access.

### Architecture Impact
- None — no new dependencies, IPC channels, stores, or schema changes.

### Migration Notes
- None

---
## [2026-07-02] — Ollama CLI runner

### Summary

`./src/infrastructure/ollama-cli/OllamaCliRunner.ts` adds a focused wrapper around the local `ollama` command so later sessions can make local Ollama detection, model discovery, service startup, and smoke tests CLI-first without adding command parsing to the chat client.

### Added
- `./src/infrastructure/ollama-cli/OllamaCliRunner.ts` — Wraps `ollama --version`, `ollama list`, `ollama show`, `ollama serve`, and `ollama run` smoke tests with timeout-safe boolean/empty-list fallbacks.

### Changed
- `./src/infrastructure/ollama-cli/index.ts` — Exports `OllamaCliRunner` and `OllamaCliModel`.
- `./docs/architecture/INFRASTRUCTURE.md` — Documents the Ollama CLI/API hybrid module and runner behavior.
- `./docs/architecture/ARCHITECTURE.md` — Lists `ollama-cli`, `llama-server`, and provider infrastructure files in the source tree and technology stack.

### Architecture Impact
- New infrastructure utility: `OllamaCliRunner` centralizes local `ollama` command invocation for future Ollama provider routing.
- No new domain contracts, IPC channels, renderer stores, database schema changes, or composition-root wiring.

### Migration Notes
None

---
## [2026-07-02] — CLI-first Ollama provider routing

### Summary

`./src/infrastructure/ollama-cli/OllamaCodeClient.ts` now treats local Ollama as a CLI-first provider for availability while preserving `/api/chat` for structured streaming and tool-use. Startup model discovery in `./src/main/index.ts` uses `OllamaCliRunner` for local models and context windows, with HTTP discovery retained for remote Ollama endpoints.

### Changed
- `./src/infrastructure/ollama-cli/OllamaCodeClient.ts` — Injects `OllamaCliRunner`, checks local CLI availability before API reachability, attempts `ollama serve`, and verifies the local API before chat streaming.
- `./src/main/index.ts` — Instantiates one `OllamaCliRunner`, passes it into `OllamaCodeClient`, uses CLI-backed model discovery for local Ollama, and keeps HTTP discovery for remote hosts.
- `./docs/architecture/INFRASTRUCTURE.md` — Documents local CLI-first availability, local API readiness before chat, and remote HTTP behavior.
- `./docs/architecture/ARCHITECTURE.md` — Updates the composition root dependency graph for `OllamaCliRunner` injection.

### Architecture Impact
- New dependency wiring: `OllamaCodeClient` receives `OllamaCliRunner` from `./src/main/index.ts`.
- Provider behavior change: local Ollama availability is based on CLI detection and model listing before API-only failure; remote Ollama remains HTTP-based.
- No new IPC channels, renderer stores, database schema changes, or domain contracts.

### Migration Notes
None

---
## [2026-07-02] — CLI-first Ollama settings copy

### Summary

Settings now presents Ollama as a local CLI-first provider. The Providers tab shows Ollama CLI status alongside Claude and Codex, explains that local models come from `ollama pull model-name` and `ollama list`, and keeps the endpoint field as an advanced override for remote Ollama hosts.

### Changed
- `./src/renderer/components/Settings/SettingsView.tsx` — Added Ollama CLI to built-in CLI status, updated provider guidance, and clarified empty-model copy for local Ollama pulls.
- `./src/renderer/components/Settings/ProviderSection.tsx` — Renamed Ollama endpoint copy to an advanced override, added CLI discovery help, and labeled the provider badge as Ollama CLI.
- `./docs/architecture/RENDERER.md` — Documented Settings and ProviderSection CLI-first Ollama behavior.

### Architecture Impact
- Renderer behavior change: Settings now calls the existing `settings:detectOllamaCli` bridge from the built-in CLI status section.
- No new IPC channels, preload methods, stores, database schema changes, or domain contracts.

### Migration Notes
None

---

## [2026-07-08] — Codex silent-exit fix session program

### Summary

Created a Forge session program for the Codex CLI bug where Novel Engine starts Codex, the process exits in under ten seconds, and the UI shows no useful error. The program scopes the fix to `./src/infrastructure/codex-cli/CodexCliClient.ts`: treat no-output Codex exits as errors, preserve synthetic completion only when assistant text exists, and add bounded exit diagnostics.

### Added
- `./prompts/session-program/program-015/input-files/bug-report.md` — Captures the user report, source observations, local Codex version check, likely failure mode, and expected outcome.
- `./prompts/session-program/program-015/SESSION-01.md` — Defines the implementation session for Codex silent-exit diagnostics and no-output error handling.
- `./prompts/session-program/program-015/STATE.md` — Tracks session status, scope, design decisions, and handoff notes.
- `./prompts/session-program/program-015/MASTER.md` — Defines the execution protocol, recovery steps, stopping conditions, and final report requirements.

### Architecture Impact
- None — prompt program only, no source wiring changes.

### Migration Notes
None

---

## [2026-07-08] — Surface silent Codex CLI exits as errors

### Summary

`./src/infrastructure/codex-cli/CodexCliClient.ts` now treats Codex runs that close without assistant text or usage as failures instead of successful empty responses. The provider keeps synthetic completion only for text-without-usage runs, captures bounded stdout/stderr diagnostics, and forwards native Codex error JSON as stream errors so the renderer receives a visible failure event.

### Changed
- `./src/infrastructure/codex-cli/CodexCliClient.ts` — Added bounded process diagnostics, parse metadata, native Codex error extraction, and diagnostic close handling for no-output and non-zero exits.
- `./docs/architecture/INFRASTRUCTURE.md` — Documented Codex no-output exit errors, bounded diagnostics, and text-without-usage synthetic completion behavior.
- `./prompts/session-program/program-015/STATE.md` — Marked SESSION-01 complete with verification and handoff notes.

### Fixed
- `./src/infrastructure/codex-cli/CodexCliClient.ts` — Prevents a quick Codex exit with no assistant output from being saved as a successful empty assistant message.

### Architecture Impact
- None — no new dependencies, IPC channels, renderer stores, or schema changes.

### Migration Notes
None

---

## [2026-07-08] — Codex final-output fallback and diagnostics

### Summary

`./src/infrastructure/codex-cli/CodexCliClient.ts` now passes `--output-last-message` to `codex exec` and reads the temporary final-message file when JSON stdout closes cleanly without assistant text. Clean no-output failures now include a bounded parsed event tail, making Codex clean exits easier to diagnose when fallback output is unavailable.

### Changed
- `./src/infrastructure/codex-cli/CodexCliClient.ts` — Added temp final-message file lifecycle, fallback text emission before clean-exit error handling, and parsed Codex event-tail diagnostics.
- `./docs/architecture/INFRASTRUCTURE.md` — Documented Codex `--output-last-message` usage, fallback cleanup, and event-tail diagnostics.
- `./prompts/session-program/program-016/STATE.md` — Marked SESSION-01 complete with verification notes.

### Fixed
- `./src/infrastructure/codex-cli/CodexCliClient.ts` — Recovers assistant text from Codex's final-message file when JSON events omit streamed assistant text.

### Architecture Impact
- CLI invocation behavior: `./src/infrastructure/codex-cli/CodexCliClient.ts` now adds `--output-last-message <tempFile>` to `codex exec` calls.
- No new IPC channels, renderer stores, database schema changes, or domain contracts.

### Migration Notes
None

---

## [2026-07-08] — Codex tool and file event tracking

### Summary

`./src/infrastructure/codex-cli/CodexCliClient.ts` now converts completed Codex tool/file JSON items into Novel Engine stream activity. Codex `file_change` events update `done.filesTouched`, emit tool/progress events, and send one terminal `filesChanged` event so pipeline chats do not fall back to response extraction after Codex already wrote files.

### Changed
- `./src/infrastructure/codex-cli/CodexCliClient.ts` — Added defensive Codex tool/file item extraction, file-change path normalization, tracker file touches, progress inference, zero-duration tool duration events, and terminal `filesChanged` emission.
- `./docs/architecture/INFRASTRUCTURE.md` — Documented Codex tool/file tracking and emitted stream events.
- `./docs/architecture/APPLICATION.md` — Documented `ChatService` reliance on `done.filesTouched` for pipeline post-stream extraction.
- `./prompts/session-program/program-016/STATE.md` — Marked SESSION-02 complete with observed Codex `file_change` event shape.

### Fixed
- `./src/infrastructure/codex-cli/CodexCliClient.ts` — Prevents Codex-written files from being treated as no-file pipeline runs when Codex reports writes through `file_change` JSON items.

### Architecture Impact
- Codex provider stream behavior now emits `toolUse`, `toolDuration`, `progressStage`, `done.filesTouched`, and terminal `filesChanged` for completed file/tool items.
- No new IPC channels, renderer stores, database schema changes, or domain contracts.

### Migration Notes
None

---

## [2026-07-08] — Provider model resolution guardrails

### Summary

Stale model settings now resolve to an available provider model before chat streaming. The provider registry exposes deterministic model resolution, startup repairs stale `settings.json` model/provider pairs, ChatService records and routes streams with the effective model, and Settings shows a warning when the saved primary model is unavailable.

### Changed
- `./src/domain/types.ts` — Added `ResolvedModelSelection` for requested/effective model fallback results.
- `./src/domain/interfaces.ts` — Added `IProviderRegistry.resolveModelSelection()` to the provider registry contract.
- `./src/infrastructure/providers/ProviderRegistry.ts` — Added deterministic model fallback and warning emission before dispatching fallback model streams.
- `./src/main/index.ts` — Reconciles stale startup `model` and `activeProviderId` settings after provider registration.
- `./src/application/ChatService.ts` — Uses the effective model for provider routing, logs, stream metadata, and provider calls.
- `./src/renderer/components/Settings/SettingsView.tsx` — Shows stale primary-model warning and falls back visually to the first available model.
- `./docs/architecture/DOMAIN.md` — Documents the new model-resolution type and provider registry method.
- `./docs/architecture/INFRASTRUCTURE.md` — Documents ProviderRegistry model-resolution behavior.
- `./docs/architecture/APPLICATION.md` — Documents ChatService effective-model routing and usage recording.
- `./docs/architecture/RENDERER.md` — Documents Settings stale-model display handling.
- `./prompts/session-program/program-016/STATE.md` — Marked SESSION-03 complete with verification notes.

### Fixed
- `./src/infrastructure/providers/ProviderRegistry.ts` — Prevents stale model IDs from being forwarded unchanged to fallback providers.
- `./src/application/ChatService.ts` — Prevents routing logs and stream session metadata from recording unavailable stale model IDs.

### Architecture Impact
- New domain type: `./src/domain/types.ts` exports `ResolvedModelSelection`.
- New provider contract method: `./src/domain/interfaces.ts` adds `IProviderRegistry.resolveModelSelection()`.
- Startup behavior change: `./src/main/index.ts` persists repaired `model` and `activeProviderId` settings when stale values are detected.
- Renderer behavior change: `./src/renderer/components/Settings/SettingsView.tsx` displays a fallback model instead of selecting an unavailable saved model.
- No new IPC channels, preload methods, stores, or database schema changes.

### Migration Notes
- Existing stale `settings.json` model/provider pairs are repaired on startup to the resolved effective model and provider.

---

## [2026-07-08] — Created Codex file-only completion program

### Summary

Created a Forge session program for the Codex CLI auto-draft failure where `codex exec --json` exits with code `0`, writes no final agent message, and Novel Engine reports an error even though the manuscript pane appears to show file output. The program scopes implementation to Codex file-only completion detection, workspace snapshot fallback, and useful diagnostics for unknown Codex JSON event shapes.

### Added
- `./prompts/session-program/program-017/input-files/bug-report.md` — Captures the screenshot error, current code context, likely root cause, and desired fix.
- `./prompts/session-program/program-017/MASTER.md` — Defines the execution protocol for the Codex file-only completion fix.
- `./prompts/session-program/program-017/STATE.md` — Tracks the two-session plan, dependencies, scope, and design decisions.
- `./prompts/session-program/program-017/SESSION-01.md` — Specifies Codex file-only success detection via bounded workspace snapshot diff.
- `./prompts/session-program/program-017/SESSION-02.md` — Specifies improved Codex unknown-event summaries and bounded raw diagnostics.

### Architecture Impact

- None — no source, runtime wiring, IPC, schema, or domain contracts changed by this session-program creation.

### Migration Notes

- None

---

## [2026-07-08] — Codex file-only success detection

### Summary

`./src/infrastructure/codex-cli/CodexCliClient.ts` now treats clean Codex exits that update files but emit no assistant text or usage as successful file-only completions. It captures a bounded workspace metadata snapshot before spawn, diffs it when parsed Codex events do not report touched files, and emits a concise updated-files summary with synthetic `done.filesTouched` instead of surfacing a false no-output error.

### Changed
- `./src/infrastructure/codex-cli/CodexCliClient.ts` — Added bounded metadata-only workspace snapshot/diff helpers and clean-close fallback file-touch detection before no-output error classification.
- `./docs/architecture/INFRASTRUCTURE.md` — Documented Codex file-only success classification and snapshot fallback behavior.
- `./docs/architecture/APPLICATION.md` — Documented that provider `done.filesTouched` can come from native events or provider-level fallback detection.
- `./prompts/session-program/program-017/STATE.md` — Marked SESSION-01 complete with verification and handoff notes.

### Fixed
- `./src/infrastructure/codex-cli/CodexCliClient.ts` — Prevents successful Codex file writes from being reported as `Codex CLI exited without assistant output or usage` when Codex omits assistant text and usage.

### Architecture Impact
- Codex provider behavior now emits synthetic success for clean file-only exits using snapshot-derived `done.filesTouched`.
- No new dependencies, IPC channels, renderer stores, database schema changes, or domain contracts.

### Migration Notes
None

---

## [2026-07-08] — Codex unknown-event diagnostics

### Summary

`./src/infrastructure/codex-cli/CodexCliClient.ts` now makes Codex JSON parser misses actionable. Event summaries inspect nested `msg`, `event`, and `data` records, unknown events include compact key-shape summaries instead of bare `unknown`, and exit diagnostics include a bounded `unknownJsonTail` with the last raw unknown JSON snippets.

### Changed
- `./src/infrastructure/codex-cli/CodexCliClient.ts` — Added nested event summary detection, compact unknown shape summaries, bounded raw unknown JSON snippets, and `unknownJsonTail` in Codex exit diagnostics.
- `./docs/architecture/INFRASTRUCTURE.md` — Documented Codex `eventTail` shape summaries and bounded `unknownJsonTail` diagnostics.
- `./prompts/session-program/program-017/STATE.md` — Marked SESSION-02 complete with verification and parser smoke notes.

### Architecture Impact
- Codex provider diagnostics now include `unknownJsonTail=` in close/error messages when unknown JSON event shapes are encountered.
- No new dependencies, IPC channels, renderer stores, database schema changes, or domain contracts.

### Migration Notes
None

---

## [2026-07-09] — Codex 0.27.0 envelope unwrapping

### Summary

`./src/infrastructure/codex-cli/CodexCliClient.ts` now parses the Codex 0.27.0 `{"id":"0","msg":{...}}` event envelope. Assistant text (`agent_message` / `*_delta`), status, and usage (`token_count` / `task_complete`) are extracted from nested envelope candidates instead of top-level keys only, so 0.27.0 assistant text streams incrementally instead of surviving only via the `--output-last-message` fallback file. Mid-task `token_count` usage is recorded without ending the UI turn early, and the CLI's config/prompt echo lines are labeled `config-echo` / `prompt-echo` in diagnostics.

### Changed
- `./src/infrastructure/codex-cli/CodexCliClient.ts` — Added `unwrapCodexEvent()` candidate iteration; rewrote `extractText()` (with delta/full-message duplicate guard), `extractStatus()`, and `extractUsage()` (terminal vs non-terminal usage contract) to be envelope-aware; threaded a per-call `CodexParseState` through `processOutputLine()`; preferred recorded `token_count` usage over character estimates in the close-handler `done` fallback; labeled config/prompt echo lines in event summaries.
- `./prompts/session-program/program-018/STATE.md` — Marked SESSION-01 complete with verification and handoff notes.

### Architecture Impact
- None — all changes are internal to M11 with file-local types; no new dependencies, IPC channels, renderer stores, database schema changes, or domain contracts.

### Migration Notes
None

---

## [2026-07-09] — Codex real error surfacing

### Summary

`./src/infrastructure/codex-cli/CodexCliClient.ts` now distinguishes Codex transient `stream_error` events (the CLI retries internally) from terminal `error` events, both envelope-aware. Transient errors surface as `status` events and are recorded; terminal errors set `terminalErrorMessage` so failures report `Codex CLI reported an error: <real reason>` instead of the generic no-output diagnostic dump. Empty-output and nonzero-exit failures now prefer `Codex CLI stream failed after retries: <reason>` when a stream error was the last known cause, and exit diagnostics include a `streamError=` line.

### Changed
- `./src/infrastructure/codex-cli/CodexCliClient.ts` — Added `extractStreamError()`; rewrote `extractError()` to iterate envelope candidates (skipping `stream_error`); routed transient stream errors as `status` events with `lastStreamErrorMessage` tracking; added `streamError=` to `buildCodexExitMessage()` diagnostics and improved failure summaries.
- `./prompts/session-program/program-018/STATE.md` — Marked SESSION-02 complete with verification and handoff notes.

### Architecture Impact
- None — internal to M11; error strings ride the existing `StreamEvent` union (`status` / `error`), no domain changes.

### Migration Notes
None

---

## [2026-07-09] — Codex bounded stream-failure retry

### Summary

`./src/infrastructure/codex-cli/CodexCliClient.ts` now automatically retries fully-empty transient Codex stream failures. `sendMessage()` is restructured into a retry loop around a new `runCodexAttempt()`: when an attempt streams no text, touches no files, and fails with a recorded stream error (or a clean-but-empty exit that parsed JSON events), the provider re-spawns `codex exec` up to 2 times with linear 2s/4s backoff. Exactly one terminal `error` StreamEvent is emitted when the run finally gives up, and a Stop during retry backoff cancels the pending re-spawn.

### Added
- `./src/domain/constants.ts` — `CODEX_STREAM_RETRY_MAX` (2) and `CODEX_STREAM_RETRY_DELAY_MS` (2000) with JSDoc, next to the `MULTI_CALL_*` retry constants.

### Changed
- `./src/infrastructure/codex-cli/CodexCliClient.ts` — Extracted per-attempt spawn/parse/close logic into `runCodexAttempt()` returning `CodexAttemptOutcome`; retry loop with status events and linear backoff in `sendMessage()`; attempt-level `error` StreamEvents withheld until give-up; `abortedStreams` set so user Stop never triggers a re-spawn (including during backoff).
- `./docs/architecture/INFRASTRUCTURE.md` — Documented envelope unwrapping, stream_error classification, bounded retry, and abort-during-backoff behavior for the Codex provider.
- `./prompts/session-program/program-018/STATE.md` — Marked SESSION-03 complete; program done.

### Architecture Impact
- Two additive M01 constants; retry logic lives entirely in M11 (provider concern) — `ChatService`/`PipelineService` untouched, dependency flow `DOMAIN <- INFRASTRUCTURE` preserved.
- No new dependencies, IPC channels, renderer stores, database schema changes, or domain type changes.

### Migration Notes
None
