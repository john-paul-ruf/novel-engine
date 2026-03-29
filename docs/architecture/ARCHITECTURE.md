# Architecture — Novel Engine

> Last updated: 2026-03-28

Electron + React 18 + TypeScript 5 + Tailwind v4 + Zustand + better-sqlite3 + Claude Code CLI + Pandoc

See domain-specific docs:
- [Domain](./DOMAIN.md) — Types, interfaces, constants
- [Infrastructure](./INFRASTRUCTURE.md) — Database, filesystem, CLI, settings, agents, Pandoc
- [Application](./APPLICATION.md) — Services and orchestration
- [IPC](./IPC.md) — Channels, preload bridge, handler registry
- [Renderer](./RENDERER.md) — Stores, components, views

---

## Layers

```
DOMAIN ← INFRASTRUCTURE ← APPLICATION ← IPC/MAIN ← RENDERER
```

- **Domain** (`src/domain/`) — Pure types. Zero imports. Everything depends on this.
- **Infrastructure** (`src/infrastructure/`) — Implements domain interfaces. Isolated modules.
- **Application** (`src/application/`) — Orchestrates infrastructure through injected interfaces.
- **Main/IPC** (`src/main/`, `src/preload/`) — Composition root + thin IPC adapters.
- **Renderer** (`src/renderer/`) — React + Zustand. Talks to backend only through preload bridge.

---

## Source Tree

