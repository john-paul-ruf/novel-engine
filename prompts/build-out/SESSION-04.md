# Session 04 — Database Infrastructure

## Context

Novel Engine Electron app. Sessions 01–03 done. Now I need the **database layer** — SQLite via `better-sqlite3` for conversations, messages, and token usage tracking.

## Architecture Rule

Lives in `src/infrastructure/database/`. Imports from `@domain`, `better-sqlite3`, and `nanoid` (v3, CJS — use `import { nanoid } from 'nanoid'`). Implements `IDatabaseService`. No imports from Electron, application, renderer, or other infrastructure modules.

## Task

Create these files:

### File 1: `src/infrastructure/database/schema.ts`

A single function `initializeSchema(db: Database)` that creates all tables if they don't exist. Use `db.exec()` with a multi-statement SQL string.

Tables:

```sql
conversations (
  id            TEXT PRIMARY KEY,
  book_slug     TEXT NOT NULL,
  agent_name    TEXT NOT NULL,
  pipeline_phase TEXT,
  purpose       TEXT NOT NULL DEFAULT 'pipeline',
  title         TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
)

messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  thinking        TEXT NOT NULL DEFAULT '',
  timestamp       TEXT NOT NULL DEFAULT (datetime('now'))
)

token_usage (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  input_tokens    INTEGER NOT NULL DEFAULT 0,
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  thinking_tokens INTEGER NOT NULL DEFAULT 0,
  model           TEXT NOT NULL,
  estimated_cost  REAL NOT NULL DEFAULT 0,
  timestamp       TEXT NOT NULL DEFAULT (datetime('now'))
)
```

Add indexes on `messages.conversation_id`, `token_usage.conversation_id`, and `conversations.book_slug`.

Also enable WAL mode and foreign keys: `PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;`

### File 2: `src/infrastructure/database/DatabaseService.ts`

Implements `IDatabaseService`. 

Constructor: `constructor(dbPath: string)` — opens the SQLite database and calls `initializeSchema`.

**Implementation patterns:**
- Use **prepared statements** stored as private class members, initialized in the constructor. This avoids re-preparing on every call.
- Every method maps between the snake_case database columns and the camelCase domain types. Do this mapping explicitly in each method — don't use a generic mapper.
- `createConversation`: Generates an ID using `nanoid()`. Accepts and stores the `purpose` field (maps to the `purpose` column, defaults to `'pipeline'`). Returns the full `Conversation` object including `purpose`.
- `saveMessage`: Generates an ID using `nanoid()`. Also updates the parent conversation's `updated_at`. If this is the first user message, also sets the conversation's `title` to the first 80 characters of the message content.
- `getMessages`: Returns messages ordered by `timestamp ASC`.
- `listConversations`: Returns conversations for a book slug, ordered by `updated_at DESC`. Include `purpose` in the SELECT and camelCase mapping.
- `recordUsage`: Simple insert.
- `getUsageSummary`: Aggregates all usage. If `bookSlug` is provided, filter by joining through conversations.
- `getUsageByConversation`: Returns all usage records for a conversation.
- `deleteConversation`: Deletes the conversation (cascade handles messages and usage).
- `close`: Calls `this.db.close()` on the underlying `better-sqlite3` `Database` instance. Used by the main process `before-quit` handler to prevent WAL corruption.

### File 3: `src/infrastructure/database/index.ts`

Barrel export of `DatabaseService`.

## Verification

- Compiles with `npx tsc --noEmit`
- `DatabaseService` implements `IDatabaseService`
- No imports from Electron, application, renderer, or other infrastructure
- All prepared statements use parameterized queries (no string interpolation in SQL)
- snake_case ↔ camelCase mapping is explicit in every method
