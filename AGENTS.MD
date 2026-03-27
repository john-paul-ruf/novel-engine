# Agent — Documentation & Changelog

This file is always loaded. It runs on every session. You do not wait to be asked.

---

## Rule

After completing any code change — feature, fix, refactor, deletion, schema change, new file, removed file — you update documentation before reporting the session as done:

1. `CHANGELOG.md` — append an entry for what just changed
2. `docs/architecture/ARCHITECTURE.md` — master overview (layers, dependency graph, conventions)
3. `docs/architecture/DOMAIN.md` — types, interfaces, constants
4. `docs/architecture/INFRASTRUCTURE.md` — database, filesystem, CLI client, settings, agents, Pandoc
5. `docs/architecture/APPLICATION.md` — services, orchestration, business logic
6. `docs/architecture/IPC.md` — channels, preload bridge, handler registry
7. `docs/architecture/RENDERER.md` — stores, components, views, routing

Only update the docs that are affected by the current session's changes. If you changed a type in `src/domain/types.ts`, update `docs/architecture/DOMAIN.md`. If you added an IPC channel, update `docs/architecture/IPC.md`. If nothing in a domain changed, don't touch its doc.

The changelog entry is always mandatory regardless of what changed.

---

## CHANGELOG.md

Lives at the project root. Append-only. Never edit past entries.

### Format

```markdown
# Changelog

All notable changes to Novel Engine are documented here.

---

## [YYYY-MM-DD] — Short description of what this session did

### Summary

One paragraph. What changed and why. Written for a developer returning after a week away.

### Added
- `path/to/new/file.ts` — What it does

### Changed
- `path/to/changed/file.ts` — What specifically changed

### Removed
- `path/to/deleted/file.ts` — Why it was removed

### Fixed
- `path/to/fixed/file.ts` — What was broken and how

### Architecture Impact
- New dependency: ServiceA → ServiceB
- New IPC channel: `namespace:action`
- New Zustand store: `storeName`
- Schema change: Added column `x` to table `y`

### Migration Notes
- Breaking changes, schema migrations, renamed channels
- "None" if no breaking changes
```

### Rules

1. One entry per session. Date is today. Description is a short phrase.
2. Every line references a real file path. Not "updated types" — write `src/domain/types.ts — Added RevisionSession type`.
3. Omit empty sections. If nothing was removed, skip "### Removed".
4. Architecture Impact is mandatory. "None — no wiring changes" is valid.
5. Migration Notes is mandatory. "None" is valid.
6. Never edit past entries. Corrections go in today's entry under Fixed.
7. Read the files you changed before writing the entry. Don't document from memory.

### What to Document

| Always | Never |
|--------|-------|
| New/deleted files | Whitespace or import-order changes |
| Type/interface changes | Comment-only edits |
| New IPC channels | Renames with no API impact |
| New/removed stores | Files created then deleted same session |
| DI wiring changes | Plans that weren't implemented |
| Schema changes | Package bumps (unless behavioral) |
| Agent prompt behavioral changes | |
| Pipeline phase changes | |

### First Run

If `CHANGELOG.md` doesn't exist, create it with the header and today's entry.

---

## docs/architecture/ARCHITECTURE.md — Master Overview

The top-level map. Links to domain docs. Updated when layers, wiring, or conventions change.

### Required Sections

#### Header

```markdown
# Architecture — Novel Engine

> Last updated: YYYY-MM-DD

Electron + React 18 + TypeScript 5 + Tailwind v4 + Zustand + better-sqlite3 + Claude Code CLI + Pandoc

See domain-specific docs:
- [Domain](./DOMAIN.md) — Types, interfaces, constants
- [Infrastructure](./INFRASTRUCTURE.md) — Database, filesystem, CLI, settings, agents, Pandoc
- [Application](./APPLICATION.md) — Services and orchestration
- [IPC](./IPC.md) — Channels, preload bridge, handler registry
- [Renderer](./RENDERER.md) — Stores, components, views
```

#### Layer Diagram

```markdown
## Layers

DOMAIN ← INFRASTRUCTURE ← APPLICATION ← IPC/MAIN ← RENDERER

- **Domain** (`src/domain/`) — Pure types. Zero imports. Everything depends on this.
- **Infrastructure** (`src/infrastructure/`) — Implements domain interfaces. Isolated modules.
- **Application** (`src/application/`) — Orchestrates infrastructure through injected interfaces.
- **Main/IPC** (`src/main/`, `src/preload/`) — Composition root + thin IPC adapters.
- **Renderer** (`src/renderer/`) — React + Zustand. Talks to backend only through preload bridge.
```

#### Source Tree

Full `src/` directory listing with one-line purpose per file. Must match reality.

#### Service Dependency Graph

