import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeLibrary, seedBook, type Library } from '../../test/bookFixtures';
import { cleanupTempDirs, makeTempDir } from '../../test/tempDir';

let lib: Library;

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  lib = await makeLibrary(await makeTempDir());
  await seedBook(lib, 'book', { title: 'Book' });
});

afterEach(async () => {
  await cleanupTempDirs();
  vi.restoreAllMocks();
});

describe('file operations', () => {
  it('writeFile creates parent directories and readFile round-trips content', async () => {
    const unicode = '第一章 — «Ça commence» 🖋️\n\nProse body.';
    await lib.service.writeFile('book', 'chapters/01-opening/draft.md', unicode);
    expect(await lib.service.readFile('book', 'chapters/01-opening/draft.md')).toBe(unicode);
  });

  it('very large content round-trips intact', async () => {
    const large = 'word '.repeat(200_000); // ~1 MB
    await lib.service.writeFile('book', 'source/story-bible.md', large);
    expect(await lib.service.readFile('book', 'source/story-bible.md')).toBe(large);
  });

  it('readFile throws a descriptive error for a missing file', async () => {
    await expect(lib.service.readFile('book', 'chapters/09-none/draft.md')).rejects.toThrow(
      /File not found: chapters\/09-none\/draft\.md in book "book"/
    );
  });

  it('deleteFile removes the file and tolerates deleting a missing one', async () => {
    await lib.service.writeFile('book', 'source/pitch.md', 'pitch');
    await lib.service.deleteFile('book', 'source/pitch.md');
    expect(await lib.service.fileExists('book', 'source/pitch.md')).toBe(false);

    await expect(lib.service.deleteFile('book', 'source/pitch.md')).resolves.toBeUndefined();
  });

  it('deletePath removes files and whole directories, tolerating missing paths', async () => {
    await lib.service.writeFile('book', 'chapters/01-gone/draft.md', 'x');
    await lib.service.writeFile('book', 'chapters/01-gone/notes.md', 'y');

    await lib.service.deletePath('book', 'chapters/01-gone');
    expect(await lib.service.fileExists('book', 'chapters/01-gone')).toBe(false);

    await expect(lib.service.deletePath('book', 'chapters/01-gone')).resolves.toBeUndefined();
  });

  it('renameFile moves content, creates destination parents, and rejects missing sources', async () => {
    await lib.service.writeFile('book', 'source/old.md', 'content');
    await lib.service.renameFile('book', 'source/old.md', 'source/nested/new.md');

    expect(await lib.service.readFile('book', 'source/nested/new.md')).toBe('content');
    expect(await lib.service.fileExists('book', 'source/old.md')).toBe(false);

    await expect(lib.service.renameFile('book', 'source/ghost.md', 'source/x.md')).rejects.toThrow(
      /source file "source\/ghost\.md" does not exist/
    );
  });

  it('listDirectory returns directories first, each group alphabetical', async () => {
    await lib.service.writeFile('book', 'zeta.md', 'z');
    await lib.service.writeFile('book', 'chapters/01-one/draft.md', 'x');

    const entries = await lib.service.listDirectory('book');
    const names = entries.map((e) => `${e.isDirectory ? 'd' : 'f'}:${e.name}`);
    expect(names).toEqual(['d:chapters', 'd:source', 'f:about.json', 'f:zeta.md']);

    const chapters = entries.find((e) => e.name === 'chapters');
    expect(chapters?.children?.[0].name).toBe('01-one');
  });
});

