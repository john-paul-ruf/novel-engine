# State Tracker — Novel Engine / deployment-prep

## Program
Novel Engine — Electron/React/TypeScript book-building pipeline.

## Feature
deployment-prep — pre-release documentation pipeline.

## Intent
Execute the full pre-deployment pipeline in strict phase order: generate `RELEASE_NOTES.md` from git history, deep-rewrite `README.md` against the actual codebase, then rebuild the 6-page GitHub Pages site in `docs/` — all three outputs mutually consistent.

## Sessions
8 total, grouped into the 3 pipeline phases.

## Session Status

| # | Session | Phase | Modules | Status | Completed | Notes |
|---|---------|-------|---------|--------|-----------|-------|
| 01 | Generate Release Notes | 1 | — (git, CHANGELOG) | done | 2026-07-08 | 60 commits since v0.7.0; RELEASE_NOTES.md written; suggested v0.8.0 (minor); no breaking changes |
| 02 | Full Codebase Analysis for README | 2 | reads M01–M10 | done | 2026-07-08 | Artifact written; 12 new features, 15 phantom/stale claims found |
| 03 | README Rewrite | 2 | — (README.md) | pending | | |
| 04 | Evaluation Migration + Design System | 3 | — (docs/) | pending | | Must precede 05 — rescues old index.html content |
| 05 | Landing Page | 3 | — (docs/) | pending | | |
| 06 | Architecture + Changelog Pages | 3 | — (docs/) | pending | | |
| 07 | Press Kit + Contact Pages | 3 | — (docs/) | pending | | |
| 08 | Site-Wide Verification + Report | 3 | — (docs/) | pending | | |

## Dependency Graph

```
01 ──> 02 ──> 03 ──> 04 ──┬──> 05 ──┐
                          ├──> 06 ──┼──> 08
                          └──> 07 ──┘
```

- Phases are strictly sequential (deployment-prep.md Rule 1): Phase 2 starts only after 01 is done; Phase 3 only after 03.
- Within Phase 3, sessions 05/06/07 all depend on 04 (canonical nav/footer/tokens live in `evaluation.html`) and may run in any order or parallel. 08 requires all three.

## Architecture Reference (feature-specific)
- **No `src/` changes.** This feature touches only `RELEASE_NOTES.md`, `README.md`, and `docs/*.html`.
- Never modify: `docs/architecture/*.md`, `docs/og-image.png`.
- Website: plain self-contained HTML5, inline CSS per page, vanilla JS only, no CDNs, no tracking, no site generator.
- Full program config: `FORGE-CONFIG.md` (repo root).

## Scope Summary

| Module | Touched | How |
|--------|---------|-----|
| M01–M10 | read-only | SESSION-02 verifies every README/website claim against source |
| Repo docs (`README.md`, `RELEASE_NOTES.md`, `CHANGELOG.md`) | write/read | Phases 1–2 outputs; changelog is read-only input |
| `docs/` website | write | Phase 3 creates/replaces the 6 HTML pages |

## Design Decisions

1. **Phase 2 split into analysis (02) + rewrite (03).** The readme-deep-update prompt's 8 analysis steps plus a full rewrite exceed one 30-min session. The analysis persists to `artifacts/readme-analysis.md` so the rewrite works from verified facts, and the artifact is reused by SESSION-07 (By The Numbers).
2. **Evaluation migration (04) runs before the landing page (05).** SESSION-05 replaces `docs/index.html`; the 10-book evaluation living there must be moved to `evaluation.html` first or it is destroyed. Ordering is a hard dependency, not a preference.
3. **Canonical nav/footer/design tokens live in `evaluation.html`.** SESSION-04 builds them once from update-website.md Step 4; sessions 05–07 copy the markup, guaranteeing cross-page consistency without a shared stylesheet (a Constraint of the spec).
4. **Dangling nav links accepted mid-Phase-3.** Pages are created across sessions, so nav links dangle until 05–07 complete. SESSION-08 verifies all links; the site should not be deployed between 04 and 08.
5. **Zero-commit short-circuit.** If SESSION-01 finds no commits since the last tag, it marks all sessions `skipped` and stops, per release-notes.md.
6. **Sub-prompts are authoritative** (deployment-prep.md Rule 6). Sessions orchestrate and gate; the copies in `input-files/` carry the detailed instructions.

