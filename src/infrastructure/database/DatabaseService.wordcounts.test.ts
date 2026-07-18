import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from './DatabaseService';
import { makeDb } from '../../test/db';

let db: DatabaseService;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  db = makeDb();
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});

describe('word count snapshots', () => {
  it('appends snapshots — same book and day produce separate rows', () => {
    db.recordWordCountSnapshot('my-book', 1000, 3);
    db.recordWordCountSnapshot('my-book', 1500, 4);

    const history = db.getWordCountHistory('my-book');
    expect(history.length).toBe(2);
    expect(history.map((s) => s.wordCount)).toEqual([1000, 1500]); // recorded_at ASC
    expect(history[0]).toMatchObject({ bookSlug: 'my-book', chapterCount: 3 });
    expect(history[0].recordedAt.length).toBeGreaterThan(0);
  });

  it('filters by book and returns all books when no slug is given', () => {
    db.recordWordCountSnapshot('book-a', 100, 1);
    db.recordWordCountSnapshot('book-b', 200, 2);

    expect(db.getWordCountHistory('book-a').map((s) => s.bookSlug)).toEqual(['book-a']);
    expect(db.getWordCountHistory().length).toBe(2);
  });

  it('respects the limit parameter', () => {
    for (let i = 0; i < 5; i++) db.recordWordCountSnapshot('my-book', i, 1);
    expect(db.getWordCountHistory('my-book', 3).length).toBe(3);
    expect(db.getWordCountHistory(undefined, 2).length).toBe(2);
  });

  it('returns an empty history for an unknown book', () => {
    expect(db.getWordCountHistory('nope')).toEqual([]);
  });
});
