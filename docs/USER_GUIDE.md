# Novel Engine — User Guide

> Last updated: 2026-03-28

---

## 1. What is Novel Engine?

Novel Engine is an Electron desktop application for writing novels with the help of 7 specialized AI agents. Each agent has a distinct role in the writing process — from pitching a story concept through drafting, revision, copy editing, and publication.

The app uses the **Claude Code CLI** as its AI backend. You need a Claude subscription — Novel Engine doesn't store API keys or handle billing. The CLI authenticates through your own Anthropic account.

All your books, chapters, and project files are stored locally on your machine in the app's user data directory. Nothing is sent to external servers beyond the Claude API calls made through the CLI.

---

## 2. Getting Started

### First Launch

When you open Novel Engine for the first time, the **onboarding wizard** guides you through setup:

1. **CLI Detection** — The app checks if the `claude` CLI is installed and authenticated. If not, you'll see instructions to install it.
2. **Author Name** — Enter your name (used in book metadata and cover pages).
3. **Model Selection** — Choose your default model:
   - **Claude Opus 4** — Best quality, recommended for all creative work
   - **Claude Sonnet 4** — Faster and cheaper, good for copy editing and utility tasks

### Creating Your First Book

1. Click the **"+ New Book"** button in the sidebar.
2. Enter a title (the directory slug is auto-generated).
3. The book appears in the sidebar book selector.
4. The pipeline tracker shows you're at the **Story Pitch** phase.

### The Author Profile

The **author profile** (`author-profile.md`) describes your writing voice, themes, genres, and style. Spark and Quill read this to understand your creative DNA. Write a few paragraphs about what kind of writer you are — the more detail, the better the agents understand your preferences.

To edit it, go to **Settings > Author Profile** or find it in the file browser.

---

## 3. The Writing Pipeline

### What is the Pipeline?

The pipeline is a 14-phase workflow that takes a book from concept to publication. Each phase has a designated agent and produces specific output files. You advance through the pipeline sequentially — each phase must be completed before the next unlocks.

### The 14 Phases

| # | Phase | Agent | What Happens |
|---|-------|-------|-------------|
| 1 | **Story Pitch** | Spark | Discover and pitch your story concept. Output: `source/pitch.md` |
| 2 | **Story Scaffold** | Verity | Build the scene outline and story bible from the pitch. Output: `source/scene-outline.md` |
| 3 | **First Draft** | Verity | Write the complete first draft chapter by chapter. Output: chapter files in `chapters/` |
| 4 | **First Read** | Ghostlight | Cold read for reader experience feedback. Output: `source/reader-report.md` |
| 5 | **Structural Assessment** | Lumen | Diagnose structural strengths and weaknesses. Output: `source/dev-report.md` |
| 6 | **Revision Plan** | Forge | Synthesize feedback into a revision task list. Output: `source/project-tasks.md` |
| 7 | **Revision** | Verity | Implement structural changes based on the plan |
| 8 | **Second Read** | Ghostlight | Read the revised manuscript |
| 9 | **Second Assessment** | Lumen | Verify revisions and assess readiness |
| 10 | **Copy Edit** | Sable | Grammar, consistency, and mechanical polish. Output: `source/audit-report.md` |
| 11 | **Fix Planning** | Forge | Plan copy-level fixes |
| 12 | **Mechanical Fixes** | Verity | Implement copy-level fixes |
| 13 | **Build** | (none) | Generate DOCX, EPUB, and PDF exports |
| 14 | **Publish & Audit** | Quill | Audit outputs and prepare metadata. Output: `source/metadata.md` |

### How Phases Advance

When an agent completes its work and writes the expected output file, the phase enters a **"pending completion"** state (shown with a checkmark icon). It does NOT automatically advance — you must review the output and click **"Advance →"** in the pipeline tracker to confirm you're satisfied and ready to proceed.

This gives you control over quality gates. If you're not happy with an agent's output, you can re-run the conversation before advancing.

### Manual Phase Completion

Some phases (like **First Draft** and **Mechanical Fixes**) depend on the book's status field rather than a single file. Use the **"Mark Complete"** button in the pipeline tracker to manually signal that a phase is done.

