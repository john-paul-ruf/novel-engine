import { access, readFile as fsReadFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeLibrary, seedBook, type Library } from '../../test/bookFixtures';
import { cleanupTempDirs, makeTempDir } from '../../test/tempDir';

let lib: Library;

const SLUG = 'book-one';

async function exists(absPath: string): Promise<boolean> {
  try {
    await access(absPath);
    return true;
  } catch {
    return false;
  }
}

beforeEach(async () => {
  lib = await makeLibrary(await makeTempDir());
  await seedBook(lib, SLUG, { title: 'Book One', files: { 'source/pitch.md': 'hello' } });
});

afterEach(async () => {
  await cleanupTempDirs();
});

describe('FileSystemService path containment (CAP-04)', () => {
  it('rejects readFile with a traversal path', async () => {
    await expect(lib.service.readFile(SLUG, '../../outside')).rejects.toThrow(
      /escapes book directory/,
    );
  });

  it('rejects writeFile with a traversal path and writes nothing', async () => {
    const escaped = path.join(lib.booksDir, 'evil');
    await expect(lib.service.writeFile(SLUG, '../evil', 'x')).rejects.toThrow(
      /escapes book directory/,
    );
    expect(await exists(escaped)).toBe(false);
  });

  it('rejects deletePath and renameFile traversal paths', async () => {
    await expect(lib.service.deletePath(SLUG, '../../..')).rejects.toThrow(
      /escapes book directory/,
    );
    await expect(lib.service.renameFile(SLUG, 'source/pitch.md', '../stolen.md')).rejects.toThrow(
      /escapes book directory/,
    );
  });

  it('throws from getAbsolutePath on a traversal path and performs no I/O', () => {
    expect(() => lib.service.getAbsolutePath(SLUG, '../x')).toThrow(/escapes book directory/);
    expect(() => lib.service.getAbsolutePath(SLUG, '/etc/passwd')).toThrow(
      /escapes book directory/,
    );
  });

  it('allows normal nested read and write inside the book', async () => {
    await lib.service.writeFile(SLUG, 'chapters/01-x/draft.md', 'body');
    expect(await lib.service.readFile(SLUG, 'chapters/01-x/draft.md')).toBe('body');

    const onDisk = await fsReadFile(
      path.join(lib.booksDir, SLUG, 'chapters', '01-x', 'draft.md'),
      'utf-8',
    );
    expect(onDisk).toBe('body');
  });

  it('returns the absolute in-book path for a valid relative path', () => {
    expect(lib.service.getAbsolutePath(SLUG, 'source/pitch.md')).toBe(
      path.join(lib.booksDir, SLUG, 'source', 'pitch.md'),
    );
  });
});
