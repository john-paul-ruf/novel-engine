# Changelog

All notable changes to Novel Engine are documented here.

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
