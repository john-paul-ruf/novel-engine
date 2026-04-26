# Infrastructure — Implementations

> Last updated: 2026-04-26

Everything in `src/infrastructure/`. Implements domain interfaces using Node.js builtins and npm packages.

---

## Modules

### settings/ — App Preferences & CLI Detection

| File | Purpose |
|------|---------|
| `SettingsService.ts` | Implements `ISettingsService`. JSON at `{userData}/settings.json`. |
| `index.ts` | Barrel export |

Key behavior:
- Constructor takes `userDataPath: string`
- In-memory cache invalidated on write
- `detectClaudeCli()` runs `claude --version` with timeout
- `detectCodexCli()` runs `codex --version` with timeout
- Settings merged with `DEFAULT_SETTINGS` on load; built-in provider configs are merged by ID so existing settings pick up newly shipped built-ins

### database/ — SQLite Persistence

| File | Purpose |
|------|---------|
| `schema.ts` | CREATE TABLE statements, WAL mode, foreign keys, migration guards |
| `DatabaseService.ts` | Implements `IDatabaseService`. Prepared statements for all queries. |
| `index.ts` | Barrel export |

Key behavior:
- WAL mode + foreign keys enabled at connection time
- Prepared statements stored as class members for reuse
- Explicit snake_case → camelCase mapping in every query method
- `pruneStreamEvents(olderThanDays)` deletes old event data
- `persistStreamEventBatch()` wraps inserts in a transaction for bulk efficiency
- `updateBookSlug` migrates conversation references on slug rename

### agents/ — Agent Prompt Loader

| File | Purpose |
|------|---------|
| `AgentService.ts` | Implements `IAgentService`. Reads .md files from disk, matches against AGENT_REGISTRY. |
| `index.ts` | Barrel export |

Key behavior:
- `loadAll()` reads every agent file from the `custom-agents/` directory
- `load(name)` returns a single `Agent` with full `systemPrompt`
- `loadComposite(base, supplements)` concatenates base + supplement files (used for Verity phase-specific prompts)
- `loadRaw(filename)` reads any file from agents directory by filename

### filesystem/ — Book I/O & Watchers

| File | Purpose |
|------|---------|
| `FileSystemService.ts` | Implements `IFileSystemService`. Book CRUD, file read/write, directory listing, shelved pitches, pitch room drafts. |
| `BookWatcher.ts` | Watches active book dir for file changes, debounced notifications. |
| `BooksDirWatcher.ts` | Watches `books/` root for new/deleted books (folder add/remove). |
| `index.ts` | Barrel export |

Key behavior:
- `FileSystemService` constructor takes `booksDir` and `userDataPath`
- `createBook` generates slug from title, creates directory structure with `about.json`
- `reconcileBookSlugs` renames folders whose name no longer matches the slugified title
- `saveCoverImage` copies image into book directory, updates `about.json`
- `archiveBook`/`unarchiveBook` moves books to/from `_archived/` subdirectory
- Shelved pitches stored in `{userData}/shelved-pitches/{slug}.md` with YAML front matter
- Pitch Room drafts stored in `{userData}/pitch-drafts/{conversationId}/`
- `BookWatcher.watch(slug)` switches which book directory is being monitored
- `BooksDirWatcher.start()` watches for folder-level changes in `books/`

### claude-cli/ — CLI Client

| File | Purpose |
|------|---------|
| `ClaudeCodeClient.ts` | Implements `IClaudeClient` and `IModelProvider`. Spawns `claude` CLI as child process, streams NDJSON responses. Exposes `providerId` (`'claude-cli'`) and `capabilities` (`text-completion`, `tool-use`, `thinking`, `streaming`). |
| `StreamSessionTracker.ts` | Tracks active stream sessions for orphan detection/recovery. |
| `index.ts` | Barrel export |

Key behavior:
- Spawns `claude` with flags: `--output-format stream-json`, `--max-turns`, `--model`, `--system-prompt`
- Optional `--thinking-budget` for extended thinking
- Working directory set to book directory (CLI tools operate on book files)
- Parses NDJSON line-by-line from stdout
- Maps CLI events to `StreamEvent` union variants
- `abortStream` sends SIGTERM, then SIGKILL after 2s grace period
- `isAvailable()` caches result of `claude --version` check
- Persists stream events to SQLite in batches (100ms flush interval, max 20, critical events flush immediately) for reduced I/O pressure
- `hasActiveProcesses()` / `hasActiveProcessesForBook()` for idle detection
- EPIPE/ERR_STREAM_DESTROYED on stdin logged with diagnostic info (stdinBytes, writableFinished, writableEnded)
- System prompt size guard: rejects prompts > 500KB with clear error before spawn

### codex-cli/ — Codex CLI Client

| File | Purpose |
|------|---------|
| `CodexCliClient.ts` | Implements `IModelProvider`. Spawns `codex exec --json`, translates JSONL events into `StreamEvent`, tracks active processes, persists stream events, and detects changed files by comparing the working directory before/after a run. |
| `index.ts` | Barrel export |

