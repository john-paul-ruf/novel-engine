# SESSION-02 — Database Queries & Schema Migration

> **Program:** Novel Engine
> **Feature:** dashboards-and-revision-modal
> **Modules:** M03
> **Depends on:** SESSION-01
> **Estimated effort:** 25 min

---

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| `M01` | domain | `src/domain/interfaces.ts` | New IDatabaseService methods to implement |
| `M03` | database | `src/infrastructure/database/DatabaseService.ts, src/infrastructure/database/migrations.ts, src/infrastructure/database/schema.ts` | Adding migration and implementing new queries |

---

## Context

SESSION-01 extended `IDatabaseService` with six new methods for dashboard and statistics queries. This session implements them: a schema migration for the `word_count_snapshots` table, new prepared statements, and the query implementations.

The existing `DatabaseService` uses prepared statements stored as class members, follows snake_case ↔ camelCase mapping, and uses `better-sqlite3` with WAL mode and foreign keys.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/infrastructure/database/migrations.ts` | Modify | Add migration v3: `word_count_snapshots` table |
| `src/infrastructure/database/DatabaseService.ts` | Modify | Add 6 prepared statements and method implementations |

---

## Implementation

### 1. Add migration v3 to `migrations.ts`

Add a new entry to the `MIGRATIONS` array:

```typescript
{
  version: 3,
  description: 'Create word_count_snapshots table for statistics tracking',
  sql: `
    CREATE TABLE IF NOT EXISTS word_count_snapshots (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      book_slug     TEXT NOT NULL,
      word_count    INTEGER NOT NULL,
      chapter_count INTEGER NOT NULL,
      recorded_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_word_count_snapshots_lookup
      ON word_count_snapshots(book_slug, recorded_at DESC);
  `,
},
```

### 2. Add prepared statements to `DatabaseService` constructor

Add new class members for the prepared statements (after the existing file version statements):

```typescript
// Dashboard & Statistics
private stmtGetLastConversation: Database.Statement;
private stmtGetUsageOverTimeAll: Database.Statement;
private stmtGetUsageOverTimeByBook: Database.Statement;
private stmtGetUsageByAgentAll: Database.Statement;
private stmtGetUsageByAgentByBook: Database.Statement;
private stmtGetUsageByPhaseAll: Database.Statement;
private stmtGetUsageByPhaseByBook: Database.Statement;
private stmtRecordWordCountSnapshot: Database.Statement;
private stmtGetWordCountHistoryAll: Database.Statement;
private stmtGetWordCountHistoryByBook: Database.Statement;
```

Initialize them in the constructor (after the existing file version prepared statements):

```typescript
this.stmtGetLastConversation = this.db.prepare(`
  SELECT c.agent_name, c.title, c.updated_at
  FROM conversations c
  WHERE c.book_slug = ?
  ORDER BY c.updated_at DESC
  LIMIT 1
`);

this.stmtGetUsageOverTimeAll = this.db.prepare(`
  SELECT
    date(tu.timestamp) AS date,
    COALESCE(SUM(tu.input_tokens), 0)    AS input_tokens,
    COALESCE(SUM(tu.output_tokens), 0)   AS output_tokens,
    COALESCE(SUM(tu.thinking_tokens), 0) AS thinking_tokens
  FROM token_usage tu
  GROUP BY date(tu.timestamp)
  ORDER BY date ASC
`);

this.stmtGetUsageOverTimeByBook = this.db.prepare(`
  SELECT
    date(tu.timestamp) AS date,
    COALESCE(SUM(tu.input_tokens), 0)    AS input_tokens,
    COALESCE(SUM(tu.output_tokens), 0)   AS output_tokens,
    COALESCE(SUM(tu.thinking_tokens), 0) AS thinking_tokens
  FROM token_usage tu
  JOIN conversations c ON c.id = tu.conversation_id
  WHERE c.book_slug = ?
  GROUP BY date(tu.timestamp)
  ORDER BY date ASC
`);