describe('word counts', () => {
  it('countWords sums chapter drafts and excludes 00-* front matter', async () => {
    await seedBook(lib, 'counted', {
      title: 'Counted',
      chapters: {
        '00-0-copyright': 'these words never count',
        '01-one': 'one two three',
        '02-two': 'four five',
      },
    });

    expect(await lib.service.countWords('counted')).toBe(5);
  });

  it('countWords returns 0 for a book without chapters', async () => {
    expect(await lib.service.countWords('book')).toBe(0);
  });

  it('countWordsPerChapter orders front matter → body → back matter with numeric ordering', async () => {
    await seedBook(lib, 'ordered', {
      title: 'Ordered',
      chapters: {
        '10-ten': 'a b c',
        '02-two': 'a b',
        'z0-afterword': 'a b c d',
        '00-1-dedication': 'dedicated words',
        '00-0-copyright': 'legal words',
      },
    });

    const counts = await lib.service.countWordsPerChapter('ordered');
    expect(counts.map((c) => c.slug)).toEqual([
      '00-0-copyright',
      '00-1-dedication',
      '02-two',
      '10-ten',
      'z0-afterword',
    ]);
    // Front matter is listed but reports 0 words
    expect(counts.map((c) => c.wordCount)).toEqual([0, 0, 2, 3, 4]);
  });
});

describe('assembleManuscript', () => {
  it('assembles non-empty chapters in order with title-cased headings and a word total', async () => {
    await seedBook(lib, 'novel', {
      title: 'Novel',
      chapters: {
        '02-the-turn': 'turn prose here',
        '01-first-light': 'opening prose',
        '03-empty': '   \n',
      },
    });

    const assembly = await lib.service.assembleManuscript('novel');

    expect(assembly.chapters.map((c) => c.slug)).toEqual(['01-first-light', '02-the-turn']);
    expect(assembly.chapters[0].title).toBe('First light');
    expect(assembly.chapterCount).toBe(2); // empty chapter skipped
    expect(assembly.wordCount).toBe(5);
    expect(assembly.content).toBe('# First light\n\nopening prose\n\n---\n\n# The turn\n\nturn prose here');
  });

  it('returns an empty assembly when there is no chapters directory', async () => {
    const assembly = await lib.service.assembleManuscript('missing-book');
    expect(assembly).toEqual({ content: '', chapterCount: 0, wordCount: 0, chapters: [] });
  });
});

describe('getProjectManifest', () => {
  it('lists existing source files, counts non-front-matter chapters, and sums draft words only', async () => {
    await seedBook(lib, 'proj', {
      title: 'Proj',
      chapters: { '00-0-copyright': 'legal', '01-one': 'one two three' },
      files: {
        'source/pitch.md': 'a pitch',
        'chapters/01-one/notes.md': 'note words here',
      },
    });

    const manifest = await lib.service.getProjectManifest('proj');

    expect(manifest.meta.title).toBe('Proj');
    expect(manifest.chapterCount).toBe(1);
    expect(manifest.totalWordCount).toBe(3); // draft.md words only, notes excluded

    const paths = manifest.files.map((f) => f.path);
    expect(paths).toContain('source/pitch.md');
    expect(paths).toContain('chapters/01-one/draft.md');
    expect(paths).toContain('chapters/01-one/notes.md');
    expect(paths).not.toContain('source/story-bible.md'); // absent files omitted

    const pitch = manifest.files.find((f) => f.path === 'source/pitch.md');
    expect(pitch?.wordCount).toBe(2);
  });

  it('includes the author profile by absolute path when present', async () => {
    await lib.service.writeFile('book', 'source/pitch.md', 'p');
    const profilePath = path.join(lib.userDataDir, 'author-profile.md');
    const { writeFile: fsWrite } = await import('node:fs/promises');
    await fsWrite(profilePath, 'I write books.', 'utf-8');

    const manifest = await lib.service.getProjectManifest('book');
    expect(manifest.files.map((f) => f.path)).toContain(profilePath);
  });
});

describe('getRecentFiles', () => {
  it('returns md/json files newest-first, respecting the limit and skipping dist/', async () => {
    await seedBook(lib, 'recent', {
      title: 'Recent',
      files: {
        'source/pitch.md': 'pitch words',
        'dist/output.md': 'ignored',
        'assets/image.png': 'binary-ish',
      },
    });

    const files = await lib.service.getRecentFiles('recent', 5);
    const paths = files.map((f) => f.path);

    expect(paths).toContain('source/pitch.md');
    expect(paths).toContain('about.json');
    expect(paths).not.toContain('dist/output.md');
    expect(paths).not.toContain('assets/image.png');

    const limited = await lib.service.getRecentFiles('recent', 1);
    expect(limited.length).toBe(1);
  });
});