Key behavior:
- Provider ID is `codex-cli`; capabilities are `text-completion`, `tool-use`, and `streaming`
- Spawns `codex --ask-for-approval never exec --json --sandbox workspace-write --skip-git-repo-check --ephemeral --model <model> --cd <workingDir> --add-dir <booksDir>`
- Feeds the agent system prompt and conversation transcript to stdin because Codex CLI has no Claude-style `--system-prompt` argument
- Parses `thread.started`, `turn.started`, `item.started`, `item.completed`, `turn.completed`, and `error` JSONL events from stdout
- Maps `item.completed` assistant text to text blocks and `turn.completed.usage` to final token usage
- Ignores non-JSON stderr warnings unless the Codex process exits nonzero
- `abortStream` sends SIGTERM, then SIGKILL after 2s grace period
- `isAvailable()` caches `codex --version`

### providers/ — Model Provider Registry

| File | Purpose |
|------|---------|
| `ProviderRegistry.ts` | Implements `IProviderRegistry`. Central hub for all model providers — registration, model routing (reverse index), config CRUD, persistence to settings. Protects built-in providers from deletion. |
| `OpenAiCompatibleProvider.ts` | Implements `IModelProvider` for OpenAI Chat Completions-compatible APIs. SSE streaming via `fetch`, `AbortController` cancellation, estimated token counts. No tool-use. Runtime `updateApiKey()`/`updateBaseUrl()`. |
| `index.ts` | Barrel export |

Key behavior:
- Constructor takes `ISettingsService` for config persistence
- `registerProvider()` adds provider + config, first registered becomes default
- `getProviderForModel()` uses reverse model→provider index (O(1) lookup)
- `sendMessage()` routes to model's provider, falls back to default
- `abortStream()` broadcasts to all providers (idempotent)
- `updateProviderConfig()` protects `id`, `type`, `isBuiltIn` from mutation
- Config changes auto-persist to `settings.json`

### pandoc/ — Export Engine

| File | Purpose |
|------|---------|
| `index.ts` | `resolvePandocPath(resourcesPath)` — resolves Pandoc binary path based on platform and packaged vs dev mode. |

### series/ — Series Management

| File | Purpose |
|------|---------|
| `SeriesService.ts` | Implements `ISeriesService`. File-based storage in `{userData}/series/{slug}/`. Manages `series.json` manifests and `series-bible.md` files. In-memory reverse-lookup cache (`bookSlug → seriesSlug`) rebuilt on mutation or explicit invalidation. |
| `index.ts` | Barrel export |

Key behavior:
- Constructor takes `userDataDir: string`, creates `series/` root if missing
- CRUD operations read/write `series.json` in each series directory
- Volume management auto-renumbers on add/remove/reorder
- Validates books aren't in multiple series simultaneously
- `getSeriesForBook()` uses lazy-built reverse cache for O(1) lookups
- `invalidateCache()` called by BooksDirWatcher when books directory changes
- `totalWordCount` in summaries is always 0 (renderer computes from bookStore)

---

## Schema

### `conversations`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | TEXT | PK | nanoid or UUID |
| `book_slug` | TEXT | NOT NULL | Directory slug |
| `agent_name` | TEXT | NOT NULL | From AgentName |
| `pipeline_phase` | TEXT | | Nullable for ad-hoc |
| `purpose` | TEXT | NOT NULL DEFAULT 'pipeline' | ConversationPurpose |
| `title` | TEXT | NOT NULL DEFAULT '' | From first user message |
| `created_at` | TEXT | NOT NULL | ISO 8601, defaults to datetime('now') |
| `updated_at` | TEXT | NOT NULL | ISO 8601, defaults to datetime('now') |

Index: `idx_conversations_book_slug` on `book_slug`

### `messages`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | TEXT | PK | nanoid or UUID |
| `conversation_id` | TEXT | NOT NULL, FK → conversations(id) ON DELETE CASCADE | |
| `role` | TEXT | NOT NULL, CHECK('user','assistant') | |
| `content` | TEXT | NOT NULL | Message body |
| `thinking` | TEXT | NOT NULL DEFAULT '' | Extended thinking content |
| `timestamp` | TEXT | NOT NULL | ISO 8601 |

Index: `idx_messages_conversation_id` on `conversation_id`

### `token_usage`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `conversation_id` | TEXT | NOT NULL, FK → conversations(id) ON DELETE CASCADE | |
| `input_tokens` | INTEGER | NOT NULL DEFAULT 0 | |
| `output_tokens` | INTEGER | NOT NULL DEFAULT 0 | |
| `thinking_tokens` | INTEGER | NOT NULL DEFAULT 0 | |
| `model` | TEXT | NOT NULL | Model used |
| `timestamp` | TEXT | NOT NULL | ISO 8601 |

Index: `idx_token_usage_conversation_id` on `conversation_id`

