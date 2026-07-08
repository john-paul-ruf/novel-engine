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
| 03 | README Rewrite | 2 | — (README.md) | done | 2026-07-08 | Full rewrite; +9 feature sections, −5 phantom sections; screenshots refreshed |
| 04 | Evaluation Migration + Design System | 3 | — (docs/) | done | 2026-07-08 | Migration already existed from v0.7.0 cycle; content parity verified vs pre-migration original; version badge → v0.8.0 |
| 05 | Landing Page | 3 | — (docs/) | done | 2026-07-08 | index.html rebuilt writer-first per SESSION-03 amendment; raw GitHub screenshot URLs; all claims README-verified |
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
- *(see SESSION-03 notes below for what the README now claims)*
- **Surprises:** (1) The "Wrangler two-call context pattern" is NOT implemented — context assembly is deterministic ContextBuilder + turn compaction; the only Wrangler call is revision-plan parsing (WRANGLER-PARSE.md via loadRaw; registry quirk: AGENT_REGISTRY points to nonexistent WRANGLER.md). (2) Preservation spec mismatch: README has NO "# Heads up" or "# Questions, comments, or rants?" sections — it has `# Dedication` + `# Foreword` (both captured verbatim in the artifact); the Testers-Needed blockquote carries the contact email. (3) BuildService produces MD+DOCX+EPUB3 only — no PDF despite the build phase description. (4) There are 9 registry agents (7 creative + Wrangler + Helper) — keep "seven agents" language for the editorial team only.

### SESSION-03 (2026-07-08) — README Rewrite

- **README.md fully rewritten** (verified against the SESSION-02 artifact; preserved `# Dedication` + `# Foreword` byte-identical — git diff first hunk starts at line 25; all local links verified to resolve).
- **Added feature sections (9):** Multi-Provider AI Backends, The Streamlined Workspace, Tracked Chapter Editing, Chapter Deep Dive, Live Activity Monitor (reframed), version-history-everywhere (merged into File Version History), back matter + updated Book Management, multi-call orchestration (in providers section), refreshed onboarding flow (Provider Setup step).
- **Removed phantom sections (5):** Sidebar Bookshelf, Five-Tab Files View, Book Overview Dashboard, Reading Mode (folded into Manuscript), About.json Editor. Fixed model claims: Hot Take no longer "always Opus"; Wrangler no longer "Claude Sonnet".
- **Screenshots:** hero + 6-image gallery using the new 2026-07-08 screenshots (Workspace hero; Library, Command Palette, Manuscript reader, Manuscript editor, Providers, Model Selection). Appearance + Profile shots unused.
- **Corrected counts:** 187 TS/TSX files, 25 stores, 8 DB tables. Tech stack adds Fontsource fonts, undici, Pandoc 3.6.4, Codex/Ollama/llama-server backends. No version number quoted anywhere (About panel says v0.1.0, package.json 0.2.0, tag v0.8.0 — intentionally avoided).
- **For the website sessions (04–07):** the app's five surfaces are Library / Workspace / Manuscript / Exports / Statistics+Settings; onboarding step 2 is now "Provider Setup" (Claude + Codex detection); prerequisites = "at least one AI backend" (Claude CLI, Codex CLI, Ollama, llama-server, OpenAI-compatible); build outputs are MD/DOCX/EPUB (no PDF); book list for the Foreword/site is the 10 titles in README lines 8–18; evaluation link points at john-paul-ruf.github.io/novel-engine/evaluation.html (SESSION-04 must create this page).

### SESSION-03 amendment (2026-07-08) — Writer-first README restructure (user-directed)

- **README.md restructured for non-technical authors** at the user's request: hero = "A Desktop Publishing Studio for Novels" + "Ten books on Amazon. Built with seven AI editors in one app." + download links; the 10-book social proof moved to a banner directly under the hero; first screenshot is now the **Manuscript view** (words on a page), not the workspace; 3-bullet value prop (Pitch to Published / Your Voice, Protected / Privacy-First); plain-language install instructions **including the unsigned-macOS right-click→Open / "Open Anyway" walkthrough and Windows SmartScreen note**; "Connect an AI" as a simple 3-option table; Common Questions FAQ; Dedication preserved verbatim but moved to the bottom; `# Foreword` heading replaced by the "Books built with Novel Engine" banner (same links + evaluation sentence).
- **New highlighted legal box "Your Words Are Yours"**: AGPL applies to application code only; manuscripts/exports are the author's exclusive property. Repeated in the License section. This addresses author AGPL/KDP provenance anxiety.
- **All engineering content moved to `TECHNICAL.md` (repo root, new file)**: backends internals, context assembly, precise pipeline detection table, feature internals, building for distribution, project structure, tech stack, architecture, DB schema. README links to it from "For Developers".
- **Website sessions (04–07) must mirror this framing**: writer-first voice, download-first hero, ten-books social proof up top, unsigned-install guidance, the "Your Words Are Yours" legal reassurance, and links to TECHNICAL.md for depth. The evaluation link target (evaluation.html) is unchanged.