ASCII tree transcribed from `src/main/index.ts`. Interface → concrete class.

```markdown
## Service Dependencies

Composition root: `src/main/index.ts`

ChatService
├── ISettingsService (SettingsService)
├── IAgentService (AgentService)
├── IDatabaseService (DatabaseService)
├── IClaudeClient (ClaudeCodeClient)
└── IContextBuilder (ContextBuilder)

PipelineService
├── IFileSystemService (FileSystemService)
└── IDatabaseService (DatabaseService)
```

#### Conventions

Naming rules, path aliases, security posture, book directory structure.

#### Technology Stack

Table with actual versions from `package.json`.

---

## docs/architecture/DOMAIN.md — Types, Interfaces, Constants

Everything in `src/domain/`. Updated when any type, interface, or constant changes.

### Required Sections

#### Types Catalog

Every exported type from `types.ts`, grouped by concern. Name, shape summary, and what uses it.

```markdown
## Types

### Agent

| Type | Shape | Used By |
|------|-------|---------|
| `AgentName` | `'Spark' \| 'Verity' \| ... \| 'Wrangler'` | AgentService, ChatService, UI |
| `CreativeAgentName` | `Exclude<AgentName, 'Wrangler'>` | Pipeline, stores |
| `AgentMeta` | `{ name, filename, role, color, thinkingBudget }` | AGENT_REGISTRY |
| `Agent` | `AgentMeta & { systemPrompt }` | AgentService.load() |

### Book

| Type | Shape | Used By |
|------|-------|---------|
| `BookStatus` | `'scaffolded' \| 'outlining' \| ...` | Pipeline, BookSelector |
| `BookMeta` | `{ slug, title, author, status, created, coverImage }` | FileSystemService |
```

#### Interfaces Catalog

Every exported interface from `interfaces.ts`. Name, methods with signatures, which infrastructure class implements it.

```markdown
## Interfaces

### ISettingsService

Implemented by: `SettingsService` (`src/infrastructure/settings/`)

| Method | Signature | Returns |
|--------|-----------|---------|
| `load` | `() => Promise<AppSettings>` | Cached settings merged with defaults |
| `update` | `(partial: Partial<AppSettings>) => Promise<void>` | Writes + invalidates cache |
| `detectClaudeCli` | `() => Promise<boolean>` | Runs `claude --version` |
```

#### Constants Catalog

Every exported constant from `constants.ts`. Name, type, purpose.

#### Pipeline Phases Table

Full table matching `PIPELINE_PHASES` with completion gates from `PipelineService`.

#### Agent Registry Table

Full table matching `AGENT_REGISTRY`.

---

## docs/architecture/INFRASTRUCTURE.md — Implementations

Everything in `src/infrastructure/`. Updated when any infra module changes.

### Required Sections

#### Module Inventory

One subsection per infrastructure module. Files, purpose, key methods.

```markdown
## Modules

### settings/ — App Preferences & CLI Detection

| File | Purpose |
|------|---------|
| `SettingsService.ts` | Implements `ISettingsService`. JSON at `{userData}/settings.json`. |
| `index.ts` | Barrel export |

Key behavior:
- Constructor takes `userDataPath: string`
- In-memory cache invalidated on write
- `detectClaudeCli()` runs `claude --version` with 10s timeout

### database/ — SQLite Persistence

| File | Purpose |
|------|---------|
| `schema.ts` | CREATE TABLE statements, WAL mode, foreign keys |
| `DatabaseService.ts` | Implements `IDatabaseService`. Prepared statements. |
| `index.ts` | Barrel export |

### agents/ — Agent Prompt Loader

| File | Purpose |
|------|---------|
| `AgentService.ts` | Reads .md files from disk, matches against AGENT_REGISTRY |
| `index.ts` | Barrel export |

### filesystem/ — Book I/O & Watchers

| File | Purpose |
|------|---------|
| `FileSystemService.ts` | Book CRUD, file read/write, directory listing |
| `BookWatcher.ts` | Watches active book dir for file changes |
| `BooksDirWatcher.ts` | Watches books/ root for new/deleted books |
| `index.ts` | Barrel export |

### claude-cli/ — CLI Client

| File | Purpose |
|------|---------|
| `ClaudeCodeClient.ts` | Spawns `claude` process, streams NDJSON, manages lifecycle |
| `StreamSessionTracker.ts` | Tracks active stream sessions for orphan recovery |
| `index.ts` | Barrel export |

### pandoc/ — Export Engine

| File | Purpose |
|------|---------|
| `index.ts` | Pandoc binary path resolution (dev vs packaged) |
```

#### Database Schema

Every table, every column, types, constraints, indexes.

