# Update Website — GitHub Pages Multi-Page Site

## Purpose

Read the project's changelog, architecture docs, README, and existing website assets. Then build or update a full multi-page GitHub Pages site in `docs/` that serves three audiences: **users** (writers who want to build books), **builders** (developers who want to contribute or fork), and **press** (journalists, reviewers, and anyone evaluating the project).

The site is a collection of HTML pages with a shared design system. No static site generator — just clean HTML files with shared CSS conventions inlined per page, and a consistent navigation structure.

---

## Step 1: Collect All Source Material

Read every one of these files before writing any HTML. Do not skip any. Do not summarize from memory — read the actual file contents.

### Core
- `README.md` — Product narrative, feature list, screenshots, install instructions
- `CHANGELOG.md` — Full history of every session and change
- `package.json` — Version number, dependencies, scripts

### Architecture Docs
- `docs/architecture/ARCHITECTURE.md` — Master overview, layers, dependency graph
- `docs/architecture/DOMAIN.md` — Types, interfaces, constants
- `docs/architecture/INFRASTRUCTURE.md` — Database, filesystem, CLI, settings, agents
- `docs/architecture/APPLICATION.md` — Services, orchestration, business logic
- `docs/architecture/IPC.md` — Channels, preload bridge
- `docs/architecture/RENDERER.md` — Stores, components, views

### Existing Site Assets
- `docs/index.html` — Current GitHub Pages site (contains the 10-book evaluation — preserve this content)
- `docs/og-image.png` — Existing OG image (keep reference)

### Screenshots
- `screenshots/first-draft.png` — Verity ghostwriting with pipeline tracker
- `screenshots/pitch-room.png` — Pitch room interface
- `screenshots/revision-queue.png` — Revision queue interface