### SESSION-04 (2026-07-08) — Evaluation Migration + Design System

- **Key discovery: the SESSION-04 premise was stale.** The 6-page site already exists — the evaluation was migrated from the old single-page `index.html` to `evaluation.html` in the **v0.7.0 cycle** (commit `a7a7c4b` "website build out"; current landing `index.html` dates from then too). Nothing was at risk of destruction; per the "partially built — don't rebuild what works" rule, this session verified instead of rebuilt.
- **Content parity verified against the true original** (`git show a7a7c4b~1:docs/index.html`): all 10 titles, all 10 blended scores (9.4→7.0), verdict bar, disclosure note, legend, tier table, and every Claude/ChatGPT review sentence present verbatim. Only absent text is the old standalone footer link block, superseded by the shared footer (same links) per spec §3.2.
- **Only change made: version badge `v0.7.0` → `v0.8.0`** in nav (line 171) and footer (line 448) — tag-based version per SESSION-01 quirk, NOT package.json's `0.2.0`.
- **evaluation.html IS the canonical pattern for 05–07**: `:root` tokens match Step 4 byte-for-byte; sticky nav (brand + version badge + 6 links + GitHub icon + hamburger <760px, `.active` on current page); three-column `site-footer` with "No tracking. No cookies. No analytics."; breadcrumb; unique OG tags with per-page `og:url`. Zero `<script>` tags — mobile menu uses an inline `onclick` toggle. Google Fonts `<link>` is the one external resource (allowed by Step 4 typography).
- **SESSION-05 may now overwrite `index.html`** — but note it is NOT the old evaluation page; it's the v0.7.0 landing page ("Build Books, Not Write Them"). 05 should treat it as the outgoing landing page to be replaced with the writer-first redesign. Existing `architecture/changelog/press/contact.html` likewise date from v0.7.0 — sessions 06/07 update rather than create, and must bump their badges to v0.8.0 too.
- **Protected files untouched**: `docs/index.html`, `docs/og-image.png`, `docs/architecture/*.md` (git status clean apart from `evaluation.html`).

### SESSION-05 (2026-07-08) — Landing Page

- **`docs/index.html` fully replaced** with the writer-first landing page per the SESSION-03 amendment (which overrides the older §3.1 spec): hero = "A Desktop Publishing Studio for Novels" + "Ten books on Amazon…" + download-first CTAs → releases/latest; ten-book social-proof banner directly under the hero; hero image = **Manuscript view** (words on a page); 3-card value prop; "Your Words Are Yours" legal box high on the page; unsigned-macOS right-click→Open walkthrough + Windows SmartScreen note; "Connect an AI" 3-option table (Claude/Ollama/Codex); 5-step onboarding incl. Provider Setup; FAQ + Testers-Needed; slim For-Developers strip.
- **Screenshot URL pattern chosen: raw GitHub URLs** (`https://raw.githubusercontent.com/john-paul-ruf/novel-engine/main/screenshots/Screenshot%202026-07-08%20at%20…%E2%80%AFAM.png` — note the U+202F narrow no-break space encodes as `%E2%80%AF`). Relative `../screenshots/` cannot work since Pages serves from `docs/`. **SESSION-06/07 must use the same pattern.** All 9 new screenshots are git-tracked; 7 used (Manuscript reader hero + 6-shot gallery).
- **Verified against README (zero fabrication):** 10/10 Amazon ASINs match; 7 agents + roles match the README table (order Spark, Verity, Ghostlight, Lumen, Forge, Sable, Quill); 14 phase names match the README pipeline table verbatim (Story Pitch…Publish & Audit, grouped in the 6 README stages); **no PDF claim** (MD/DOCX/EPUB only); no "two-call pattern", no "No API keys" claim, no MIT (AGPL-3.0 everywhere).
- **OG tags updated to writer-first framing** (og:title "A Desktop Publishing Studio for Novels") — intentional deviation from Step 7's literal "Build Books, Not Write Them" text, which described the retired positioning; user-directed amendment wins.
- **Nav/footer verified byte-identical** to `evaluation.html` modulo the active link; badge v0.8.0. One `<script>` block added (IntersectionObserver fade-up, vanilla, inline). Deviation from §3.1: no "Get Started" anchor button in the hero (download button replaces it; #get-started section still exists and is anchor-linkable).
- **For SESSION-06/07:** copy nav/footer from index.html or evaluation.html (identical); TECHNICAL.md deep-links use the GitHub blob URL `https://github.com/john-paul-ruf/novel-engine/blob/main/TECHNICAL.md`; keep "seven agents/editors" language; footer tagline "The engine is there. It is no longer a toy." retained sitewide.
