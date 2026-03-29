# README Deep Update Prompt

## Objective

Perform a comprehensive analysis of the entire Novel Engine repository and rewrite the `README.md` to accurately reflect the **current state** of the codebase. The README must be factual — every feature, file, component, and capability mentioned must be verified against actual source code.

---

## Core Narrative: "Build Books, Not Write Them"

The README must communicate a critical distinction: **Novel Engine doesn't write books — it builds them.**

This is not an AI ghostwriting tool. It's a **book-building system** — an editorial production pipeline where the human author is the creative authority and seven specialized AI agents serve as the author's professional editorial team. The metaphor is construction, not dictation:

- **The author writes.** The agents edit, analyze, assess, plan, and polish.
- **Verity** (the ghostwriter) drafts prose, but only in the author's voice — captured through a detailed Voice Profile interview. Verity is a craftsperson executing the author's vision, not an autonomous creator.
- **The pipeline is a build process.** Like compiling software, building a book means taking raw creative material through structured phases — pitching, scaffolding, drafting, reading, assessing, revising, copy-editing, and exporting — each with clear inputs, outputs, and completion gates.
- **"Build" is literal.** The final phase literally compiles chapters into exportable formats (Markdown, DOCX, EPUB, PDF) via Pandoc. The whole app mirrors a build system: source files in, polished manuscript out.

### Language Guidance

Use this framing throughout the README:
- Say **"build a novel"** not "write a novel"
- Say **"editorial pipeline"** not "writing assistant"
- Say **"the author's editorial team"** not "AI writers"
- Say **"production-ready manuscript"** not "AI-generated content"
- Frame agents as **roles in a publishing house** — first reader, developmental editor, copy editor, task master — not as AI chatbots
- Emphasize the **structured, phase-gated process** — this isn't freeform chat with an LLM, it's a disciplined build pipeline
- The app is a **workshop** where books are constructed, not a magic wand that produces them

---

## Preservation Requirements

**Keep these sections exactly as they are** (content and formatting):

1. The `# Heads up` section at the very top
2. The `# Dedication` section (the two italicized paragraphs)
3. The `# Questions, comments, or rants?` section with the email link

These three sections MUST remain at the top of the README in their current order, before the main `# Novel Engine` heading.

---

## Analysis Steps

### Step 1: Domain Layer Analysis
Read these files completely:
- `src/domain/types.ts` — catalog every type, enum, and type alias
- `src/domain/interfaces.ts` — catalog every service interface and its methods
- `src/domain/constants.ts` — catalog agent definitions, pipeline phases, pricing, defaults

Document:
- All agent names, slugs, models, and thinking budgets
- All pipeline phases and their completion gates
- All service interfaces and what they expose
- Token pricing constants
- Any enums or union types that define app behavior

### Step 2: Infrastructure Layer Analysis
Read every file in `src/infrastructure/`:
- `settings/SettingsService.ts` — what settings are managed, CLI detection logic
- `database/schema.ts` — all tables, columns, indexes
- `database/DatabaseService.ts` — all query methods, what data is persisted
- `agents/AgentService.ts` — how agent prompts are loaded/managed
- `filesystem/FileSystemService.ts` — book CRUD, file I/O, directory structure
- `filesystem/BookWatcher.ts` — what file watching is implemented
- `filesystem/BooksDirWatcher.ts` — what directory watching is implemented
- `claude-cli/ClaudeCodeClient.ts` — CLI invocation, streaming, argument construction
- `claude-cli/StreamSessionTracker.ts` — stream session management
- `pandoc/index.ts` — Pandoc binary resolution

Document:
- Actual database schema (tables and their purposes)
- All file system operations supported
- How the Claude CLI is actually invoked (flags, streaming protocol)
- What file watchers exist and what they monitor

