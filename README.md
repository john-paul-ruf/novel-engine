# Dedication
*To everyone who has an idea for a good book but doesn't know how to craft it, this is for you...*

*For everyone else who may be impacted by this work, or whose sensibilities I have offended.*
*I am so sorry.  I just wanted to write my memoir and found out it is easier to write fiction than fact. This is the result.*

# Foreword
Books created in this engine
- [The Last Compiler](https://www.amazon.com/dp/B0GTPJWFQ7)
- [The Lien](https://www.amazon.com/dp/B0GT13J22M)
- [Cleartext](https://www.amazon.com/dp/B0GTN8DRM8)
- [Project Sephirot](https://www.amazon.com/dp/B0GJ6S4N9G)
- [The Recursive Archivist](https://www.amazon.com/dp/B0GTP2KB7Q)
- [Day One](https://www.amazon.com/dp/B0GTQKZQSY)
- [Reset](https://www.amazon.com/dp/B0GT6Z8T7Y)
- [The Empty Orbit](https://www.amazon.com/dp/B0GT2JP9D5)
- [The Keeper's Frequency](https://www.amazon.com/dp/B0GTF4H6F8)
- [Junk Souls](https://www.amazon.com/dp/B0GTMGN843)

I asked Claude and ChatGPT to audit ten books made in the MVP and this product with extended thinking on - [here are the results](https://john-paul-ruf.github.io/novel-engine/evaluation.html)

# Novel Engine

A desktop application for **building novels**, not writing them. Novel Engine is a book-building system — an editorial production pipeline where the human author is the creative authority and seven specialized AI agents serve as the author's professional editorial team.

You bring the story. The agents pitch, scaffold, draft in your voice, read, analyze, plan revisions, copy-edit, and compile your manuscript into export-ready formats. The pipeline is a build process: source material goes in, a production-ready manuscript comes out. "Build" is both metaphor and literal — the final phase assembles chapters via [Pandoc](https://pandoc.org/) into Markdown, DOCX, and EPUB.

Built with Electron, React, and TypeScript, and powered by **your choice of AI backend**: the [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code), the Codex CLI, [Ollama](https://ollama.com/) (fully local, CLI-first), a llama.cpp `llama-server`, or any OpenAI-compatible endpoint. No cloud backend of its own. Everything runs on your machine.

Requires tech skill to use — or grab a pre-built installer from [Releases](https://github.com/john-paul-ruf/novel-engine/releases) if one exists for your platform.

![The Workspace — pipeline spine, Forge planning a revision, and the manuscript companion](screenshots/Screenshot%202026-07-08%20at%203.20.55%E2%80%AFAM.png)
*The Workspace — the 14-phase pipeline spine on the left, Forge planning mechanical fixes in chat, and the revision plan open in the companion pane*

> ### 🧪 Testers Needed!
>
> Pre-built installers are now available on the [Releases](https://github.com/john-paul-ruf/novel-engine/releases) page for **macOS** (.dmg), **Windows** (Squirrel installer), and **Linux** (.deb). These are early builds and **have not been tested on all platforms** — I develop on macOS, so the Windows and Linux installers especially need eyes on them.
>
> If you download an installer and try it out, **please report what happens** — whether it works perfectly, crashes on launch, or anything in between. Open an [issue](https://github.com/john-paul-ruf/novel-engine/issues) or email [john.paul.ruf@gmail.com](mailto:john.paul.ruf@gmail.com?subject=Novel%20Engine%20Installer%20Testing).
>
> Things I'd love feedback on:
> - Does the installer run and complete without errors?
> - Does the app launch after installation?
> - Does the onboarding wizard detect your Claude Code / Codex / Ollama CLI?
> - Can you create a book and chat with an agent?
> - Any UI glitches, missing fonts, or broken layouts?

---

## What It Does

Novel Engine is a workshop for constructing books. It organizes the entire editorial lifecycle into a structured, phase-gated build pipeline, run from a workspace designed around your book: a **Library** bookshelf, a **Workspace** with the pipeline spine and a split chat + companion pane, and a **Manuscript** view where you read — and now directly edit — the draft.

The author drives every creative decision. The agents are your editorial staff — each one a specialist who does their job at the right moment in the build process:

- **Spark** develops the story concept and produces the pitch document
- **Verity** drafts prose in the author's voice (captured through a Voice Profile interview), builds scaffolding documents, and implements revisions — with phase-aware prompt assembly that loads specialized instructions for scaffolding, drafting, revision, and mechanical fixes
- **Ghostlight** reads the manuscript cold and reports the raw reader experience
- **Lumen** runs a deep structural assessment across seven diagnostic lenses
- **Forge** synthesizes all feedback into a prioritized revision task list with session-by-session execution prompts
- **Sable** performs the copy edit — grammar, consistency, mechanical polish
- **Quill** audits the final manuscript and prepares publication metadata

The pipeline takes a book from **pitch → polished manuscript** in 14 structured phases. Each phase has a designated agent, clear inputs and outputs, and a completion gate that the author explicitly confirms before the next phase unlocks.

---

## The Seven Agents

| Agent | Role | What They Do |
|-------|------|--------------|
| **Spark** | Story Pitch | Explores your idea through conversation, then produces a full pitch card — premise, themes, characters, emotional engine, opening hook |
| **Verity** | Ghostwriter | The only agent that writes prose. Drafts chapters using your captured voice profile, builds the scene outline and story bible, implements revision changes. Runs phase-specific sub-prompts (scaffold, draft, revision, mechanical fixes) and integrates with the motif ledger |
| **Ghostlight** | First Reader | Reads the manuscript cold — no notes, no context — and reports the unfiltered reader experience |
| **Lumen** | Developmental Editor | Seven-lens structural analysis: protagonist arc, supporting cast, pacing, scene necessity, theme, narrative logic, and a revision roadmap |
| **Sable** | Copy Editor | Line-level polish: grammar, style consistency, mechanical errors. Produces the audit report and maintains the style sheet |
| **Forge** | Task Master | Synthesizes reader and dev reports into a prioritized, phased revision plan with session prompts for Verity |
| **Quill** | Publisher | Audits build outputs, generates publication metadata — title, description, keywords, BISAC categories, back-cover copy |

Default thinking budgets: Spark 4K, Verity 10K, Ghostlight 6K, Lumen 16K, Sable 4K, Forge 8K, Quill 4K tokens.

Two internal staff members work behind the scenes: a **Wrangler** agent that parses Forge's revision plans into executable session queues, and a **Helper** agent that answers how-do-I questions in-app from the bundled user guide.

Every agent's system prompt is a plain `.md` file in your user data directory (`custom-agents/`) — fully editable. Missing prompts are restored from the bundled copies on startup without overwriting your customizations.

---

## The Build Pipeline

Novel Engine enforces a **14-phase pipeline**. Each phase is a build stage with defined inputs, outputs, and a completion gate. The author confirms each phase before the next unlocks — no automatic advancement.

| # | Phase | Agent | Completes When |
|---|-------|-------|----------------|
| 1 | **Story Pitch** | Spark | `source/pitch.md` exists (≥50 words) |
| 2 | **Story Scaffold** | Verity | `source/scene-outline.md` exists (≥200 words) |
| 3 | **First Draft** | Verity | Chapters with >1,000 total words + book status advanced |
| 4 | **First Read** | Ghostlight | `source/reader-report.md` exists (≥50 words) |
| 5 | **Structural Assessment** | Lumen | `source/dev-report.md` exists (≥50 words) |
| 6 | **Revision Plan** | Forge | `source/project-tasks.md` + `source/revision-prompts.md` exist |
| 7 | **Revision** | Verity | `source/reader-report-v1.md` archived |
| 8 | **Second Read** | Ghostlight | Fresh `reader-report.md` differs from `reader-report-v1.md` |
| 9 | **Second Assessment** | Lumen | Fresh `dev-report.md` differs from `dev-report-v1.md` |
| 10 | **Copy Edit** | Sable | `source/audit-report.md` exists (≥50 words) |
| 11 | **Fix Planning** | Forge | New `project-tasks.md` + `revision-prompts.md` + archived v1 copies |
| 12 | **Mechanical Fixes** | Verity | `audit-report.md` exists + book status ≥ copy-edit |
| 13 | **Build** | — | `dist/{slug}.md` generated |
| 14 | **Publish & Audit** | Quill | `source/metadata.md` exists (≥50 words) |

The pipeline spine in the Workspace shows every phase, its agent, and its status at a glance. Phases support three user actions:
- **Advance →** — confirms a completed phase and unlocks the next
- **Mark done** — manually marks a phase complete
- **Revert** — moves a phase back to active, undoing side effects for status/archive-dependent phases

---

## Screenshots

| | |
|---|---|
| ![Library](screenshots/Screenshot%202026-07-08%20at%203.20.46%E2%80%AFAM.png) | ![Command Palette](screenshots/Screenshot%202026-07-08%20at%203.21.12%E2%80%AFAM.png) |
| *Library — your bookshelf, with pipeline progress per book* | *Command palette (⌘K) — jump to any phase, chapter, or action* |
| ![Manuscript Reader](screenshots/Screenshot%202026-07-08%20at%203.21.28%E2%80%AFAM.png) | ![Manuscript Editor](screenshots/Screenshot%202026-07-08%20at%203.21.31%E2%80%AFAM.png) |
| *Manuscript reader — chapter rail with draft/edited badges* | *Manuscript editor — tracked editing of Verity's draft* |
| ![Providers](screenshots/Screenshot%202026-07-08%20at%203.21.58%E2%80%AFAM.png) | ![Model Selection](screenshots/Screenshot%202026-07-08%20at%203.22.03%E2%80%AFAM.png) |
| *Providers — Claude, Codex, and Ollama CLIs detected* | *Model selection — pick any model from any connected backend* |

---

## Key Features

### Multi-Provider AI Backends

Novel Engine routes every agent call through a provider registry, so the same editorial pipeline runs on whichever AI backend you have:

- **Claude Code CLI** — the flagship path. Full agent mode with file tools, streamed NDJSON, extended thinking
- **Codex CLI** — detected at startup and registered with model discovery; runs in a sandboxed workspace (`codex exec --json --sandbox workspace-write`)
- **Ollama (CLI-first)** — fully local. Novel Engine detects the `ollama` CLI, discovers models from `ollama list`, can start `ollama serve` itself, and drives models through its own built-in agentic tool loop (Read/Write/Edit/LS with path sandboxing) — including proactive context compaction at 80% of the model's window
- **llama-server** — any llama.cpp-compatible OpenAI endpoint, with `<think>` tag parsing for reasoning models like QwQ and DeepSeek-R1
- **OpenAI-compatible endpoints** — bring your own base URL and API key (LM Studio, self-hosted, etc.)

Pick a **primary model** (all agent sessions) and a **secondary model** (fast passes like chapter audits) in Settings — the pickers list exactly the models your installed backends report. For heavy manuscript-wide jobs on backends without large tool budgets, a **multi-call orchestrator** automatically splits the work into batched read passes (~20K words each) with scratch-file handoff and a synthesis call.

### The Streamlined Workspace

The app is organized around five surfaces, reachable from a compact icon rail or the **command palette (⌘K)**:

- **Library** — a bookshelf of cards with cover, status badge, phase progress, and word count; series grouped into their own shelves; New Book / Pitch-with-Spark ghost cards
- **Workspace** — the working surface: pipeline spine, phase header (agent identity, artifact chips, quick actions), and a resizable split pane of chat + companion. The companion pane has five tabs — **Chapter**, **Sources**, **Reports**, **Motifs**, **Explorer** — each with one-click version history
- **Manuscript** — read or edit the draft, chapter by chapter or as the whole book
- **Exports** — build and download your manuscript formats
- **Statistics / Settings** — usage charts and configuration

A persistent status bar shows the live agent task (tool, file, elapsed time) and session token total, with an expandable **activity drawer** for full CLI call details.

### Tracked Chapter Editing

The chapter editor is unlocked — you can write directly in Verity's draft. Every change is tracked against the agent's last version:

- **EDITED badges** in the chapter rail show exactly which chapters carry your edits
- **View my changes** opens a diff of your edits vs. Verity's baseline, with a two-step **discard my edits** revert
- **Verity sees your edits** — on her next session, a capped unified diff of your changes is injected into her context as "Author Edits Since Your Last Draft," so revisions respect your hand
- **Agent-activity guard** — while an agent is working on the book, the editor locks read-only; if a file changes on disk under you, a reload bar appears

### Pitch Room

A free brainstorming space where you explore story ideas with Spark before committing to a book. Each pitch conversation gets its own draft folder. When a concept crystallizes, Spark can:

- **Make it a book** — creates a real book project, copies the pitch, and switches the app to it
- **Shelve it** — saves the pitch to a shelf with a logline for future use
- **Discard it** — deletes the draft and conversation

Shelved pitches can be browsed, previewed, restored to a new book, or deleted from the Pitch Room's rail.

### Voice Profile System

Before Verity writes a single word, you establish a **Voice Profile** — a detailed document capturing your sentence rhythm, vocabulary register, dialogue style, emotional temperature, interiority depth, punctuation habits, structural instincts, tonal anchors, and an avoid list. Verity conducts a guided interview to extract your authentic voice, or analyzes writing samples you provide. The voice profile is stored per-book at `source/voice-profile.md` and loaded into every Verity session.

### Author Profile

A global **Author Profile** — your creative DNA — persists across all books. It captures your genres, influences, recurring themes, process, and aspirations. You can create or refine it through a guided conversation ("Refine with Verity") or edit it manually in Settings.

### Manuscript & Series Import

Import an existing manuscript. The **Import Wizard** accepts `.md`, `.markdown`, `.txt`, or `.docx` files and automatically detects chapter boundaries via heading patterns and "Chapter N" matching. After detection you can rename, merge, or remove chapters and edit title/author metadata. On commit, the wizard creates a full book directory with all chapters as `draft.md` files.

Optionally, trigger **AI-powered source document generation** — four sequential agent calls (Spark for pitch; Verity for outline + story bible, voice profile, and motif ledger) to bring the imported book up to feature parity with natively-created ones.

The **Series Import Wizard** does the same for multiple manuscripts at once: multi-file selection, automatic series-name detection, per-volume rename/reorder/skip, and create-or-attach to a series.

### Context Building

Every agent interaction assembles context deterministically with a token-budget-aware system:

1. **File manifest** — lists all project files with word counts so agents know what's available to read
2. **Per-agent read guidance** — tells each agent which files are required, relevant, or irrelevant to their role
3. **Dynamic conversation compaction** — calculates how much context window remains after the system prompt and response reserve, then keeps as many recent turns as the budget allows (generous: all turns, moderate: 8, tight: 4, critical: 2)

Agents run in full **agent mode** with tool use — they read and write files directly in the book directory (Read, Write, Edit, LS). Per-call context diagnostics (files listed, turns kept/dropped, manifest tokens) are visible in the activity drawer.

### Auto-Draft

The **Auto-Draft** system automates the first-draft phase. One click starts a loop where Verity writes one chapter at a time — reading the scene outline, finding the next unwritten chapter, drafting the full prose, and updating the story bible. The loop continues until every chapter in the outline has a draft or you click Stop.

- **Per-book sessions** — each book can run its own auto-draft loop independently
- **Error resilience** — CLI errors pause the loop; you can resume or stop
- **Safety valve** — hard iteration limit prevents runaway loops
- **Signal-based completion** — Verity signals `DRAFT_COMPLETE` when all chapters are drafted
- **Integrated quality checks** — every chapter runs through the Verity Audit pipeline (audit → fix if needed), and a motif/phrase audit runs every 3 chapters to keep the motif ledger accurate

### Verity Audit Pipeline

An automated quality assurance system that runs after agent interactions and during auto-draft:

- **Audit pass** — a fast audit agent (on your secondary model) scans each chapter for editorial narration, flagged phrases, anti-patterns, voice drift, and continuity errors
- **Fix pass** — if the audit severity reaches "moderate" or "heavy," a targeted fix agent automatically corrects the issues
- **Motif audit** — runs periodically during auto-draft to keep the motif ledger's flagged phrases accurate
- **Non-blocking** — audit/fix results stream to the activity drawer without interrupting the main workflow

### Motif Ledger

A structured tracking system for recurring literary elements across the manuscript:

- **Motif Systems** — named clusters of motifs with arc trajectories
- **Motif Entries** — individual phrases or images tied to characters, with first appearances and occurrence tracking
- **Structural Devices** — narrative techniques (callbacks, parallels, frame structures) with chapter references
- **Foreshadowing Tracker** — planted seeds with expected payoffs and status (planted, paid-off, abandoned)
- **Minor Character Motifs** — per-character motif assignments for the supporting cast
- **Flagged Phrases** — words and constructions to retire, limit, or avoid — with alternatives and per-chapter limits
- **Audit Log** — records of which chapters have been audited and what was found

The ledger is stored as `source/motif-ledger.json` per book and is editable through the **Motifs** companion tab (seven panels). Verity reads the ledger during drafting and revision. Malformed agent-written JSON is automatically normalized via a single model call on load.

### Hot Take

A quick, informal assessment from Ghostlight. One click launches a cold read of the full manuscript — no outline, no notes, no context — and delivers a gut reaction: what grabbed them, what didn't, the biggest problem, and a one-sentence verdict. Runs as a single call on the Claude CLI, or as an automatically batched multi-call read on local backends. No files are written — the response lives in chat only.

### Chapter Deep Dive

Ask Lumen for a scoped craft critique of a single chapter, straight from the chapter rail's context menu — prose rhythm, scene mechanics, and structure for just that chapter, without launching a full assessment phase.

### Direct Feedback

Skip the pipeline and give Forge direct revision instructions. Describe what you want changed in plain language — Forge reads the manuscript, assesses the scope, and generates `project-tasks.md` and `revision-prompts.md` tailored to your feedback.

### Revision Queue

After Forge produces a revision plan, the **Revision Queue** parses it into structured sessions and executes them. A Wrangler agent call parses Forge's output into JSON (cached by content hash so it only re-runs when the plan changes), then each session runs as a Verity conversation. The queue is accessible as a slide-over modal from any view.

Four execution modes:
- **Manual** — you approve each task at approval gates before Verity continues
- **Auto-approve** — run the full queue unattended
- **Auto-skip** — step through gates without executing (review mode)
- **Selective** — choose which sessions to run, skip the rest

Plus: approval gates with approve/reject-with-feedback/skip/retry, task checkboxes ticked in `project-tasks.md` as sessions complete, state persistence across app restarts, a post-queue verification conversation, and automatic detection of the two revision cycles (structural revision and mechanical fixes).

### Extended Thinking

Enable **extended thinking** globally or override it per-message with the **thinking budget slider**. Each agent has a default thinking budget tuned to their task complexity. On the Claude CLI this passes `--effort high`; thinking blocks display in collapsible panels with auto-generated summaries.

### Quick Actions

Each agent has pre-built prompts accessible from a dropdown next to the chat input — common tasks like "Next chapter" for Verity, "Full assessment" for Lumen, or "Create revision plan" for Forge.

### Live Activity Monitor

The status bar shows the current agent task in real time; the expandable **activity drawer** tracks every AI call across the app — chat, auto-draft, hot takes, ad hoc revisions, revision queue sessions, audits, and motif audits. Each call shows the agent, model, progress stage (reading → thinking → drafting → editing → reviewing → complete), tool usage with file paths, token estimates, context diagnostics, and a kill switch.

### Modal Chat

An overlay chat window for scoped conversations — voice setup, author profile refinement, and similar single-purpose sessions — that works from any view, sharing the same stream infrastructure as the main chat.

### File Version History

Every file edit — whether by the author or an agent — is automatically snapshotted with SHA-256 content deduplication. Version history is one click away everywhere prose appears: the Manuscript toolbar and every companion tab open the same **history modal** with:

- **Diff viewer** — structured line-by-line diff between any two versions
- **Revert** — restore any previous version with one click (creates a new `revert` snapshot)
- **Source tracking** — each version tagged as `user`, `agent`, or `revert`
- **Automatic pruning** — keeps the most recent 50 versions per file per book (always preserving the latest agent baseline)

### File Watchers

Two filesystem watchers run in the background:

- **Book Watcher** — monitors the active book's directory for file changes (edits by agents or external tools) and pushes change notifications to the renderer
- **Books Directory Watcher** — monitors the `books/` root for new or removed book folders, automatically refreshing the Library when books are added or deleted from outside the app

### OS Notifications

When an agent finishes responding and the app window is not focused, Novel Engine fires an OS-level notification (macOS, Windows, Linux). Notifications cover chat completions, errors, revision session completions, queue completions, and build completions. Click a notification to bring the window to front. Configurable in Settings.

### Book Management

- **Create** new books with auto-generated copyright pages and pipeline state
- **Archive / unarchive** books to a `_archived/` directory
- **Cover images** — upload JPG/PNG/WebP/GIF covers served via a custom `novel-asset://` protocol
- **Back matter** — add `z`-prefixed back-matter chapters (about the author, acknowledgments) from the chapter rail
- **Slug reconciliation** — automatically renames book folders when titles change
- **Catalog export** — export the entire `books/` directory as a ZIP archive

### Series Bible

Group multiple books into ordered **series** with a shared story bible. Series are file-based (`{userData}/series/{slug}/`), each with a `series.json` manifest and a `series-bible.md` markdown file. The series bible is referenced in all creative agents' context when working on a book that belongs to a series — agents use it for cross-volume continuity.

- **CRUD** — create, rename, delete series from the Series Management modal
- **Volume ordering** — add/remove books, reorder volumes
- **Series Bible editor** — write and edit shared continuity documents
- **Library grouping** — books in a series get their own shelf section

### In-App Helper

A floating **Help & FAQ assistant**, toggled from the icon rail. The Helper agent uses the bundled user guide as its knowledge base and answers questions about features, workflows, agents, and troubleshooting. The conversation persists across book switches and can be reset any time.

### Guided Tours

Three replayable spotlight tours — **Welcome** (main UI areas), **First Book Guide** (pitch → scaffold workflow), and **Pipeline Deep Dive** (all 14 phases) — with keyboard navigation and auto-launch after onboarding. Replay from Settings → Profile.

### Chapter Validation

A validator runs automatically after agent interactions to detect and correct misplaced chapter files — files written to the wrong path or with the wrong name are moved to the correct `chapters/NN-slug/draft.md` layout.

### Writing Statistics

A dedicated **Statistics View** with charts and breakdowns powered by [Recharts](https://recharts.org/):

- **Token usage over time** — daily input/output/thinking token trends
- **Per-agent and per-phase breakdowns** — where the tokens go
- **Word count history** — snapshots recorded over time showing manuscript growth
- **Cost estimates** — approximate API-rate cost
- **Words per chapter** — bar chart of chapter-level word distribution

### Batch Find & Replace

Bulk search-and-replace across all chapter drafts, from the Manuscript view or command palette: literal or regex matching, optional case sensitivity, per-chapter match preview with inline context, selective application, and automatic version snapshots before every modification.

---

## Prerequisites

- **Node.js** 18+ (for building/running from source)
- **At least one AI backend:**
  - [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) — `npm install -g @anthropic-ai/claude-code`, then `claude login` *(recommended)*
  - Codex CLI — detected automatically if installed
  - [Ollama](https://ollama.com/) — fully local; `ollama pull` a tool-capable model
  - A running llama.cpp `llama-server`, or any OpenAI-compatible endpoint
- **Pandoc** (optional) — required for DOCX/EPUB export. Run `npm run download-pandoc` to fetch a platform-specific binary, or install separately

---

## Getting Started

```bash
# Clone the repository
git clone https://github.com/john-paul-ruf/novel-engine.git
cd novel-engine

# Install dependencies
npm install

# (Optional) Download Pandoc binary for manuscript export
npm run download-pandoc

# Start the app in development mode
npm start
```

On first launch the **Onboarding Wizard** walks you through five steps:

1. **Welcome** — introduction
2. **Provider Setup** — auto-detects the Claude Code and Codex CLIs; links to install instructions if not found
3. **Model Selection** — choose a default model from your connected backends
4. **Author Profile** — write or skip your creative DNA document
5. **Ready** — creates your first book or enters the app (and starts the Welcome tour)

---

## Building for Distribution

```bash
# Package the app (no installer)
npm run package

# Create platform installers (DMG, Squirrel, DEB, RPM)
npm run make

# CI build script (used by GitHub Actions)
npm run ci-build
```

Electron Forge handles packaging via [`forge.config.ts`](./forge.config.ts). Bundled resources include the Pandoc binary, all agent `.md` prompt files, and the user guide. macOS code signing and notarization are supported via environment variables (`APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`); Windows signing via `WINDOWS_CERTIFICATE_FILE`/`WINDOWS_CERTIFICATE_PASSWORD`.

---

## Project Structure

### Source Code Architecture

187 TypeScript/TSX files across five clean-architecture layers:

```
src/
├── domain/                              # LAYER 1: Pure types, zero imports
│   ├── types.ts                         # All shared type definitions
│   ├── interfaces.ts                    # Service contracts (ports)
│   ├── constants.ts                     # Agent registry, pipeline phases, providers, pricing
│   ├── statusMessages.ts                # Rotating fun status messages for UI
│   └── index.ts                         # Barrel export
│
├── infrastructure/                      # LAYER 2: Implements domain interfaces
│   ├── settings/                        # Settings persistence, CLI detection (claude/codex/ollama)
│   ├── database/                        # SQLite schema, forward-only migrations, query methods
│   ├── agents/                          # Loads agent .md prompts, composite prompt assembly
│   ├── filesystem/                      # Book CRUD, pitches, covers, archiving + two watchers
│   ├── claude-cli/                      # Claude CLI wrapper: NDJSON streaming, session tracking
│   ├── codex-cli/                       # Codex CLI wrapper: sandboxed exec, add-dir detection
│   ├── ollama-cli/                      # Ollama runner + agentic tool loop + context compactor
│   ├── llama-server/                    # llama.cpp client: SSE, <think> parsing, tool calls
│   ├── providers/                       # Provider registry + OpenAI-compatible provider
│   ├── series/                          # Series CRUD, volume management, series bible I/O
│   └── pandoc/                          # Pandoc binary path resolution
│
├── application/                         # LAYER 3: Business logic via injected interfaces
│   ├── ChatService.ts                   # Send → route → stream → save orchestration + deep dive
│   ├── ContextBuilder.ts                # Budget-aware context assembly with compaction
│   ├── MultiCallOrchestrator.ts         # Batched multi-call runs for heavy agents
│   ├── PipelineService.ts               # Phase detection with user confirmation gates
│   ├── BuildService.ts                  # Pandoc execution for DOCX/EPUB
│   ├── RevisionQueueService.ts          # Plan parsing, session execution, approval gates
│   ├── AuditService.ts                  # Verity audit/fix pipeline, motif audit
│   ├── VersionService.ts                # Snapshots, diffs, revert, author-edit baselines
│   ├── HotTakeService.ts / AdhocRevisionService.ts / PitchRoomService.ts / HelperService.ts
│   ├── ManuscriptImportService.ts / SeriesImportService.ts / SourceGenerationService.ts
│   ├── MotifLedgerService.ts / ChapterValidator.ts / FindReplaceService.ts
│   ├── DashboardService.ts / StatisticsService.ts / StreamManager.ts / UsageService.ts
│   ├── thinkingBudget.ts                # Thinking budget resolution logic
│   ├── context/TokenEstimator.ts        # ~4 chars/token estimation
│   └── import/ChapterDetector.ts        # Chapter boundary detection for import
│
├── main/                                # LAYER 4: Electron main process
│   ├── index.ts                         # Composition root — instantiates everything
│   ├── bootstrap.ts                     # First-run directory/file creation
│   ├── notifications.ts                 # OS notification manager
│   └── ipc/handlers.ts                  # Thin adapter: IPC channel → service call
│
├── preload/
│   └── index.ts                         # contextBridge: typed window.novelEngine API
│
└── renderer/                            # LAYER 5: React UI
    ├── App.tsx / main.tsx               # Root component (onboarding gate), React 18 entry
    ├── stores/                          # 25 Zustand stores (view, book, chat, workspace,
    │                                    #   palette, pipeline, revision queue, versions, ...)
    ├── components/
    │   ├── Library/                     # Bookshelf cards + series shelves
    │   ├── Workbench/                   # Workspace: split pane, phase header, companion tabs
    │   ├── PipelineSpine/               # The 14-phase pipeline rail
    │   ├── Manuscript/                  # Chapter rail, reader/editor, tracked-edit diff modal
    │   ├── Palette/                     # Command palette (⌘K)
    │   ├── Rail/ · StatusBar/           # Icon rail, status bar + activity drawer
    │   ├── Chat/ · Exports/ · Files/    # Chat UI, exports view, file browser/editor/history
    │   ├── PitchRoom/ · Series/         # Pitch room, series management
    │   ├── MotifLedger/ · RevisionQueue/
    │   ├── Import/ · Onboarding/ · Settings/ · Statistics/
    │   ├── CliActivity/ · Helper/ · ErrorBoundary/ · common/
    │   └── Layout/                      # AppLayout, TitleBar
    ├── hooks/                           # Theme, resize, tooltips, deep dive, queue events
    ├── tours/                           # Welcome, first-book, pipeline-intro tour steps
    └── styles/globals.css               # Tailwind v4 + typography tokens
```

### User Data Directory

All user data lives outside the app bundle, in the OS user data path (`~/Library/Application Support/Novel Engine` on macOS):

```
{userData}/
├── .initialized                  # Bootstrap completion flag
├── settings.json                 # App preferences (including provider configs)
├── active-book.json              # { "book": "slug-name" }
├── author-profile.md             # Global author profile (all books)
├── USER_GUIDE.md                 # Bundled user guide (Helper agent knowledge base)
├── novel-engine.db               # SQLite database (conversations, messages, usage,
│                                 #   streams, file versions, word-count snapshots)
├── custom-agents/                # Editable agent .md prompts — customize any agent;
│                                 #   missing files restored from bundled copies on startup
├── series/
│   └── {slug}/
│       ├── series.json           # { name, slug, description, volumes, ... }
│       └── series-bible.md       # Shared continuity document
└── books/
    ├── _archived/{slug}/         # Archived books
    ├── _pitches/{slug}.md        # Shelved pitch files
    ├── __pitch-room__/           # Pitch Room draft workspace
    │   └── drafts/{conversationId}/source/pitch.md
    └── {slug}/
        ├── about.json            # { title, author, status, created, coverImage }
        ├── cover.{jpg,png,...}   # Cover image (optional)
        ├── pipeline-state.json   # Confirmed pipeline phases
        ├── source/
        │   ├── pitch.md · scene-outline.md · story-bible.md · voice-profile.md
        │   ├── reader-report.md · dev-report.md · audit-report.md · style-sheet.md
        │   ├── project-tasks.md · revision-prompts.md · metadata.md   (+ -v1 archives)
        │   ├── motif-ledger.json
        │   ├── revision-plan-cache.json · revision-queue-state.json
        │   └── .scratch/         # Multi-call batch trackers
        ├── chapters/
        │   ├── 00-0-copyright/draft.md    # Auto-generated
        │   ├── 00-1-dedication/draft.md
        │   ├── NN-slug/{draft.md, notes.md}
        │   └── zN-slug/                   # Back matter
        ├── assets/
        └── dist/                 # Build outputs (md, docx, epub)
```

---

## Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Shell | [Electron](https://www.electronjs.org/) via [Electron Forge](https://www.electronforge.io/) | 33.4 / 7.11 |
| Bundler | [Vite](https://vitejs.dev/) (Forge plugin) | 5.x |
| UI | [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) | 18.3 / ~5.5 |
| Styling | [Tailwind CSS](https://tailwindcss.com/) + [Typography plugin](https://github.com/tailwindlabs/tailwindcss-typography) | 4.x |
| Typography | [Fraunces](https://fontsource.org/fonts/fraunces) · Inter · JetBrains Mono (Fontsource) | 5.x |
| State | [Zustand](https://zustand-demo.pmnd.rs/) | 5.x |
| Database | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | 11.x |
| AI Backends | Claude Code CLI · Codex CLI · Ollama · llama-server · OpenAI-compatible | (spawned / fetched) |
| HTTP client | [undici](https://undici.nodejs.org/) (no-timeout streaming for local models) | 7.x |
| Manuscript Export | [Pandoc](https://pandoc.org/) (bundled binary) | 3.6.4 |
| Charts | [Recharts](https://recharts.org/) | 3.x |
| Diffing | [diff](https://github.com/kpdecker/jsdiff) | 8.x |
| Markdown Rendering | [marked](https://marked.js.org/) | 15.x |
| Archive Export | [archiver](https://www.archiverjs.com/) | 7.x |
| IDs | [nanoid](https://github.com/ai/nanoid) | 3.x |
| IPC | Electron `contextBridge` + `ipcMain`/`ipcRenderer` | — |

---

## Architecture

Novel Engine follows **Clean Architecture** with five strict layers:

```
DOMAIN ← INFRASTRUCTURE ← APPLICATION ← IPC/MAIN ← RENDERER
```

- **Domain** ([`src/domain/`](./src/domain/)) — Pure TypeScript types, interfaces, and constants. Zero imports. Every other layer depends on this.
- **Infrastructure** ([`src/infrastructure/`](./src/infrastructure/)) — Concrete implementations: SQLite database with forward-only migrations, filesystem I/O with watchers, four AI-backend clients (Claude CLI, Codex CLI, Ollama, llama-server) plus an OpenAI-compatible provider, a central provider registry, series storage, settings persistence, Pandoc resolution.
- **Application** ([`src/application/`](./src/application/)) — Business logic orchestrating infrastructure through injected interfaces — chat routing, context building, multi-call orchestration, pipeline detection, builds, audits, revision queue, version history, imports, statistics.
- **Main/IPC** ([`src/main/`](./src/main/)) — Electron entry point (composition root), thin IPC handlers, first-run bootstrap, OS notifications.
- **Renderer** ([`src/renderer/`](./src/renderer/)) — React components and 25 Zustand stores. Communicates with the backend exclusively through `window.novelEngine` (the preload bridge). May import domain types but never values.

All services are constructor-injected. The only place concrete classes are instantiated is [`src/main/index.ts`](./src/main/index.ts). Full layer-by-layer documentation lives in [`docs/architecture/`](./docs/architecture/ARCHITECTURE.md).

### Database Schema

Eight SQLite tables (WAL mode, foreign keys enabled, forward-only migrations):

| Table | Purpose |
|-------|---------|
| `conversations` | Tracks all agent conversations per book — agent, phase, purpose, timestamps |
| `messages` | Individual messages with role, content, and thinking block text |
| `token_usage` | Per-call token counts (input, output, thinking) by model |
| `stream_events` | Persisted stream events for session replay and recovery |
| `stream_sessions` | Tracks AI invocations for orphan detection and recovery |
| `file_versions` | Content snapshots with SHA-256 dedup for version history and revert |
| `word_count_snapshots` | Word-count history powering the statistics charts |
| `schema_version` | Migration tracking — records which schema migrations have been applied |

---

## License

[AGPL-3.0-only](LICENSE)
