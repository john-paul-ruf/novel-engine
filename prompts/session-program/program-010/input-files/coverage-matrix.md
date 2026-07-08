# Feature Coverage Matrix — Streamlined Workspace UI Conversion

> Every user-facing feature in the current renderer, mapped to its home in the redesign.
> Source of truth for scope. If a feature is not in this table, it is out of scope.
> Mockup reference: `design/ui-redesign/mockups/streamlined-workspace/index.html`

Legend: **KEEP** = unchanged internals, new placement · **REFACTOR** = same capability, rebuilt UI · **MERGE** = absorbed into another surface · **REMOVE** = capability covered elsewhere, component deleted · **NEW** = new capability

## App Shell

| # | Current feature | Where it lives today | New home | Disposition | Session | Verified |
|---|----------------|----------------------|----------|-------------|---------|----------|
| 1 | Custom title bar (traffic lights, drag region) | `Layout/TitleBar.tsx` | Title bar + breadcrumb + ⌘K pill + live word count | REFACTOR | S03 | ✅ |
| 2 | Bottom-nav view switching (8 emoji items) | `Layout/Sidebar.tsx` | 56px icon rail (SVG icons, tooltips) | REFACTOR | S03 | ✅ |
| 3 | Pipeline right-column toggle | `Sidebar.tsx` PipelineToggleButton + `RightPanel/PipelinePanel.tsx` | Removed — pipeline is always the Workspace left panel | REMOVE | S07, S14 | ✅ |
| 4 | CLI Activity right-dock toggle | `Sidebar/CliActivityButton.tsx` + `CliActivity/CliActivityPanel.tsx` | Bottom status bar + expandable Activity drawer | REFACTOR | S05 | ✅ |
| 5 | Sidebar resize handle | `Layout/ResizeHandle.tsx` | Kept for pipeline panel, split divider, drawer height | KEEP | S07, S09 | ✅ |
| 6 | Dark/light/system theme | `settingsStore` + `styles/globals.css` | Kept — new warm-ink tokens themed for both modes | KEEP | S01 | ✅ |
| 7 | View persistence (all views mounted, hidden) | `Layout/AppLayout.tsx` ViewContent | Same strategy for library/workspace/manuscript | KEEP | S02 | ✅ |
| 8 | StreamManager global listeners (chat, pitch, helper) | `AppLayout.tsx` | Unchanged, stays at app root | KEEP | S02 | ✅ |
| 9 | ErrorBoundary | `ErrorBoundary/` | Unchanged | KEEP | — | ✅ |

## Book Management

| # | Current feature | Where it lives today | New home | Disposition | Session | Verified |
|---|----------------|----------------------|----------|-------------|---------|----------|
| 10 | Book list w/ covers, status badges, word counts | `Sidebar/BookPanel.tsx` | Library view bookshelf grid | REFACTOR | S06 | ✅ |
| 11 | Series groups | `Sidebar/SeriesGroup.tsx` | Library shelf sections per series | REFACTOR | S06 | ✅ |
| 12 | New Book action | BookPanel toolbar `new-book` | Library "New Book" ghost card | REFACTOR | S06 | ✅ |
| 13 | Shelved Pitches panel | `Sidebar/ShelvedPitchesPanel.tsx` + `PitchPreviewModal.tsx` | Library "Shelved pitches" section (modals kept) | REFACTOR | S13 | ✅ |
| 14 | Archived Books modal | BookPanel `archived` | Library header action (modal kept) | KEEP | S06 | ✅ |
| 15 | Manage Series (SeriesModal, SeriesForm, VolumeList, SeriesBibleEditor) | `Series/` | Library header action (modals kept) | KEEP | S06 | ✅ |
| 16 | Import book / series (ImportChoiceModal, ImportWizard, ImportSeriesWizard) | `Import/`, `Sidebar/ImportChoiceModal.tsx` | Library "New Book" flow + header action (wizards kept) | KEEP | S06 | ✅ |
| 17 | Cover image change on click | BookPanel `handleCoverClick` | Library card cover click | KEEP | S06 | ✅ |
| 18 | Active book switching | BookPanel `handleSelectBook` | Library card click → Workspace | KEEP | S06 | ✅ |
| 19 | Voice Setup (voice profile interview) | `Sidebar/VoiceSetupButton.tsx` | Palette action + Draft-phase header action when profile missing | REFACTOR | S13 | ✅ |

