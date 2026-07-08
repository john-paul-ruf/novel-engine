# SESSION-05 — Website: Landing Page

> **Program:** Novel Engine
> **Feature:** deployment-prep
> **Modules:** none (writes `docs/index.html` only)
> **Depends on:** SESSION-04
> **Estimated effort:** 30 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| — | repo root | `README.md` (fresh from SESSION-03), `RELEASE_NOTES.md`, `package.json` | Product narrative, features, book list, version |
| — | docs | `docs/evaluation.html` | Canonical nav/footer/design-token markup to copy |
| — | assets | `screenshots/first-draft.png`, `pitch-room.png`, `revision-queue.png` | Hero + section imagery |
| — | input | `input-files/update-website.md` §3.1, Steps 4–7 | Landing page spec |

## Context

The evaluation content is safe in `evaluation.html` (SESSION-04), so `docs/index.html` can now be **replaced** with the new landing page. All content derives from the freshly rewritten README — never from memory.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `docs/index.html` | Replace | Old single-page site → new landing page |

## Implementation

### 1. Build the landing page per §3.1 of update-website.md

Sections, in order:

1. **Nav bar** — copy the canonical markup from `docs/evaluation.html`, active page = Home.
2. **Hero** — "Novel Engine" / tagline "Build books, not write them." / subtitle (7 AI editorial agents, open source, local-first, no API keys) / CTAs: Get Started, View on GitHub, Read the Evaluation → `evaluation.html` / hero screenshot `first-draft.png` (use the raw GitHub URL pattern from Step 6 if relative `../screenshots/` won't serve from Pages — test and pick one).
3. **The 7 Agents** — card grid; names, role titles, one-liners per §3.1; accent colors per the Step 4 agent-color table. Verify the agent list against the rewritten README (which verified against `constants.ts`).
4. **The Pipeline** — CSS stepped layout (no images) of the 14 phases: Pitch → Scaffold → First Draft → First Read → First Assessment → Revision Plan → Revision → Second Read → Second Assessment → Copy Edit → Revision Plan 2 → Mechanical Fixes → Build → Publish. Cross-check phase names against the rewritten README's pipeline table; the README is authoritative if they differ.
5. **For Writers — Getting Started** — prerequisites, install options, platform badges, quick start, Voice Profile explanation, export formats (Markdown, DOCX, EPUB, PDF via Pandoc) — all consistent with the README.
6. **Published Books** — grid with Amazon links from the README; link to `evaluation.html`.
7. **Footer** — canonical markup from `evaluation.html`.

Include unique OG tags per Step 7 (index variant), inline CSS with the exact Step 4 tokens, vanilla-JS-only (hamburger toggle, IntersectionObserver fade-up, smooth scroll), responsive at all three breakpoints.

## Verification

- [ ] `docs/index.html` is self-contained; no external JS/CDNs/tracking
- [ ] Agent cards match the README's agent table (names, roles)
- [ ] Pipeline phases match the README's pipeline table
- [ ] Every feature claim on the page appears in the README (no fabrication)
- [ ] Amazon links match the README
- [ ] Version badge matches `package.json`; OG tags unique and correct
- [ ] Nav/footer byte-consistent with `evaluation.html` (except active-link state)

## State Update

Set SESSION-05 to `done`. Handoff Notes: which screenshot URL pattern was chosen (relative vs raw GitHub) — SESSION-06/07 must use the same pattern.
