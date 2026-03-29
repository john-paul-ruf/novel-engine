# Changelog

All notable changes to Novel Engine are documented here.

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