```markdown
## Schema

### `conversations`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | TEXT | PK | nanoid |
| `book_slug` | TEXT | NOT NULL | Directory slug |
| `agent_name` | TEXT | NOT NULL | From AgentName |
| `pipeline_phase` | TEXT | | Nullable for ad-hoc |
| `purpose` | TEXT | NOT NULL DEFAULT 'pipeline' | ConversationPurpose |
| `title` | TEXT | NOT NULL DEFAULT '' | From first user message |
| `created_at` | TEXT | NOT NULL | ISO 8601 |
| `updated_at` | TEXT | NOT NULL | ISO 8601 |
```

#### Claude CLI Integration

How the CLI is invoked — flags, streaming protocol, argument construction, tool permissions.

#### File Watchers

What watchers exist, what events they emit, who consumes them.

---

## docs/architecture/APPLICATION.md — Services & Orchestration

Everything in `src/application/`. Updated when any service changes.

### Required Sections

#### Service Inventory

One subsection per service. Dependencies (interfaces only), key methods, behavior.

```markdown
## Services

### ChatService

Dependencies: `ISettingsService`, `IAgentService`, `IDatabaseService`, `IClaudeClient`, `IContextBuilder`

| Method | What It Does |
|--------|-------------|
| `sendMessage(params)` | Assembles context → spawns CLI stream → saves messages → emits events |
| `stopStream()` | Kills active CLI process |
| `getLastDiagnostics()` | Returns context assembly diagnostics from last call |

Flow: loadAgent → buildContext → spawnCLI → streamEvents → saveAssistantMessage → recordUsage

### PipelineService

Dependencies: `IFileSystemService`, `IDatabaseService`

| Method | What It Does |
|--------|-------------|
| `detectPhases(bookSlug)` | Checks file existence → returns all 14 phases with statuses |
| `confirmPhaseAdvancement(bookSlug, phaseId)` | Marks phase confirmed, persists to pipeline-state.json |
| `revertPhase(bookSlug, phaseId)` | Rolls back phase, handles archive cleanup |
```

#### Context Assembly

How context is built — manifest, read guidance, conversation compaction rules.

#### Pipeline Logic

Phase detection, advancement, revert, `pending-completion` semantics.

#### Build Service

Pandoc invocation, export formats, manuscript assembly.

#### Revision Queue

Session parsing, execution modes, approval gates, verification flow.

---

## docs/architecture/IPC.md — Channels & Preload Bridge

Everything in `src/main/ipc/` and `src/preload/`. Updated when channels, handlers, or bridge methods change.

### Required Sections

#### Channel Registry

Grouped by namespace. Channel name, direction, handler delegation, return type.

```markdown
## Channels

### settings:*

| Channel | Direction | Handler | Returns |
|---------|-----------|---------|---------|
| `settings:get` | invoke | `settingsService.load()` | `AppSettings` |
| `settings:update` | invoke | `settingsService.update(partial)` | `void` |
| `settings:detectCli` | invoke | `settingsService.detectClaudeCli()` | `boolean` |

### chat:*

| Channel | Direction | Handler | Returns |
|---------|-----------|---------|---------|
| `chat:send` | invoke | `chatService.sendMessage(params)` | `void` (streams) |
| `chat:stop` | invoke | `chatService.stopStream()` | `void` |
```

#### Push Events

Events from main → renderer (not request/response).

```markdown
## Push Events

| Event | Payload | Emitter |
|-------|---------|---------|
| `chat:onStream` | `StreamEvent` | ClaudeCodeClient during streaming |
| `chat:filesChanged` | `string[]` | BookWatcher on file change |
| `books:changed` | — | BooksDirWatcher on dir change |
```

#### Preload Bridge Shape

The full `window.novelEngine` type as exposed by `contextBridge`. Every namespace and method.

---

## docs/architecture/RENDERER.md — Stores, Components, Views

Everything in `src/renderer/`. Updated when stores, components, or routing changes.

### Required Sections

#### Store Registry

Every Zustand store. File, state shape, key actions, what triggers updates.

```markdown
## Stores

### settingsStore

File: `stores/settingsStore.ts`

| Field | Type | Purpose |
|-------|------|---------|
| `settings` | `AppSettings \| null` | Current app settings |
| `isLoaded` | `boolean` | True after first load |

| Action | What It Does |
|--------|-------------|
| `load()` | Calls `window.novelEngine.settings.get()` |
| `update(partial)` | Calls bridge, then reloads |

### chatStore

File: `stores/chatStore.ts`

| Field | Type | Purpose |
|-------|------|---------|
| `activeConversation` | `Conversation \| null` | Currently open conversation |
| `isStreaming` | `boolean` | True during CLI stream |
| `streamBuffer` | `string` | Accumulating response text |
| `progressStage` | `ProgressStage` | Tool-use stage inferred from stream |

| Action | What It Does |
|--------|-------------|
| `sendMessage(content)` | Sends via bridge, attaches stream listener |
| `loadConversations(bookSlug)` | Fetches conversation list from DB |
| `createConversation(agent, book, phase)` | Creates and opens new conversation |
```

