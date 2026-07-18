import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MIGRATIONS, runMigrations } from './migrations';

let db: Database.Database;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  db = new Database(':memory:');
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});

function tableNames(): string[] {
  return (
    db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
      .all() as { name: string }[]
  ).map((r) => r.name);
}

function conversationColumns(): string[] {
  return (db.pragma('table_info(conversations)') as { name: string }[]).map((c) => c.name);
}

describe('MIGRATIONS list', () => {
  it('versions are sequential integers starting at 0', () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual(MIGRATIONS.map((_, i) => i));
  });
});

describe('runMigrations', () => {
  it('adds the purpose column to a legacy conversations table, preserving rows', () => {
    // Pre-state: schema from before the purpose column existed
    db.exec(`
      CREATE TABLE conversations (
        id         TEXT PRIMARY KEY,
        book_slug  TEXT NOT NULL,
        agent_name TEXT NOT NULL
      );
      INSERT INTO conversations (id, book_slug, agent_name) VALUES ('old', 'book', 'Spark');
    `);

    runMigrations(db);

    expect(conversationColumns()).toContain('purpose');
    const row = db
      .prepare(`SELECT id, purpose FROM conversations WHERE id = 'old'`)
      .get() as { id: string; purpose: string };
    expect(row.purpose).toBe('pipeline'); // default applied to pre-existing rows
  });

  it('leaves an existing purpose column untouched', () => {
    db.exec(`
      CREATE TABLE conversations (
        id      TEXT PRIMARY KEY,
        book_slug TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        purpose TEXT NOT NULL DEFAULT 'pipeline'
      );
      INSERT INTO conversations (id, book_slug, agent_name, purpose) VALUES ('c', 'b', 'Spark', 'helper');
    `);

    expect(() => runMigrations(db)).not.toThrow();
    const row = db.prepare(`SELECT purpose FROM conversations WHERE id = 'c'`).get() as { purpose: string };
    expect(row.purpose).toBe('helper');
  });

  it('creates the file_versions and word_count_snapshots tables', () => {
    db.exec(`CREATE TABLE conversations (id TEXT PRIMARY KEY, book_slug TEXT, agent_name TEXT);`);
    runMigrations(db);
    expect(tableNames()).toContain('file_versions');
    expect(tableNames()).toContain('word_count_snapshots');
  });

  it('records every applied version and is a no-op when re-run', () => {
    db.exec(`CREATE TABLE conversations (id TEXT PRIMARY KEY, book_slug TEXT, agent_name TEXT);`);
    runMigrations(db);

    const versions = (
      db.prepare('SELECT version FROM schema_version ORDER BY version').all() as { version: number }[]
    ).map((r) => r.version);
    expect(versions).toEqual(MIGRATIONS.map((m) => m.version));

    runMigrations(db); // second run must apply nothing
    const count = db.prepare('SELECT COUNT(*) AS c FROM schema_version').get() as { c: number };
    expect(count.c).toBe(MIGRATIONS.length);
  });

  it('applies only migrations newer than the recorded version', () => {
    db.exec(`
      CREATE TABLE conversations (id TEXT PRIMARY KEY, book_slug TEXT, agent_name TEXT, purpose TEXT);
      CREATE TABLE schema_version (
        version INTEGER NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now')),
        description TEXT NOT NULL DEFAULT ''
      );
      INSERT INTO schema_version (version) VALUES (2);
    `);

    runMigrations(db);

    // v3 applied, nothing below re-applied
    expect(tableNames()).toContain('word_count_snapshots');
    expect(tableNames()).not.toContain('file_versions');
  });
});