```
src/
├── domain/                                  # LAYER 1: Pure types, zero imports
│   ├── types.ts                             # All shared type definitions
│   ├── interfaces.ts                        # Service contracts (ports)
│   ├── constants.ts                         # Agent registry, pipeline phases, defaults, quick actions, status messages
│   └── index.ts                             # Barrel export
│
├── infrastructure/                          # LAYER 2: Implements domain interfaces
│   ├── settings/
│   │   ├── SettingsService.ts               # CLI detection, preferences, JSON persistence
│   │   └── index.ts
│   ├── database/
│   │   ├── schema.ts                        # SQLite CREATE TABLE statements, WAL mode, foreign keys
│   │   ├── DatabaseService.ts               # Conversations, messages, usage, stream events repos
│   │   └── index.ts
│   ├── agents/
│   │   ├── AgentService.ts                  # Reads agent .md files from disk, composite loading
│   │   └── index.ts
│   ├── filesystem/
│   │   ├── FileSystemService.ts             # Book CRUD, file I/O, shelved pitches, pitch room
│   │   ├── BookWatcher.ts                   # Watches active book dir for file changes
│   │   ├── BooksDirWatcher.ts               # Watches books/ root for new/deleted books
│   │   └── index.ts
│   ├── claude-cli/
│   │   ├── ClaudeCodeClient.ts              # Spawns `claude` process, streams NDJSON, lifecycle
│   │   ├── StreamSessionTracker.ts          # Tracks active stream sessions for orphan recovery
│   │   └── index.ts
│   ├── pandoc/
│   │   └── index.ts                         # Pandoc binary path resolution (dev vs packaged)
│   └── series/
│       ├── SeriesService.ts                 # File-based series CRUD, reverse-lookup cache
│       └── index.ts
│
├── application/                             # LAYER 3: Business logic, depends on interfaces
│   ├── ContextBuilder.ts                    # Assembles context per agent read guidance + conversation compaction
│   ├── ChatService.ts                       # Full send→stream→save orchestration (via CLI)
│   ├── ChapterValidator.ts                  # Validates/corrects chapter file placement
│   ├── PipelineService.ts                   # Phase detection from file existence + book status
│   ├── BuildService.ts                      # Pandoc execution for DOCX/EPUB/PDF
│   ├── UsageService.ts                      # Token tracking, cost estimation
│   ├── RevisionQueueService.ts              # Parses Forge output, executes revision sessions
│   ├── MotifLedgerService.ts                # Motif ledger CRUD from JSON on disk
│   ├── VersionService.ts                   # File versioning: snapshot, diff, revert, prune
│   ├── ManuscriptImportService.ts           # DOCX/MD import, chapter detection, book creation
│   ├── SeriesImportService.ts              # Batch import + series creation orchestration
│   ├── SourceGenerationService.ts           # Multi-agent source document generation
│   ├── HelperService.ts                     # In-app help assistant (user guide as context)
│   ├── FindReplaceService.ts               # Bulk find & replace across chapter drafts; safe revert via snapshots
│   ├── import/
│   │   └── ChapterDetector.ts               # Pure chapter break detection utility
│   ├── context/
│   │   └── TokenEstimator.ts                # Pure token counting utility
│   └── index.ts                             # Barrel export
│
├── main/                                    # LAYER 4: Electron main process
│   ├── index.ts                             # COMPOSITION ROOT — instantiates everything
│   ├── bootstrap.ts                         # First-run directory/file creation
│   ├── notifications.ts                     # OS notification manager
│   └── ipc/
│       └── handlers.ts                      # Thin adapter: IPC channel → service call
│
├── preload/
│   └── index.ts                             # contextBridge: typed API for renderer
│
└── renderer/                                # LAYER 5: React UI
    ├── App.tsx                              # Root component, onboarding gate
    ├── main.tsx                             # React 18 createRoot entry
    ├── stores/
    │   ├── settingsStore.ts
    │   ├── bookStore.ts
    │   ├── chatStore.ts
    │   ├── pipelineStore.ts
    │   ├── viewStore.ts
    │   ├── tourStore.ts                  # Tour lifecycle: start, complete, dismiss, replay
    │   ├── pitchRoomStore.ts
    │   ├── pitchShelfStore.ts
    │   ├── revisionQueueStore.ts
    │   ├── autoDraftStore.ts
    │   ├── cliActivityStore.ts
    │   ├── fileChangeStore.ts
    │   ├── modalChatStore.ts
    │   ├── motifLedgerStore.ts
    │   ├── importStore.ts
    │   ├── helperStore.ts                # In-app help assistant panel state
    │   └── streamHandler.ts              # Shared stream event handler factory
    ├── tours/
    │   └── tourDefinitions.ts            # Step arrays for welcome, first-book, pipeline-intro tours
    ├── components/
    │   ├── common/                          # Tooltip, GuidedTourOverlay
    │   ├── Layout/                          # AppLayout, Sidebar, TitleBar, ResizeHandle
    │   ├── Onboarding/                      # OnboardingWizard
    │   ├── Settings/                        # SettingsView
    │   ├── Sidebar/                         # BookSelector, PipelineTracker, FileTree, action buttons
    │   ├── Chat/                            # ChatView, MessageBubble, ThinkingBlock, ChatInput, etc.
    │   ├── Files/                           # FilesView, FileBrowser, FileEditor, StructuredBrowser
    │   ├── Build/                           # BuildView
    │   ├── PitchRoom/                       # PitchRoomView
    │   ├── RevisionQueue/                   # RevisionQueueView, SessionCard, TaskProgress, etc.
    │   ├── MotifLedger/                     # MotifLedgerView + tabs (Entries, Systems, Foreshadow, etc.)
    │   ├── Import/                          # ImportWizard, ChapterPreviewList, ImportSeriesWizard, VolumePreviewList
    │   ├── CliActivity/                     # CliActivityPanel
    │   ├── Helper/                          # HelperButton, HelperPanel, HelperMessageList
    │   └── ErrorBoundary/                   # ErrorBoundary
    ├── hooks/
    │   ├── useResizeHandle.ts
    │   ├── useRevisionQueueEvents.ts
    │   ├── useRotatingStatus.ts
    │   ├── useTheme.ts
    │   ├── useTooltip.ts                 # Tooltip positioning, delays, viewport clamping
    │   └── useVerticalResize.ts
    └── styles/
        └── globals.css
```

---

## Service Dependencies

Composition root: `src/main/index.ts`

```
SettingsService(userDataPath)
DatabaseService(dbPath)
AgentService(agentsDir)
FileSystemService(booksDir, userDataPath)
ClaudeCodeClient(booksDir, db)

UsageService
└── IDatabaseService (DatabaseService)

ChapterValidator(booksDir)

ChatService
├── ISettingsService (SettingsService)
├── IAgentService (AgentService)
├── IDatabaseService (DatabaseService)
├── IProviderRegistry (ProviderRegistry)
├── IFileSystemService (FileSystemService)
├── UsageService
└── ChapterValidator

PipelineService
└── IFileSystemService (FileSystemService)

BuildService
├── IFileSystemService (FileSystemService)
├── pandocPath: string
└── booksDir: string

RevisionQueueService
├── IFileSystemService (FileSystemService)
├── IProviderRegistry (ProviderRegistry)
├── IAgentService (AgentService)
├── IDatabaseService (DatabaseService)
└── ISettingsService (SettingsService)

MotifLedgerService
└── IFileSystemService (FileSystemService)

VersionService
├── IDatabaseService (DatabaseService)
└── IFileSystemService (FileSystemService)

ManuscriptImportService
├── IFileSystemService (FileSystemService)
└── pandocPath: string

SeriesImportService
├── IManuscriptImportService (ManuscriptImportService)
└── ISeriesService (SeriesService)

SourceGenerationService
├── ISettingsService (SettingsService)
├── IAgentService (AgentService)
├── IDatabaseService (DatabaseService)
├── IFileSystemService (FileSystemService)
└── IProviderRegistry (ProviderRegistry)

HelperService
├── ISettingsService (SettingsService)
├── IAgentService (AgentService)
├── IDatabaseService (DatabaseService)
├── IFileSystemService (FileSystemService)
├── IProviderRegistry (ProviderRegistry)
├── StreamManager
└── userDataPath: string

FindReplaceService
├── IFileSystemService (FileSystemService)
└── IVersionService (VersionService)

NotificationManager
└── ISettingsService (SettingsService)

BookWatcher(booksDir, callback)
BooksDirWatcher(booksDir, callback)
```