### Reverting Phases

If you need to redo work, right-click a completed phase and select **"Revert."** This moves the pipeline back to that phase without deleting the agent's output files. You can then re-confirm or redo the work.

---

## 4. The Agents

### Spark — Story Discovery

**Role:** Pitches and discovers story concepts.
**Color:** Amber

Spark is your brainstorming partner. It asks probing questions about what you're drawn to — genre, themes, emotions, characters, "what if" scenarios — and crystallizes the answers into a pitch card written to `source/pitch.md`.

**Quick actions:**
- "Pitch me a story" — Start from scratch
- "I have an idea..." — Bring your own concept
- "Revisit the pitch" — Refine an existing pitch

### Verity — The Ghostwriter

**Role:** Drafts, scaffolds, and revises the manuscript.
**Color:** Purple

Verity is the workhorse of the pipeline. It builds the scene outline, story bible, and writes every chapter. During revision phases, it implements structural and mechanical fixes based on other agents' feedback.

**Quick actions:**
- "Next chapter" — Write the next unwritten chapter
- "Build scene outline" — Create chapter-by-chapter structure
- "Build story bible" — Characters, world, timeline
- "Revise chapter..." — Targeted chapter revision

### Ghostlight — First Reader

**Role:** Cold read for honest reader feedback.
**Color:** Cyan

Ghostlight reads your manuscript with no prior knowledge of your intent. It gives you the raw reader experience — what works, what confuses, what loses attention. Its output is a reader report in `source/reader-report.md`.

**Quick actions:**
- "Read the manuscript" — Full cold read
- "Hot Take" — Quick gut-reaction read

### Lumen — Developmental Editor

**Role:** Structural analysis across seven lenses.
**Color:** Emerald

Lumen performs deep structural analysis — protagonist arcs, pacing maps, scene necessity audits, thematic coherence, and more. It produces a developmental report in `source/dev-report.md` with specific, actionable revision recommendations.

**Quick actions:**
- "Full assessment" — All seven lenses
- "Pacing & scenes" — Focus on momentum
- "Character arcs" — Focus on protagonist and cast

### Sable — Copy Editor

**Role:** Grammar, consistency, and mechanical polish.
**Color:** Red

Sable reads the manuscript for mechanical issues: grammar errors, inconsistent spelling, formatting problems, style drift. It produces an audit report and builds/updates the style sheet.

**Quick actions:**
- "Copy edit" — Full manuscript audit
- "Build style sheet" — Catalog style decisions

### Forge — Task Master

**Role:** Synthesizes feedback into executable revision plans.
**Color:** Orange

Forge reads the reader report and dev report, then creates a phased revision plan with specific session prompts for Verity. It organizes work into phases (structural changes first, then refinements, then polish).

**Quick actions:**
- "Create revision plan" — From reader/dev reports
- "Plan copy fixes" — From audit report
- "Plan from my feedback" — Your own revision requests

### Quill — Publisher

**Role:** Publication metadata and final audit.
**Color:** Indigo

Quill prepares your book for publication — generating metadata (title, subtitle, description, keywords, categories, comp titles, back-cover copy) and auditing the final build outputs.

**Quick actions:**
- "Prepare for publication" — Audit build outputs
- "Generate metadata" — Create publication metadata

### How to Start a Conversation

1. Select a book in the sidebar.
2. Click the agent's name in the sidebar (under the pipeline tracker) or select the agent from the chat view dropdown.
3. Type your message or use a **quick action** (pre-built prompts) from the dropdown next to the input.
4. The agent responds with streaming text. You'll see a progress indicator showing what the agent is doing (reading files, thinking, drafting, editing).

### Extended Thinking

When enabled in settings, agents use **extended thinking** — a reasoning phase before responding. You'll see a collapsible "Thinking" block above the response showing the agent's internal reasoning. This generally improves output quality, especially for complex tasks.

Each agent has a default thinking budget (token allocation for reasoning). You can override all agents' budgets in **Settings > Thinking Budget**.

---

## 5. Book Management

### Creating a Book

Click **"+ New Book"** in the sidebar. Enter a title — the app generates a URL-safe slug (e.g., "The Lost City" becomes `the-lost-city`). A new directory is created with the standard structure.

