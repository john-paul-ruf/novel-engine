# Feature Scout — Scan Site & Codebase, Generate Feature Requests

## Purpose

You are a product strategist and senior engineer. Your job is to scan the Novel Engine GitHub Pages site, README, architecture docs, existing feature requests, and codebase — then brainstorm novel, high-impact feature ideas that don't already exist as feature requests or implemented functionality. For each viable idea, create a new `.md` file in `prompts/feature-requests/`.

---

## Step 1 — Read Everything

Read all of these before generating any ideas. Do not skip any. Do not work from memory.

### Site Pages

Fetch and read every page of the GitHub Pages site:

- `docs/index.html` — Landing page, hero, features, get-started
- `docs/architecture.html` — Technical architecture for developers
- `docs/changelog.html` — Full formatted changelog
- `docs/evaluation.html` — 10-book dual AI evaluation
- `docs/press.html` — Press kit, differentiators, published books
- `docs/contact.html` — Contact info, contribution guide

### Core Docs

- `README.md` — Product narrative, full feature list, agents, pipeline
- `CHANGELOG.md` — History of every session and change
- `issues.md` — Known issues and bugs (if it exists)

### Architecture Docs

- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/DOMAIN.md`
- `docs/architecture/INFRASTRUCTURE.md`
- `docs/architecture/APPLICATION.md`
- `docs/architecture/IPC.md`
- `docs/architecture/RENDERER.md`

### Existing Feature Requests

Read every file in `prompts/feature-requests/` and `prompts/feature-requests/processed/`. These are already captured — do not duplicate them.

### Agent Prompts

Read every `.md` file in `agents/`. Understanding what the agents do is critical for identifying gaps and opportunities.

### Domain Layer

- `src/domain/types.ts` — All shared types
- `src/domain/interfaces.ts` — Service contracts
- `src/domain/constants.ts` — Agent registry, pipeline phases, defaults

---

## Step 2 — Build a Mental Model

Before brainstorming, synthesize what you've read into:

1. **What the product does today** — every feature, every agent capability, every pipeline phase, every UI view
2. **What users struggle with** — infer from issues.md, changelog fixes, and UX gaps visible in the architecture
3. **What competitors offer** — think about tools like Scrivener, Sudowrite, NovelAI, Atticus, Vellum, ProWritingAid, and how Novel Engine compares
4. **What the architecture enables** — features that would be easy to build given the existing infrastructure (SQLite, file watchers, multi-agent IPC, streaming CLI, Pandoc)
5. **What the architecture blocks** — features that would require significant refactoring (note these but don't discard them)

---

## Step 3 — Brainstorm Features

Generate feature ideas across these categories. You don't need to hit every category — focus on ideas that are genuinely useful, not just impressive-sounding.

### Categories

| Category | Think About |
|----------|------------|
| **Writing workflow** | What's tedious or manual that could be automated or streamlined? |
| **Agent capabilities** | New agents, agent improvements, new collaboration patterns between agents |
| **Pipeline** | New phases, phase improvements, branching pipelines, parallel work |
| **Context & memory** | Better context management, long-term memory, cross-book learning |
| **UI/UX** | Missing views, quality-of-life improvements, accessibility, customization |
| **Analytics & insights** | Writing statistics, progress tracking, cost analysis, quality metrics |
| **Collaboration** | Multi-author support, editor workflows, feedback loops |
| **Import/Export** | New formats, integrations, data portability |
| **Voice & style** | Voice profile improvements, style analysis, consistency tools |
| **Publishing** | Metadata, distribution, marketing materials, cover generation |
| **Developer experience** | Plugin system, custom agents, API, scripting |
| **Performance** | Speed, resource usage, offline capabilities, caching |

### Quality Filter

For each idea, ask yourself:

1. **Is it already implemented?** → Check the README feature list, architecture docs, and changelog. If yes, discard.
2. **Is it already a feature request?** → Check `prompts/feature-requests/` and `prompts/feature-requests/processed/`. If yes, discard.
3. **Does it fit the product philosophy?** → Novel Engine is about the author retaining creative authority. Features that remove the author from the loop don't fit.
4. **Is it specific enough to build?** → "Make the UI better" is not a feature request. "Add a split-pane view for side-by-side chapter comparison during revision" is.
5. **Would a writer actually want this?** → Engineer-brain features that don't serve the writing workflow should be deprioritized.

---

## Step 4 — Write Feature Request Files

For each idea that passes the quality filter, create a file in `prompts/feature-requests/`.

### File Naming

Use kebab-case descriptive names: `chapter-comparison-view.md`, `writing-statistics-dashboard.md`, `agent-memory-system.md`.

### File Format

Keep it concise. The user writes short, conversational feature requests — match the tone of the existing ones in `prompts/feature-requests/processed/`. These are raw ideas, not specs. The intake prompt (`prompts/meta/intake.md`) will later decompose them into session prompts.

```markdown
{One to three paragraphs describing the feature. What it does, why it's useful, and any key constraints or preferences.}

{Optional: specific UI placement, interaction model, or architectural hints.}
```

Do NOT include:
- Headers or titles (the filename is the title)
- Implementation details or code
- Session decomposition (that's intake.md's job)
- Priority rankings or effort estimates

Do include:
- What the feature does from the user's perspective
- Why it matters for the writing workflow
- Any constraints ("must work offline", "should not require API keys", etc.)
- Where it lives in the UI if you have an opinion

---

## Step 5 — Report

After creating all feature request files, output a summary:

### Format

```
## Feature Scout Report

Scanned: {number} site pages, {number} docs, {number} existing feature requests, {number} agent prompts

### New Feature Requests Created

1. `{filename}.md` — {one-sentence summary}
2. `{filename}.md` — {one-sentence summary}
...

### Ideas Considered but Discarded

- {idea} — {why: already exists / doesn't fit philosophy / too vague / already requested}
...

### Observations

{Any broader product insights, gaps, or strategic observations that emerged from the scan but don't map to a single feature request.}
```

---

## Constraints

- **Do not duplicate existing feature requests.** Read them first.
- **Do not suggest features that already exist.** Read the README and changelog first.
- **Do not write implementation specs.** These are raw ideas for the intake prompt to decompose.
- **Match the tone of existing feature requests.** Short, conversational, opinionated.
- **Minimum 3 ideas, maximum 15.** Quality over quantity. If you only find 3 good ideas, that's fine.
- **Every idea must serve writers.** This is a book-building tool, not a general-purpose AI app.
