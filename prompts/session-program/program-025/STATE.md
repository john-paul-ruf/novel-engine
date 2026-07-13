# State Tracker — Novel Engine / deployment-prep

## Program
Novel Engine — Electron 33 / React 18 / TypeScript 5, Clean Architecture (see FORGE-CONFIG.md)

## Feature
deployment-prep

## Intent
Execute the full pre-deployment pipeline in strict sequential order: generate release notes (Phase 1), perform a deep README update (Phase 2), then rebuild the project website (Phase 3) — all consistent with each other and the current codebase.
(Source: `prompts/meta/deployment-prep.md`, copied to `input-files/`.)

## Sessions
5

## Session Status

| # | Session | Modules | Status | Completed | Notes |
|---|---------|---------|--------|-----------|-------|
| 01 | Release Notes (Phase 1) | — | done | 2026-07-13 | v0.9.0 suggested; 33 commits, 104 files changed; package.json discrepancy noted |
| 02 | README Deep Update (Phase 2) | M01–M11 (read) | done | 2026-07-13 | Added Query Manager + WebSearch features; updated pipeline 14→15 phases; updated Quill agent description; updated Ship stage |
| 03 | Website: Landing + Architecture (Phase 3a) | — | done | 2026-07-13 | Updated index.html + architecture.html to v0.9.0; added Query Manager + WebSearch features, updated counts |
| 04 | Website: Changelog + Evaluation (Phase 3b) | — | done | 2026-07-13 | Updated changelog.html (v0.9.0, 99 entries, 3 new highlights, 21 new entries); evaluation.html version badge + phase count updated |
| 05 | Website: Press + Contact + Summary (Phase 3c) | — | pending | — | Updates press.html + contact.html; produces Phase Summary Report |

(Status: pending | in-progress | done | blocked | skipped)

## Dependency Graph

```
SESSION-01 ──► SESSION-02 ──► SESSION-03 ──► SESSION-04 ──► SESSION-05
```

Strict sequential chain. Each phase depends on the output of the previous one:
- S01 produces `RELEASE_NOTES.md` (version + changes) → S02 uses it for README
- S02 produces updated `README.md` → S03–S05 use it for website content
- S03–S05 are sequential because they share a design system and must be cross-consistent

## Architecture Reference (feature-specific)

This program does NOT modify source code. It modifies:
- `RELEASE_NOTES.md` — repo root (S01)
- `docs/releases/vX.Y.Z-RELEASE_NOTES.md` — archive copy (S01)
- `README.md` — repo root (S02)
- `docs/index.html` — landing page (S03)
- `docs/architecture.html` — technical page (S03)
- `docs/changelog.html` — changelog page (S04)
- `docs/evaluation.html` — evaluation page (S04, verify only)
- `docs/press.html` — press kit (S05)
- `docs/contact.html` — contact page (S05)

Preserved (never modified):
- `docs/architecture/*.md` — maintained by AGENTS.md documentation system
- `docs/og-image.png` — existing asset

## Scope Summary

| Module | Files Touched | Sessions |
|--------|---------------|----------|
| — (docs) | `RELEASE_NOTES.md`, `docs/releases/*`, `README.md`, `docs/*.html` | S01–S05 |

## Design Decisions

1. **Phase 3 split into 3 sessions.** The update-website prompt builds 6 HTML pages — too much for one ≤30min session. Split: (3a) landing + architecture, (3b) changelog + evaluation, (3c) press + contact + summary. Rationale: keeps each session focused and within time limit.

2. **Update in place, not rebuild.** All 6 HTML pages already exist with the shared design system, nav, and footer. Sessions 03–05 update content, not rebuild from scratch. Rationale: preserves working CSS/JS, avoids design drift, faster.

3. **Follow current README voice.** The readme-deep-update prompt specifies a "Build Books, Not Write Them" narrative, but the current README uses "A Desktop Publishing Studio for Novels" language. SESSION-02 follows the existing voice and updates content rather than forcing a narrative shift. Rationale: the project owner chose this voice; respect it.

4. **Version discrepancy flagged, not fixed.** `package.json` says `0.2.0` while last tag is `v0.8.0`. SESSION-01 notes this but does not modify `package.json` — that's a separate decision for the project owner. The suggested version follows semver logic from the release notes, not the stale package.json.

