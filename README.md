# Dedication
# Dedication
*To everyone who has an idea for a good book but doesn't know how to craft it, this is for you...*

*For everyone else who may be impacted by this work, or whose sensibilities I have offended.*
*I am so sorry.  I just wanted to write my memoir and found out it is easier to write fiction than fact. This is the result.*

# Book created in this engine
- [Cleartext](https://www.amazon.com/dp/B0GTN8DRM8)
- [Junk Souls](https://www.amazon.com/dp/B0GTMGN843)
- [Day One](https://www.amazon.com/dp/B0GTQKZQSY)
- [The Last Compiler](https://www.amazon.com/dp/B0GTPJWFQ7)
- [The Recursive Archivist](https://www.amazon.com/dp/B0GTP2KB7Q)


I asked Claude and ChatGPT to audit ten books made in the MVP and this product with extended thinking on, [here are the results](https://john-paul-ruf.github.io/novel-engine/)

# Novel Engine

A desktop application for **building novels**, not writing them. Novel Engine is a book-building system — an editorial production pipeline where the human author is the creative authority and seven specialized AI agents serve as the author's professional editorial team.

You bring the story. The agents pitch, scaffold, draft in your voice, read, analyze, plan revisions, copy-edit, and compile your manuscript into export-ready formats. The pipeline is a build process: source material goes in, a production-ready manuscript comes out. "Build" is both metaphor and literal — the final phase assembles chapters via [Pandoc](https://pandoc.org/) into Markdown, DOCX, and EPUB.

Built with Electron, React, TypeScript, and powered by the [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) — with extensible multi-model provider support for OpenAI-compatible endpoints. No cloud backend. Everything runs on your machine.

Requires tech skill to use — or grab a pre-built installer from [Releases](https://github.com/john-paul-ruf/novel-engine/releases) if one exists for your platform.

> ### 🧪 Testers Needed!
>
> Pre-built installers are now available on the [Releases](https://github.com/john-paul-ruf/novel-engine/releases) page for **macOS** (.dmg), **Windows** (Squirrel installer), and **Linux** (.deb). These are early builds and **have not been tested on all platforms** — I develop on macOS, so the Windows and Linux installers especially need eyes on them.
>
> If you download an installer and try it out, **please report what happens** — whether it works perfectly, crashes on launch, or anything in between. Open an [issue](https://github.com/john-paul-ruf/novel-engine/issues) or email [john.paul.ruf@gmail.com](mailto:john.paul.ruf@gmail.com?subject=Novel%20Engine%20Installer%20Testing).
>
> Things I'd love feedback on:
> - Does the installer run and complete without errors?
> - Does the app launch after installation?
> - Does the onboarding wizard detect your Claude Code CLI?
> - Can you create a book and chat with an agent?
> - Any UI glitches, missing fonts, or broken layouts?

<p align="center">
  <img src="screenshots/first-draft.png" alt="Verity ghostwriting a first draft with Auto Draft, pipeline tracker, and CLI Activity monitor" width="800" />
  <br />
  <em>Verity ghostwriting Chapter 21 during the First Draft phase — pipeline tracker on the left, real-time CLI activity on the right</em>
</p>

---

## What It Does

Novel Engine is a workshop for constructing books. It replaces a scattered multi-script writing system with a single desktop application that organizes the entire editorial lifecycle into a structured, phase-gated pipeline.

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

Phases support three user actions:
- **Advance →** — confirms a completed phase and unlocks the next
- **Done** — manually marks a phase complete (creates stub files if needed)
- **Revert** — moves a phase back to active, undoing side effects for status/archive-dependent phases

---

## Key Features

### Pitch Room

A free brainstorming space where you explore story ideas with Spark before committing to a book. Each pitch conversation gets its own draft folder. When a concept crystallizes, Spark can:

- **Make it a book** — creates a real book project, copies the pitch, and switches the app to it
- **Shelve it** — saves the pitch to a shelf with a logline for future use
- **Discard it** — deletes the draft and conversation

Shelved pitches can be browsed, previewed, restored to a new book, or deleted from the sidebar.

<p align="center">
  <img src="screenshots/pitch-room.png" alt="Pitch Room with Spark agent brainstorming story concepts" width="800" />
  <br />
  <em>Spark pitching story concepts in the Pitch Room — extended thinking, file browser, and CLI Activity monitor visible</em>
</p>

### Voice Profile System

Before Verity writes a single word, you establish a **Voice Profile** — a detailed document capturing your sentence rhythm, vocabulary register, dialogue style, emotional temperature, interiority depth, punctuation habits, structural instincts, tonal anchors, and an avoid list. Verity conducts a guided interview (four prompts, one at a time) to extract your authentic voice, or analyzes writing samples you provide. The voice profile is stored per-book at `source/voice-profile.md` and loaded into every Verity session.

### Author Profile

A global **Author Profile** — your creative DNA — persists across all books. It captures your genres, influences, recurring themes, process, and aspirations. Spark and Quill use it for consistent creative direction. You can create or refine it through a guided conversation at any time.

### Manuscript Import

Import an existing manuscript into Novel Engine. The **Import Wizard** accepts `.md`, `.markdown`, or `.docx` files and automatically detects chapter boundaries via heading patterns and "Chapter N" matching. After detection you can:

- **Rename** individual chapters inline
- **Merge** adjacent chapters
- **Remove** chapters (content folds into the previous chapter)
- **Edit** title and author metadata

On commit, the wizard creates a full book directory with all chapters written as `draft.md` files and the status set to `first-draft`. Optionally, trigger **AI-powered source document generation** — four sequential agent calls (Spark for pitch, Verity for outline/bible, voice profile, and motif ledger) to bring the imported book up to feature parity with natively-created ones.

### Context Building

Every agent interaction assembles context intelligently using a token-budget-aware system:

1. **File manifest** — lists all project files with word counts so agents know what's available to read
2. **Per-agent read guidance** — tells each agent which files are required, relevant, or irrelevant to their role
3. **Dynamic conversation compaction** — calculates how much context window remains after the system prompt and response reserve, then keeps as many recent turns as the budget allows (generous: all turns, moderate: 8, tight: 4, critical: 2)

Agents run in full **agent mode** with tool use — they read and write files directly in the book directory using Claude Code CLI's Read, Write, Edit, and LS tools.

### Auto-Draft

The **Auto-Draft** system automates the first-draft phase. One click starts a loop where Verity writes one chapter at a time — reading the scene outline, finding the next unwritten chapter, drafting the full prose, and updating the story bible. The loop continues until every chapter in the outline has a draft or you click Stop.

Features:
- **Per-book sessions** — each book can run its own auto-draft loop independently
- **Error resilience** — CLI errors pause the loop; you can resume or stop
- **Chapter tracking** — shows how many chapters have been written during the current run
- **Safety valve** — hard limit of 150 iterations prevents runaway loops
- **Signal-based completion** — Verity signals `DRAFT_COMPLETE` when all chapters are drafted
- **Integrated quality checks** — every chapter runs through the Verity Audit pipeline (audit → fix if needed), and a motif/phrase audit runs every 3 chapters to keep the motif ledger accurate

### Verity Audit Pipeline

An automated quality assurance system that runs after every agent interaction and during auto-draft:

- **Audit pass** — a Sonnet-powered audit agent scans each chapter for editorial narration, flagged phrases, anti-patterns, voice drift, and continuity errors
- **Fix pass** — if the audit severity reaches "moderate" or "heavy," a targeted fix agent automatically corrects the issues
- **Motif audit** — runs periodically during auto-draft (every 3 chapters) to keep the motif ledger's flagged phrases section accurate
- **Non-blocking** — audit/fix results stream to the CLI Activity Monitor without interrupting the main workflow

### Motif Ledger

A structured tracking system for recurring literary elements across the manuscript:

- **Motif Systems** — named clusters of motifs with arc trajectories (e.g., "Water Imagery" escalating through chapters)
- **Motif Entries** — individual phrases or images tied to characters, with first appearances and occurrence tracking
- **Structural Devices** — narrative techniques (callbacks, parallels, frame structures) with chapter references
- **Foreshadowing Tracker** — planted seeds with expected payoffs and status (planted, paid-off, abandoned)
- **Minor Character Motifs** — per-character motif assignments for the supporting cast
- **Flagged Phrases** — words and constructions to retire, limit, or avoid — with alternatives and per-chapter limits
- **Audit Log** — records of which chapters have been audited and what was found

The ledger is stored as `source/motif-ledger.json` per book and is editable through a tabbed interface with seven panels. Verity reads the ledger during drafting and revision to maintain motif consistency. Malformed agent-written JSON is automatically normalized via a Sonnet CLI call on load.

### Hot Take

A quick, informal assessment from Ghostlight. One click launches a cold read of the full manuscript — no outline, no notes, no context. Ghostlight reads every chapter in order, then delivers a five-paragraph gut reaction: what grabbed them, what didn't, the biggest problem, and a one-sentence verdict. Always runs on Claude Opus regardless of the global model setting. No files are written — the response lives in chat only.

### Direct Feedback

Skip the pipeline and give Forge direct revision instructions. Describe what you want changed in plain language — Forge reads the manuscript, assesses the scope, and generates `project-tasks.md` and `revision-prompts.md` tailored to your feedback. Useful when you know exactly what needs fixing and don't need a formal assessment cycle.

### Revision Queue

After Forge produces a revision plan (`project-tasks.md` + `revision-prompts.md`), the **Revision Queue** parses it into structured sessions and executes them. The queue uses a Wrangler call (Claude Sonnet) to parse Forge's output into JSON, then runs each session as a Verity conversation.

Four execution modes:
- **Manual** — you approve each task at approval gates before Verity continues
- **Auto-approve** — run the full queue unattended, approving all gates automatically
- **Auto-skip** — step through gates without executing (review mode)
- **Selective** — choose which sessions to run, skip the rest

Features:
- **Approval gates** — Verity pauses at natural checkpoints; you approve, reject (with feedback), skip, or retry
- **Approve All** — auto-approve remaining gates within a single session
- **Task progress tracking** — checkboxes in `project-tasks.md` are updated as sessions complete
- **Phase-level progress** — see completion counts per revision phase
- **Session state persistence** — progress survives app restarts via `source/revision-queue-state.json`
- **Plan caching** — avoids re-calling the Wrangler when source files haven't changed
- **Revision verification** — after all sessions complete, opens a Verity conversation for a final gut-check
- **Two revision cycles** — supports both structural revision (cycle 1) and mechanical fixes (cycle 2), with automatic cycle detection and state transitions

<p align="center">
  <img src="screenshots/revision-queue.png" alt="Revision Queue with 13 sessions and 30 tasks across the editorial pipeline" width="800" />
  <br />
  <em>Revision Queue — 13 sessions, 30 tasks, with manual/auto execution modes and per-session chapter targeting</em>
</p>

### Extended Thinking

Enable **extended thinking** globally or override it per-message with the **thinking budget slider**. Each agent has a default thinking budget tuned to their task complexity. When enabled, the app passes `--effort high` to the Claude CLI. Thinking blocks are displayed in collapsible amber panels with auto-generated summaries (~200 characters).

### Quick Actions

Each agent has pre-built prompts accessible from a dropdown next to the chat input — common tasks like "Next chapter" for Verity, "Full assessment" for Lumen, or "Create revision plan" for Forge. One click fills the chat input with a well-crafted prompt.

### CLI Activity Monitor

A real-time panel showing all active Claude CLI processes. Tracks every stream across the app — chat, auto-draft, hot takes, ad hoc revisions, revision queue sessions, audits, and motif audits. Each stream shows the agent name, progress stage (reading → thinking → drafting → editing → reviewing → complete), active tool use with file paths, and elapsed time. The panel persists across view changes.

### Modal Chat

An overlay chat window that works from any view. Start a conversation in the main chat, then switch to Files or Build while keeping the chat accessible as a floating modal. The modal shares the same stream infrastructure — messages continue streaming even while you browse files.

### File Version History

Every file edit — whether by the author or an agent — is automatically snapshotted with SHA-256 content deduplication. The version history panel shows a timeline of changes per file with:

- **Diff viewer** — structured line-by-line diff between any two versions
- **Revert** — restore any previous version with one click (creates a new `revert` snapshot)
- **Source tracking** — each version tagged as `user`, `agent`, or `revert`
- **Automatic pruning** — keeps the most recent 50 versions per file per book

### File Watchers

Two filesystem watchers run in the background:

- **Book Watcher** — monitors the active book's directory for file changes (edits by agents or external tools) and pushes change notifications to the renderer
- **Books Directory Watcher** — monitors the `books/` root for new or removed book folders, automatically refreshing the book list when books are added or deleted from outside the app

### OS Notifications

When an agent finishes responding and the app window is not focused, Novel Engine fires an OS-level notification (macOS, Windows, Linux). Notifications cover chat completions, errors, revision session completions, queue completions, and build completions. Click a notification to bring the window to front. Configurable in Settings.

### Book Management

- **Create** new books with auto-generated copyright pages and pipeline state
- **Archive / unarchive** books to a `_archived/` directory
- **Cover images** — upload JPG/PNG/WebP covers served via a custom `novel-asset://` protocol
- **Slug reconciliation** — automatically renames book folders when titles change
- **Per-chapter word counts** — displayed in the sidebar and files view
- **Catalog export** — export the entire `books/` directory as a ZIP archive

### Multi-Model Provider Support

Beyond the built-in Claude Code CLI, Novel Engine supports **OpenAI-compatible endpoints** (e.g., Ollama, LM Studio, self-hosted models). Add providers in Settings with a base URL and optional API key. Each provider declares its capabilities (text-completion, tool-use, thinking, streaming) so the app gates features accordingly. A central provider registry routes model requests to the correct backend.

### Series Bible

Group multiple books into ordered **series** with a shared story bible. Series are file-based (`{userData}/series/{slug}/`), each with a `series.json` manifest and a `series-bible.md` markdown file. The series bible is automatically injected into all 7 creative agents' context when working on a book that belongs to a series — agents reference it for cross-volume continuity.

Features:
- **CRUD** — create, rename, delete series from the Series Management modal
- **Volume ordering** — add/remove books, reorder with up/down arrows
- **Series Bible editor** — write and edit shared continuity documents in a dedicated markdown editor
- **Sidebar grouping** — books in series are visually grouped with collapsible headers in the BookSelector
- **Reverse-lookup cache** — O(1) book→series resolution on every chat message

### Series Import

Import multiple manuscripts at once and group them as a series. The **Import Series Wizard** extends the single-book manuscript import with batch support:

- **Multi-file selection** — select multiple `.md`, `.markdown`, or `.docx` files at once
- **Series name detection** — automatically detects common series name from file titles (longest-common-prefix strategy)
- **Volume preview** — shows all volumes with chapter counts and word counts
- **Per-volume editing** — rename titles, reorder volumes, skip individual books
- **Create or attach** — create a new series or add volumes to an existing one
- **Sequential commit** — imports each volume in order, creating the full book directory structure for each

### In-App Helper

A floating **help assistant** accessible via a chat bubble in the bottom-right corner of the app. The Helper agent uses a comprehensive 16-section user guide as its knowledge base and answers questions about Novel Engine features, workflows, agents, troubleshooting, and navigation.

- **Persistent conversation** — the helper conversation persists across book switches and view changes
- **Non-creative agent** — runs on a 2K thinking budget with 5 max turns; doesn't write to book files
- **Reset** — clear the conversation and start fresh at any time
- **Knowledge base** — the user guide (`docs/USER_GUIDE.md`) is bundled and automatically updated on startup

### Guided Tours & Tooltips

An interactive onboarding system that helps new users discover features:

- **Three guided tours** — Welcome (6 steps), First Book (3 steps), Pipeline Intro (7 steps)
- **Spotlight overlay** — CSS clip-path cutouts highlight target elements with step-by-step popovers
- **Keyboard navigation** — arrow keys and Escape for tour controls
- **Auto-launch** — Welcome tour starts automatically after onboarding
- **Replay from Settings** — replay any tour at any time; green checkmarks for completed tours
- **Sidebar Help button** — "?" icon to launch tours on demand
- **Contextual tooltips** — 14 components have descriptive tooltips (sidebar buttons, pipeline phases, chat controls, file view toggles, window controls)
- **Tour-aware suppression** — tooltips are hidden during active tours to reduce visual clutter
- **Accessible** — `aria-modal`, `aria-live`, `aria-describedby` on all interactive elements

### Chapter Validation

The **ChapterValidator** runs automatically after agent interactions to detect and correct misplaced chapter files — files written to the wrong path, wrong extensions, or incorrect directory structures are moved to the correct `chapters/NN-slug/draft.md` layout.

---

## Prerequisites

- **Node.js** 18+
- **Claude Code CLI** — install via `npm install -g @anthropic-ai/claude-code`, then authenticate with `claude login`
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
2. **Claude CLI Setup** — auto-detects the `claude` binary; links to install instructions if not found
3. **Model Selection** — choose a default Claude model (Opus or Sonnet)
4. **Author Profile** — write or skip your creative DNA document
5. **Ready** — creates your first book or enters the app

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

Electron Forge handles packaging via [`forge.config.ts`](./forge.config.ts). Bundled resources include the Pandoc binary and all agent `.md` prompt files. macOS code signing and notarization are supported via environment variables (`APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`).

---

## Project Structure

### Source Code Architecture

158 TypeScript/TSX files across five clean-architecture layers:

```
src/
├── domain/                              # LAYER 1: Pure types, zero imports
│   ├── types.ts                         # All shared type definitions
│   ├── interfaces.ts                    # Service contracts (ports)
│   ├── constants.ts                     # Agent registry, pipeline phases, prompts, status messages
│   ├── statusMessages.ts               # Rotating fun status messages for UI
│   └── index.ts                         # Barrel export
│
├── infrastructure/                      # LAYER 2: Implements domain interfaces
│   ├── settings/
│   │   ├── SettingsService.ts           # Settings persistence, CLI detection
│   │   └── index.ts
│   ├── database/
│   │   ├── schema.ts                    # SQLite schema (conversations, messages, usage, streams)
│   │   ├── migrations.ts               # Forward-only schema migrations (file_versions table, etc.)
│   │   ├── DatabaseService.ts           # All query methods with prepared statements
│   │   └── index.ts
│   ├── agents/
│   │   ├── AgentService.ts              # Loads agent .md prompts from disk, composite prompt assembly
│   │   └── index.ts
│   ├── filesystem/
│   │   ├── FileSystemService.ts         # Book CRUD, file I/O, pitches, covers, archiving
│   │   ├── BookWatcher.ts               # Watches active book directory for changes
│   │   ├── BooksDirWatcher.ts           # Watches books/ for added/removed book folders
│   │   └── index.ts
│   ├── claude-cli/
│   │   ├── ClaudeCodeClient.ts          # Claude CLI wrapper, streaming, tool tracking
│   │   ├── StreamSessionTracker.ts      # Progress stage inference, file touch tracking
│   │   └── index.ts
│   ├── providers/
│   │   ├── ProviderRegistry.ts          # Central registry routing models to providers
│   │   ├── OpenAiCompatibleProvider.ts  # BYOK provider for OpenAI-compatible endpoints
│   │   └── index.ts
│   ├── series/
│   │   ├── SeriesService.ts             # Series CRUD, volume management, bible I/O, reverse-lookup cache
│   │   └── index.ts
│   └── pandoc/
│       └── index.ts                     # Pandoc binary path resolution
│
├── application/                         # LAYER 3: Business logic via injected interfaces
│   ├── ChatService.ts                   # Send → stream → save orchestration
│   ├── ContextBuilder.ts                # Budget-aware context assembly with compaction
│   ├── PipelineService.ts              # Phase detection with user confirmation gates
│   ├── BuildService.ts                  # Pandoc execution for DOCX/EPUB
│   ├── UsageService.ts                  # Token tracking
│   ├── RevisionQueueService.ts          # Revision plan parsing, session execution, approval gates
│   ├── ChapterValidator.ts              # Auto-corrects misplaced chapter files
│   ├── AuditService.ts                  # Verity audit/fix pipeline, motif audit
│   ├── PitchRoomService.ts              # Pitch Room message handling
│   ├── HotTakeService.ts                # Ghostlight hot-take orchestration
│   ├── AdhocRevisionService.ts          # Direct feedback → Forge revision plan
│   ├── StreamManager.ts                 # Stream lifecycle, session tracking, file change detection
│   ├── MotifLedgerService.ts            # Motif ledger CRUD, JSON normalization, unaudited chapter detection
│   ├── VersionService.ts                # File version snapshots, diffs, revert, pruning
│   ├── ManuscriptImportService.ts       # Manuscript import: preview, chapter detection, commit
│   ├── SourceGenerationService.ts       # Post-import AI source document generation
│   ├── SeriesImportService.ts           # Batch series import: preview + commit via IManuscriptImportService
│   ├── HelperService.ts                 # In-app help assistant with persistent conversation
│   ├── thinkingBudget.ts                # Thinking budget resolution logic
│   ├── index.ts                         # Barrel export
│   ├── context/
│   │   └── TokenEstimator.ts            # ~4 chars/token estimation
│   └── import/
│       └── ChapterDetector.ts           # Chapter boundary detection for import
│
├── main/                                # LAYER 4: Electron main process
│   ├── index.ts                         # Composition root — instantiates everything
│   ├── bootstrap.ts                     # First-run directory/file creation
│   ├── notifications.ts                 # OS notification manager
│   └── ipc/
│       └── handlers.ts                  # Thin adapter: IPC channel → service call
│
├── preload/
│   └── index.ts                         # contextBridge: typed API for renderer
│
└── renderer/                            # LAYER 5: React UI
    ├── App.tsx                          # Root component, onboarding gate
    ├── main.tsx                         # React 18 createRoot entry
    ├── stores/
    │   ├── settingsStore.ts             # App settings state
    │   ├── bookStore.ts                 # Book list, active book, word counts
    │   ├── chatStore.ts                 # Chat state, streaming, message history
    │   ├── pipelineStore.ts             # Pipeline phase state
    │   ├── viewStore.ts                 # Navigation, active view, selected agent
    │   ├── pitchRoomStore.ts            # Pitch Room conversations and drafts
    │   ├── pitchShelfStore.ts           # Shelved pitches management
    │   ├── revisionQueueStore.ts        # Revision queue state
    │   ├── modalChatStore.ts            # Modal chat overlay state
    │   ├── cliActivityStore.ts          # CLI activity monitoring
    │   ├── autoDraftStore.ts            # Auto-draft chapter loop with audit integration
    │   ├── fileChangeStore.ts           # File change tracking from watchers
    │   ├── motifLedgerStore.ts          # Motif ledger CRUD and tab state
    │   ├── providerStore.ts             # Multi-model provider management
    │   ├── versionStore.ts              # File version history and diffs
    │   ├── importStore.ts               # Manuscript import wizard state
    │   ├── seriesStore.ts               # Series CRUD, volume management, bible editor state
    │   ├── seriesImportStore.ts         # Series import wizard state
    │   ├── helperStore.ts               # Helper panel visibility, conversation, streaming
    │   ├── tourStore.ts                 # Guided tour lifecycle, completion state
    │   └── streamHandler.ts             # Routes stream events to correct stores
    ├── components/
    │   ├── Layout/                      # AppLayout, Sidebar, TitleBar, ResizeHandle
    │   ├── Onboarding/                  # OnboardingWizard
    │   ├── Settings/                    # SettingsView, ProviderSection
    │   ├── Sidebar/                     # BookSelector, PipelineTracker, FileTree,
    │   │                                #   VoiceSetupButton, ShelvedPitchesPanel,
    │   │                                #   PitchPreviewModal, PitchHistory,
    │   │                                #   CliActivityButton, RevisionQueueButton,
    │   │                                #   HotTakeButton, AdhocRevisionButton,
    │   │                                #   SeriesGroup
    │   ├── Chat/                        # ChatView, ChatInput, ChatModal, ChatTitleBar,
    │   │                                #   MessageBubble, MessageList, StreamingMessage,
    │   │                                #   ThinkingBlock, ThinkingBudgetSlider, QuickActions,
    │   │                                #   AgentHeader, ConversationList
    │   ├── PitchRoom/                   # PitchRoomView
    │   ├── Files/                       # FilesView, StructuredBrowser, FileBrowser,
    │   │                                #   FileEditor, SourcePanel, ChaptersPanel,
    │   │                                #   AgentOutputPanel, FilesHeader,
    │   │                                #   CollapsibleSection, DeleteConfirmModal,
    │   │                                #   VersionHistoryPanel, DiffViewer
    │   ├── Build/                       # BuildView
    │   ├── RevisionQueue/               # RevisionQueueView, SessionCard, QueueControls,
    │   │                                #   TaskProgress, RevisionSessionPanel
    │   ├── MotifLedger/                 # MotifLedgerView, SystemsTab, EntriesTab,
    │   │                                #   StructuralTab, ForeshadowTab,
    │   │                                #   MinorCharactersTab, FlaggedPhrasesTab,
    │   │                                #   AuditLogTab
    │   ├── CliActivity/                 # CliActivityPanel, constants
    │   ├── Import/                      # ImportWizard, ChapterPreviewList,
    │   │                                #   ImportSeriesWizard, VolumePreviewList
    │   ├── Helper/                      # HelperButton, HelperPanel, HelperMessageList
    │   ├── Series/                      # SeriesModal, SeriesForm, VolumeList,
    │   │                                #   SeriesBibleEditor
    │   ├── common/                      # Tooltip, GuidedTourOverlay
    │   └── ErrorBoundary/               # ErrorBoundary
    ├── hooks/
    │   ├── useTheme.ts                  # Dark/light/system theme sync
    │   ├── useRotatingStatus.ts         # Fun rotating status messages
    │   ├── useRevisionQueueEvents.ts    # Revision queue event subscription
    │   ├── useResizeHandle.ts           # Horizontal sidebar resize
    │   ├── useVerticalResize.ts         # Vertical panel resize
    │   └── useTooltip.ts               # Tooltip positioning and viewport clamping
    ├── tours/
    │   └── tourDefinitions.ts           # Welcome, first-book, pipeline-intro tour steps
    └── styles/
        └── globals.css                  # Tailwind v4 import + minimal custom styles
```

### User Data Directory

All user data lives outside the app bundle, in the OS user data path (`~/Library/Application Support/Novel Engine` on macOS):

```
{userData}/
├── .initialized                  # Bootstrap completion flag
├── settings.json                 # App preferences (including provider configs)
├── active-book.json              # { "book": "slug-name" }
├── author-profile.md             # Global author profile (all books)
├── novel-engine.db               # SQLite database (conversations, messages, usage, streams, file versions)
├── books/
│   ├── {slug}/
│   │   ├── about.json            # { title, author, status, created, coverImage }
│   │   ├── cover.{jpg,png,...}   # Cover image (optional)
│   │   ├── pipeline-state.json   # Confirmed pipeline phases
│   │   ├── source/
│   │   │   ├── pitch.md
│   │   │   ├── voice-profile.md
│   │   │   ├── scene-outline.md
│   │   │   ├── story-bible.md
│   │   │   ├── style-sheet.md
│   │   │   ├── reader-report.md      # (+ reader-report-v1.md after revision)
│   │   │   ├── dev-report.md         # (+ dev-report-v1.md after revision)
│   │   │   ├── audit-report.md
│   │   │   ├── project-tasks.md      # (+ project-tasks-v1.md after revision)
│   │   │   ├── revision-prompts.md   # (+ revision-prompts-v1.md after revision)
│   │   │   ├── metadata.md
│   │   │   ├── motif-ledger.json     # Motif tracking (systems, entries, foreshadows, phrases)
│   │   │   ├── revision-plan-cache.json   # Wrangler parse cache
│   │   │   └── revision-queue-state.json  # Session progress state
│   │   ├── chapters/
│   │   │   ├── 00-0-copyright/
│   │   │   │   └── draft.md          # Auto-generated copyright page
│   │   │   ├── 00-1-dedication/
│   │   │   │   └── draft.md
│   │   │   └── NN-slug/
│   │   │       ├── draft.md          # The prose (Verity writes here)
│   │   │       └── notes.md          # Author annotations
│   │   └── dist/                     # Build outputs (md, docx, epub)
│   ├── _archived/                    # Archived books
│   │   └── {slug}/...
│   ├── _pitches/                     # Shelved pitch files
│   │   └── {slug}.md
│   └── __pitch-room__/              # Pitch Room draft workspace
│       └── drafts/{conversationId}/
│           └── source/pitch.md
├── series/
│   └── {slug}/
│       ├── series.json                  # { name, slug, description, volumes, created, updated }
│       └── series-bible.md              # Shared continuity document for the series
└── custom-agents/
    ├── SPARK.md                      # Core agent prompts (7 creative agents)
    ├── VERITY-CORE.md                # Verity base prompt
    ├── VERITY-SCAFFOLD.md            # Phase: scaffolding
    ├── VERITY-DRAFT.md               # Phase: first draft
    ├── VERITY-REVISION.md            # Phase: revision
    ├── VERITY-MECHANICAL.md          # Phase: mechanical fixes
    ├── VERITY-LEDGER.md              # Motif ledger integration
    ├── VERITY-AUDIT.md               # Quality audit agent
    ├── VERITY-FIX.md                 # Automated fix agent
    ├── GHOSTLIGHT.md
    ├── LUMEN.md
    ├── SABLE.md
    ├── FORGE.md
    ├── QUILL.md
    ├── VOICE-SETUP.md                # Voice profile interview
    ├── AUTHOR-PROFILE.md             # Author profile setup
    ├── PITCH-ROOM.md                 # Spark in pitch room mode
    ├── HOT-TAKE.md                   # Ghostlight hot take
    ├── MOTIF-AUDIT.md                # Motif/phrase audit
    ├── ADHOC-REVISION.md             # Direct feedback → Forge
    ├── REVISION-VERIFICATION.md      # Post-revision verification
    ├── WRANGLER-PARSE.md             # Revision plan parser
    └── HELPER.md                     # In-app help assistant
```

Agent system prompts live in `custom-agents/` and are fully editable — customize any agent's behavior by modifying its `.md` file. Missing agents are automatically restored from the bundled copies on startup (without overwriting your customizations).

---

## Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Shell | [Electron](https://www.electronjs.org/) via [Electron Forge](https://www.electronforge.io/) | 33.4 |
| Bundler | [Vite](https://vitejs.dev/) (Forge plugin) | 5.x |
| UI | [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) | 18.3 / ~5.5 |
| Styling | [Tailwind CSS](https://tailwindcss.com/) + [Typography plugin](https://github.com/tailwindlabs/tailwindcss-typography) | 4.x |
| State | [Zustand](https://zustand-demo.pmnd.rs/) | 5.x |
| Database | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | 11.x |
| AI Backend | [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) + OpenAI-compatible endpoints | (spawned / fetched) |
| Manuscript Export | [Pandoc](https://pandoc.org/) (bundled binary) | — |
| Diffing | [diff](https://github.com/kpdecker/jsdiff) | 8.x |
| IDs | [nanoid](https://github.com/ai/nanoid) | 3.x |
| Markdown Rendering | [marked](https://marked.js.org/) | 15.x |
| Archive Export | [archiver](https://www.archiverjs.com/) | 7.x |
| IPC | Electron `contextBridge` + `ipcMain`/`ipcRenderer` | — |

---

## Architecture

Novel Engine follows **Clean Architecture** with five strict layers:

```
DOMAIN ← INFRASTRUCTURE ← APPLICATION ← IPC/MAIN ← RENDERER
```

- **Domain** ([`src/domain/`](./src/domain/)) — Pure TypeScript types, interfaces, and constants. Zero imports. Every other layer depends on this.
- **Infrastructure** ([`src/infrastructure/`](./src/infrastructure/)) — Concrete implementations: SQLite database with forward-only migrations, filesystem I/O, Claude CLI wrapper, file watchers, Pandoc runner, settings persistence, provider registry with OpenAI-compatible support, series file-based storage.
- **Application** ([`src/application/`](./src/application/)) — Business logic orchestrating infrastructure through injected interfaces: ChatService, ContextBuilder, PipelineService, BuildService, RevisionQueueService, AuditService, PitchRoomService, HotTakeService, AdhocRevisionService, StreamManager, MotifLedgerService, VersionService, ManuscriptImportService, SourceGenerationService, SeriesImportService, HelperService, UsageService, ChapterValidator.
- **Main/IPC** ([`src/main/`](./src/main/)) — Electron entry point (composition root), IPC handlers (thin one-liner delegations), first-run bootstrap, OS notifications.
- **Renderer** ([`src/renderer/`](./src/renderer/)) — React components, Zustand stores (20 stores), hooks. Communicates with the backend exclusively through `window.novelEngine` (the preload bridge). May import domain types but never values.

All services are constructor-injected. The only place concrete classes are instantiated is [`src/main/index.ts`](./src/main/index.ts).

### Database Schema

Seven SQLite tables (WAL mode, foreign keys enabled, forward-only migrations):

| Table | Purpose |
|-------|---------|
| `conversations` | Tracks all agent conversations per book — agent, phase, purpose, timestamps |
| `messages` | Individual messages with role, content, and thinking block text |
| `token_usage` | Per-call token counts (input, output, thinking) by model |
| `stream_events` | Persisted stream events for session replay and recovery |
| `stream_sessions` | Tracks CLI invocations for orphan detection and recovery |
| `file_versions` | Content snapshots with SHA-256 dedup for version history and revert |
| `schema_version` | Migration tracking — records which schema migrations have been applied |

See [`AGENTS.md`](./AGENTS.md) for the full architecture documentation.

---

## License

[AGPL-3.0-only](LICENSE)
