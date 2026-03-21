# Dedication

*To everyone who has an idea for a good book but doesn't know how to craft it, this is for you...*

*For everyone else who may be impacted by this work, or whose sensibilities I have offended.*  
*I am so sorry.  I just wanted to write my memoir and found out it is easier to write fiction than fact. This is the result*

# Questions, comments, or rants?
[john.paul.ruf@gmail.com](mailto:john.paul.ruf@gmail.com?subject=Novel%20Engine)


# Novel Engine

A standalone desktop application for AI-assisted novel writing. Novel Engine orchestrates **seven specialized AI agents** through a structured, editorial publishing pipeline — from first idea to polished manuscript ready for export.

Built with Electron, React, TypeScript, and powered entirely by the [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code). No API keys. No cloud backend. Everything runs on your machine.

Requires tech skill to use.  One day there will be installers...

---

## What It Does

Novel Engine replaces a scattered multi-script writing system with a single, unified desktop app. You write; the agents edit, analyze, revise, copy-edit, and help you prepare for publication — each in their specific role, at the right moment.

The pipeline takes a book from **blank page → published-ready manuscript** in 14 structured phases. Each phase has a designated agent, a clear goal, and a completion gate before the next phase unlocks.

---

## The Seven Agents

| Agent | Role | What It Does |
|-------|------|--------------|
| **Spark** | Story Pitch | Develops your initial idea into a full pitch document — premise, themes, characters, and shape of the story |
| **Verity** | Ghostwriter | The only agent that writes prose. Drafts chapters using your voice profile, revises on command, implements copy fixes |
| **Ghostlight** | First Reader | Reads the manuscript cold — no context, no notes — and reports the raw reader experience |
| **Lumen** | Developmental Editor | Deep structural analysis: pacing, character arcs, theme, narrative logic. Produces the dev report |
| **Sable** | Copy Editor | Line-level polish: grammar, style consistency, mechanical errors, prose rhythm |
| **Forge** | Task Master | Synthesizes all reports into an actionable revision task list and session-by-session execution plan |
| **Quill** | Publisher | Audits the final manuscript, prepares metadata, and readies the book for publication |

---

## The Publishing Pipeline

Novel Engine enforces a **14-phase pipeline** — each phase must complete before the next unlocks. You can see the pipeline status at a glance in the sidebar.

| Phase | Agent | Completes When |
|-------|-------|----------------|
| **Story Pitch** | Spark | `source/pitch.md` written |
| **Story Scaffold** | Verity | `source/scene-outline.md` written |
| **First Draft** | Verity | Chapters written, >1,000 total words |
| **First Read** | Ghostlight | `source/reader-report.md` written |
| **Structural Assessment** | Lumen | `source/dev-report.md` written |
| **Revision Plan** | Forge | `source/project-tasks.md` written |
| **Revision** | Verity | `source/reader-report-v1.md` archived |
| **Second Read** | Ghostlight | Both `reader-report.md` + `reader-report-v1.md` exist |
| **Second Assessment** | Lumen | `source/dev-report-v1.md` written |
| **Copy Edit** | Sable | `source/audit-report.md` written |
| **Fix Planning** | Forge | `source/revision-prompts.md` + `source/audit-report.md` exist |
| **Mechanical Fixes** | Verity | Implements copy-level fixes session by session |
| **Build** | — | `dist/output.md` generated |
| **Publish & Audit** | Quill | `source/metadata.md` written |

---

## Key Features

### Voice Profile System
Before Verity writes a single word, you establish a **Voice Profile** — a detailed document capturing your sentence rhythm, vocabulary register, dialogue style, emotional temperature, and more. Verity conducts a guided interview (four prompts, one at a time) to extract your authentic voice, or analyzes writing samples you provide. The voice profile is stored per-book and loaded into every Verity session.

### Author Profile
A global **Author Profile** — your creative DNA — persists across all books. It captures your genres, influences, recurring themes, process, and aspirations. Quill and Spark use it for consistent creative direction.

### Context Wrangler (The Two-Call Pattern)
Every agent interaction uses an intelligent two-call pattern:

1. **Wrangler call** (fast, cheap, Sonnet) — reads the file manifest, conversation history, and token budget, then produces a plan: which files to include, which chapters to load, whether to summarize old conversation turns
2. **Agent call** (the real work) — runs with precisely the right context, nothing more

This keeps every call under the 200K token context window and ensures agents always have what they need without wasting tokens on irrelevant content.

### Revision Queue
After Forge produces a revision plan, the **Revision Queue** executes it automatically — session by session, chapter by chapter. Four execution modes:

- **Manual** — you approve each session output before Verity moves to the next
- **Auto-approve** — run the full queue unattended
- **Auto-skip** — step through without executing (review mode)
- **Selective** — approve some sessions, skip others

Approval gates appear inline. You can reject a session and retry, or skip it and continue.

### Extended Thinking
Enable **extended thinking** per agent to give Claude space to reason through complex structural problems before responding. Each agent has a default thinking budget tuned to their task complexity — Lumen gets 16K tokens, Sable gets 4K.

### Agent Output Persistence
Every agent response can be saved to its canonical project file with one click. Verity outputs a "Save as Draft" button; Ghostlight saves to `reader-report.md`; Forge saves to `project-tasks.md`. Multi-target saves appear for phases with multiple outputs (e.g., scaffold phase saves both scene outline and story bible separately).

