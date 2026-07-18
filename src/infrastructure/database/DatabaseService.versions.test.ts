import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from './DatabaseService';
import { makeDb, makeFileVersion } from '../../test/db';

let db: DatabaseService;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  db = makeDb();
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});

describe('insertFileVersion / getFileVersion', () => {
  it('round-trips a full version including content and source', () => {
    const inserted = makeFileVersion(db, {
      content: '# Pitch',
      contentHash: 'abc123',
      byteSize: 7,
      source: 'agent',
    });

    expect(inserted.id).toBeGreaterThan(0);
    expect(inserted.content).toBe('# Pitch');
    expect(inserted.contentHash).toBe('abc123');
    expect(inserted.byteSize).toBe(7);
    expect(inserted.source).toBe('agent');

    expect(db.getFileVersion(inserted.id)).toEqual(inserted);
  });

  it('persists all three FileVersionSource values', () => {
    for (const source of ['user', 'agent', 'revert'] as const) {
      expect(makeFileVersion(db, { source }).source).toBe(source);
    }
  });

  it('returns null for an unknown version id', () => {
    expect(db.getFileVersion(9999)).toBeNull();
  });
});

describe('latest lookups', () => {
  it('getLatestFileVersion returns the newest summary (no content field)', () => {
    makeFileVersion(db, { content: 'v1' });
    const v2 = makeFileVersion(db, { content: 'v2' });

    const latest = db.getLatestFileVersion('test-book', 'source/pitch.md');
    expect(latest?.id).toBe(v2.id);
    expect(latest).not.toHaveProperty('content');

    expect(db.getLatestFileVersion('test-book', 'nope.md')).toBeNull();
  });

  it('getLatestFileVersionBySource returns the newest full version of that source', () => {
    const agentV = makeFileVersion(db, { content: 'agent draft', source: 'agent' });
    makeFileVersion(db, { content: 'user edit', source: 'user' });

    const latestAgent = db.getLatestFileVersionBySource('test-book', 'source/pitch.md', 'agent');
    expect(latestAgent?.id).toBe(agentV.id);
    expect(latestAgent?.content).toBe('agent draft');

    expect(db.getLatestFileVersionBySource('test-book', 'source/pitch.md', 'revert')).toBeNull();
  });
});

describe('listing and counting', () => {
  it('lists newest-first with limit and offset', () => {
    const ids = [1, 2, 3, 4].map((n) => makeFileVersion(db, { content: `v${n}` }).id);

    const firstPage = db.listFileVersions('test-book', 'source/pitch.md', 2, 0);
    expect(firstPage.map((v) => v.id)).toEqual([ids[3], ids[2]]);

    const secondPage = db.listFileVersions('test-book', 'source/pitch.md', 2, 2);
    expect(secondPage.map((v) => v.id)).toEqual([ids[1], ids[0]]);

    expect(db.countFileVersions('test-book', 'source/pitch.md')).toBe(4);
    expect(db.countFileVersions('test-book', 'other.md')).toBe(0);
  });

  it('getVersionedFilePaths returns distinct sorted paths for the book only', () => {
    makeFileVersion(db, { filePath: 'source/pitch.md' });
    makeFileVersion(db, { filePath: 'source/pitch.md' });
    makeFileVersion(db, { filePath: 'chapters/01/draft.md' });
    makeFileVersion(db, { bookSlug: 'other-book', filePath: 'source/other.md' });

    expect(db.getVersionedFilePaths('test-book')).toEqual([
      'chapters/01/draft.md',
      'source/pitch.md',
    ]);
  });
});

describe('deleteFileVersionsBeyondLimit', () => {
  it('keeps the newest N versions and reports the number deleted', () => {
    const ids = [1, 2, 3, 4, 5].map((n) => makeFileVersion(db, { content: `v${n}` }).id);

    const deleted = db.deleteFileVersionsBeyondLimit('test-book', 'source/pitch.md', 2);

    expect(deleted).toBe(3);
    const remaining = db.listFileVersions('test-book', 'source/pitch.md', 10, 0);
    expect(remaining.map((v) => v.id)).toEqual([ids[4], ids[3]]);
  });

  it('pins the latest agent snapshot even beyond the keep limit', () => {
    const agentV = makeFileVersion(db, { content: 'baseline', source: 'agent' });
    makeFileVersion(db, { content: 'u1', source: 'user' });
    makeFileVersion(db, { content: 'u2', source: 'user' });
    const u3 = makeFileVersion(db, { content: 'u3', source: 'user' });
    const u4 = makeFileVersion(db, { content: 'u4', source: 'user' });

    const deleted = db.deleteFileVersionsBeyondLimit('test-book', 'source/pitch.md', 2);

    expect(deleted).toBe(2); // u1 and u2 — the agent baseline survives
    const remaining = db.listFileVersions('test-book', 'source/pitch.md', 10, 0);
    expect(remaining.map((v) => v.id)).toEqual([u4.id, u3.id, agentV.id]);
  });
});
