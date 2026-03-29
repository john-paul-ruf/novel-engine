# SESSION-03 — Update Website

> **Phase:** 3 of 3
> **Depends on:** SESSION-01 (RELEASE_NOTES.md), SESSION-02 (README.md)
> **Produces:** 6 HTML files in `docs/`
> **Source prompt:** `prompts/session-program/program-006/input-files/update-website.md`

---

## Objective

Build or update the full multi-page GitHub Pages site in `docs/` using the freshly produced `RELEASE_NOTES.md` and `README.md` from the previous sessions, plus all architecture docs, changelog, and screenshots. The site serves three audiences: **users** (writers), **builders** (developers), and **press** (journalists/reviewers).

---

## Step 1: Collect All Source Material

Read every one of these files before writing any HTML. Do not skip any.

### Core
- `README.md` — Product narrative, feature list, screenshots, install instructions
- `CHANGELOG.md` — Full history
- `package.json` — Version number, dependencies, scripts
- `RELEASE_NOTES.md` — Fresh from SESSION-01

### Architecture Docs
- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/DOMAIN.md`
- `docs/architecture/INFRASTRUCTURE.md`
- `docs/architecture/APPLICATION.md`
- `docs/architecture/IPC.md`
- `docs/architecture/RENDERER.md`

### Existing Site Assets
- `docs/index.html` — Current site (contains 10-book evaluation — **preserve this content**)
- `docs/og-image.png` — Existing OG image (keep reference)

### Screenshots
- `screenshots/*`

### Amazon books
- https://www.amazon.com/stores/John-Ruf/author/B00J98NAZ6

### Optional
- `issues.md`, `LICENSE`

---

## Step 2: Site Map

```
docs/
├── index.html              # Landing page — hero, agents, pipeline, get started
├── evaluation.html         # 10-book dual AI evaluation (migrated from current index.html)
├── architecture.html       # Technical architecture for developers
├── changelog.html          # Full formatted changelog
├── press.html              # Press kit — differentiators, quotes, books, contact
├── contact.html            # Contact info, links, contribution guide
├── og-image.png            # Existing — don't touch
└── architecture/           # Existing markdown docs — don't touch
```

---

## Step 3: Page Specifications

### 3.1 — `index.html` (Landing Page)

**Nav Bar** (shared across all pages):
- Logo/project name (links to index), version badge
- Page links: Home, Architecture, Changelog, Evaluation, Press, Contact
- GitHub icon link, hamburger on mobile

**Hero**:
- "Novel Engine" / "Build books, not write them."
- Subtitle: desktop book-building pipeline, 7 AI editorial agents, open source, local-first, no API keys
- CTA buttons: Get Started, View on GitHub, Read the Evaluation
- Screenshot: `screenshots/first-draft.png`

**The 7 Agents** — Card grid:
| Agent | Color | Role |
|-------|-------|------|
| Spark | amber | The Ideator — brainstorms, pitches, develops premises |
| Verity | blue | The Ghostwriter — drafts prose in the author's captured voice |
| Ghostlight | magenta | The First Reader — cold reads with no context |
| Lumen | teal | The Developmental Editor — deep structural and thematic analysis |
| Sable | red | The Copy Editor — line-level precision, style consistency |
| Forge | orange | The Task Master — builds revision plans from reports |
| Quill | slate | The Query Crafter — pitches, synopses, metadata for publishing |

**The Pipeline** — Visual 14-phase stepped layout (CSS, not images):
Pitch → Scaffold → First Draft → First Read → First Assessment → Revision Plan → Revision → Second Read → Second Assessment → Copy Edit → Revision Plan 2 → Mechanical Fixes → Build → Publish

**For Writers — Getting Started**: Prerequisites, install options, platform badges, quick start, voice profile, export formats.

**Published Books**: pull from https://www.amazon.com/stores/John-Ruf/author/B00J98NAZ6 - make links.

**Footer** (shared): Project name, version, license, GitHub, author, tech credits, "No tracking. No cookies. No analytics."

---

### 3.2 — `evaluation.html`

Migrate entire existing `docs/index.html` content here verbatim. Add shared nav + footer. Update `<title>` and OG tags. All book data, scores, Claude vs GPT reviews, tier rankings, verdict bar, disclosure — preserved exactly.

---

### 3.3 — `architecture.html`

- Overview: 5-layer clean architecture diagram (CSS, not ASCII)
- Tech Stack table (from package.json versions)
- Service dependency graph
- Key design decisions: DI, no API keys, two-call pattern, streaming CLI, context wrangler
- Database schema overview
- Full annotated source tree
- Contributing guide

---

### 3.4 — `changelog.html`

- Summary stats (entry count, date range, categorized counts)
- Timeline view: grouped by date, categorized bullets, collapsible busy dates
- Highlight reel: 5-10 most significant changes
- Parse and render **every** CHANGELOG.md entry — no summarizing

---

### 3.5 — `press.html`

- The pitch (quotable 1-2 paragraphs)
- Differentiators card grid (build system not chatbot, 7 agents, voice capture, local-first, open source, two-call pattern, ships real books)
- Published works + evaluation link + quote: "Not AI slop. Scores: 7.0–9.4 / 10"
- By-the-numbers stats
- Quotable lines
- Assets, screenshots, contact

---

### 3.6 — `contact.html`

- Get in touch (email: john.paul.ruf@gmail.com, GitHub issues)
- Contributing guide (link to architecture.html)
- Report a bug
- Testers wanted (platform-specific installer links)
- License

---

## Step 4: Shared Design System

Inline CSS per page. Consistent tokens:

### Colors
```css
--bg: #0a0a0c; --surface: #111114; --surface2: #19191e; --border: #2a2a32;
--text: #e8e6e0; --text2: #b6b3ab; --text3: #7d7a73;
--accent: #c4ff4d; --amber: #efb100; --teal: #3dd4a0; --blue: #6fb8ff;
--magenta: #d4a0ff; --red: #ff6b6b; --orange: #ff9f43; --slate: #94a3b8;
```

### Agent Colors
Spark=amber, Verity=blue, Ghostlight=magenta, Lumen=teal, Sable=red, Forge=orange, Quill=slate.

### Typography
- Headings: `DM Serif Display, serif`
- Body: `DM Sans, sans-serif`
- Mono: `Space Mono, monospace`
- Google Fonts: `https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap`

### Layout
Max 1200px centered. Card radius 10-12px. 1px solid var(--border).

### Responsive
- Desktop: >1050px
- Tablet: 760-1050px
- Mobile: <760px
- Nav → hamburger at 760px
- Grids → single column at 760px

### Animations
- Subtle fade-up on scroll (IntersectionObserver, vanilla JS)
- Smooth scroll for anchor links
- Hover transitions (0.2s ease)

---

## Step 5: Content Tone

- **Writers** (index): Warm, confident, approachable. Author's creative authority.
- **Developers** (architecture): Direct, technical. Engineering discipline.
- **Press** (press): Clear, quotable. Published books as proof.

---

## Step 6: Screenshots

From `docs/`, reference screenshots:
```html
<img src="../screenshots/first-draft.png" alt="...">
```

Fallback (if relative paths fail for GitHub Pages):
```
https://raw.githubusercontent.com/john-paul-ruf/novel-engine/main/screenshots/first-draft.png
```

---

## Step 7: OG Tags

Each page gets unique `og:title` and `og:description`. All share `og:image` → `og-image.png`.

| Page | og:title | og:description |
|------|----------|----------------|
| index | Novel Engine — Build Books, Not Write Them | A desktop book-building pipeline powered by 7 AI editorial agents... |
| evaluation | Novel Engine — 10-Book Dual AI Evaluation | Two AIs. Same 10 manuscripts. Separate verdicts. Scores: 7.0–9.4... |
| architecture | Novel Engine — Architecture & Technical Docs | 5-layer clean architecture. Electron + React + TypeScript... |
| changelog | Novel Engine — Changelog | Full development history... |
| press | Novel Engine — Press Kit | Press resources... Differentiators, published books, quotable facts... |
| contact | Novel Engine — Contact & Contributing | Get in touch, report bugs, contribute code... |

---

## Step 8: Build All Pages

Every HTML file must:
1. Be self-contained HTML5
2. Include all CSS inline in `<style>`
3. Vanilla JS only — no frameworks, no CDNs
4. Proper `<title>`, OG tags, meta description
5. Shared nav + footer structure
6. Work in Chrome, Firefox, Safari, Edge
7. Responsive at all three breakpoints

---

## Constraints

- **Never fabricate features.** Only describe what exists in the codebase.
- **Never modify `docs/architecture/*.md`.** Maintained separately.
- **Never modify `docs/og-image.png`.** Keep existing asset.
- **Never remove 10-book evaluation content.** Migrate to `evaluation.html` intact.
- **No tracking scripts, analytics, cookies, or third-party JS.**
- **No static site generators.** Plain HTML files.
- **Don't create files outside `docs/`.** Website lives entirely in docs.
- **Don't modify source code.** This session only produces website files.

---

## Verification Checklist

- [ ] All 6 HTML files exist in `docs/`
- [ ] Every nav link points to a real page with correct relative paths
- [ ] All internal cross-page links work
- [ ] 10-book evaluation data in `evaluation.html` matches original `index.html`
- [ ] No external JS dependencies
- [ ] Version number on every page matches `package.json`
- [ ] All Amazon book links included and correct
- [ ] GitHub repo link: `https://github.com/john-paul-ruf/novel-engine`
- [ ] Contact email: `john.paul.ruf@gmail.com`
- [ ] Screenshot references resolve
- [ ] Every page has unique, accurate OG tags
- [ ] Mobile nav works (hamburger toggle)
- [ ] No `docs/architecture/*.md` files modified or deleted
- [ ] `docs/og-image.png` untouched
- [ ] No tracking scripts, analytics, or cookies
- [ ] Changelog page contains every `CHANGELOG.md` entry

---

## Completion Gate

All 6 HTML files exist in `docs/` and pass every item on the verification checklist.

---

## Update STATE.md

After completion, update STATE.md with:
- SESSION-03 status → `complete`
- All artifacts → produced
- Final summary report

---

## Final Summary Report

After all three phases complete, produce:

```
## Deployment Prep — Complete

### Release Notes (Phase 1)
- Version: vX.Y.Z (bump type)
- Changes: N features, N improvements, N fixes, N breaking
- File: RELEASE_NOTES.md

### README (Phase 2)
- Features added: [list]
- Features removed: [list]
- Sections updated: [list]
- File: README.md

### Website (Phase 3)
- Pages updated: [6 HTML files]
- New content: [notable additions]
- Files: docs/*.html

### Ready to Ship
- [ ] Review RELEASE_NOTES.md
- [ ] Review README.md diff
- [ ] Preview docs/index.html locally
- [ ] Tag the release: git tag vX.Y.Z
- [ ] Push: git push origin main --tags
```