### The Book Selector

The sidebar shows your currently active book. Click it to open a dropdown listing all your books. Click a book to switch to it — the pipeline, conversations, and file browser update accordingly.

### Book Metadata

Each book has metadata in `about.json`:
- **Title** — The book's display name
- **Author** — Your name (from settings by default)
- **Status** — Current pipeline stage (scaffolded, outlining, first-draft, etc.)
- **Cover Image** — Optional cover art (drag-and-drop in the sidebar)
- **Created** — Creation date

### Archiving Books

To archive a book you're no longer actively working on, right-click it in the book selector and choose **"Archive."** Archived books are moved to an `_archived/` directory and hidden from the main list. To restore, go to **Settings > Archived Books**.

### Importing Manuscripts

You can import existing manuscripts into Novel Engine:

1. Go to **File > Import Manuscript** (or use the import button in the sidebar).
2. Select a file — supported formats: **Markdown (.md)** and **Word (.docx)**.
3. The app detects chapter boundaries and shows a preview.
4. Review and adjust chapter splits, title, and author.
5. Click **"Import"** to create the book with all chapters.

The imported book starts at the **First Draft** phase — you can then run Ghostlight for a first read, or jump to any agent.

### Shelved Pitches

If you brainstorm a pitch but aren't ready to commit to writing it, you can **shelve** it. Shelved pitches are saved separately and can be restored later when you're ready.

---

## 6. The Pitch Room

The **Pitch Room** is a dedicated brainstorming space for generating story ideas with Spark. Unlike the main pipeline (which is tied to a specific book), the Pitch Room lets you explore multiple concepts freely.

### How to Use It

1. Click **"Pitch Room"** in the sidebar.
2. Start a conversation with Spark — pitch ideas, explore concepts, iterate.
3. Each conversation becomes a **draft pitch**.

### Managing Drafts

- **Promote to Book** — When a pitch is ready, promote it to a full book. This creates a new book directory with the pitch file already in place.
- **Shelve** — Save the pitch for later without creating a book.
- **Delete** — Remove a draft you don't want.

---

## 7. File Management

### The Files View

Click **"Files"** in the sidebar to open the file browser. It shows the complete directory tree of your active book:

- **`source/`** — Project documents: pitch, outline, bible, reports, prompts, style sheet
- **`chapters/NN-slug/`** — Each chapter in its own directory with `draft.md` (prose) and `notes.md` (annotations)
- **`dist/`** — Build outputs (markdown, DOCX, EPUB, PDF)

### Reading and Editing Files

Click any file to read its contents in the main panel. For markdown files, you'll see the rendered content. Click **"Edit"** to switch to raw markdown editing.

### Book Directory Structure

```
books/my-novel/
  about.json              # Book metadata
  source/
    pitch.md              # Story pitch (Spark)
    scene-outline.md      # Chapter-by-chapter plan (Verity)
    story-bible.md        # Characters, world, timeline (Verity)
    voice-profile.md      # Voice/style reference (Verity)
    reader-report.md      # Reader feedback (Ghostlight)
    dev-report.md         # Structural analysis (Lumen)
    project-tasks.md      # Revision task list (Forge)
    revision-prompts.md   # Session prompts for Verity (Forge)
    audit-report.md       # Copy edit results (Sable)
    style-sheet.md        # Style guide (Sable)
    metadata.md           # Publication metadata (Quill)
    motif-ledger.json     # Motif tracking (auto-updated)
  chapters/
    01-the-beginning/
      draft.md            # Chapter prose
      notes.md            # Author annotations
    02-rising-action/
      draft.md
      notes.md
  dist/
    output.md             # Concatenated manuscript
    output.docx           # Word document
    output.epub           # EPUB ebook
    output.pdf            # PDF document
```

### Version History

Novel Engine automatically tracks file versions. When an agent writes or modifies a file, a snapshot is saved. You can:

- **View History** — See all versions of a file with timestamps and sources (agent, user, revert).
- **Compare Versions** — View a diff between any two versions.
- **Revert** — Restore a file to any previous version.

---

## 8. Conversations

### How Conversations Work