### `stream_events`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `session_id` | TEXT | NOT NULL | Groups events per CLI call |
| `conversation_id` | TEXT | NOT NULL | |
| `sequence_number` | INTEGER | NOT NULL | Ordering within session |
| `event_type` | TEXT | NOT NULL | StreamEvent.type discriminator |
| `payload` | TEXT | NOT NULL | JSON-serialized StreamEvent |
| `timestamp` | TEXT | NOT NULL | ISO 8601 |

Index: `idx_stream_events_session` on `(session_id, sequence_number)`

### `stream_sessions`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | TEXT | PK | nanoid |
| `conversation_id` | TEXT | NOT NULL | |
| `agent_name` | TEXT | NOT NULL | |
| `model` | TEXT | NOT NULL | |
| `book_slug` | TEXT | NOT NULL | |
| `started_at` | TEXT | NOT NULL | ISO 8601 |
| `ended_at` | TEXT | | NULL = still running or orphaned |
| `final_stage` | TEXT | NOT NULL DEFAULT 'idle' | ProgressStage |
| `files_touched` | TEXT | NOT NULL DEFAULT '{}' | JSON FileTouchMap |
| `interrupted` | INTEGER | NOT NULL DEFAULT 0 | 1 = marked as orphaned |

Index: `idx_stream_sessions_active` on `ended_at` WHERE `ended_at IS NULL`

### `file_versions`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | Sequential version ordering |
| `book_slug` | TEXT | NOT NULL | Book directory slug |
| `file_path` | TEXT | NOT NULL | Relative to book root |
| `content` | TEXT | NOT NULL | Full file content snapshot |
| `content_hash` | TEXT | NOT NULL | SHA-256 hex digest for dedup |
| `byte_size` | INTEGER | NOT NULL | Content length in bytes |
| `source` | TEXT | NOT NULL CHECK(IN 'user','agent','revert') | Who caused this version |
| `created_at` | TEXT | NOT NULL DEFAULT datetime('now') | ISO 8601 |

Indexes:
- `idx_file_versions_lookup` on `(book_slug, file_path, id DESC)` — primary query pattern
- `idx_file_versions_hash` on `(book_slug, file_path, content_hash)` — dedup lookups

Migration: v2 in `migrations.ts`

---

## Claude CLI Integration

### Invocation

```
claude --output-format stream-json \
       --max-turns <maxTurns> \
       --model <model> \
       --system-prompt <systemPrompt> \
       [--thinking-budget <budget>] \
       -p <userMessage>
```

- Working directory set to book path (enables tool file operations)
- `--allowedTools` not specified — CLI uses its default tool set
- Process spawned via `child_process.spawn`

### Streaming Protocol

CLI outputs NDJSON (one JSON object per line) to stdout. Events map to `StreamEvent`:

| CLI Event | StreamEvent Type |
|-----------|-----------------|
| `content_block_start` (type=thinking) | `blockStart` → `thinkingDelta` |
| `content_block_delta` (type=thinking_delta) | `thinkingDelta` |
| `content_block_start` (type=text) | `blockStart` → `textDelta` |
| `content_block_delta` (type=text_delta) | `textDelta` |
| `content_block_stop` | `blockEnd` |
| `content_block_start` (type=tool_use) | `toolUse` |
| `content_block_start` (type=tool_result) | `toolUse` (status update) |
| `result` | `done` (with token counts) |

### Orphan Recovery

On startup, `ChatService.recoverOrphanedSessions()` checks `stream_sessions` for rows with `ended_at IS NULL`, marks them as `interrupted`, and exposes them to the UI.

---

## Codex CLI Integration

### Invocation

```
codex --ask-for-approval never exec \
      --json \
      --sandbox workspace-write \
      --skip-git-repo-check \
      --ephemeral \
      --model <model> \
      --cd <workingDir> \
      --add-dir <booksDir>
```

- Working directory is the explicit `workingDir`, the active book directory, or `booksDir`
- System prompt and conversation transcript are combined into a single stdin prompt
- `workspace-write` keeps Codex scoped to the book working directory plus `booksDir`
- `--json` emits newline-delimited JSON events on stdout

### Streaming Protocol

| Codex Event | StreamEvent Type |
|-------------|------------------|
| `turn.started` | `status` |
| `item.started` | `toolUse` when the item is tool-like |
| `item.completed` with assistant text | `blockStart` → `textDelta` → `blockEnd` |
| `item.completed` with tool-like item | `toolUse`, `toolDuration` |
| `turn.completed` | Captures token usage for final `done` |
| process close | `filesChanged` from directory diff, then `done` |

Changed-file detection is filesystem based rather than Codex event-schema based, so agent-written files are still captured if Codex JSON item shapes change.

---

## File Watchers

### BookWatcher

- Watches: single book directory (switchable via `watch(slug)`)
- Events: file change/add/delete within the book
- Consumer: `chat:filesChanged` IPC event → renderer
- Debounced to avoid flooding during rapid writes

### BooksDirWatcher

- Watches: `books/` root directory
- Events: folder added or removed
- Consumer: `books:changed` IPC event → renderer bookStore reload
- Started once at app init via `start()`
