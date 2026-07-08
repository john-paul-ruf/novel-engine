# Novel Engine — Technical Guide

> Engineering documentation for developers and the technically curious. For the writer-facing overview, see the [README](./README.md). For layer-by-layer architecture docs, see [docs/architecture/](./docs/architecture/ARCHITECTURE.md).

---

## Contents

- [Multi-Provider AI Backends](#multi-provider-ai-backends)
- [How Agents Get Context](#how-agents-get-context)
- [The Pipeline, Precisely](#the-pipeline-precisely)
- [Feature Internals](#feature-internals)
- [Building for Distribution](#building-for-distribution)
- [Project Structure](#project-structure)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Database Schema](#database-schema)

---

## Multi-Provider AI Backends

Novel Engine routes every agent call through a provider registry, so the same editorial pipeline runs on whichever AI backend you have:

- **Claude Code CLI** — the flagship path. Full agent mode with file tools, streamed NDJSON, extended thinking. Invocation: `claude --print --output-format stream-json --verbose --model <model> --max-turns <N> --system-prompt-file <tmp> --allowedTools Read,Write,Edit,LS,Bash(mkdir:*),... --add-dir <booksDir> [--effort high]`. Large system prompts are passed via a temp file to dodge Windows' ~32K command-line limit.
- **Codex CLI** — detected at startup (`codex --version`) and registered with model discovery; runs sandboxed via `codex exec --json --sandbox workspace-write`, with `--add-dir` support feature-detected from `codex exec --help` and graceful degradation when absent.
- **Ollama (CLI-first)** — fully local. Novel Engine detects the `ollama` CLI, discovers models from `ollama list`, can start `ollama serve` itself, and drives models through its own built-in agentic tool loop (`Read`/`Write`/`Edit`/`LS` with path-traversal sandboxing and tolerant argument parsing for smaller models). Old tool results are proactively compacted at 80% of the model's context window; the loop only stops if usage would exceed 98% after compaction. Per-model context windows are discovered via `/api/show` with CLI fallback.
- **llama-server** — any llama.cpp-compatible OpenAI endpoint (SSE streaming), with `<think>` tag parsing for reasoning models like QwQ and DeepSeek-R1 and accumulation of fragmented streamed tool calls. Shares the Ollama tool executor and compactor.
- **OpenAI-compatible endpoints** — bring your own base URL and API key (LM Studio, self-hosted, etc.).

Primary/secondary model selection: the **primary model** runs all agent sessions; the **secondary model** runs fast passes (chapter audits). Pickers list exactly the models installed backends report. `claude-fable-5` is probed at startup and offered only if the CLI accepts it.

For heavy manuscript-wide jobs on backends without large tool budgets, a **multi-call orchestrator** splits work into batched read passes (~20K words per batch, max 8) that write scratch trackers to `source/.scratch/`, followed by a synthesis call. Retries add 5 extra turns per attempt, max 2 retries.

## How Agents Get Context

Context assembly is deterministic (no LLM-driven selection):

1. **File manifest** — all project files with word counts, so agents know what's available to read with their own tools
2. **Per-agent read guidance** — static required/relevant/irrelevant file lists per agent
3. **Dynamic conversation compaction** — remaining budget = 200K − (system prompt + thinking budget + response reserve + 14K); turns kept by bucket: generous (all), moderate (8), tight (4), critical (2). Token estimation is `chars / 4`.
4. **Author-edit awareness** — when you hand-edit chapters, a capped (≤120-line) unified diff of your changes vs. the agent baseline is injected into Verity's context as "Author Edits Since Your Last Draft"

Per-call context diagnostics (files listed, turns kept/dropped, manifest tokens) are surfaced in the activity drawer.

## The Pipeline, Precisely

14 phases with file-based completion detection (`PipelineService`). A phase is complete only when its detection passes **and** the author confirms advancement.

| # | Phase | Agent | Detected when |
|---|-------|-------|----------------|
| 1 | Story Pitch | Spark | `source/pitch.md` ≥50 words |
| 2 | Story Scaffold | Verity | `source/scene-outline.md` ≥200 words |
| 3 | First Draft | Verity | chapters exist, >1,000 total words, book status advanced |
| 4 | First Read | Ghostlight | `source/reader-report.md` ≥50 words |
| 5 | Structural Assessment | Lumen | `source/dev-report.md` ≥50 words |
| 6 | Revision Plan | Forge | `project-tasks.md` + `revision-prompts.md` ≥50 words |
| 7 | Revision | Verity | `reader-report-v1.md` archived |
| 8 | Second Read | Ghostlight | fresh `reader-report.md` differs from v1 |
| 9 | Second Assessment | Lumen | fresh `dev-report.md` differs from v1 |
| 10 | Copy Edit | Sable | `source/audit-report.md` ≥50 words |
| 11 | Fix Planning | Forge | new tasks/prompts + archived v1 copies |
| 12 | Mechanical Fixes | Verity | `audit-report.md` + status ≥ copy-edit |
| 13 | Build | — | `dist/{slug}.md` generated |
| 14 | Publish & Audit | Quill | `source/metadata.md` ≥50 words |

Default per-agent thinking budgets: Spark 4K, Verity 10K, Ghostlight 6K, Lumen 16K, Sable 4K, Forge 8K, Quill 4K tokens (internal Wrangler 4K, Helper 2K). On the Claude CLI, thinking passes `--effort high`.

## Feature Internals

- **Auto-Draft** — a renderer-driven loop: Verity drafts one chapter per iteration until she signals `DRAFT_COMPLETE`; each chapter passes through the audit→fix pipeline, and a motif/phrase audit runs every 3 chapters. Hard iteration cap as a safety valve.
- **Verity Audit Pipeline** — audit pass on the secondary model (4096 max tokens, 120s timeout); fix pass triggers at severity ≥ *moderate*; results stream to the activity drawer without blocking.
- **Revision Queue** — a Wrangler agent call parses Forge's plan into structured session JSON, cached by normalized content hash (`source/revision-plan-cache.json`) so it only re-runs when the plan changes. Sessions run as Verity conversations with keyword-detected approval gates; four modes (manual / auto-approve / auto-skip / selective); state persists in `source/revision-queue-state.json`; two revision cycles (structural, mechanical) auto-detected.
- **Version history** — every file write snapshots to SQLite with SHA-256 dedup; source tagged `user`/`agent`/`revert`; pruned to 50 versions per file per book, always pinning the latest agent baseline for edit diffs.
- **File watchers** — a recursive debounced watcher on the active book (filters `.DS_Store`, swap/tmp files, SQLite journals) and a non-recursive watcher on `books/` for folder add/remove.
- **Motif ledger normalization** — malformed agent-written JSON is brace-repaired, then normalized to the canonical schema via a single `maxTurns: 1` model call.
- **Imports** — `.md`/`.markdown`/`.txt` direct, `.docx` via Pandoc; chapter boundaries by "Chapter N"/heading regex (≥3 matches) with single-chapter fallback; optional post-import source generation (Spark → pitch; Verity → outline+bible, voice profile, motif ledger).
- **Exports** — `BuildService` assembles `dist/{slug}.md`, then runs Pandoc per format: DOCX and EPUB3 (with cover image if present). Format failures are independent.
- **Notifications** — OS-level, only when the window is unfocused; chat/error/revision/queue/build events; click to focus.
- **PATH fix** — on launch the login shell's PATH is recovered (`$SHELL -l -c 'echo $PATH'`) so GUI-launched apps can find `claude`/`codex`/`ollama`.
- **Orphan recovery** — stream sessions are tracked in SQLite; interrupted sessions are recovered on startup, stream events pruned after 7 days.

## Building for Distribution

```bash
npm run package    # package the app (no installer)
npm run make       # platform installers (DMG, Squirrel, DEB, RPM)
npm run ci-build   # CI pipeline: make + collect installers + SHA-256 checksums
npm run lint       # tsc --noEmit
```

Electron Forge config lives in [`forge.config.ts`](./forge.config.ts):

- **extraResource**: the Pandoc binary (`resources/pandoc/`, fetch with `npm run download-pandoc` — Pandoc 3.6.4 per-platform), the `agents/` prompt files, and `docs/` (user guide for the Helper agent)
- **macOS**: ZIP + DMG makers. Signing/notarization activate only when `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` are set — public builds are currently **unsigned** (hence the right-click-Open dance in the README)
- **Windows**: Squirrel maker; optional signing via `WINDOWS_CERTIFICATE_FILE`/`WINDOWS_CERTIFICATE_PASSWORD`
- **Linux**: Deb + Rpm makers
- Utility scripts: `scripts/ci-build.js` (installer collection + checksums), `scripts/generate-icons.js`, `scripts/download-pandoc.js`

## Project Structure

### Source (187 TypeScript/TSX files, five clean-architecture layers)

```
src/
├── domain/                              # LAYER 1: Pure types, zero imports
│   ├── types.ts / interfaces.ts / constants.ts   # types, ports, agent registry,
│   │                                              #   pipeline phases, providers
│   └── statusMessages.ts / index.ts
│
├── infrastructure/                      # LAYER 2: Implements domain interfaces
│   ├── settings/                        # Settings persistence, CLI detection (claude/codex/ollama)
│   ├── database/                        # SQLite schema, forward-only migrations, queries
│   ├── agents/                          # Loads agent .md prompts, composite assembly
│   ├── filesystem/                      # Book CRUD, pitches, covers, archiving + 2 watchers
│   ├── claude-cli/                      # Claude CLI wrapper: NDJSON streaming, session tracking
│   ├── codex-cli/                       # Codex CLI wrapper: sandboxed exec, add-dir detection
│   ├── ollama-cli/                      # Ollama runner + agentic tool loop + context compactor
│   ├── llama-server/                    # llama.cpp client: SSE, <think> parsing, tool calls
│   ├── providers/                       # Provider registry + OpenAI-compatible provider
│   ├── series/                          # Series CRUD, volume management, series bible I/O
│   └── pandoc/                          # Pandoc binary path resolution
│
├── application/                         # LAYER 3: Business logic via injected interfaces
│   ├── ChatService.ts                   # Send → route → stream → save + chapter deep dive
│   ├── ContextBuilder.ts                # Budget-aware context assembly with compaction
│   ├── MultiCallOrchestrator.ts         # Batched multi-call runs for heavy agents
│   ├── PipelineService.ts               # Phase detection with confirmation gates
│   ├── BuildService.ts                  # Pandoc execution for DOCX/EPUB
│   ├── RevisionQueueService.ts          # Plan parsing, session execution, approval gates
│   ├── AuditService.ts                  # Verity audit/fix pipeline, motif audit
│   ├── VersionService.ts                # Snapshots, diffs, revert, author-edit baselines
│   ├── HotTakeService / AdhocRevisionService / PitchRoomService / HelperService
│   ├── ManuscriptImportService / SeriesImportService / SourceGenerationService
│   ├── MotifLedgerService / ChapterValidator / FindReplaceService
│   ├── DashboardService / StatisticsService / StreamManager / UsageService
│   ├── thinkingBudget.ts                # Budget resolution: message > global > per-agent
│   ├── context/TokenEstimator.ts        # ~4 chars/token estimation
│   └── import/ChapterDetector.ts        # Chapter boundary detection for import
│
├── main/                                # LAYER 4: Electron main process
│   ├── index.ts                         # Composition root — the only place classes are new'd
│   ├── bootstrap.ts                     # First-run setup; agent prompt restore
│   ├── notifications.ts                 # OS notification manager
│   └── ipc/handlers.ts                  # Thin adapter: IPC channel → service call
│
├── preload/index.ts                     # contextBridge: typed window.novelEngine API
│
└── renderer/                            # LAYER 5: React UI
    ├── App.tsx / main.tsx               # Onboarding gate, React 18 entry
    ├── stores/                          # 25 Zustand stores
    ├── components/                      # Library, Workbench, PipelineSpine, Manuscript,
    │                                    #   Palette, Rail, StatusBar, Chat, Exports, Files,
    │                                    #   PitchRoom, Series, MotifLedger, RevisionQueue,
    │                                    #   Import, Onboarding, Settings, Statistics,
    │                                    #   CliActivity, Helper, ErrorBoundary, Layout, common
    ├── hooks/ · tours/ · styles/
```

### User data directory

All user data lives outside the app bundle (`~/Library/Application Support/Novel Engine` on macOS):

```
{userData}/
├── .initialized · settings.json · active-book.json · author-profile.md · USER_GUIDE.md
├── novel-engine.db               # SQLite: conversations, messages, usage, streams,
│                                 #   file versions, word-count snapshots
├── custom-agents/                # Editable agent .md prompts — restored, never overwritten
├── series/{slug}/                # series.json + series-bible.md
└── books/
    ├── _archived/{slug}/         # Archived books
    ├── _pitches/{slug}.md        # Shelved pitches
    ├── __pitch-room__/drafts/{conversationId}/source/pitch.md
    └── {slug}/
        ├── about.json · cover.* · pipeline-state.json
        ├── source/               # pitch, scene-outline, story-bible, voice-profile,
        │                         #   reports (+v1 archives), tasks/prompts, metadata,
        │                         #   style-sheet, motif-ledger.json,
        │                         #   revision-plan-cache.json, revision-queue-state.json,
        │                         #   .scratch/ (multi-call trackers)
        ├── chapters/00-0-copyright/ · 00-1-dedication/ · NN-slug/{draft.md,notes.md} · zN-slug/
        ├── assets/
        └── dist/                 # Build outputs (md, docx, epub)
```

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

## Architecture

Novel Engine follows **Clean Architecture** with five strict layers:

```
DOMAIN ← INFRASTRUCTURE ← APPLICATION ← IPC/MAIN ← RENDERER
```

- **Domain** ([`src/domain/`](./src/domain/)) — Pure TypeScript types, interfaces, constants. Zero imports.
- **Infrastructure** ([`src/infrastructure/`](./src/infrastructure/)) — SQLite with forward-only migrations, filesystem I/O with watchers, four AI-backend clients plus an OpenAI-compatible provider, provider registry, series storage, settings, Pandoc resolution.
- **Application** ([`src/application/`](./src/application/)) — Business logic through injected interfaces: chat routing, context building, multi-call orchestration, pipeline detection, builds, audits, revision queue, version history, imports, statistics.
- **Main/IPC** ([`src/main/`](./src/main/)) — Composition root, thin IPC handlers, first-run bootstrap, OS notifications. Window: 1400×900 (min 900×600), hidden-inset title bar, `contextIsolation: true`, `nodeIntegration: false`.
- **Renderer** ([`src/renderer/`](./src/renderer/)) — React + 25 Zustand stores. Backend access exclusively via `window.novelEngine` (preload bridge); may import domain types, never values.

All services are constructor-injected; concrete classes are instantiated only in [`src/main/index.ts`](./src/main/index.ts). Full layer docs: [docs/architecture/](./docs/architecture/ARCHITECTURE.md).

## Database Schema

Eight SQLite tables (WAL mode, foreign keys enabled, forward-only migrations):

| Table | Purpose |
|-------|---------|
| `conversations` | All agent conversations per book — agent, phase, purpose, timestamps |
| `messages` | Individual messages with role, content, and thinking block text |
| `token_usage` | Per-call token counts (input, output, thinking) by model |
| `stream_events` | Persisted stream events for session replay and recovery |
| `stream_sessions` | AI invocations tracked for orphan detection and recovery |
| `file_versions` | Content snapshots with SHA-256 dedup for version history and revert |
| `word_count_snapshots` | Word-count history powering the statistics charts |
| `schema_version` | Records which schema migrations have been applied |

---

## License

[AGPL-3.0-only](LICENSE) — applies to the application source code. Content created *with* the application (manuscripts, outlines, exports) belongs entirely to its author.
