# SESSION-06 — Website: Architecture + Changelog Pages

> **Program:** Novel Engine
> **Feature:** deployment-prep
> **Modules:** none (writes `docs/architecture.html`, `docs/changelog.html`)
> **Depends on:** SESSION-04 (may run in parallel with SESSION-05 and SESSION-07)
> **Estimated effort:** 30 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| — | docs | `docs/architecture/ARCHITECTURE.md`, `DOMAIN.md`, `INFRASTRUCTURE.md`, `APPLICATION.md`, `IPC.md`, `RENDERER.md` | Source material for the architecture page |
| — | repo root | `CHANGELOG.md`, `package.json`, `README.md` | Full changelog + versions + tech stack |
| — | docs | `docs/evaluation.html` | Canonical nav/footer/design-token markup |
| — | input | `input-files/update-website.md` §3.3, §3.4, Steps 4–7 | Page specs |

## Context

The two developer/history-facing pages. Read **all six** architecture markdown docs before writing HTML — do not summarize from memory. Parse **every** entry of `CHANGELOG.md` — the changelog page must be complete, not sampled.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `docs/architecture.html` | Create | Technical deep-dive per §3.3 |
| `docs/changelog.html` | Create | Full formatted changelog per §3.4 |

## Implementation

### 1. `docs/architecture.html` (§3.3)

- **Overview** — the 5-layer clean architecture (Domain ← Infrastructure ← Application ← IPC/Main ← Renderer) with a CSS-based layer diagram (no ASCII art) and one paragraph per layer on responsibility + import rules.
- **Tech Stack** — table (Layer, Technology, Version) with versions from `package.json`.
- **Service Dependency Graph** — visual tree of composition-root wiring, drawn from `ARCHITECTURE.md`.
- **Key Design Decisions** — constructor DI, no API keys, two-call Wrangler pattern, Context Wrangler capabilities, NDJSON streaming CLI integration. **Verify each claim against the architecture docs (and the README rewritten in SESSION-03) before publishing — describe what is actually implemented.**
- **Database Schema** — table overview from `INFRASTRUCTURE.md`.
- **Source Tree** — annotated listing from `ARCHITECTURE.md`.
- **Contributing** — clone/install/run commands verified against `package.json` scripts; architecture rules; link to `docs/architecture/*.md` on GitHub.

### 2. `docs/changelog.html` (§3.4)

- **Summary stats** — total entries, date range, categorized counts.
- **Timeline** — entries grouped by date; Added/Changed/Removed/Fixed lists; file paths as `code` spans; Architecture Impact / Migration Notes when non-trivial; `<details>/<summary>` for dense dates.
- **Highlight reel** — 5–10 most significant changes grouped by theme, each linking to its full entry.
- **Render every entry from `CHANGELOG.md`. Do not skip or summarize entries.**

Both pages: copy nav/footer/tokens from `docs/evaluation.html` (active link set per page), unique OG tags per Step 7, inline CSS, vanilla JS only, responsive.

## Verification

- [ ] Both files exist and are self-contained HTML5 documents
- [ ] Every `CHANGELOG.md` entry appears in `changelog.html` (count `##`-level entries in the source and matching blocks in the HTML — counts must be equal)
- [ ] Tech-stack versions match `package.json`
- [ ] Architecture claims traceable to `docs/architecture/*.md`
- [ ] Version badge matches `package.json`; unique OG tags; no external JS/tracking
- [ ] `docs/architecture/*.md` files unmodified (`git status`)

## State Update

Set SESSION-06 to `done`. Handoff Notes: changelog entry count rendered, any architecture-doc claims that conflicted with the README (flag for SESSION-08).
