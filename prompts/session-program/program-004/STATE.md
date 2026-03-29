# State Tracker — Novel Engine / dashboards-and-revision-modal

> Generated 2026-03-29.
> Updated by the executing agent after each session.

---

## Program

**Name:** Novel Engine
**Root:** /Users/the.phoenix/WebstormProjects/novel-engine/
**Stack:** TypeScript 5, Electron 33, React 18, Tailwind CSS v4, Zustand, better-sqlite3, Claude Code CLI

## Feature

**Name:** dashboards-and-revision-modal
**Intent:** Add a Book Overview Dashboard (landing screen), a Writing Statistics Dashboard (charts and cost tracking), and convert the Revision Queue from a full view to a floating modal.
**Source documents:** `book-overview-dashboard.md`, `writing-statistics-dashboard.md`, `revision-queue-updates.md`
**Sessions:** 7

---

## Status Key

- `pending` — Not started
- `in-progress` — Started, not verified
- `done` — Completed and verified
- `blocked` — Cannot proceed (see notes)
- `skipped` — Intentionally skipped (see notes)

---

## Session Status

| # | Session | Modules | Status | Completed | Notes |
|---|---------|---------|--------|-----------|-------|
| 1 | SESSION-01 — Domain Types & Interfaces | M01 | done | 2026-03-29 | Implemented all domain types, interfaces, and constants. Also added concrete implementations (DB queries, migration v3, FileSystemService.getRecentFiles) since SESSION-01 verification requires zero tsc errors and the interface extensions break concrete classes. |
| 2 | SESSION-02 — Database Queries & Schema Migration | M03 | done | 2026-03-29 | Refactored inline db.prepare() to stored prepared statements matching codebase convention. Migration v3 and query implementations were already in place from SESSION-01. |
| 3 | SESSION-03 — Dashboard Service + FileSystem + IPC + Preload | M05, M08, M09 | done | 2026-03-29 | Created DashboardService, wired IPC handler + preload bridge. FileSystemService.getRecentFiles was already implemented in SESSION-01. |
| 4 | SESSION-04 — Dashboard View | M10 | done | 2026-03-29 | Created DashboardView with 6 card components, dashboardStore, updated viewStore (default=dashboard, version 3), AppLayout, Sidebar, bookStore. |
| 5 | SESSION-05 — Statistics Service + IPC + Preload | M08, M09 | done | 2026-03-29 | Created StatisticsService, wired IPC handlers + preload bridge. Added word count snapshot hook on chat:send file changes. |
| 6 | SESSION-06 — Statistics View | M10 | pending | | |
| 7 | SESSION-07 — Revision Queue Modal Refactor | M10 | pending | | |

---

## Dependency Graph

```
SESSION-01 (Domain Types)
├── SESSION-02 (Database Queries)
│   ├── SESSION-03 (Dashboard Service + IPC)
│   │   └── SESSION-04 (Dashboard View)
│   └── SESSION-05 (Statistics Service + IPC)
│       └── SESSION-06 (Statistics View)
└── SESSION-04 (Dashboard View — also needs ViewId changes)
    └── SESSION-07 (Revision Queue Modal — needs ViewId from SESSION-04)
```

**Sequential chain:** 01 → 02 → 03 → 04 (dashboard fully working)

**Parallel tracks after SESSION-02:**
- Track A: 03 → 04 (dashboard)
- Track B: 05 → 06 (statistics)

Both tracks can run in parallel since they touch different files (except shared viewStore/AppLayout/Sidebar modifications — the executing agent must merge carefully if running in parallel).

**SESSION-07** depends on SESSION-04 because it modifies `viewStore.ts` (removing `'revision-queue'` from ViewId, which SESSION-04 already modified to add `'dashboard'`). Must run after SESSION-04.

---

## Architecture Reference

> Full stack, conventions, and architecture rules are in `/Users/the.phoenix/WebstormProjects/novel-engine/FORGE-CONFIG.md`.

### Feature-specific notes

