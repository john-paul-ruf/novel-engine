import type Database from 'better-sqlite3';

export function initializeSchema(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id             TEXT PRIMARY KEY,
      book_slug      TEXT NOT NULL,
      agent_name     TEXT NOT NULL,
      pipeline_phase TEXT,
      purpose        TEXT NOT NULL DEFAULT 'pipeline',
      title          TEXT NOT NULL DEFAULT '',
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role            TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content         TEXT NOT NULL,
      thinking        TEXT NOT NULL DEFAULT '',
      timestamp       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS token_usage (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      input_tokens    INTEGER NOT NULL DEFAULT 0,
      output_tokens   INTEGER NOT NULL DEFAULT 0,
      thinking_tokens INTEGER NOT NULL DEFAULT 0,
      model           TEXT NOT NULL,
      estimated_cost  REAL NOT NULL DEFAULT 0,
      timestamp       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
      ON messages(conversation_id);

    CREATE INDEX IF NOT EXISTS idx_token_usage_conversation_id
      ON token_usage(conversation_id);

    CREATE INDEX IF NOT EXISTS idx_conversations_book_slug
      ON conversations(book_slug);
  `);

  // Safety check: ensure purpose column exists (defensive for early dev builds)
  const columns = db.pragma('table_info(conversations)') as { name: string }[];
  if (!columns.some((c) => c.name === 'purpose')) {
    db.exec(`ALTER TABLE conversations ADD COLUMN purpose TEXT NOT NULL DEFAULT 'pipeline'`);
  }
}