### Optional (read if they exist)
- `issues.md` — Known issues (don't publish details, but inform the project status section)
- `LICENSE` — License type for the footer

---

## Step 2: Site Map & Page Structure

Build these pages. Every page shares the same nav bar, footer, and design tokens.

```
docs/
├── index.html              # Landing page — hero, what it does, agents, get started
├── evaluation.html         # The 10-book dual AI evaluation (migrated from current index.html)
├── architecture.html       # Technical architecture for developers
├── changelog.html          # Full formatted changelog
├── press.html              # Press kit — differentiators, quotes, published books, contact
├── contact.html            # Contact info, links, contribution guide
├── og-image.png            # Existing — don't touch
└── architecture/           # Existing markdown docs — don't touch
    ├── ARCHITECTURE.md
    ├── DOMAIN.md
    ├── INFRASTRUCTURE.md
    ├── APPLICATION.md
    ├── IPC.md
    └── RENDERER.md
```

---

## Step 3: Page Specifications

### 3.1 — `index.html` (Landing Page)

The front door. Answers: "What is this? Why should I care? How do I get it?"

#### Sections

**Nav Bar** (shared across all pages):
- Logo/project name (links to index)
- Page links: Home, Architecture, Changelog, Evaluation, Press, Contact
- GitHub icon link to repo
- Version badge from `package.json`
- Hamburger menu on mobile

**Hero**:
- Project name: "Novel Engine"
- Tagline: "Build books, not write them."
- Subtitle: A desktop book-building pipeline powered by 7 AI editorial agents. Open source. Local-first. No API keys.
- CTA buttons: "Get Started" (links to install section), "View on GitHub", "Read the Evaluation" (links to evaluation.html)
- Screenshot from `screenshots/first-draft.png` (reference as `../screenshots/first-draft.png` or use GitHub raw URL — use your judgment on what works for GitHub Pages)

**The 7 Agents**:
- Card grid, one per agent
- Each card: agent name, role title, one-liner description, agent color accent
- Agent descriptions drawn from README and architecture docs:
  - **Spark** — The Ideator. Brainstorms, pitches, develops premises.
  - **Verity** — The Ghostwriter. Drafts prose in the author's captured voice.
  - **Ghostlight** — The First Reader. Cold reads the manuscript with no context.
  - **Lumen** — The Developmental Editor. Deep structural and thematic analysis.
  - **Sable** — The Copy Editor. Line-level precision, style consistency, motif tracking.
  - **Forge** — The Task Master. Builds revision plans from editorial reports.
  - **Quill** — The Query Crafter. Writes pitches, synopses, and metadata for publishing.

**The Pipeline**:
- Visual representation of the 14-phase pipeline
- Use a horizontal or vertical stepped layout with CSS (not images)
- Phases: Pitch → Scaffold → First Draft → First Read → First Assessment → Revision Plan → Revision → Second Read → Second Assessment → Copy Edit → Revision Plan 2 → Mechanical Fixes → Build → Publish
- Brief description of what happens at each phase

**For Writers — Getting Started**:
- What you need: macOS, Windows, or Linux + Claude Code CLI subscription
- Install options: pre-built installers from Releases page, or build from source
- Platform badges (macOS .dmg, Windows Squirrel, Linux .deb)
- Quick start: Install → Launch → Onboarding wizard detects CLI → Create a book → Start with Spark
- Voice Profile explanation: the AI learns YOUR writing voice through an interview process
- Export formats: Markdown, DOCX, EPUB, PDF via Pandoc

**Published Books**:
- Grid of books built with the engine
- Each: title, Amazon link, cover placeholder or just styled title card
- From README: Cleartext, Junk Souls, Day One, The Last Compiler, The Recursive Archivist
- Link to the full evaluation page

**Footer** (shared across all pages):
- Project name, version, license
- GitHub link, Releases link
- Author: John Ruf — email link
- "Built with Claude Code CLI, Electron, React, and Pandoc"
- "No tracking. No cookies. No analytics."

---

### 3.2 — `evaluation.html` (10-Book Dual AI Evaluation)

**Migrate the entire existing `docs/index.html` content here.** This is the project's proof of concept — every card, score, tier, review paragraph, and styling must be preserved exactly.

Changes from the original:
- Add the shared nav bar at the top
- Add the shared footer at the bottom
- Update the `<title>` and OG tags for this specific page
- Add a breadcrumb or back link to the landing page
- Keep all CSS — either inline it again or factor shared styles into the page

All book data, scores, Claude vs GPT reviews, tier rankings, the verdict bar, the disclosure note, and every card must be preserved verbatim.

---

### 3.3 — `architecture.html` (For Developers)

Deep technical page for developers who want to understand or contribute.

#### Sections

**Overview**:
- The 5-layer clean architecture: Domain ← Infrastructure ← Application ← IPC/Main ← Renderer
- Visual layer diagram (CSS-based, not ASCII art)
- One-paragraph description of each layer's responsibility and import rules

**Tech Stack**:
- Table: Layer, Technology, Version (from package.json)
- Electron, React 18, TypeScript 5, Tailwind v4, Zustand, better-sqlite3, Claude Code CLI, Pandoc, nanoid, marked

**Service Dependency Graph**:
- Visual tree showing how services are composed in the composition root
- Draw from `docs/architecture/ARCHITECTURE.md`

**Key Design Decisions**:
- Dependency injection via constructor (no DI container)
- No API keys — Claude Code CLI handles authentication
- Two-call pattern: Wrangler (cheap model) plans context → Agent (expensive model) does the work
- Context Wrangler: AI-powered context planning, per-agent file rules, chapter strategies, conversation compaction
- Streaming CLI integration: NDJSON events, thinking blocks, progress stages

**Database Schema**:
- Table overview from INFRASTRUCTURE.md
- Key tables: conversations, messages, usage, pipeline state

**Source Tree**:
- Full annotated directory listing from ARCHITECTURE.md
- Each file/directory with one-line purpose

**Contributing**:
- Clone, install prerequisites (Node 20+, Claude Code CLI), npm install, npm start
- Development commands
- Architecture rules to follow
- Link to the markdown architecture docs in `docs/architecture/` on GitHub

---

### 3.4 — `changelog.html` (Project History)

The full changelog, beautifully formatted.

#### Structure

**Summary Stats** (top of page):
- Total number of changelog entries
- Date range (first entry to latest)
- Categorized counts: features added, bugs fixed, architecture changes

**Timeline View**:
- Entries grouped by date
- Each entry: date header, summary paragraph, categorized bullet lists (Added, Changed, Removed, Fixed)
- File paths rendered as `code` spans
- Architecture Impact and Migration Notes rendered if non-trivial
- Collapsible entries for dates with many changes (use `<details>/<summary>` elements)

**Highlight Reel** (sidebar or top section):
- Extract the 5-10 most significant changes across the project's history
- Group by theme: "Major Features", "Architecture Milestones", "Agent System Evolution"
- Each highlight: one sentence + link to the full entry below

Parse the actual `CHANGELOG.md` and render every entry. Do not summarize or skip entries.

---

### 3.5 — `press.html` (Press Kit)

For journalists, reviewers, newsletter writers, and anyone writing about the project.

#### Sections

**The Pitch** (quotable summary):
- 1-2 paragraph distilled explanation of what Novel Engine is and why it matters
- Frame: "Novel Engine is to book-writing what a build system is to software"
- Emphasize: not a chatbot, not an AI ghostwriter — it's an editorial production pipeline where the human author retains creative authority

**What Makes This Different**:
- Card grid of differentiators:
  - **Build system, not chat bot** — 14-phase pipeline with completion gates, not freeform prompting
  - **7 specialized agents** — Not one general AI, but a team with distinct roles and perspectives
  - **Voice capture** — Writes in the author's voice via a detailed profile interview
  - **Local-first** — Everything runs on your machine. No cloud backend. No API key storage.
  - **Open source** — MIT licensed, fully inspectable
  - **Two-call pattern** — An AI plans context for another AI. Smart token management, not brute force.
  - **Ships real books** — 5+ published novels on Amazon built with this system

**Published Works**:
- Book list with Amazon links
- Link to the 10-book evaluation page
- Pull a key quote from the evaluation: "Not AI slop. Scores: 7.0–9.4 / 10"

**By The Numbers** (if computable from source material):
- Number of agents, pipeline phases, IPC channels, components
- Lines of code (approximate)
- Published books count

**Quotable Lines** (extracted and adapted from README):
- "You bring the story. The agents build it into a book."
- "The pipeline is a build process: source material goes in, a production-ready manuscript comes out."
- "Seven agents. Fourteen phases. One manuscript."
- "Build is both metaphor and literal — the final phase compiles chapters via Pandoc."

**Assets**:
- Link to screenshots in the repo
- Link to og-image.png
- GitHub repo link
- Author contact

**Contact**:
- John Ruf
- Email: john.paul.ruf@gmail.com
- GitHub: john-paul-ruf

---

### 3.6 — `contact.html` (Contact & Community)

#### Sections

**Get In Touch**:
- Email: john.paul.ruf@gmail.com (with mailto link)
- GitHub Issues: link to issues page
- GitHub Discussions: link if exists, otherwise just issues

**Contributing**:
- "Novel Engine welcomes contributions"
- Link to architecture.html for understanding the codebase
- Link to GitHub issues for finding work
- Basic contribution flow: fork → branch → PR
- Architecture rules: respect layer boundaries, no business logic in IPC, use dependency injection

**Report a Bug**:
- Link to GitHub new issue page
- What to include: platform, version, steps to reproduce, expected vs actual

**Testers Wanted**:
- Pull from README's testers-needed callout
- Platform-specific installer links (point to GitHub Releases)
- What to test: installer, launch, onboarding, book creation, agent chat, UI

**License**:
- License type and link to LICENSE file in repo

---

## Step 4: Shared Design System

All pages must share a consistent visual language. Inline the CSS per page (no external stylesheet — keeps GitHub Pages simple), but maintain identical design tokens.

### Color Tokens
```css
:root {
  --bg: #0a0a0c;
  --surface: #111114;
  --surface2: #19191e;
  --surface3: #151519;
  --border: #2a2a32;
  --text: #e8e6e0;
  --text2: #b6b3ab;
  --text3: #7d7a73;
  --accent: #c4ff4d;
  --accent2: #9dcc3e;
  --amber: #efb100;
  --teal: #3dd4a0;
  --blue: #6fb8ff;
  --magenta: #d4a0ff;
  --red: #ff6b6b;
  --orange: #ff9f43;
  --slate: #94a3b8;
}
```

### Agent Colors
| Agent | Color | CSS Variable |
|-------|-------|-------------|
| Spark | Amber/gold | `var(--amber)` |
| Verity | Blue | `var(--blue)` |
| Ghostlight | Magenta/purple | `var(--magenta)` |
| Lumen | Teal | `var(--teal)` |
| Sable | Red | `var(--red)` |
| Forge | Orange | `var(--orange)` |
| Quill | Slate/silver | `var(--slate)` |

### Typography
- Headings: `'DM Serif Display', serif`
- Body: `'DM Sans', sans-serif`
- Monospace/labels: `'Space Mono', monospace`
- Load from Google Fonts: `https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap`

### Layout
- Max width: 1200px, centered
- Page padding: 44px 32px (desktop), 24px 14px (mobile)
- Card radius: 10-12px
- Border: 1px solid var(--border)

### Navigation Bar
- Sticky top, z-index 100
- Background: var(--bg) with slight transparency + backdrop blur
- Left: project name (link to index), version badge
- Center/right: page links (Home, Architecture, Changelog, Evaluation, Press, Contact)
- Far right: GitHub icon link
- Active page highlighted with accent underline
- Mobile: hamburger icon → slide-down menu

### Footer
- Top border separator
- Three-column on desktop (project info, links, contact), stacked on mobile
- Consistent across all pages

### Responsive Breakpoints
- Desktop: > 1050px
- Tablet: 760px — 1050px
- Mobile: < 760px
- Nav collapses to hamburger at 760px
- Grids collapse to single column at 760px

### Animations
- Subtle fade-up on scroll for cards (use `IntersectionObserver` in vanilla JS)
- Smooth scroll for anchor links
- Hover transitions on interactive elements (0.2s ease)

---

## Step 5: Content Tone & Writing Rules

### For Writers (index.html, primarily)
Warm, confident, approachable. "You bring the story. We help you build it into a book." Avoid jargon. Emphasize the human author's creative authority. Make the pipeline feel like a professional publishing experience, not a tech demo.

### For Developers (architecture.html)
Direct, technical, respectful of expertise. Lead with architecture. Show that this is a serious codebase with real engineering discipline. Mention clean architecture, dependency injection, streaming CLI integration. Make them want to read the source.

### For Press (press.html)
Clear, quotable, differentiated. Emphasize what makes this NOT just another AI writing tool. Lead with the published books as proof. Provide ready-to-use quotes and facts.

### Overall Rules
- **Never fabricate features.** Only describe what exists in the codebase. Read the source material.
- No marketing fluff — every claim must be backed by what's actually in the repo
- Self-deprecating humor is fine ("Yes, we built an Electron app. No, we're not sorry.")
- Technical accuracy is non-negotiable — if a feature isn't implemented, don't mention it
- Credit the tools: Claude Code CLI, Electron, React, Pandoc, etc.
- No tracking, analytics, cookies, or third-party scripts
- No Lorem ipsum — every piece of text is real content

---

## Step 6: Screenshots

Reference screenshots from the repo. For GitHub Pages, use relative paths that work when served from `docs/`:

```html
<!-- From docs/index.html, reference screenshots in repo root -->
<img src="../screenshots/first-draft.png" alt="...">
```

If relative paths won't work for GitHub Pages (they may not since Pages serves from `docs/`), use the raw GitHub URL pattern:
```
https://raw.githubusercontent.com/john-paul-ruf/novel-engine/main/screenshots/first-draft.png
```

Available screenshots:
- `screenshots/first-draft.png` — Verity ghostwriting with pipeline tracker and CLI activity
- `screenshots/pitch-room.png` — Pitch room brainstorming interface
- `screenshots/revision-queue.png` — Revision queue management

Use judgment on which screenshots go where. The landing page hero should use the most impressive one (likely `first-draft.png`).

---

## Step 7: Build All Pages

Write every HTML file listed in the site map. Each file must:

1. Be a self-contained HTML5 document
2. Include all CSS inline in a `<style>` block
3. Include only vanilla JS (no frameworks, no CDNs) — keep it minimal
4. Include proper `<title>`, OG tags, and meta description unique to that page
5. Share navigation and footer structure
6. Render correctly in Chrome, Firefox, Safari, and Edge
7. Be responsive at all three breakpoints

### OG Tags (per page)

**index.html**:
```html
<meta property="og:title" content="Novel Engine — Build Books, Not Write Them">
<meta property="og:description" content="A desktop book-building pipeline powered by 7 AI editorial agents. Open source. Local-first. Ships real novels.">
```

**evaluation.html**:
```html
<meta property="og:title" content="Novel Engine — 10-Book Dual AI Evaluation">
<meta property="og:description" content="Two AIs. Same 10 manuscripts. Separate verdicts. Scores: 7.0–9.4. Full ranked report.">
```

**architecture.html**:
```html
<meta property="og:title" content="Novel Engine — Architecture & Technical Docs">
<meta property="og:description" content="5-layer clean architecture. Electron + React + TypeScript + Claude Code CLI. Dependency injection. Streaming AI.">
```

**changelog.html**:
```html
<meta property="og:title" content="Novel Engine — Changelog">
<meta property="og:description" content="Full development history of Novel Engine. Every feature, fix, and architectural decision documented.">
```

**press.html**:
```html
<meta property="og:title" content="Novel Engine — Press Kit">
<meta property="og:description" content="Press resources for Novel Engine. Differentiators, published books, quotable facts, and contact info.">
```

**contact.html**:
```html
<meta property="og:title" content="Novel Engine — Contact & Contributing">
<meta property="og:description" content="Get in touch, report bugs, contribute code, or test pre-built installers.">
```

All pages share: `og:image` pointing to `og-image.png`, `og:url` with the correct page URL, `og:type: website`.

---

## Step 8: Verify

After writing all pages, verify:

1. All 6 HTML files exist in `docs/`
2. Every nav link points to a real page with correct relative paths
3. All internal cross-page links work (e.g., "Read the Evaluation" on index → evaluation.html)
4. The 10-book evaluation data in `evaluation.html` is identical to the original `index.html` content
5. No external JS dependencies anywhere
6. Version number on every page matches `package.json`
7. All Amazon book links from README are included and correct
8. GitHub repo link is correct: `https://github.com/john-paul-ruf/novel-engine`
9. Contact email is correct: `john.paul.ruf@gmail.com`
10. Screenshot references resolve (test the URL pattern)
11. Every page has unique, accurate OG tags
12. Mobile nav works (hamburger menu toggles)
13. No `docs/architecture/*.md` files were modified or deleted
14. `docs/og-image.png` is untouched
15. No tracking scripts, analytics, or cookies on any page
16. The changelog page contains every entry from `CHANGELOG.md`

---

## Constraints

- **Never fabricate features.** Only describe what actually exists in the codebase.
- **Never modify `docs/architecture/*.md` files.** Those are maintained by the AGENTS.md documentation system.
- **Never modify `docs/og-image.png`.** Keep the existing asset.
- **Never remove the 10-book evaluation content.** Migrate it to `evaluation.html` intact.
- **Never add tracking scripts, analytics, or cookies.** This is a clean open-source project page.
- **Never use external JS CDNs or frameworks.** Vanilla JS only.
- **Never use a static site generator.** Plain HTML files.
- **Don't create files outside `docs/`.** The website lives entirely in the docs directory.
- **Don't modify source code.** This prompt only produces website files.

---

## Output

1. `docs/index.html` — Landing page (NEW — replaces the old single-page site)
2. `docs/evaluation.html` — 10-book evaluation (MIGRATED from old index.html)
3. `docs/architecture.html` — Technical architecture page (NEW)
4. `docs/changelog.html` — Full changelog (NEW)
5. `docs/press.html` — Press kit (NEW)
6. `docs/contact.html` — Contact & contributing (NEW)
7. Summary of what source material informed each page and any decisions made
