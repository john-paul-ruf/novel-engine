# State — small-queue-intake

> Tracks execution status of each session. Update this file after every session completes.

---

## Sessions

| # | Title | Status | Completed | Notes |
|---|-------|--------|-----------|-------|
| 01 | Bug Cluster: Overflow, Sidebar Compression, Scrollbars | done | 2026-03-29 | Added min-w-0 max-w-[200px] to QueueControls select; overflow-hidden to BookSelector title wrapper; overflow-hidden on CliActivityPanel outermost + selected-call wrappers to eliminate nested scroll contexts. |
| 02 | Done Confirm Box + Onboarding Guide Selectors | done | 2026-03-29 | Added FirstDraftCompleteModal (green, celebratory) to PipelineTracker; updated pipeline-intro tour steps to target [data-tour="pipeline-tracker"] instead of phase-specific rows that require the accordion to be open. |
| 03 | Book Dropdown Redesign | done | 2026-03-29 | Added LibraryPanel behind ··· button; simplified dropdown footer to New Book + ···; explicit seriesGroups.filter(g => g.volumes.length > 0); all management actions moved into LibraryPanel. |
| 04 | Sidebar: Chat Expandable + Hot Take/Adhoc Nesting | done | 2026-03-29 | ChatNavGroup added with expand toggle; Hot Take/Ad Hoc nested as compact sub-items; HelpButton redesigned as full-width nav button moved to bottom of nav; quick-actions section removed. |
| 05 | Motif Ledger -> Files View | done | 2026-03-29 | Removed motif-ledger ViewId + NAV item; added persist v2 migration; MotifLedgerView embedded as tab in FilesView with Files/Motif Ledger tab bar. |
| 06 | Archive Series | done | 2026-03-29 | Added Archive Series button in SeriesModal edit mode; two-step confirmation; archives all volumes via existing archiveBook, then reloads books + closes modal. |
| 07 | Settings Reorganization: Tabs | done | 2026-03-29 | Replaced monolithic scroll with 4-tab layout: Writing (model+thinking), Providers (CLI+ProviderSection), Appearance (theme+notifications+about), Profile (author+tours+usage+catalog). |
| 08 | Saved Prompt Library | done | 2026-03-29 | Added SavedPrompt type + savedPrompts[] to AppSettings/DEFAULT_SETTINGS; rewrote QuickActions with Built-in/Saved tabs; save form with name, text, pin-to-agent; use/delete per entry. |
| 09 | About.json Rich Display | done | 2026-03-29 | Created AboutJsonViewer.tsx (self-loading, header with Edit JSON + Chat with Spark, generic JsonValue for extra fields, inline-edit title/author/status/cover); useOpenSpark hook creates Spark conversation + sends metadata-enrichment prompt + navigates to chat; FilesView.tsx intercepts about.json in reader mode before ReaderContent. |
| 10 | Query Letter Mode + Helper Agent Improvements | done | 2026-03-29 | Added Query Letter (Traditional) + Synopsis (Traditional) to AGENT_QUICK_ACTIONS.Quill; updated agents/HELPER.md with Application Map (14 phases, 7 agents, file locations, workflows) + Common Questions section; created prompts/meta/user-guide-maintenance.md. |
| 11 | Chapter Deep Dive: Backend | done | 2026-03-29 | Added deepDive() to IChatService; implemented in ChatService (inline context assembly, Lumen agent, session tracking, StreamManager); IPC handler chat:deepDive in handlers.ts; window.novelEngine.chat.deepDive() in preload. |
| 12 | Chapter Deep Dive: UI | done | 2026-03-29 | Added isChapterDraft/extractChapterSlug utilities; handleDeepDive in FilesView creates Lumen conversation via chatStore, attachToExternalStream, navigate('chat'), fires deepDive IPC without await; Deep Dive button in FilesHeader with spinner. |
| 13 | Reading Mode | done | 2026-03-29 | ManuscriptAssembly type in types.ts; assembleManuscript in IFileSystemService + FileSystemService; IPC handler books:assembleManuscript; preload bridge; 'reading' added to ViewId; ReadingModeView component with IntersectionObserver chapter tracking; AppLayout + BuildView entry point. |

---

## Dependencies

- SESSION-01: nothing
- SESSION-02: nothing
- SESSION-03: SESSION-01 (done)
- SESSION-04: SESSION-03 (done)
- SESSION-05: SESSION-04 (done)
- SESSION-06: nothing
- SESSION-07: nothing
- SESSION-08: SESSION-07 (done)
- SESSION-09: nothing
- SESSION-10: nothing
- SESSION-11: nothing
- SESSION-12: SESSION-11 (done)
- SESSION-13: nothing (standalone)

---

## Handoff Notes

**Last completed session:** SESSION-13 (PROGRAM COMPLETE)
**Observations:** All 13 sessions complete. chapterSortKey helper reused from existing FileSystemService. 'reading' added to ViewId persisted store (persist version unchanged — 'reading' not set as default so no migration needed). Zero TypeScript errors across all sessions.
