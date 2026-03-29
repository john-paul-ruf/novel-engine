import type Database from 'better-sqlite3';

export type Migration = {
  version: number;
  description: string;
  sql: string;
};

/**
 * Forward-only migration list. Each entry runs exactly once.
 *
 * Rules:
 * - Version numbers are sequential integers starting at 0.
 * - Version 0 is the baseline — it records that the existing schema is in place.
 * - Never edit a migration that has already been released. Add a new one.
 * - Each migration's SQL runs inside a transaction.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 0,
    description: 'Baseline — existing schema (conversations, messages, token_usage, stream_events, stream_sessions)',
    sql: '', // No-op: already applied by schema.ts CREATE TABLE IF NOT EXISTS
  },
  {
    version: 1,
    description: 'Ensure conversations.purpose column exists (migrated from ad hoc ALTER TABLE check)',
    sql: '', // Handled conditionally below — SQLite ALTER TABLE ADD COLUMN doesn't support IF NOT EXISTS
  },
  {
    version: 2,
    description: 'Create file_versions table for content version control',
    sql: `
      CREATE TABLE IF NOT EXISTS file_versions (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        book_slug     TEXT NOT NULL,
        file_path     TEXT NOT NULL,
        content       TEXT NOT NULL,
        content_hash  TEXT NOT NULL,
        byte_size     INTEGER NOT NULL,
        source        TEXT NOT NULL CHECK(source IN ('user', 'agent', 'revert')),
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_file_versions_lookup
        ON file_versions(book_slug, file_path, id DESC);

      CREATE INDEX IF NOT EXISTS idx_file_versions_hash
        ON file_versions(book_slug, file_path, content_hash);
    `,
  },
  {
    version: 3,
    description: 'Create word_count_snapshots table for writing statistics',
    sql: `
      CREATE TABLE IF NOT EXISTS word_count_snapshots (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        book_slug     TEXT NOT NULL,
        word_count    INTEGER NOT NULL,
        chapter_count INTEGER NOT NULL,
        recorded_at   TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_word_count_snapshots_book
        ON word_count_snapshots(book_slug, recorded_at);
    `,
  },
];

/**
 * Run all pending migrations. Called after schema.ts creates the base tables.
 *
 * Flow:
 * 1. Ensure schema_version table exists
 * 2. Read the highest applied version (defaults to -1)
 * 3. Apply each pending migration in its own transaction
 * 4. Record the version in schema_version
 */
export function runMigrations(db: Database.Database): void {
  // Ensure the version tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version     INTEGER NOT NULL,
      applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
      description TEXT NOT NULL DEFAULT ''
    );
  `);

  // Read the current schema version
  const row = db.prepare('SELECT MAX(version) AS max_version FROM schema_version').get() as
    | { max_version: number | null }
    | undefined;
  const currentVersion = row?.max_version ?? -1;

  // Apply pending migrations
  const pending = MIGRATIONS.filter((m) => m.version > currentVersion);
  if (pending.length === 0) return;

  const insertVersion = db.prepare(
    'INSERT INTO schema_version (version, description) VALUES (?, ?)',
  );

  for (const migration of pending) {
    const run = db.transaction(() => {
      // Version 1: conditional ALTER TABLE (SQLite doesn't support ADD COLUMN IF NOT EXISTS)
      if (migration.version === 1) {
        const columns = db.pragma('table_info(conversations)') as { name: string }[];
        if (!columns.some((c) => c.name === 'purpose')) {
          db.exec(`ALTER TABLE conversations ADD COLUMN purpose TEXT NOT NULL DEFAULT 'pipeline'`);
        }
      } else if (migration.sql.trim()) {
        db.exec(migration.sql);
      }

      insertVersion.run(migration.version, migration.description);
    });

    run();
    console.log(`[migrations] Applied v${migration.version}: ${migration.description}`);
  }
}