### Build & Export
The **Build** phase uses a bundled [Pandoc](https://pandoc.org/) binary to assemble all chapters and export your manuscript in:

- **Markdown** (`.md`) — concatenated chapters with front matter
- **DOCX** (`.docx`) — Word-compatible with proper styling
- **EPUB** (`.epub`) — e-reader ready
- **PDF** (`.pdf`) — print-ready via LaTeX

After building, use "Download All" to export a zip of all formats.

### File Viewer
A read-only markdown viewer for every project file. Browse your chapters, reports, outlines, and source documents with full markdown rendering. The `about.json` card (title and author) is inline-editable directly.

### Usage Tracking
Every Claude CLI call records input, output, and thinking token counts. The app tracks cumulative costs across conversations using real per-million-token pricing (Opus 4: $15/$75, Sonnet 4: $3/$15).

### Multi-Book Support
Manage multiple books simultaneously. Each book has its own isolated directory, conversation history, pipeline state, and word count. Switch between them from the sidebar.

### Chapter Validation
Chapters are validated for structural consistency — the validator checks for missing chapters in the sequence, oversized/undersized chapters, and orphaned files.

---

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) — installed, authenticated, and on your `$PATH`
- npm 9+

> **No API key needed.** Novel Engine delegates all AI calls to the Claude Code CLI, which handles its own authentication through your Anthropic subscription.

---

## Getting Started

```bash
# Install dependencies
npm install

# Download the bundled Pandoc binary
npm run download-pandoc

# Start in development mode
npm start
```

The first run launches the **Onboarding Wizard**, which:
1. Verifies the Claude Code CLI is installed and authenticated
2. Collects your name and preferred default model
3. Helps you set up your Author Profile
4. Creates your first book project

---

## Building for Distribution

```bash
# Package (no installer — just the .app / .exe)
npm run package

# Create platform-specific installers
npm run make
```

Outputs land in `out/`. Supported platforms:
- **macOS** — `.dmg` via `@electron-forge/maker-dmg`
- **Windows** — Squirrel installer via `@electron-forge/maker-squirrel`
- **Linux** — `.deb` and `.rpm` via their respective makers + `.zip`

---

## Project Structure (Where Files Live)

Novel Engine stores all user data outside the app bundle, in the OS user data directory (`~/Library/Application Support/Novel Engine` on macOS):

```
{userData}/
├── active-book.json          # Pointer to the currently active book slug
├── author-profile.md         # Global author profile (all books)
├── books/
│   └── {slug}/
│       ├── about.json        # { title, author, status, created, coverImage }
│       ├── source/
│       │   ├── pitch.md
│       │   ├── scene-outline.md
│       │   ├── story-bible.md
│       │   ├── voice-profile.md
│       │   ├── style-sheet.md
│       │   ├── reader-report.md
│       │   ├── dev-report.md
│       │   ├── audit-report.md
│       │   ├── revision-prompts.md
│       │   ├── project-tasks.md
│       │   └── metadata.md
│       ├── chapters/
│       │   └── NN-slug/
│       │       ├── draft.md  # The prose (Verity writes here)
│       │       └── notes.md  # Author annotations
│       └── dist/             # Build outputs (md, docx, epub, pdf)
└── custom-agents/
    ├── SPARK.md
    ├── VERITY.md
    ├── GHOSTLIGHT.md
    ├── LUMEN.md
    ├── SABLE.md
    ├── FORGE.MD
    ├── Quill.md
    └── WRANGLER.md
```

Agent system prompts live in `custom-agents/` and are fully editable — customize any agent's behavior by modifying its `.md` file.

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Shell | [Electron 33](https://www.electronjs.org/) via [Electron Forge](https://www.electronforge.io/) |
| Bundler | [Vite 5](https://vitejs.dev/) (Forge plugin) |
| UI | [React 18](https://react.dev/), [TypeScript 5](https://www.typescriptlang.org/), [Tailwind CSS v4](https://tailwindcss.com/) |
| State | [Zustand 5](https://zustand-demo.pmnd.rs/) |
| Database | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (conversation + usage history) |
| AI Backend | [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) (spawned as child process) |
| Markdown Export | [Pandoc](https://pandoc.org/) (bundled binary) |
| IDs | [nanoid](https://github.com/ai/nanoid) |
| Markdown Rendering | [marked](https://marked.js.org/) |
| IPC | Electron `contextBridge` + `ipcMain`/`ipcRenderer` |

---

## Architecture

Novel Engine follows **Clean Architecture** with five strict layers:

```
DOMAIN ← INFRASTRUCTURE ← APPLICATION ← IPC/MAIN ← RENDERER
```

- **Domain** (`src/domain/`) — Pure TypeScript types, interfaces, and constants. Zero imports. Every other layer depends on this.
- **Infrastructure** (`src/infrastructure/`) — Concrete implementations: SQLite database, filesystem I/O, Claude CLI wrapper, Pandoc runner, settings persistence.
- **Application** (`src/application/`) — Business logic orchestrating infrastructure through injected interfaces: ChatService, PipelineService, BuildService, ContextWrangler, RevisionQueueService, UsageService.
- **Main/IPC** (`src/main/`) — Electron entry point (composition root), IPC handlers (thin one-liner delegations), first-run bootstrap.
- **Renderer** (`src/renderer/`) — React components, Zustand stores, hooks. Communicates with the backend exclusively through `window.novelEngine` (the preload bridge). May import domain types but never values.

All services are constructor-injected. The only place concrete classes are instantiated is `src/main/index.ts`.

See [`prompts/00-MASTER-GUIDE.md`](./prompts/00-MASTER-GUIDE.md) for the full architecture documentation and the 21-session build log.

---

## License

[AGPL-3.0-only](LICENSE)