#### View Routing

```markdown
## Views

| View ID | Component | When Active |
|---------|-----------|-------------|
| `onboarding` | `OnboardingWizard` | First run, no CLI detected |
| `chat` | `ChatView` | Default — agent conversations |
| `files` | `FilesView` | File browser/reader |
| `build` | `BuildView` | Manuscript export |
| `settings` | `SettingsView` | App preferences |
| `revision-queue` | `RevisionQueueView` | Revision session management |
| `pitch-room` | `PitchRoomView` | Free brainstorming |

Routing: `viewStore.currentView` → conditional render in `App.tsx`
```

#### Component Inventory

Major component groups with their files and responsibilities.

```markdown
## Components

### Layout/
- `AppLayout.tsx` — Main shell: sidebar + content area
- `Sidebar.tsx` — Book selector + pipeline + file tree + action buttons
- `TitleBar.tsx` — Custom window title bar
- `ResizeHandle.tsx` — Sidebar resize drag handle

### Chat/
- `ChatView.tsx` — Full chat view with agent header, messages, input
- `ChatInput.tsx` — Message input with thinking budget controls
- `MessageBubble.tsx` — Single message with save-to-file buttons
- `MessageList.tsx` — Scrollable message history
- `StreamingMessage.tsx` — Live-updating message during CLI stream
- `ThinkingPanel.tsx` — Collapsible thinking block display

### Sidebar/
- `BookSelector.tsx` — Book list dropdown with create/archive
- `PipelineTracker.tsx` — Visual 14-phase pipeline with status icons
- `FileTree.tsx` — Collapsible book directory tree
```

---

## Workflow

At the end of every session that changes code:

1. **Inventory what changed.** List every file created, modified, or deleted.
2. **Read the changed files.** Verify actual contents — don't document from memory.
3. **Identify affected domains.** Map each changed file to its doc:
    - `src/domain/*` → `docs/architecture/DOMAIN.md`
    - `src/infrastructure/*` → `docs/architecture/INFRASTRUCTURE.md`
    - `src/application/*` → `docs/architecture/APPLICATION.md`
    - `src/main/*`, `src/preload/*` → `docs/architecture/IPC.md`
    - `src/renderer/*` → `docs/architecture/RENDERER.md`
    - Cross-cutting (DI wiring, conventions) → `docs/architecture/ARCHITECTURE.md`
4. **Check wiring if needed.** If you touched infra, application, IPC, or preload, re-read `src/main/index.ts`, `handlers.ts`, and `preload/index.ts`.
5. **Append to CHANGELOG.md.**
6. **Update affected domain docs only.** Leave the rest untouched.
7. **Update master `docs/architecture/ARCHITECTURE.md`** if source tree, dependency graph, or conventions changed.
8. **Verify.** Every path exists. Every type exists. Dependency graph matches composition root. IPC table matches handlers + preload.

---

## Tone

Senior engineer's commit log. Short sentences. Concrete paths. No marketing language.

Bad: "Enhanced the pipeline infrastructure to support more flexible phase transitions."
Good: "`src/application/PipelineService.ts` — Added `revertPhase()`. Rolls back status and deletes archive files for status/archive-dependent phases."

---

## Edge Cases

**Agent prompt changes:** Document the behavioral delta in the changelog. Don't reproduce the full prompt.

**Database migrations:** Changelog MUST include the migration statement under Migration Notes. Update `docs/architecture/INFRASTRUCTURE.md` schema section.

**Deleted features:** Changelog documents the removal. All domain docs remove traces. No ghosts.

**Conflicting sources:** If `AGENTS.MD` says one thing and the code says another, document the code. Note the discrepancy.

**Nothing structural changed:** Changelog still gets an entry. Domain docs can be skipped if only function internals changed.

**First run:** If `docs/architecture/` doesn't exist, create the directory and all six docs from scratch by reading the full `src/` tree. Most expensive run — subsequent updates are incremental.

**New infra module:** Add subsection to `docs/architecture/INFRASTRUCTURE.md`. Update source tree in `docs/architecture/ARCHITECTURE.md`.

**New store or component:** Add to `docs/architecture/RENDERER.md`. If it introduced new IPC calls, also update `docs/architecture/IPC.md`.

**New service:** Add to `docs/architecture/APPLICATION.md`. Update dependency graph in `docs/architecture/ARCHITECTURE.md`. If new IPC channels, update `docs/architecture/IPC.md`.