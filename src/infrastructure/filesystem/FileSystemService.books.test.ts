import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileSystemService } from './FileSystemService';
import { makeLibrary, seedBook, type Library } from '../../test/bookFixtures';
import { cleanupTempDirs, makeTempDir } from '../../test/tempDir';

let lib: Library;

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  lib = await makeLibrary(await makeTempDir());
});

afterEach(async () => {
  await cleanupTempDirs();
  vi.restoreAllMocks();
});

describe('createBook', () => {
  it('creates the full directory skeleton, about.json, and front-matter chapters', async () => {
    const meta = await lib.service.createBook('My Great Novel', 'Jo Author');

    expect(meta.slug).toBe('my-great-novel');
    expect(meta.status).toBe('scaffolded');

    const root = path.join(lib.booksDir, 'my-great-novel');
    for (const dir of ['source', 'chapters', 'assets', 'dist']) {
      expect((await stat(path.join(root, dir))).isDirectory()).toBe(true);
    }

    const about = JSON.parse(await readFile(path.join(root, 'about.json'), 'utf-8'));
    expect(about).toMatchObject({ title: 'My Great Novel', author: 'Jo Author', status: 'scaffolded' });

    // Copyright + dedication front matter written; no pipeline-gating source files
    const copyright = await readFile(path.join(root, 'chapters', '00-0-copyright', 'draft.md'), 'utf-8');
    expect(copyright).toContain('Copyright © ');
    expect(copyright).toContain('Jo Author');
    const dedication = await readFile(path.join(root, 'chapters', '00-1-dedication', 'draft.md'), 'utf-8');
    expect(dedication).toContain('# Dedication');
    expect(await lib.service.fileExists('my-great-novel', 'source/scene-outline.md')).toBe(false);
  });

  it('sets the new book as active', async () => {
    await lib.service.createBook('First');
    expect(await lib.service.getActiveBookSlug()).toBe('first');
  });

  it.each([
    ['Spaces  And   Gaps', 'spaces-and-gaps'],
    ['Punct!uation? Ma&rks.', 'punct-uation-ma-rks'],
    ['  --Trimmed--  ', 'trimmed'],
    ['Café Überall', 'caf-berall'], // non-ascii letters are dropped, not transliterated
  ])('slugifies %j → %j', async (title, slug) => {
    const meta = await lib.service.createBook(title);
    expect(meta.slug).toBe(slug);
  });

  it('a duplicate title silently reuses the same directory (no collision error)', async () => {
    await lib.service.createBook('Twin', 'First Author');
    await lib.service.writeFile('twin', 'chapters/01-one/draft.md', 'existing prose');

    const second = await lib.service.createBook('Twin', 'Second Author');

    expect(second.slug).toBe('twin');
    // about.json overwritten, prior content untouched
    expect((await lib.service.getBookMeta('twin')).author).toBe('Second Author');
    expect(await lib.service.readFile('twin', 'chapters/01-one/draft.md')).toBe('existing prose');
  });
});

describe('listBooks', () => {
  it('lists books sorted by title with word counts and the active flag', async () => {
    await seedBook(lib, 'zebra', { title: 'Zebra', chapters: { '01-one': 'one two three' } });
    await seedBook(lib, 'apple', { title: 'Apple' });
    await lib.service.setActiveBook('zebra');

    const books = await lib.service.listBooks();

    expect(books.map((b) => b.title)).toEqual(['Apple', 'Zebra']);
    const zebra = books[1];
    expect(zebra.wordCount).toBe(3);
    expect(zebra.isActive).toBe(true);
    expect(books[0].isActive).toBe(false);
  });

  it('ignores underscore/dot directories and skips books with malformed about.json', async () => {
    await seedBook(lib, 'good', { title: 'Good' });
    await seedBook(lib, 'broken', { rawAbout: '{not json' });
    await seedBook(lib, '_archived/old-book', { title: 'Old' });
    await seedBook(lib, '.hidden', { title: 'Hidden' });

    const books = await lib.service.listBooks();
    expect(books.map((b) => b.slug)).toEqual(['good']);
  });

  it('auto-imports a directory without about.json, humanizing the title', async () => {
    await seedBook(lib, 'my-imported-novel', { omitAbout: true });

    const books = await lib.service.listBooks();
    expect(books.length).toBe(1);
    expect(books[0].title).toBe('My Imported Novel');

    // Stub about.json was written — the import is idempotent
    const about = JSON.parse(
      await readFile(path.join(lib.booksDir, 'my-imported-novel', 'about.json'), 'utf-8')
    );
    expect(about.title).toBe('My Imported Novel');
  });

  it('returns [] when the books directory does not exist', async () => {
    const service = new FileSystemService(path.join(lib.userDataDir, 'nonexistent'), lib.userDataDir);
    expect(await service.listBooks()).toEqual([]);
  });
});

