# State Tracker — Novel Engine / streamlined-workspace-ui

## Program
Novel Engine — Electron/React/TypeScript multi-agent writing app

## Feature
`streamlined-workspace-ui` — convert the renderer to the Streamlined Workspace design (icon rail, pipeline-as-nav, split workbench, activity drawer, command palette)

## Intent
Collapse today's 4-column, 10-nav-item UI into a book-centric workspace where the 14-phase pipeline is the navigation, chat and manuscript are visible together, and diagnostics live in a bottom drawer. Zero feature loss — scope governed by `input-files/coverage-matrix.md` (66 features).

## Session Status

| # | Session | Modules | Status | Completed | Notes |
|---|---------|---------|--------|-----------|-------|
| 01 | Design tokens & typography foundation | M10 | done | 2026-07-07 | Additive only — tokens + fonts + agentColors.ts; no existing component touched |
| 02 | viewStore v5 — new view routing | M10 | pending | — | |
| 03 | Icon rail + title bar breadcrumb | M10 | pending | — | |
| 04 | Command palette + action registry | M10 | pending | — | |
| 05 | Status bar + activity drawer | M10 | pending | — | |
| 06 | Library view (bookshelf) | M10 | pending | — | |
| 07 | Pipeline spine panel | M10 | pending | — | |
| 08 | Workbench shell + phase header | M10 | pending | — | |
| 09 | Split pane — chat + companion shell | M10 | pending | — | |
| 10 | Companion content tabs | M10 | pending | — | |
| 11 | Manuscript view (read + edit) | M10 | pending | — | |
| 12 | Exports, Statistics, Settings routing | M10 | pending | — | |
| 13 | Pitch Room + palette-launched actions | M10 | pending | — | |
| 14 | Legacy removal, tours, final audit | M10 | pending | — | |

(Status: pending | in-progress | done | blocked | skipped)

## Dependency Graph

```
S01 (tokens) ──┬─▶ S03 (rail) ──▶ S06 (library)
S02 (routing) ─┤                  S07 (spine) ──▶ S08 (workbench) ──▶ S09 (split) ──▶ S10 (companion)
               ├─▶ S04 (palette)
               └─▶ S05 (drawer)
S02 + S03 ──▶ S11 (manuscript)
S03 ──▶ S12 (exports/stats/settings)
S04 + S06 ──▶ S13 (pitch room + actions)
ALL ──▶ S14 (cleanup + tours)
```

Parallel-safe pairs: S04/S05 (after S02–S03); S06/S07; S11 alongside S08–S10; S12 alongside S13.

## Architecture Reference (feature-specific)

- All work is in **M10 renderer** (`src/renderer/`). No main/IPC/domain changes expected; if a session needs a new IPC channel it must STOP and mark itself blocked.
- New components live under `src/renderer/components/{Rail,Palette,StatusBar,Library,PipelineSpine,Workbench,Manuscript}/`.
- New stores: `workspaceStore.ts` (selected phase, companion tab), `paletteStore.ts` (open state + action registry). `cliActivityStore.ts` gains drawer state.
- Legacy components remain importable until SESSION-14 deletes them.
- Visual contract: `design/ui-redesign/mockups/streamlined-workspace/index.html`

## Scope Summary

| Module | Touched by |
|--------|-----------|
| M10 renderer — stores | S02, S04, S05, S07, S08 |
| M10 renderer — components | S01, S03–S14 |
| M10 renderer — styles | S01 |
| M10 renderer — tours | S14 |

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Pipeline is the navigation | Kills 3-way duplication (dashboard card / sidebar toggle / right panel); the phase model is the app's real mental model |
| Split workbench (chat ‖ manuscript) | #1 workflow is read-feedback ↔ check-draft; currently requires view switching |
| Dashboard removed, not rebuilt | Its 5 cards each merge into a better surface (coverage matrix #23–27) |
| CLI activity → bottom drawer | VS Code terminal pattern; frees a full column |
| Pitch Room off the rail | Infrequent entry action; lives in Library + palette |
| Legacy views kept until S14 | App must boot after every session; safe rollback |
| Icons: shared inline-SVG component set | Replaces emoji; no new npm dependency |
| Fonts: `@fontsource` packages | Electron must work offline — no Google Fonts CDN at runtime |

## Handoff Notes

(agents append here after each session — newest first)

### SESSION-01 (2026-07-07)

**Built:** Design tokens + typography foundation. `:root` (light) and `.dark` token blocks in `src/renderer/styles/globals.css`, exposed via `@theme inline`; fontsource imports in `src/renderer/main.tsx` (before `globals.css`); `src/renderer/components/common/agentColors.ts` keyed off `CREATIVE_AGENT_NAMES` from `@domain/constants`.

**Generated utility spellings — use these EXACT names in later sessions:**
- Colors (work with any color-accepting utility: `bg-`, `text-`, `border-`, `ring-`, etc.):
  `ne-bg0` `ne-bg1` `ne-bg2` `ne-bg3` · `ne-line` `ne-line-soft` · `ne-ink` `ne-ink-dim` `ne-ink-faint` · `ne-brass` `ne-brass-hi` `ne-brass-dim` · `ne-spark` `ne-verity` `ne-ghostlight` `ne-lumen` `ne-sable` `ne-forge` `ne-quill`
  → e.g. `bg-ne-bg1`, `text-ne-ink-dim`, `border-ne-line`, `bg-ne-brass-dim`
- Fonts: `font-ne-serif` (Fraunces Variable), `font-ne-ui` (Inter 400/500/600/700 only), `font-ne-mono` (JetBrains Mono 400/500 only)
- Raw CSS vars are `--ne-*` (e.g. `var(--ne-brass)`); `agentColor(name)` returns `'var(--ne-<agent>)'` with `'var(--ne-ink-faint)'` fallback.

**Warnings:**
- Inter weights other than 400/500/600/700 and Mono weights other than 400/500 are NOT loaded — don't use `font-ne-mono` with `font-semibold`, etc.
- Headless `npm start` note for verifying agents: the Forge Vite plugin kills the renderer dev server when stdin closes. Backgrounded `npm start` yields ERR_CONNECTION_REFUSED. Keep stdin open (e.g. `sleep 60 | npm start`) when smoke-testing headlessly. Not a code issue.
- Pre-existing unrelated uncommitted changes in the tree (`src/application/BuildService.ts`, `CHANGELOG.md`, program-009 files, mockup assets) — left untouched, not staged.