## Pipeline & Dashboard

| # | Current feature | Where it lives today | New home | Disposition | Session | Verified |
|---|----------------|----------------------|----------|-------------|---------|----------|
| 20 | 14-phase tracker (status, expand, confirm gates) | `Sidebar/PipelineTracker.tsx` | Pipeline spine panel — phases grouped into 5 stages, phase = nav | REFACTOR | S07 | ✅ |
| 21 | Auto Draft trigger (First Draft phase) | PipelineTracker | Current-phase card in spine | KEEP | S07 | ✅ |
| 22 | Build trigger on Build phase | PipelineTracker | SHIP stage node action → Exports view | KEEP | S07, S12 | ✅ |
| 23 | Dashboard Pipeline Progress card | `Dashboard/DashboardView.tsx` PipelineCard | Spine header progress bar ("Phase N of 14") | MERGE | S07 | ✅ |
| 24 | Dashboard Word Count card (per-chapter bars) | DashboardView WordCountCard | Spine book header total + Manuscript chapter rail per-chapter counts | MERGE | S07, S11 | ✅ |
| 25 | Dashboard Last Interaction + Resume Chat | DashboardView LastInteractionCard | Workspace restores last phase conversation; Library "Recent" line | MERGE | S06, S08 | ✅ |
| 26 | Dashboard Revision Tasks card | DashboardView RevisionTasksCard | Revision-phase card in spine (progress micro-bar) | MERGE | S07 | ✅ |
| 27 | Dashboard Recent Files card | DashboardView RecentFilesCard | Activity drawer "Files" filter + Library recent line | MERGE | S05, S06 | ✅ |

## Chat & Agent Interaction

| # | Current feature | Where it lives today | New home | Disposition | Session | Verified |
|---|----------------|----------------------|----------|-------------|---------|----------|
| 28 | Agent chat (messages, streaming, markdown) | `Chat/ChatView.tsx`, MessageList, StreamingMessage, MessageBubble | Workbench chat pane (left split) | REFACTOR | S09 | ✅ |
| 29 | Conversation list/switcher | `Chat/ConversationList.tsx` | Phase-scoped conversation dropdown chip in chat pane header | REFACTOR | S08 | ✅ |
| 30 | Agent header (identity, role) | `Chat/AgentHeader.tsx` | Workbench phase header (agent chip + color) | MERGE | S08 | ✅ |
| 31 | Thinking blocks (collapsible) | `Chat/ThinkingBlock.tsx` | Unchanged inside chat pane | KEEP | S09 | ✅ |
| 32 | Thinking budget slider | `Chat/ThinkingBudgetSlider.tsx` | Compact "Thinking: Off/N" chip under input | REFACTOR | S09 | ✅ |
| 33 | Quick actions | `Chat/QuickActions.tsx` | "Quick actions" chip under input + command palette | REFACTOR | S04, S09 | ✅ |
| 34 | Chat modal (floating chat) | `Chat/ChatModal.tsx` | Kept as-is (opened from Hot Take etc.) | KEEP | S13 | ✅ |
| 35 | Hot Take | `Sidebar/HotTakeButton.tsx` | Palette action + Assess-stage quick action | REFACTOR | S13 | ✅ |
| 36 | Ad Hoc Revisions / Revision Queue (sessions, run next/all, pause, cache, open-in-chat) | `RevisionQueue/*` + `Sidebar/AdhocRevisionButton.tsx`, `RevisionQueueButton.tsx` | Modal kept; launched from palette + Revision phase card | KEEP | S13 | ✅ |
| 37 | Helper (Help chat panel) | `Helper/*` | Palette action + rail help entry (panel kept) | KEEP | S13 | ✅ |