## Handoff Notes

*(Agents append here after each session: what was produced, key numbers, surprises, anything the next session needs.)*

### SESSION-01 (2026-07-08) — Release Notes

- **Range:** `v0.7.0` (2026-03-29) → HEAD `2e302c7` — **60 commits**, 386 files changed, contributors: the.phoenix, John Paul Ruf.
- **Suggested version: v0.8.0 (minor).** Reason: large new feature surface (providers, UI redesign, tracked editing, version history) with **zero breaking changes** — no DB schema/migration changes (`schema.ts` diff is empty), no IPC channel renames (additive only).
- **Highlights (for README/website):** (1) Multi-provider AI backends — Ollama CLI-first with a built-in agentic tool loop (`ollama-cli` module: OllamaCodeClient/ToolExecutor/tools/contextCompactor), llama-server client, Codex CLI provider, MultiCallOrchestrator; (2) complete 14-session **streamlined workspace UI** redesign (Library bookshelf, pipeline spine, workbench split pane w/ companion tabs, Manuscript view, command palette, icon rail, status bar + activity drawer, new Fraunces/Inter/JetBrains Mono typography); (3) **tracked chapter editing** — author edits diffed vs agent baseline, EDITED badges, discard flow, edits injected into Verity audits; (4) **version history everywhere** via reusable VersionHistoryModal; (5) dual primary/secondary model pickers, hardcoded model IDs removed, Claude Fable 5 probed at startup; (6) 250K context ceiling + proactive 80% compaction for Ollama/llama-server.
- **Breaking changes: none.** No user approval pause required per Completion Gate.
- **Quirks for later sessions:** `package.json` version is `0.2.0` and decoupled from git tags (was `0.1.0` at tag v0.7.0) — README/website should quote the tag-based version v0.8.0, not package.json. The old v0.7.0 RELEASE_NOTES.md was archived to `docs/releases/0.7.0-RELEASE_NOTES.md`. CHANGELOG.md only covers 3 of the ~13 feature streams in range (last entry 2026-07-02); commit messages are the primary source for streamlined-ui / tracked-chapter-editing / version-history-everywhere / codex work. The 2026-03-29 "Sidebar bookshelf + FilesView tabs" layout was superseded by the streamlined UI — don't document it as current.

### SESSION-02 (2026-07-08) — README Codebase Analysis

- **Artifact:** `prompts/session-program/program-013/artifacts/readme-analysis.md` (15 sections, all claims file-cited). No repo files modified.
- **New features discovered: 12** (multi-provider backends, streamlined UI shell, tracked editing, version-history-everywhere, Chapter Deep Dive, dual model pickers, Fable probe, multi-call orchestration, back-matter chapters, build ZIP export, context diagnostics, misc).
- **Phantom/stale README claims found: 15** — biggest: Sidebar Bookshelf / Five-Tab Files View / Dashboard / Reading Mode views no longer exist (replaced by Library/Workspace/Manuscript); all 12 README screenshots reference deleted files (9 new 2026-07-08 screenshots exist in `screenshots/`); file count is 187 not 170; stores are 25 not 23; DB tables are 8 not 7; Hot Take is NOT pinned to Opus; Wrangler is not pinned to Sonnet.
- **Surprises:** (1) The "Wrangler two-call context pattern" is NOT implemented — context assembly is deterministic ContextBuilder + turn compaction; the only Wrangler call is revision-plan parsing (WRANGLER-PARSE.md via loadRaw; registry quirk: AGENT_REGISTRY points to nonexistent WRANGLER.md). (2) Preservation spec mismatch: README has NO "# Heads up" or "# Questions, comments, or rants?" sections — it has `# Dedication` + `# Foreword` (both captured verbatim in the artifact); the Testers-Needed blockquote carries the contact email. (3) BuildService produces MD+DOCX+EPUB3 only — no PDF despite the build phase description. (4) There are 9 registry agents (7 creative + Wrangler + Helper) — keep "seven agents" language for the editorial team only.
