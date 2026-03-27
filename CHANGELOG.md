# Changelog

All notable changes to Novel Engine are documented here.

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
