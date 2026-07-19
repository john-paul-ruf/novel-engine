import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChapterValidator } from './ChapterValidator';
import { cleanupTempDirs, makeTempDir } from '../test/tempDir';

let booksDir: string;
let chaptersDir: string;
let validator: ChapterValidator;

async function seedFile(relative: string, content = 'prose'): Promise<void> {
  const target = path.join(booksDir, 'book', relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, 'utf-8');
}

const exists = async (relative: string): Promise<boolean> => {
  try {
    await readFile(path.join(booksDir, 'book', relative), 'utf-8');
    return true;
  } catch {
    return false;
  }
};

beforeEach(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  booksDir = await makeTempDir();
  chaptersDir = path.join(booksDir, 'book', 'chapters');
  await mkdir(chaptersDir, { recursive: true });
  validator = new ChapterValidator(booksDir);
});

afterEach(async () => {
  await cleanupTempDirs();
  vi.restoreAllMocks();
});

describe('validateAndCorrect', () => {
  it('returns [] for a missing chapters directory and for a clean structure', async () => {
    expect(await new ChapterValidator(booksDir).validateAndCorrect('empty-book')).toEqual([]);

    await seedFile('chapters/01-one/draft.md');
    await seedFile('chapters/01-one/notes.md');
    expect(await validator.validateAndCorrect('book')).toEqual([]);
  });

  // NOTE: root files must START with draft/notes/chapter/section to be
  // recognized — "01-slug-draft.md" is intentionally left untouched.
  it.each([
    ['draft-01-the-beginning.md', 'chapters/01-the-beginning/draft.md'],
    ['notes-02-second.md', 'chapters/02-second/notes.md'],
    ['chapter-5-notes.md', 'chapters/05-chapter/notes.md'],
  ])('moves root-level %s to %s', async (rootFile, correctedPath) => {
    await seedFile(`chapters/${rootFile}`, 'misplaced content');

    const corrected = await validator.validateAndCorrect('book');

    expect(corrected).toEqual([correctedPath.replace(/^chapters\//, 'chapters/')]);
    expect(await exists(correctedPath)).toBe(true);
    expect(await exists(`chapters/${rootFile}`)).toBe(false);
  });

  it('leaves non-chapter files and unresolvable names alone', async () => {
    await seedFile('chapters/readme.md');
    await seedFile('chapters/draft-untitled.md'); // no number anywhere → no slug

    const corrected = await validator.validateAndCorrect('book');

    expect(corrected).toEqual([]);
    expect(await exists('chapters/readme.md')).toBe(true);
    expect(await exists('chapters/draft-untitled.md')).toBe(true);
  });

  it('preserves an existing target and discards the stray root copy', async () => {
    await seedFile('chapters/01-one/draft.md', 'authoritative');
    await seedFile('chapters/draft-01-one.md', 'stray duplicate');

    const corrected = await validator.validateAndCorrect('book');

    expect(corrected).toEqual(['chapters/01-one/draft.md (moved from root, existing file preserved)']);
    expect(await readFile(path.join(chaptersDir, '01-one', 'draft.md'), 'utf-8')).toBe('authoritative');
    expect(await exists('chapters/draft-01-one.md')).toBe(false);
  });

  it('renames misnamed files inside chapter directories', async () => {
    await seedFile('chapters/03-three/chapter-three.md', 'content');

    const corrected = await validator.validateAndCorrect('book');

    expect(corrected).toEqual(['chapters/03-three/draft.md (renamed from chapter-three.md)']);
    expect(await exists('chapters/03-three/draft.md')).toBe(true);
  });

  it('removes in-directory duplicates when the canonical file already exists', async () => {
    await seedFile('chapters/03-three/draft.md', 'canonical');
    await seedFile('chapters/03-three/chapter-copy.md', 'dupe');

    const corrected = await validator.validateAndCorrect('book');

    expect(corrected).toEqual(['chapters/03-three/draft.md (removed duplicate)']);
    expect(await readFile(path.join(chaptersDir, '03-three', 'draft.md'), 'utf-8')).toBe('canonical');
    expect(await exists('chapters/03-three/chapter-copy.md')).toBe(false);
  });

  it('accepts versioned variants (draft-v2.md) as valid without changes', async () => {
    await seedFile('chapters/04-four/draft.md');
    await seedFile('chapters/04-four/draft-v2.md', 'older version');

    expect(await validator.validateAndCorrect('book')).toEqual([]);
    expect(await exists('chapters/04-four/draft-v2.md')).toBe(true);
  });
});