this.stmtGetUsageByAgentAll = this.db.prepare(`
  SELECT
    c.agent_name,
    COALESCE(SUM(tu.input_tokens), 0)    AS input_tokens,
    COALESCE(SUM(tu.output_tokens), 0)   AS output_tokens,
    COALESCE(SUM(tu.thinking_tokens), 0) AS thinking_tokens,
    COUNT(DISTINCT c.id)                  AS conversation_count
  FROM token_usage tu
  JOIN conversations c ON c.id = tu.conversation_id
  GROUP BY c.agent_name
  ORDER BY SUM(tu.input_tokens + tu.output_tokens + tu.thinking_tokens) DESC
`);

this.stmtGetUsageByAgentByBook = this.db.prepare(`
  SELECT
    c.agent_name,
    COALESCE(SUM(tu.input_tokens), 0)    AS input_tokens,
    COALESCE(SUM(tu.output_tokens), 0)   AS output_tokens,
    COALESCE(SUM(tu.thinking_tokens), 0) AS thinking_tokens,
    COUNT(DISTINCT c.id)                  AS conversation_count
  FROM token_usage tu
  JOIN conversations c ON c.id = tu.conversation_id
  WHERE c.book_slug = ?
  GROUP BY c.agent_name
  ORDER BY SUM(tu.input_tokens + tu.output_tokens + tu.thinking_tokens) DESC
`);

this.stmtGetUsageByPhaseAll = this.db.prepare(`
  SELECT
    COALESCE(c.pipeline_phase, 'adhoc') AS phase,
    COALESCE(SUM(tu.input_tokens), 0)    AS input_tokens,
    COALESCE(SUM(tu.output_tokens), 0)   AS output_tokens,
    COALESCE(SUM(tu.thinking_tokens), 0) AS thinking_tokens,
    COUNT(DISTINCT c.id)                  AS conversation_count
  FROM token_usage tu
  JOIN conversations c ON c.id = tu.conversation_id
  GROUP BY COALESCE(c.pipeline_phase, 'adhoc')
  ORDER BY SUM(tu.input_tokens + tu.output_tokens + tu.thinking_tokens) DESC
`);

this.stmtGetUsageByPhaseByBook = this.db.prepare(`
  SELECT
    COALESCE(c.pipeline_phase, 'adhoc') AS phase,
    COALESCE(SUM(tu.input_tokens), 0)    AS input_tokens,
    COALESCE(SUM(tu.output_tokens), 0)   AS output_tokens,
    COALESCE(SUM(tu.thinking_tokens), 0) AS thinking_tokens,
    COUNT(DISTINCT c.id)                  AS conversation_count
  FROM token_usage tu
  JOIN conversations c ON c.id = tu.conversation_id
  WHERE c.book_slug = ?
  GROUP BY COALESCE(c.pipeline_phase, 'adhoc')
  ORDER BY SUM(tu.input_tokens + tu.output_tokens + tu.thinking_tokens) DESC
`);

this.stmtRecordWordCountSnapshot = this.db.prepare(`
  INSERT INTO word_count_snapshots (book_slug, word_count, chapter_count, recorded_at)
  VALUES (?, ?, ?, datetime('now'))
`);

this.stmtGetWordCountHistoryAll = this.db.prepare(`
  SELECT book_slug, word_count, chapter_count, recorded_at
  FROM word_count_snapshots
  ORDER BY recorded_at ASC
  LIMIT ?
`);

this.stmtGetWordCountHistoryByBook = this.db.prepare(`
  SELECT book_slug, word_count, chapter_count, recorded_at
  FROM word_count_snapshots
  WHERE book_slug = ?
  ORDER BY recorded_at ASC
  LIMIT ?
`);
```

### 3. Implement the six methods

Add these method implementations to the `DatabaseService` class (before `close()`):

```typescript
getLastConversation(bookSlug: string): { agentName: string; title: string; updatedAt: string } | null {
  const row = this.stmtGetLastConversation.get(bookSlug) as
    | { agent_name: string; title: string; updated_at: string }
    | undefined;
  if (!row) return null;
  return {
    agentName: row.agent_name,
    title: row.title,
    updatedAt: row.updated_at,
  };
}