Each interaction with an agent is a **conversation**. Conversations are persistent — you can close the app and come back to continue where you left off.

Conversations are scoped to a specific book and agent. Each pipeline phase typically has one conversation, but you can create multiple conversations with the same agent for different purposes.

### Conversation History

All messages are stored in a local SQLite database. The conversation list appears in the sidebar under the active agent. Click a conversation to reopen it.

### Deleting Conversations

Right-click a conversation in the list and select **"Delete"** to permanently remove it and all its messages.

---

## 9. The Revision Queue

### What is the Revision Queue?

After Forge creates a revision plan, the **Revision Queue** lets you execute it systematically. It breaks the plan into individual sessions and runs them through Verity one at a time.

### Loading a Plan

1. Make sure Forge has written `source/project-tasks.md` and `source/revision-prompts.md`.
2. Go to **"Revision Queue"** in the sidebar.
3. Click **"Load Plan"** — the app parses Forge's output into structured sessions.

### Execution Modes

- **Manual** — You approve each session before the next one starts. Best for careful oversight.
- **Auto-Approve** — Sessions run back-to-back automatically. Best for when you trust the plan.
- **Selective** — Choose which sessions to run and skip the rest.

### Approval Gates

In manual mode, after each session completes, you see the result and choose:
- **Approve** — Accept the changes, mark tasks complete, proceed.
- **Reject** — Discard the changes, optionally re-run.
- **Skip** — Move past this session without changes.

### Monitoring Progress

The queue view shows a progress bar with completed/total sessions, the current session's streaming output, and a log of past sessions with their results.

---

## 10. Building Your Book

### Export Formats

Novel Engine can export your manuscript in four formats:
- **Markdown** — Concatenated chapters in a single `.md` file
- **DOCX** — Microsoft Word document (via Pandoc)
- **EPUB** — E-book format (via Pandoc)
- **PDF** — Print-ready PDF (via Pandoc)

### Pandoc Requirement

DOCX, EPUB, and PDF exports require **Pandoc** to be installed on your system. The app bundles Pandoc where possible, but if it's not detected, you'll see instructions to install it.

### The Build View

1. Select a book.
2. Click **"Build"** in the sidebar.
3. Choose your output formats.
4. Click **"Build"** — progress logs appear in real-time.
5. When complete, click the output files to open them or use **"Export ZIP"** to download all formats.

---

## 11. Series Management

### Creating a Series

1. Go to **"Series"** in the sidebar.
2. Click **"+ New Series"**.
3. Enter a name and optional description.

### Adding Books to a Series

- Drag books from the book list into a series, or use the series detail view to add volumes.
- Each book has a **volume number** — the order it appears in the series.

### Reordering Volumes

Drag volumes in the series detail view to reorder them. Volume numbers update automatically.

### Series Bible

Each series has a **series bible** — a shared document describing overarching characters, world rules, and continuity notes. Agents can reference the series bible when working on any book in the series.

---

## 12. Settings

Access settings from the gear icon in the sidebar or **Settings** in the menu.

### Model Selection

Choose the default AI model for agent interactions:
- **Claude Opus 4** — Highest quality, best for creative work
- **Claude Sonnet 4** — Faster, cheaper, good for utility tasks

### Thinking Budget

Configure the **extended thinking** token budget:
- **Enable/Disable** — Toggle extended thinking globally
- **Budget Override** — Set a custom budget applied to all agents (overrides per-agent defaults)
- **Auto-Collapse** — Automatically collapse thinking blocks in the chat view

### Theme

Choose between **Light**, **Dark** (default), or **System** (follows OS preference).

### Provider Management

Configure AI providers in the **Providers** section. Claude CLI is the built-in provider and cannot be removed.

### OS Notifications

Toggle desktop notifications for when agent calls complete (useful for long-running tasks like full manuscript reads).

---

## 13. Motif Ledger

### What It Tracks

The **motif ledger** (`source/motif-ledger.json`) is a structured record of:

- **Motif Systems** — Recurring thematic patterns (e.g., a light/darkness motif)
- **Motif Entries** — Specific phrases, images, or symbols tied to characters
- **Structural Devices** — Narrative techniques (framing, callbacks, echoes)
- **Foreshadowing** — Planted setups and their expected payoffs
- **Minor Character Motifs** — Tracking for supporting cast
- **Flagged Phrases** — Overused or problematic language patterns