- **Dashboard**: New `IDashboardService` assembles data from three existing interfaces (`IDatabaseService`, `IFileSystemService`, `IPipelineService`). Parses `project-tasks.md` for revision task tracking.
- **Statistics**: New `IStatisticsService` aggregates DB queries and computes cost estimates using `MODEL_PRICING` constant. Adds `word_count_snapshots` table for tracking word count over time.
- **Revision Queue Modal**: Pure renderer refactor — no backend changes. Converts from ViewId-based full page to floating modal with minimize/maximize and book-scoping.
- **recharts**: New npm dependency added in SESSION-06. Only used in the renderer layer.

---

## Scope Summary

| ID | Module | Impact | Sessions |
|----|--------|--------|----------|
| `M01` | domain | New types: `BookDashboardData`, `BookStatistics`, `WordCountSnapshot`, etc. New interfaces: `IDashboardService`, `IStatisticsService`. Extended: `IDatabaseService`, `IFileSystemService`. New constant: `MODEL_PRICING`. | SESSION-01 |
| `M03` | database | Migration v3: `word_count_snapshots` table. 6 new query methods + 10 prepared statements. | SESSION-02 |
| `M05` | filesystem | New method: `getRecentFiles()` | SESSION-03 |
| `M08` | application | New services: `DashboardService`, `StatisticsService` | SESSION-03, SESSION-05 |
| `M09` | main/ipc | New IPC channels: `dashboard:getData`, `statistics:get`, `statistics:recordSnapshot`. Composition root: 2 new service instances. Word count snapshot hook on stream done. | SESSION-03, SESSION-05 |
| `M10` | renderer | New stores: `dashboardStore`, `statisticsStore`. New components: `DashboardView`, `StatisticsView`, `RevisionQueueModal`. Modified: `viewStore` (new ViewIds, default change), `bookStore` (navigate on switch), `revisionQueueStore` (modal state), `AppLayout`, `Sidebar`. New dependency: `recharts`. | SESSION-04, SESSION-06, SESSION-07 |

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Derive word count history from `word_count_snapshots` table (recorded after each stream) rather than computing from `file_versions` content | Efficient at query time. No expensive content-scanning. Clean time-series data. Starts recording from feature deployment — no retroactive data, but that's acceptable. |
| Use Opus API pricing as default for cost estimation | Conservative estimate. The app doesn't track per-usage model choices at the aggregate level. Disclaimer in UI notes "estimated at API rates." |
| Make dashboard the default view on app load and book switch | Feature request explicitly asks for dashboard as landing screen. Previous default was chat. |
| Convert revision queue to floating modal rather than drawer/panel | Feature request wants "non-blocking" and "minimize/maximize." A floating modal with pointer-events passthrough gives the best UX for this. Minimized state is a bottom bar; different-book state is a small badge. |
| Use recharts for charting | Most popular React charting library. Composable API. Tree-shakeable. Works well with Tailwind's dark theme via inline styles. No competitor is significantly better for this use case. |
| Remove `'revision-queue'` from ViewId | The revision queue is no longer a navigable view — it's a modal triggered by a button. Keeping it as a ViewId would create dead code and confusion. |

---

## Handoff Notes

> Agents write here after each session to communicate context to the next run.

### Last completed session: SESSION-05

### Observations:
- DashboardView uses `import type` for domain types and value imports only from `@domain/constants` (AGENT_REGISTRY, PIPELINE_PHASES) — compliant with renderer layer rules.
- viewStore persisted version bumped to 3. The migration function handles old `motif-ledger` values but doesn't need to handle `chat` → `dashboard` migration since users with `chat` persisted can stay on `chat` until they navigate.
- Dashboard is now the default landing view and the navigation target when switching books.
- Used HTML entities for emojis in JSX to avoid encoding issues.

### Next up:
- SESSION-06 (Statistics View) — all dependencies met (SESSION-04 ✓, SESSION-05 ✓). Will modify viewStore, AppLayout, Sidebar — must merge with SESSION-04's dashboard changes.
- SESSION-07 (Revision Queue Modal) — all dependencies met (SESSION-04 ✓). Can run after SESSION-06.