5. **No source code changes.** This entire program is documentation and website content. `npx tsc --noEmit` is not a verification step for these sessions. Verification is content-accuracy checks against source code.

## Handoff Notes

_(Agents append here after each session: what was done, deviations, gotchas for the next session.)_

- 2026-07-13 (Forge): Program created. 5 sessions, strict sequential chain. Sub-prompts copied to `input-files/`. Key context: 33 commits since v0.8.0, package.json version stale at 0.2.0, all 6 HTML pages already exist, CHANGELOG.md is 2,312 lines, README is 205 lines. Screenshots use `Screenshot 2026-07-08 at *.png` naming pattern. `TECHNICAL.md` exists and is referenced by README. No `# Heads up` section in README — Dedication is at the bottom, preserved verbatim.
- 2026-07-13 (S01): Release notes generated. Suggested version: **v0.9.0** (minor bump — multiple new features: Query Manager, WebSearch, query auto-populate; 9 bug fixes for Codex CLI; no breaking changes). Files written: `RELEASE_NOTES.md` (root) + `docs/releases/v0.9.0-RELEASE_NOTES.md` (archive). All 33 commit hashes verified. Three feature groups, three improvement groups, nine bug fixes, two documentation items. No empty sections. package.json discrepancy (0.2.0 vs v0.8.0) noted in release notes header. **For S02 (README):** update version to v0.9.0, add Query Manager to features, add WebSearch cross-provider capability, add Codex CLI hardening summary, update pipeline phase count (14→15), update IPC channel count (add 11 query:* channels + 2 research/fill channels = 13 new), update store count (add queryStore), update component count (add 6 QueryManager components), update file count per git diff stat.
- 2026-07-13 (S02): README updated. Changes: (1) Pipeline phase count 14→15 in hero bullet and pipeline section; (2) "Pitch to Published" bullet now includes query letter/submission tracking; (3) Quill agent description expanded with query management responsibilities; (4) Ship stage row updated to include "Query Agents" phase; (5) Two new "What Else Is In The Box" items: Query Manager and Web search for all providers. No sections removed, no narrative voice changed, Dedication preserved verbatim. **For S03–S05 (website):** use v0.9.0 as version; key new features for landing page: Query Manager (submission tracking with AI research), WebSearch (cross-provider); pipeline now has 15 phases; Quill role expanded. Source file count: 197 .ts/.tsx files. 25 Zustand stores. 6 QueryManager components.
- 2026-07-13 (S03): Updated docs/index.html and docs/architecture.html. index.html: version badge v0.8.0→v0.9.0, meta description 14→15 phases, value prop "Pitch to Published" includes query letters, Quill agent card updated, pipeline heading 14→15, Ship stage includes Query Agents chip, two new feature cards (Query Manager, Web search), footer v0.9.0. architecture.html: version badge, file count 170→197, dependency graph added QueryService, source tree added QueryService.ts + WebSearcher note + QueryManager component group, IPC channels 131→142, component groups 24→25, footer v0.9.0 + "Fifteen phases" tagline. **For S04:** changelog.html needs version badge v0.9.0 + new entries since v0.8.0. evaluation.html — verify only, no changes expected.
- 2026-07-13 (S04): Updated docs/changelog.html and docs/evaluation.html. changelog.html: version badge v0.9.0, stats updated (99 entries, 197 source files, 35+ bug fixes, date range through 2026-07-13), 3 new highlight cards added at top (Query Manager, WebSearch, Codex CLI hardening), 21 new changelog entries inserted (all commits from 2026-07-08 through 2026-07-13), footer v0.9.0 + "Fifteen phases" tagline. evaluation.html: version badge v0.8.0→v0.9.0 (nav + footer), evaluator disclosure "14 phases"→"15 phases". Pre-existing 2-entry discrepancy (99 CHANGELOG.md entries vs 97 HTML entries) confirmed as from previous deployment — 5 Onboarding sessions consolidated into 1, not introduced by this session. All 21 new entries since v0.8.0 verified present. **For S05:** press.html and contact.html need version badge v0.9.0; "By The Numbers" stats in press.html need updating (agents 7, phases 15, IPC channels 142, source files 197, published books 10); add Query Manager + WebSearch to differentiators.