### Automatic Updates

During drafting, the motif ledger is automatically updated every few chapters. Lumen runs a motif audit to keep the ledger current without waiting for the formal assessment phase.

### Manual Editing

You can view and edit the motif ledger from the Files view. It's stored as JSON but the app provides a structured view for easier editing.

---

## 14. Keyboard Shortcuts & Tips

### Workflow Tips

- **Use quick actions** — Every agent has pre-built prompts. Use the dropdown next to the chat input instead of typing common commands.
- **Review before advancing** — Always read agent output before clicking "Advance →" in the pipeline. This is your quality gate.
- **Write notes** — Use `notes.md` files in chapter directories to leave annotations for yourself and the agents.
- **Trust the pipeline order** — The phases are designed to build on each other. Skipping phases leads to lower quality output.
- **Use Ghostlight's Hot Take** — For a quick gut-check on a chapter without running a full read.

### The Sidebar as Command Center

The sidebar is your primary navigation:
- **Book selector** — Top of sidebar, switch between projects
- **Pipeline tracker** — Visual progress through all 14 phases
- **File tree** — Browse and open book files
- **Agent list** — Start conversations with any agent
- **Action buttons** — Pitch Room, Build, Series, Settings

---

## 15. Troubleshooting

### "Claude CLI not detected"

The Claude Code CLI must be installed and authenticated:

1. Install: `npm install -g @anthropic-ai/claude-code`
2. Authenticate: Run `claude` in your terminal and follow the login flow.
3. Verify: `claude --version` should show the version number.
4. Restart Novel Engine — it re-checks on startup.

### Agent Not Responding

- Check that the Claude CLI is still authenticated (run `claude` in a terminal).
- Check your internet connection — the CLI needs to reach Anthropic's API.
- Check the model — Opus may be temporarily unavailable; try switching to Sonnet in Settings.

### Slow Responses

- **Model choice:** Opus is slower than Sonnet. For long tasks (full manuscript reads), expect several minutes.
- **Thinking budget:** Higher thinking budgets add latency. Reduce the budget in Settings for faster (but potentially lower quality) responses.
- **Manuscript size:** Large manuscripts (100K+ words) take longer to process.

### Files Not Updating After Agent Response

- The file tree auto-refreshes when agents write files. If it doesn't, click the refresh icon in the file browser.
- Check the agent's response — it may have encountered an error while writing.

### Build Failing

- **Pandoc not found:** Install Pandoc from https://pandoc.org/installing.html
- **Missing chapters:** The build concatenates all chapters in order. If chapters are missing draft.md files, the build may produce incomplete output.
- **EPUB/PDF errors:** Check that chapter content is valid markdown.

### For Bugs and Issues

If you encounter a bug or unexpected behavior that isn't covered here, please report it at:
**https://github.com/john-paul-ruf/novel-engine/issues**

Include:
- What you were doing
- What you expected
- What happened instead
- Your OS and app version

---

## 16. Architecture Overview (for Power Users)

### Where Books Are Stored

Books live in your OS user data directory:
- **macOS:** `~/Library/Application Support/Novel Engine/books/`
- **Windows:** `%APPDATA%/Novel Engine/books/`
- **Linux:** `~/.config/Novel Engine/books/`

Each book is a self-contained directory with `about.json`, `source/`, `chapters/`, and `dist/`.

### Customizing Agent Prompts

Agent system prompts are stored in the `custom-agents/` directory (inside the user data path). You can edit these `.md` files to customize how each agent behaves. Changes take effect on the next conversation.

**Warning:** Customized prompts are preserved across app updates (the app never overwrites existing agent files). But if an update changes the default prompts significantly, you may want to compare and merge changes.

### The Author Profile

The `author-profile.md` file lives in the user data root (not inside any book). It's shared across all books and read by Spark and Quill.

### Database

Conversations, messages, usage records, and file versions are stored in a local SQLite database (`novel-engine.db` in the user data directory). This file is not meant to be edited manually.
