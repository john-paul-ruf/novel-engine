import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveWithinBook } from './pathSafety';

const BOOKS_DIR = path.resolve('/tmp/novel-engine-books');
const SLUG = 'my-book';
const BOOK_ROOT = path.join(BOOKS_DIR, SLUG);

describe('resolveWithinBook', () => {
  it('resolves a valid nested path inside the book', () => {
    expect(resolveWithinBook(BOOKS_DIR, SLUG, 'chapters/01-x/draft.md')).toBe(
      path.join(BOOK_ROOT, 'chapters', '01-x', 'draft.md'),
    );
  });

  it('resolves the book root itself for an empty relative path', () => {
    expect(resolveWithinBook(BOOKS_DIR, SLUG, '')).toBe(BOOK_ROOT);
  });

  it('resolves a normalised path that stays inside the book', () => {
    expect(resolveWithinBook(BOOKS_DIR, SLUG, 'chapters/../source/pitch.md')).toBe(
      path.join(BOOK_ROOT, 'source', 'pitch.md'),
    );
  });

  it.each([
    '../x',
    '../../etc/passwd',
    '../../../../.ssh/id_rsa',
    'a/../../b',
  ])('throws for a relative escape: %s', (rel) => {
    expect(() => resolveWithinBook(BOOKS_DIR, SLUG, rel)).toThrow(/escapes book directory/);
  });

  it('throws for an absolute path', () => {
    expect(() => resolveWithinBook(BOOKS_DIR, SLUG, '/etc/passwd')).toThrow(
      /escapes book directory/,
    );
  });
});