## Files, Manuscript & Reference

| # | Current feature | Where it lives today | New home | Disposition | Session | Verified |
|---|----------------|----------------------|----------|-------------|---------|----------|
| 38 | Source tab (voice profile, scene outline, story bible, pitch cards) | `Files/SourcePanel.tsx` | Companion pane "Sources" tab in Workspace | REFACTOR | S10 | ✅ |
| 39 | Book Info editor (about.json, chat-with-Spark) | `Files/AboutJsonViewer.tsx` | Library card "Book info" + palette (viewer kept) | KEEP | S06 | ✅ |
| 40 | Chapters tab (list, reorder, notes, back matter add/delete) | `Files/ChaptersPanel.tsx` | Manuscript view chapter rail | REFACTOR | S11 | ✅ |
| 41 | Agent reports grid (reader/dev/audit reports, style sheet, tasks, prompts) | `Files/AgentOutputPanel.tsx` | Companion pane "Reports" tab (phase-aware default) | REFACTOR | S10 | ✅ |
| 42 | File explorer (tree browse) | `Files/FileBrowser.tsx` | Companion pane "Explorer" tab | KEEP | S10 | ✅ |
| 43 | File reader (markdown render) | FilesView MarkdownViewer | Companion + Manuscript Reader typography | REFACTOR | S10, S11 | ✅ |
| 44 | File editor (edit, save) | `Files/FileEditor.tsx` | Manuscript Editor mode + companion "Open in editor" | KEEP | S11 | ✅ |
| 45 | Verity-draft read-only guard (ch 02+) | FilesView `isVerityDraft` | Same guard in Manuscript Editor | KEEP | S11 | ✅ |
| 46 | Version history + diff viewer | `Files/VersionHistoryPanel.tsx`, `DiffViewer.tsx` | Manuscript Editor side panel | KEEP | S11 | ✅ |
| 47 | Find & Replace | `Files/FindReplaceModal.tsx` | Palette action + Manuscript Editor toolbar | KEEP | S11 | ✅ |
| 48 | Delete confirm modal | `Files/DeleteConfirmModal.tsx` | Kept where used | KEEP | S11 | ✅ |
| 49 | Chapter Deep Dive (Lumen scoped analysis) | FilesView `handleDeepDive` | Chapter rail context action + palette | KEEP | S11 | ✅ |
| 50 | Motif Ledger (7 tabs: entries, foreshadow, structural, systems, minor chars, flagged, audit) | `MotifLedger/*` | Companion pane "Motifs" tab (full view embedded) | KEEP | S10 | ✅ |
| 51 | Reading Mode (full manuscript, chapter tracking) | `Reading/ReadingModeView.tsx` | Manuscript view Reader mode | MERGE | S11 | ✅ |

## Build, Statistics, Settings, Pitch Room

| # | Current feature | Where it lives today | New home | Disposition | Session | Verified |
|---|----------------|----------------------|----------|-------------|---------|----------|
| 52 | Build (formats, progress log, output files, download/all) | `Build/BuildView.tsx` | Exports view (rail icon) | REFACTOR | S12 | ✅ |
| 53 | "Read Full Manuscript" button in Build | BuildView | Removed — Manuscript rail icon covers it | REMOVE | S12 | ✅ |
| 54 | Statistics (summary cards, usage/agent/phase charts, words toggle) | `Statistics/StatisticsView.tsx` | Statistics view (rail bottom icon), internals unchanged | KEEP | S12 | ✅ |
| 55 | Settings (writing / providers / appearance / profile tabs) | `Settings/SettingsView.tsx`, `ProviderSection.tsx` | Settings view (rail bottom icon), internals unchanged | KEEP | S12 | ✅ |
| 56 | Guided tour replays list in Settings | SettingsView TOUR_INFO | Unchanged; selectors re-targeted | KEEP | S14 | ✅ |
| 57 | Pitch Room (Spark chat, build-out, shelve) | `PitchRoom/PitchRoomView.tsx` | Own screen, entered from Library card + palette (off the rail) | REFACTOR | S13 | ✅ |
| 58 | Pitch session history | `Sidebar/PitchHistory.tsx` | Pitch Room left rail (sessions list) | REFACTOR | S13 | ✅ |

