# Changelog

All notable changes to Novel Engine are documented here.

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
