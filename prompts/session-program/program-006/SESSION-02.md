# SESSION-02 — README Deep Update

> **Phase:** 2 of 3
> **Depends on:** SESSION-01 (RELEASE_NOTES.md must exist)
> **Produces:** Rewritten `README.md`
> **Source prompt:** `prompts/session-program/program-006/input-files/readme-deep-update.md`

---

## Objective

Perform a comprehensive analysis of the entire Novel Engine repository and rewrite `README.md` to accurately reflect the current state of the codebase. Every feature, file, component, and capability mentioned must be verified against actual source code. Use information from `RELEASE_NOTES.md` (produced by SESSION-01) to ensure accuracy.

---

## Core Narrative: "Build Books, Not Write Them"

Novel Engine doesn't write books — it **builds** them. This is a book-building system, not an AI ghostwriting tool. Reinforce this framing throughout:

- Say **"build a novel"** not "write a novel"
- Say **"editorial pipeline"** not "writing assistant"
- Say **"the author's editorial team"** not "AI writers"
- Say **"production-ready manuscript"** not "AI-generated content"
- Frame agents as **roles in a publishing house** — not AI chatbots
- Emphasize the **structured, phase-gated process** — not freeform chat
- The app is a **workshop** where books are constructed

---

## Preservation Requirements

**Keep these sections exactly as they are** (content and formatting):

1. The `# Heads up` section at the very top
2. The `# Dedication` section (the two italicized paragraphs)
3. The `# Questions, comments, or rants?` section with the email link

These three MUST remain at the top of the README in their current order, before the main `# Novel Engine` heading.

---

## Analysis Steps

Execute each step fully. Read actual files — do not work from memory.

### Step 1: Domain Layer

Read completely:
- `src/domain/types.ts` — catalog every type, enum, type alias
- `src/domain/interfaces.ts` — catalog every service interface and methods
- `src/domain/constants.ts` — catalog agent definitions, pipeline phases, pricing, defaults

Document: agent names/slugs/models/thinking budgets, pipeline phases and gates, service interfaces, token pricing, enums/union types.

### Step 2: Infrastructure Layer

Read every file in `src/infrastructure/`:
- `settings/SettingsService.ts` — settings managed, CLI detection
- `database/schema.ts` — all tables, columns, indexes
- `database/DatabaseService.ts` — query methods, persisted data
- `agents/AgentService.ts` — agent prompt loading/management
- `filesystem/FileSystemService.ts` — book CRUD, file I/O
- `filesystem/BookWatcher.ts` — file watching
- `filesystem/BooksDirWatcher.ts` — directory watching
- `claude-cli/ClaudeCodeClient.ts` — CLI invocation, streaming, arguments
- `claude-cli/StreamSessionTracker.ts` — stream session management
- `pandoc/index.ts` — Pandoc binary resolution

### Step 3: Application Layer

Read every file in `src/application/`:
- `ChatService.ts` — send/stream/save flow
- `ContextBuilder.ts` — how context is actually assembled (may differ from Wrangler two-call pattern — document what's ACTUALLY implemented)
- `PipelineService.ts` — phase detection logic
- `BuildService.ts` — Pandoc execution, export formats
- `UsageService.ts` — token tracking, cost calculation
- `RevisionQueueService.ts` — revision queue orchestration
- `ChapterValidator.ts` — chapter validation rules
- `context/TokenEstimator.ts` — token counting approach

### Step 4: Main Process

Read:
- `src/main/index.ts` — composition root
- `src/main/bootstrap.ts` — first-run setup
- `src/main/ipc/handlers.ts` — every IPC channel
- `src/main/notifications.ts` — notification system
- `src/preload/index.ts` — preload bridge API

### Step 5: Renderer

Read all stores: `src/renderer/stores/*.ts`

Read all component directories:
- `Layout/`, `Onboarding/`, `Chat/`, `Files/`, `Build/`, `Settings/`, `Sidebar/`
- `RevisionQueue/`, `PitchRoom/`, `CliActivity/`, `ErrorBoundary/`
- `src/renderer/hooks/`, `src/renderer/App.tsx`

### Step 6: Configuration & Build

Read:
- `package.json` — scripts, dependencies, version
- `forge.config.ts`, `tsconfig.json`, Vite configs
- `scripts/` directory

### Step 7: Agent Prompts

Scan `agents/` directory — list all agent files present.

### Step 8: Additional Files

Read: `AGENTS.MD`, `CHAPTER_VALIDATION.md`, `LICENSE`

---

## README Structure

Write the updated README with this structure:

```
# Heads up                          ← preserved exactly
# Dedication                        ← preserved exactly
# Questions, comments, or rants?    ← preserved exactly

# Novel Engine
  [Updated intro — book-building system framing]

## What It Does
  [Pipeline as build process, author as creative authority]

## The Seven Agents
  [Table verified against constants.ts, publishing house roles]

## The Build Pipeline
  [Table verified against PipelineService.ts and constants.ts]

## Key Features
  [Each verified against actual code. Add new, remove phantom.]

## Screenshots
  [If screenshots/ contains images]

## Prerequisites
  [Updated requirements]

## Getting Started
  [Updated from actual scripts and onboarding flow]

## Building for Distribution
  [From forge.config.ts]

## Project Structure
  [Actual src/ tree and userData tree]

## Technology Stack
  [From package.json actual versions]

## Architecture
  [Actual layer structure]

## License
  [Verified]
```

---

## Writing Rules

1. **Build, don't write.** Every description reinforces the book-building metaphor.
2. **Be factual.** Every claim verified against source code.
3. **Discover new features.** Investigate and add if actually implemented: Pitch Room, CLI Activity, Modal Chat, Auto-Draft, Stream routing, File watching, Thinking budget slider, Chapter validation, Notifications, Error boundaries.
4. **Remove phantom features.** If the current README describes something that doesn't exist in code, remove it.
5. **Keep it readable.** Tables, bullets, clear headers. Scannable in 60 seconds.
6. **Don't over-document internals.** High-level architecture, link to AGENTS.md for details.
7. **Accurate code counts.** Count actual `.ts` and `.tsx` files if mentioning size.

---

## Verification Checklist

Before finalizing, verify every item:

- [ ] Every agent listed matches `constants.ts`
- [ ] Every pipeline phase matches actual detection logic
- [ ] Every npm script listed exists in `package.json`
- [ ] Every dependency listed matches `package.json`
- [ ] Every feature described has corresponding source code
- [ ] The src/ tree matches actual file structure
- [ ] The userData directory structure matches FileSystemService behavior
- [ ] The preload bridge API matches what's actually exposed
- [ ] No features are described that don't exist
- [ ] The dedication and heads-up sections are preserved verbatim
- [ ] Links to internal files use correct relative paths

---

## Completion Gate

`README.md` has been rewritten and passes every item on the verification checklist above.

---

## Report to User Before Proceeding

Confirm:
- Number of features added vs removed
- Any significant narrative changes
- The updated technology stack table

Then proceed to SESSION-03.

---

## Update STATE.md

After completion, update STATE.md with:
- SESSION-02 status → `complete`
- SESSION-03 status → `pending` (unblocked)
- Carry-forward context: features added/removed, technology stack updates, narrative changes