---

## Conventions

### Path Aliases

| Alias | Maps To |
|-------|---------|
| `@domain/*` | `src/domain/*` |
| `@infra/*` | `src/infrastructure/*` |
| `@app/*` | `src/application/*` |

### File Naming

- Domain types: `PascalCase` type names in `camelCase.ts` files
- Infrastructure: `PascalCaseService.ts` implementing `IPascalCaseService`
- Application: `PascalCaseService.ts`
- Components: `PascalCase.tsx` in `PascalCase/` directories
- Stores: `camelCaseStore.ts`
- Barrel exports: `index.ts` in every infrastructure subdirectory

### Renderer Value Import Exception

The renderer layer normally uses `import type` only from domain. However, **pure data constants and pure functions with zero Node.js dependencies** may be imported as values. This avoids routing static configuration through the IPC bridge unnecessarily.

**Criteria for allowed value imports:**
- Zero Node.js imports (no `fs`, `path`, `child_process`, etc.)
- No side effects (no I/O, no global state mutation)
- Statically defined data or pure functions

**Allowed imports from `@domain/constants`:**
- `AGENT_REGISTRY`, `PIPELINE_PHASES`, `CREATIVE_AGENT_NAMES`
- `AGENT_QUICK_ACTIONS`, `AVAILABLE_MODELS`
- `CHARS_PER_TOKEN`, `PITCH_ROOM_SLUG`

**Allowed imports from `@domain/statusMessages`:**
- `randomRespondingStatus()`, `randomPitchRoomFlavor()`

**NOT allowed from renderer:**
- Infrastructure classes, application services, or any module with I/O

### Security

- `contextIsolation: true` — always
- `nodeIntegration: false` — always
- No API keys stored — Claude Code CLI handles its own authentication
- All renderer↔main communication through the preload bridge
- Custom `novel-asset://` protocol for serving local files (cover images) to renderer

### Book Directory Structure

```
{userData}/
├── books/
│   └── {slug}/
│       ├── about.json              # BookMeta
│       ├── source/                 # Agent output files
│       │   ├── pitch.md
│       │   ├── voice-profile.md
│       │   ├── scene-outline.md
│       │   ├── story-bible.md
│       │   ├── reader-report.md
│       │   ├── dev-report.md
│       │   ├── audit-report.md
│       │   ├── project-tasks.md
│       │   ├── revision-prompts.md
│       │   ├── style-sheet.md
│       │   ├── motif-ledger.json
│       │   └── metadata.md
│       ├── chapters/
│       │   └── NN-slug/
│       │       ├── draft.md
│       │       └── notes.md
│       └── dist/                   # Build outputs
├── custom-agents/                  # Agent .md prompt files
├── author-profile.md              # Global author profile
├── active-book.json               # { "book": "slug-name" }
├── settings.json                  # AppSettings
└── novel-engine.db                # SQLite database
```

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Shell | Electron | 33.4.0 |
| Bundler | Vite (via Electron Forge) | ^5.4.21 |
| Framework | React | ^18.3.0 |
| Language | TypeScript | ~5.5.0 |
| Styling | Tailwind CSS | ^4.0.0 |
| State | Zustand | ^5.0.0 |
| Database | better-sqlite3 | ^11.0.0 |
| AI Backend | Claude Code CLI | (system-installed) |
| Build | Pandoc | (bundled binary) |
| IDs | nanoid | 3 |
| Markdown | marked | ^15.0.0 |
| Archive | archiver | ^7.0.1 |
| Build Tool | Electron Forge | ^7.11.1 |