### Step 3: Application Layer Analysis
Read every file in `src/application/`:
- `ChatService.ts` — the full send/stream/save flow
- `ContextBuilder.ts` — how context is actually assembled (note: this may differ from the Wrangler two-call pattern described in AGENTS.md — document what's ACTUALLY implemented)
- `PipelineService.ts` — phase detection logic
- `BuildService.ts` — Pandoc execution, export formats
- `UsageService.ts` — token tracking, cost calculation
- `RevisionQueueService.ts` — revision queue orchestration
- `ChapterValidator.ts` — chapter validation rules
- `context/TokenEstimator.ts` — token counting approach

Document:
- Whether the Context Wrangler two-call pattern is implemented, or if a simpler ContextBuilder is used
- Exact revision queue capabilities and execution modes
- Build output formats actually supported
- Pipeline phase detection — verify against constants

### Step 4: Main Process Analysis
Read:
- `src/main/index.ts` — composition root, all services instantiated, window creation
- `src/main/bootstrap.ts` — first-run setup logic
- `src/main/ipc/handlers.ts` — every IPC channel registered
- `src/main/notifications.ts` — notification system
- `src/preload/index.ts` — the complete preload bridge API

Document:
- Every IPC channel and what it does
- The full preload bridge API surface (this IS the renderer's interface to the backend)
- Bootstrap/first-run behavior
- Window configuration (size, frame, etc.)

### Step 5: Renderer Analysis
Read all stores:
- `src/renderer/stores/*.ts` — every store, its state shape, and actions

Read all components (at minimum scan each file):
- `src/renderer/components/Layout/` — app shell structure
- `src/renderer/components/Onboarding/` — onboarding wizard flow
- `src/renderer/components/Chat/` — chat UI, streaming, thinking blocks
- `src/renderer/components/Files/` — file browser, editor, structured browser
- `src/renderer/components/Build/` — build UI
- `src/renderer/components/Settings/` — settings panel
- `src/renderer/components/Sidebar/` — sidebar widgets
- `src/renderer/components/RevisionQueue/` — revision queue UI
- `src/renderer/components/PitchRoom/` — pitch room feature
- `src/renderer/components/CliActivity/` — CLI activity monitoring
- `src/renderer/components/ErrorBoundary/` — error handling
- `src/renderer/hooks/` — custom hooks
- `src/renderer/App.tsx` — root component, routing/view logic

Document:
- All views/screens available in the app
- All sidebar widgets and what they show
- Features visible in the UI that aren't in the current README (e.g., PitchRoom, CliActivity, shelved pitches, modal chat, auto-draft, stream routing, file change tracking)
- The actual onboarding flow steps

### Step 6: Configuration & Build Analysis
Read:
- `package.json` — scripts, dependencies, version
- `forge.config.ts` — Electron Forge configuration
- `tsconfig.json` — TypeScript configuration, path aliases
- `vite.main.config.ts`, `vite.preload.config.ts`, `vite.renderer.config.ts` — Vite configs
- `scripts/` directory — utility scripts (download-pandoc, generate-icons, etc.)

Document:
- All npm scripts and their purposes
- Actual dependency versions
- Build/packaging configuration
- Any utility scripts

### Step 7: Agent Prompts Analysis
Scan the `agents/` directory:
- List all agent files present
- Note: Don't reproduce agent prompts, just confirm which agents exist

### Step 8: Additional Files
Read:
- `AGENTS.MD` — the architect role definition
- `CHAPTER_VALIDATION.md` — validation rules
- `LICENSE` — confirm license type

---

## README Structure

Write the updated README with this structure:

```
# Heads up                          ← preserved exactly
# Dedication                        ← preserved exactly
# Questions, comments, or rants?    ← preserved exactly

# Novel Engine
  [Updated intro paragraph — frame as a book-building system, not a writing tool.
   Lead with what makes it different: structured editorial pipeline, seven specialist agents,
   the author stays in creative control. "Build" is both metaphor and literal — the final
   phase compiles the manuscript via Pandoc.]

---

## What It Does
  [Updated based on actual capabilities. Frame the pipeline as a build process:
   source material → structured phases → production-ready manuscript.
   Emphasize the author's role as creative authority and the agents as editorial staff.]

---

## The Seven Agents
  [Table — verified against constants.ts.
   Frame each agent as a role in a publishing house, not an AI chatbot.
   Describe what editorial function they serve in the build process.]

---

## The Build Pipeline
  [Table — verified against PipelineService.ts and constants.ts.
   Consider renaming from "Publishing Pipeline" to "Build Pipeline" to reinforce
   the build metaphor. Each phase is a build stage with inputs, outputs, and gates.]

---

## Key Features
  [Each feature verified against actual code]
  - Only include features that are ACTUALLY IMPLEMENTED
  - Add any NEW features found that aren't in current README
  - Remove any features described that don't exist in code

---

## Screenshots
  [Placeholder section if assets/ contains screenshots, skip if not]

---

## Prerequisites
  [Updated requirements]

---

## Getting Started
  [Updated based on actual scripts and onboarding flow]

---

## Building for Distribution
  [Updated based on forge.config.ts]

---

## Project Structure
  ### Source Code Architecture
  [Updated src/ tree reflecting actual files]

  ### User Data Directory
  [Updated userData tree]

---

## Technology Stack
  [Table — verified against package.json actual versions]

---

## Architecture
  [Updated based on actual layer structure]

---

## License
  [Verified]
```

---

## Writing Guidelines

1. **Build, don't write.** Every description must reinforce that Novel Engine is a book-building system, not a writing tool. The author brings the creative vision; the app provides a professional editorial pipeline to construct a polished manuscript from that vision. Avoid any language that implies the AI is the author. The AI agents are specialized editorial staff — readers, editors, planners, copy editors — not ghost authors. Even Verity, the ghostwriter agent, operates strictly within the author's established voice profile and under the author's direction.

2. **Be factual.** Every claim must be verified against source code. If a feature is partially implemented, say so. If it's fully working, describe what it does.

3. **Discover new features.** The current README was written early in development. The codebase likely has features not mentioned:
   - Pitch Room / Shelved Pitches
   - CLI Activity monitoring
   - Modal Chat
   - Auto-Draft system
   - Stream routing
   - File change detection/watching
   - Book directory watching
   - Thinking budget slider
   - Chapter validation
   - Notifications system
   - Error boundaries

   Investigate each of these and add them to the README if they're real, implemented features.

4. **Remove phantom features.** If the current README describes something that doesn't exist in code, remove it.

5. **Keep it readable.** Use tables, bullet points, and clear section headers. The README should be scannable — someone should understand what Novel Engine is and what it *builds* within 60 seconds of reading.

6. **Don't over-document internals.** The README is for users and potential contributors. Mention the architecture at a high level, but don't reproduce the full AGENTS.md content. Link to it instead.

7. **Accurate code counts.** If you want to mention the size of the codebase, count actual `.ts` and `.tsx` files.

8. **Use build/construction metaphors consistently.** The pipeline has phases, gates, and outputs — like a CI/CD system for prose. Source files go in, a manuscript comes out. Lean into this framing.

---

## Verification Checklist

Before finalizing, verify:
- [ ] Every agent listed matches `constants.ts`
- [ ] Every pipeline phase matches the actual detection logic
- [ ] Every npm script listed actually exists in `package.json`
- [ ] Every dependency listed matches `package.json`
- [ ] Every feature described has corresponding source code
- [ ] The src/ tree matches the actual file structure
- [ ] The userData directory structure matches FileSystemService behavior
- [ ] The preload bridge API matches what's actually exposed
- [ ] No features are described that don't exist
- [ ] The dedication and heads-up sections are preserved verbatim
- [ ] Links to internal files use correct relative paths