getUsageOverTime(bookSlug?: string): { date: string; inputTokens: number; outputTokens: number; thinkingTokens: number }[] {
  const rows = bookSlug
    ? (this.stmtGetUsageOverTimeByBook.all(bookSlug) as { date: string; input_tokens: number; output_tokens: number; thinking_tokens: number }[])
    : (this.stmtGetUsageOverTimeAll.all() as { date: string; input_tokens: number; output_tokens: number; thinking_tokens: number }[]);
  return rows.map((r) => ({
    date: r.date,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    thinkingTokens: r.thinking_tokens,
  }));
}

getUsageByAgent(bookSlug?: string): { agentName: string; inputTokens: number; outputTokens: number; thinkingTokens: number; conversationCount: number }[] {
  const rows = bookSlug
    ? (this.stmtGetUsageByAgentByBook.all(bookSlug) as { agent_name: string; input_tokens: number; output_tokens: number; thinking_tokens: number; conversation_count: number }[])
    : (this.stmtGetUsageByAgentAll.all() as { agent_name: string; input_tokens: number; output_tokens: number; thinking_tokens: number; conversation_count: number }[]);
  return rows.map((r) => ({
    agentName: r.agent_name,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    thinkingTokens: r.thinking_tokens,
    conversationCount: r.conversation_count,
  }));
}

getUsageByPhase(bookSlug?: string): { phase: string; inputTokens: number; outputTokens: number; thinkingTokens: number; conversationCount: number }[] {
  const rows = bookSlug
    ? (this.stmtGetUsageByPhaseByBook.all(bookSlug) as { phase: string; input_tokens: number; output_tokens: number; thinking_tokens: number; conversation_count: number }[])
    : (this.stmtGetUsageByPhaseAll.all() as { phase: string; input_tokens: number; output_tokens: number; thinking_tokens: number; conversation_count: number }[]);
  return rows.map((r) => ({
    phase: r.phase,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    thinkingTokens: r.thinking_tokens,
    conversationCount: r.conversation_count,
  }));
}

recordWordCountSnapshot(bookSlug: string, wordCount: number, chapterCount: number): void {
  this.stmtRecordWordCountSnapshot.run(bookSlug, wordCount, chapterCount);
}

getWordCountHistory(bookSlug?: string, limit?: number): { bookSlug: string; wordCount: number; chapterCount: number; recordedAt: string }[] {
  const maxRows = limit ?? 1000;
  const rows = bookSlug
    ? (this.stmtGetWordCountHistoryByBook.all(bookSlug, maxRows) as { book_slug: string; word_count: number; chapter_count: number; recorded_at: string }[])
    : (this.stmtGetWordCountHistoryAll.all(maxRows) as { book_slug: string; word_count: number; chapter_count: number; recorded_at: string }[]);
  return rows.map((r) => ({
    bookSlug: r.book_slug,
    wordCount: r.word_count,
    chapterCount: r.chapter_count,
    recordedAt: r.recorded_at,
  }));
}
```

### 4. Add import for `WordCountSnapshot` type

At the top of `DatabaseService.ts`, add `WordCountSnapshot` to the type imports from `@domain/types` (if the methods return the domain type directly — but since we're doing inline mapping, we only need the row types as casts, so this import is optional). Ensure the return types match `IDatabaseService`.

---

## Verification

1. Run `npx tsc --noEmit` — must pass with zero errors. The `DatabaseService` must satisfy the full `IDatabaseService` interface including the 6 new methods.
2. Verify that all prepared statements use parameterized queries — no string interpolation of values.
3. Verify that the migration version number (3) is the next sequential after the last existing migration.
4. Verify snake_case → camelCase mapping is applied consistently in all return objects.

---

## State Update

After completing this session, update `prompts/session-program/program-004/STATE.md`:
- Set SESSION-02 status to `done`
- Set Completed date
- Add notes about decisions or complications
- Update Handoff Notes