describe('active book', () => {
  it('round-trips through active-book.json and defaults to empty', async () => {
    expect(await lib.service.getActiveBookSlug()).toBe('');

    await lib.service.setActiveBook('some-book');
    expect(await lib.service.getActiveBookSlug()).toBe('some-book');
  });

  it('accepts a nonexistent slug without validation', async () => {
    await lib.service.setActiveBook('ghost-book');
    expect(await lib.service.getActiveBookSlug()).toBe('ghost-book');
  });
});

describe('getBookMeta', () => {
  it('throws a descriptive error for a missing book', async () => {
    await expect(lib.service.getBookMeta('nope')).rejects.toThrow(/Book "nope" not found/);
  });

  it('throws for malformed about.json', async () => {
    await seedBook(lib, 'bad', { rawAbout: 'not json at all' });
    await expect(lib.service.getBookMeta('bad')).rejects.toThrow(/malformed about\.json/);
  });
});

describe('updateBookMeta', () => {
  it('updates fields in place when the title (and slug) is unchanged', async () => {
    await lib.service.createBook('Stable Title');
    const updated = await lib.service.updateBookMeta('stable-title', { status: 'first-draft', author: 'New Author' });

    expect(updated.status).toBe('first-draft');
    expect(updated.author).toBe('New Author');
    expect(updated.slug).toBe('stable-title');
  });

  it('ignores unknown keys', async () => {
    await lib.service.createBook('Guarded');
    await lib.service.updateBookMeta('guarded', { rogue: 'value' } as never);

    const about = JSON.parse(await readFile(path.join(lib.booksDir, 'guarded', 'about.json'), 'utf-8'));
    expect(about).not.toHaveProperty('rogue');
  });

  it('renames the directory when the title changes the slug and follows the active book', async () => {
    await lib.service.createBook('Old Name'); // becomes active
    const updated = await lib.service.updateBookMeta('old-name', { title: 'New Name' });

    expect(updated.slug).toBe('new-name');
    expect((await stat(path.join(lib.booksDir, 'new-name'))).isDirectory()).toBe(true);
    await expect(stat(path.join(lib.booksDir, 'old-name'))).rejects.toThrow();
    expect(await lib.service.getActiveBookSlug()).toBe('new-name');
  });

  it('refuses to rename onto an existing book', async () => {
    await lib.service.createBook('Alpha');
    await lib.service.createBook('Beta');

    await expect(lib.service.updateBookMeta('beta', { title: 'Alpha' })).rejects.toThrow(
      /already exists/
    );
  });
});

describe('reconcileBookSlugs', () => {
  it('renames folders whose about.json title drifted and reports the migrations', async () => {
    await lib.service.createBook('Original'); // active
    // Simulate an external edit to about.json
    const aboutPath = path.join(lib.booksDir, 'original', 'about.json');
    const about = JSON.parse(await readFile(aboutPath, 'utf-8'));
    about.title = 'Renamed Externally';
    await writeFile(aboutPath, JSON.stringify(about), 'utf-8');

    const migrations = await lib.service.reconcileBookSlugs();

    expect(migrations).toEqual([{ oldSlug: 'original', newSlug: 'renamed-externally' }]);
    expect((await stat(path.join(lib.booksDir, 'renamed-externally'))).isDirectory()).toBe(true);
    expect(await lib.service.getActiveBookSlug()).toBe('renamed-externally');
  });

  it('skips renames that would collide with an existing directory', async () => {
    await seedBook(lib, 'taken', { title: 'Taken' });
    await seedBook(lib, 'drifted', { title: 'Taken' }); // same title → same target slug

    const migrations = await lib.service.reconcileBookSlugs();

    expect(migrations).toEqual([]);
    expect((await stat(path.join(lib.booksDir, 'drifted'))).isDirectory()).toBe(true);
  });

  it('returns [] when nothing drifted', async () => {
    await lib.service.createBook('Consistent');
    expect(await lib.service.reconcileBookSlugs()).toEqual([]);
  });
});
