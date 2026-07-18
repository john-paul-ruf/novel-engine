import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeSchema } from './schema';

let db: Database.Database;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined); // silence migration logs
  db = new Database(':memory:');
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});

function names(type: 'table' | 'index'): string[] {
  return (
    db
      .prepare(`SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%'`)
      .all(type) as { name: string }[]
  ).map((r) => r.name);
}

describe('initializeSchema', () => {
  it('creates all tables, including migration-created ones', () => {
    initializeSchema(db);
    expect(names('table').sort()).toEqual([
      'conversations',
      'file_versions',
      'messages',
      'schema_version',
      'stream_events',
      'stream_sessions',
      'token_usage',
      'word_count_snapshots',
    ]);
  });

  it('creates the expected indexes', () => {
    initializeSchema(db);
    expect(names('index').sort()).toEqual([
      'idx_conversations_book_slug',
      'idx_file_versions_hash',
      'idx_file_versions_lookup',
      'idx_messages_conversation_id',
      'idx_stream_events_session',
      'idx_stream_sessions_active',
      'idx_token_usage_conversation_id',
      'idx_word_count_snapshots_book',
    ]);
  });

  it('enables foreign key enforcement', () => {
    initializeSchema(db);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('is idempotent — re-running preserves existing data', () => {
    initializeSchema(db);
    db.prepare(
      `INSERT INTO conversations (id, book_slug, agent_name) VALUES ('c1', 'book', 'Spark')`
    ).run();

    expect(() => initializeSchema(db)).not.toThrow();

    const row = db.prepare(`SELECT id FROM conversations WHERE id = 'c1'`).get() as { id: string };
    expect(row.id).toBe('c1');
  });
});
