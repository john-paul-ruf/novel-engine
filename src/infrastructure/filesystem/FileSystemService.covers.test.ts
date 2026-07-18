import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeLibrary, type Library } from '../../test/bookFixtures';
import { cleanupTempDirs, makeTempDir } from '../../test/tempDir';

let lib: Library;

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  lib = await makeLibrary(await makeTempDir());
  await lib.service.createBook('Covered');
});

afterEach(async () => {
  await cleanupTempDirs();
  vi.restoreAllMocks();
});

async function makeSourceImage(name: string): Promise<string> {
  const sourcePath = path.join(lib.userDataDir, name);
  await writeFile(sourcePath, 'fake-image-bytes', 'utf-8');
  return sourcePath;
}

describe('saveCoverImage', () => {
  it('copies the image to cover.{ext} in the book root and records it in about.json', async () => {
    const filename = await lib.service.saveCoverImage('covered', await makeSourceImage('art.png'));

    expect(filename).toBe('cover.png');
    expect((await lib.service.getBookMeta('covered')).coverImage).toBe('cover.png');
    expect(await lib.service.getCoverImageAbsolutePath('covered')).toBe(
      path.join(lib.booksDir, 'covered', 'cover.png')
    );
  });

  it('replacing a cover with a different extension removes the old file', async () => {
    await lib.service.saveCoverImage('covered', await makeSourceImage('a.png'));
    await lib.service.saveCoverImage('covered', await makeSourceImage('b.jpg'));

    expect((await lib.service.getBookMeta('covered')).coverImage).toBe('cover.jpg');
    expect(await lib.service.fileExists('covered', 'cover.png')).toBe(false);
    expect(await lib.service.fileExists('covered', 'cover.jpg')).toBe(true);
  });

  it('rejects unsupported image extensions', async () => {
    await expect(
      lib.service.saveCoverImage('covered', await makeSourceImage('doc.pdf'))
    ).rejects.toThrow(/Unsupported image type "\.pdf"/);
  });
});

describe('getCoverImageAbsolutePath', () => {
  it('returns null when no cover is set', async () => {
    expect(await lib.service.getCoverImageAbsolutePath('covered')).toBeNull();
  });

  it('returns null when about.json points at a missing file', async () => {
    await lib.service.updateBookMeta('covered', { coverImage: 'cover.png' });
    expect(await lib.service.getCoverImageAbsolutePath('covered')).toBeNull();
  });
});
