import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IVersionService } from '@domain/interfaces';
import type { FindReplaceOptions } from '@domain/types';
import { FindReplaceService } from './FindReplaceService';
import { makeFakeFs, type FakeFileSystem } from '../test/fakes';

const LITERAL: FindReplaceOptions = { caseSensitive: false, useRegex: false };

let fs: FakeFileSystem;
let snapshots: { path: string; content: string; source: string }[];
let service: FindReplaceService;

beforeEach(() => {
  fs = makeFakeFs(
    {
      'chapters/01-one/draft.md': 'The grey sky. Grey clouds over grey water.\nAnother grey line.',
      'chapters/02-two/draft.md': 'One grey mention. Café scene.',
      'chapters/03-empty/notes.md': 'grey in notes only — drafts are searched, notes are not',
      'source/pitch.md': 'grey outside chapters',
    },
    { bookSlug: 'book' }
  );
  snapshots = [];
  const versions = {
    snapshotContent: vi.fn(async (_slug: string, path: string, content: string, source: string) => {
      snapshots.push({ path, content, source });
      return null;
    }),
  } as unknown as IVersionService;
  service = new FindReplaceService(fs, versions);
});

describe('preview', () => {
  it('searches only chapter drafts, sorts by match count, and reports match locations', async () => {
    const result = await service.preview('book', 'grey', LITERAL);

    expect(result.totalMatchCount).toBe(5);
    expect(result.items.map((i) => [i.filePath, i.matchCount])).toEqual([
      ['chapters/01-one/draft.md', 4],
      ['chapters/02-two/draft.md', 1],
    ]);

    const first = result.items[0].matches[0];
    expect(first).toEqual({
      lineNumber: 1,
      lineText: 'The grey sky. Grey clouds over grey water.',
      matchStart: 4,
      matchEnd: 8,
    });
    // Line 2 matches carry 1-based line numbers
    expect(result.items[0].matches.at(-1)).toMatchObject({ lineNumber: 2 });
  });

  it('is case-insensitive by default and exact with caseSensitive', async () => {
    const insensitive = await service.preview('book', 'GREY', LITERAL);
    expect(insensitive.totalMatchCount).toBe(5);

    const sensitive = await service.preview('book', 'Grey', { ...LITERAL, caseSensitive: true });
    expect(sensitive.totalMatchCount).toBe(1); // only "Grey clouds"
  });

  it('treats literal terms literally and supports regex mode, rejecting invalid patterns', async () => {
    fs.files.set('book/chapters/01-one/draft.md', 'value (x) and value (y)');
    const literalParens = await service.preview('book', '(x)', LITERAL);
    expect(literalParens.totalMatchCount).toBe(1);

    const regex = await service.preview('book', 'value \\((x|y)\\)', { caseSensitive: false, useRegex: true });
    expect(regex.totalMatchCount).toBe(2);

    await expect(service.preview('book', '([unclosed', { ...LITERAL, useRegex: true })).rejects.toThrow(
      /Invalid regular expression/
    );
    await expect(service.preview('book', '', LITERAL)).rejects.toThrow(/must not be empty/);
  });

  it('handles unicode terms and books without chapters', async () => {
    expect((await service.preview('book', 'café', LITERAL)).totalMatchCount).toBe(1);

    const bare = makeFakeFs({}, { bookSlug: 'bare' });
    const bareService = new FindReplaceService(bare, {
      snapshotContent: vi.fn(),
    } as unknown as IVersionService);
    expect(await bareService.preview('bare', 'x', LITERAL)).toMatchObject({ items: [], totalMatchCount: 0 });
  });
});

describe('apply', () => {
  it('replaces in the listed files only, snapshotting originals first', async () => {
    const original = fs.files.get('book/chapters/01-one/draft.md')!;

    const result = await service.apply({
      bookSlug: 'book',
      searchTerm: 'grey',
      replacement: 'silver',
      filePaths: ['chapters/01-one/draft.md'],
      options: LITERAL,
    });

    expect(result).toEqual({
      filesChanged: 1,
      totalReplacements: 4,
      details: [{ filePath: 'chapters/01-one/draft.md', replacements: 4 }],
    });

    expect(fs.files.get('book/chapters/01-one/draft.md')).toBe(
      'The silver sky. silver clouds over silver water.\nAnother silver line.'
    );
    expect(fs.files.get('book/chapters/02-two/draft.md')).toContain('grey'); // untouched

    expect(snapshots).toEqual([
      { path: 'chapters/01-one/draft.md', content: original, source: 'user' },
    ]);
  });

  it('skips zero-match and missing files without snapshots', async () => {
    const result = await service.apply({
      bookSlug: 'book',
      searchTerm: 'nonexistent-phrase',
      replacement: 'x',
      filePaths: ['chapters/01-one/draft.md', 'chapters/ghost/draft.md'],
      options: LITERAL,
    });

    expect(result).toEqual({ filesChanged: 0, totalReplacements: 0, details: [] });
    expect(snapshots).toEqual([]);
  });

  it('supports regex replacements with capture groups', async () => {
    fs.files.set('book/chapters/01-one/draft.md', 'Chapter 1 ends. Chapter 2 begins.');

    await service.apply({
      bookSlug: 'book',
      searchTerm: 'Chapter (\\d)',
      replacement: 'Part $1',
      filePaths: ['chapters/01-one/draft.md'],
      options: { caseSensitive: true, useRegex: true },
    });

    expect(fs.files.get('book/chapters/01-one/draft.md')).toBe('Part 1 ends. Part 2 begins.');
  });
});
