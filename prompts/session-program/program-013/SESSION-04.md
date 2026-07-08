# SESSION-04 — Website: Evaluation Migration + Shared Design System

> **Program:** Novel Engine
> **Feature:** deployment-prep
> **Modules:** none (writes `docs/evaluation.html` only)
> **Depends on:** SESSION-03
> **Estimated effort:** 30 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| — | docs | `docs/index.html` (current single-page site) | Source of the 10-book evaluation content to migrate |
| — | repo root | `package.json` | Version badge for nav |
| — | input | `input-files/update-website.md` Steps 2–4, §3.2 | Site map, page spec, design tokens |

## Context

First session of **Phase 3** (Update Website). The current `docs/index.html` contains the 10-book dual-AI evaluation — the project's proof of concept. SESSION-05 will **replace** `index.html` with a new landing page, so the evaluation content **must be migrated to `evaluation.html` first** or it is lost. This session also establishes the canonical shared nav bar, footer, and design-token CSS that every later page copies.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `docs/evaluation.html` | Create | Entire current `docs/index.html` content, wrapped in shared nav/footer |

## Implementation

### 1. Read the governing spec

Read `prompts/session-program/program-013/input-files/update-website.md` (canonical: `prompts/meta/update-website.md`): **Step 2** (site map), **§3.2** (evaluation page spec), **Step 4** (design system — color tokens, agent colors, typography, layout, nav, footer, breakpoints, animations), **Step 5** (tone), **Constraints**.

### 2. Migrate the evaluation

- Read `docs/index.html` in full. Copy **all** book data, scores, Claude vs GPT reviews, tier rankings, the verdict bar, the disclosure note, and every card into `docs/evaluation.html` **verbatim** — content and styling preserved exactly.
- Wrap with the shared **nav bar** (sticky, version badge from `package.json`, links: Home, Architecture, Changelog, Evaluation, Press, Contact, GitHub icon; hamburger < 760px; active page = Evaluation) and shared **footer** (three-column; project/version/license, links, contact; "No tracking. No cookies. No analytics.").
- Build nav/footer/`:root` tokens exactly per Step 4 — this markup is the **canonical pattern** SESSION-05/06/07 copy.
- Unique `<title>`, meta description, and OG tags per Step 7 (evaluation variant); `og:image` → `og-image.png`.
- Self-contained HTML5: CSS inline in `<style>`, vanilla JS only, no CDNs, no tracking.
- **Do not modify** `docs/index.html`, `docs/og-image.png`, or `docs/architecture/*.md` in this session.

Note: nav links to `architecture.html`, `changelog.html`, `press.html`, `contact.html` will dangle until SESSION-05–07 create them. This is accepted and verified in SESSION-08 (see STATE.md Design Decisions).

## Verification

- [ ] `docs/evaluation.html` exists and is a self-contained HTML5 document
- [ ] Evaluation content is identical to the original `docs/index.html` (diff the extracted text/data — every card, score, tier, review present)
- [ ] Nav + footer follow the Step 4 spec; version badge matches `package.json`
- [ ] Design tokens match the Step 4 `:root` block exactly
- [ ] Unique OG tags present; no external JS; no tracking
- [ ] `docs/index.html`, `docs/og-image.png`, `docs/architecture/*.md` untouched (`git status`)

## State Update

Set SESSION-04 to `done`. Handoff Notes: confirm evaluation content is safely migrated (SESSION-05 may now overwrite `index.html`); note that `evaluation.html` holds the canonical nav/footer/token markup for all later pages.