## Global Systems

| # | Current feature | Where it lives today | New home | Disposition | Session | Verified |
|---|----------------|----------------------|----------|-------------|---------|----------|
| 59 | CLI activity detail (calls, phases, tool usage, log, agent filter, live) | `CliActivity/CliActivityPanel.tsx` (831 lines) | Activity drawer content (all sections preserved) | REFACTOR | S05 | ✅ |
| 60 | CliActivityListener (global event capture) | CliActivityPanel export | Unchanged at app root | KEEP | S05 | ✅ |
| 61 | Onboarding wizard (CLI detect, first-run) | `Onboarding/OnboardingWizard.tsx` | Unchanged overlay | KEEP | S14 | ✅ |
| 62 | Guided tours (welcome, first-book, pipeline) + `data-tour` targets | `common/GuidedTourOverlay.tsx`, `tours/tourDefinitions.ts` | Re-point selectors to rail/spine/workbench/palette | REFACTOR | S14 | ✅ |
| 63 | Tooltips | `common/Tooltip.tsx` | Reused by rail + spine | KEEP | S03 | ✅ |
| 64 | viewStore persisted navigation (v4 migrations) | `stores/viewStore.ts` | v5: `library / workspace / manuscript / exports / statistics / settings / pitch-room` + legacy migration | REFACTOR | S02 | ✅ |
| 65 | Command palette (⌘K) | — (new) | New global overlay + action registry | NEW | S04 | ✅ |
| 66 | Status bar (live agent, tokens, cost) | — (new; data from cliActivityStore/statisticsStore) | New bottom bar | NEW | S05 | ✅ |

**Count: 66 features — 0 unmapped.** Removals (#3, #53) are absorbed by #20 and #51 respectively.

---

## SESSION-14 Final Audit (2026-07-07)

All 66 rows verified against the shipped code — every new home exists and is reachable; legacy components deleted. Notes on rows whose wiring changed during the audit:

- **#3 / #53 (REMOVE)** — `RightPanel/PipelinePanel` + `Build/BuildView` deleted this session; capabilities confirmed present in the spine (#20) and Manuscript reader (#51).
- **#19 / #35 / #36** — trigger functions re-homed from the deleted Sidebar button files to `src/renderer/actions/agentActions.ts`; Hot Take now lands in the workspace chat pane (ad-hoc conversation slot) instead of the deleted chat view.
- **#20** — the tracker's manual "Done" override and per-phase revert were re-homed to the workbench phase header (arm-to-confirm buttons).
- **#25** — "Resume Chat": the workspace auto-activates the selected phase's most recent conversation (S08 hook), verified with the ad-hoc suppression added this session.
- **#37** — Helper: palette action existed (S04); the promised rail help entry was added this session (bulb icon above Statistics).
- **#39** — Book info "Edit JSON" re-routed from the deleted Files view to the Manuscript editor (`about.json` file override).
- **#49** — Deep Dive re-routed from the deleted chat view to the workspace chat pane (ad-hoc slot).
- **#50** — Motif Ledger is now single-mounted (companion Motifs tab); the duplicate ⌘S handler warning from S10 is resolved by the Files view deletion.
- **#61** — Onboarding finish now lands on Workspace (book created) or Library (skipped) instead of the deleted chat view.
- **#62** — all three tours retargeted to `library-shelf` / `pipeline-spine` / `rail` / `chat-view` / `chat-input` / `quick-actions` / `pipeline-phase-pitch`; copy rewritten for the new anatomy.
- **#64** — viewStore now v6: legacy ViewIds removed from the union; persisted legacy values migrate forward; fresh installs default to `library`.
