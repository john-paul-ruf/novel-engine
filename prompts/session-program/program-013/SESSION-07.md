# SESSION-07 — Website: Press Kit + Contact Pages

> **Program:** Novel Engine
> **Feature:** deployment-prep
> **Modules:** none (writes `docs/press.html`, `docs/contact.html`)
> **Depends on:** SESSION-04 (may run in parallel with SESSION-05 and SESSION-06)
> **Estimated effort:** 25 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| — | repo root | `README.md`, `RELEASE_NOTES.md`, `LICENSE`, `package.json` | Quotes, book list, testers callout, license, version |
| — | docs | `docs/evaluation.html` | Canonical nav/footer/tokens + evaluation quote source |
| — | input | `input-files/update-website.md` §3.5, §3.6, Steps 4–7 | Page specs |

## Context

The outward-facing pages. Every quotable claim (published book count, score ranges, feature differentiators) must be traceable to the README, the evaluation page, or source code — press pages are where fabrication would be most damaging.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `docs/press.html` | Create | Press kit per §3.5 |
| `docs/contact.html` | Create | Contact & contributing per §3.6 |

## Implementation

### 1. `docs/press.html` (§3.5)

- **The Pitch** — 1–2 quotable paragraphs; frame: "Novel Engine is to book-writing what a build system is to software"; human author retains creative authority.
- **What Makes This Different** — differentiator card grid (build system not chatbot; 7 specialized agents; voice capture; local-first; open source; two-call pattern; ships real books). Verify each against the README before including.
- **Published Works** — book list + Amazon links from the README; link to `evaluation.html`; pull the score-range quote from the actual evaluation data ("Scores: 7.0–9.4 / 10" — confirm the range against `evaluation.html`).
- **By The Numbers** — agents, phases, IPC channels, components, approximate LOC, published books — compute from the repo (the SESSION-02 artifact `artifacts/readme-analysis.md` has verified counts; reuse it).
- **Quotable Lines** — per §3.5, adapted from the README.
- **Assets & Contact** — screenshots, og-image, repo link, John Ruf, `john.paul.ruf@gmail.com`, GitHub `john-paul-ruf`.

### 2. `docs/contact.html` (§3.6)

- **Get In Touch** — mailto link, GitHub Issues (Discussions only if it exists).
- **Contributing** — link to `architecture.html`, issues link, fork → branch → PR flow, architecture rules (layer boundaries, no business logic in IPC, DI).
- **Report a Bug** — new-issue link + what to include.
- **Testers Wanted** — pull from the README's testers callout; platform installer links to GitHub Releases; what to test.
- **License** — type verified against `LICENSE`, link to the file on GitHub.

Both pages: copy nav/footer/tokens from `docs/evaluation.html` (active link per page), unique OG tags per Step 7, inline CSS, vanilla JS only, responsive.

## Verification

- [ ] Both files exist and are self-contained HTML5 documents
- [ ] Every differentiator/number/quote is traceable to README, evaluation page, or the SESSION-02 artifact
- [ ] Contact email `john.paul.ruf@gmail.com` and repo `https://github.com/john-paul-ruf/novel-engine` correct on both pages
- [ ] License section matches `LICENSE`
- [ ] Version badge matches `package.json`; unique OG tags; no external JS/tracking

## State Update

Set SESSION-07 to `done`. Handoff Notes: any claims that could not be verified and were therefore omitted.
