import { stat } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeLibrary, seedBook, type Library } from '../../test/bookFixtures';
import { cleanupTempDirs, makeTempDir } from '../../test/tempDir';

let lib: Library;

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  lib = await makeLibrary(await makeTempDir());
});

afterEach(async () => {
  await cleanupTempDirs();
  vi.restoreAllMocks();
});

describe('archiveBook', () => {
  it('moves the book into _archived and out of the active list', async () => {
    await lib.service.createBook('Shelf Me');
    await lib.service.archiveBook('shelf-me');

    expect((await stat(path.join(lib.booksDir, '_archived', 'shelf-me'))).isDirectory()).toBe(true);
    expect(await lib.service.listBooks()).toEqual([]);

    const archived = await lib.service.listArchivedBooks();
    expect(archived.map((b) => b.slug)).toEqual(['shelf-me']);
    expect(archived[0]).toMatchObject({ title: 'Shelf Me', wordCount: 0, isActive: false });
  });

  it('clears the active selection when archiving the active book', async () => {
    await lib.service.createBook('Active One'); // createBook sets active
    await lib.service.archiveBook('active-one');
    expect(await lib.service.getActiveBookSlug()).toBe('');
  });

  it('leaves the active selection alone when archiving another book', async () => {
    await lib.service.createBook('Other');
    await lib.service.createBook('Active'); // now active
    await lib.service.archiveBook('other');
    expect(await lib.service.getActiveBookSlug()).toBe('active');
  });

  it('throws for a missing book and for an _archived slug collision', async () => {
    await expect(lib.service.archiveBook('ghost')).rejects.toThrow(/not found/);

    await lib.service.createBook('Twice');
    await lib.service.archiveBook('twice');
    await seedBook(lib, 'twice', { title: 'Twice' }); // recreate active copy
    await expect(lib.service.archiveBook('twice')).rejects.toThrow(/already exists/);
  });
});

describe('unarchiveBook', () => {
  it('restores the book and returns its meta', async () => {
    await lib.service.createBook('Round Trip', 'Auth');
    await lib.service.archiveBook('round-trip');

    const meta = await lib.service.unarchiveBook('round-trip');

    expect(meta).toMatchObject({ slug: 'round-trip', title: 'Round Trip', author: 'Auth' });
    expect((await lib.service.listBooks()).map((b) => b.slug)).toEqual(['round-trip']);
    expect(await lib.service.listArchivedBooks()).toEqual([]);
  });

  it('throws for a missing archived book and for an active-slug collision', async () => {
    await expect(lib.service.unarchiveBook('nope')).rejects.toThrow(/not found/);

    await lib.service.createBook('Clash');
    await lib.service.archiveBook('clash');
    await seedBook(lib, 'clash', { title: 'Clash' }); // active copy re-appears
    await expect(lib.service.unarchiveBook('clash')).rejects.toThrow(/already exists/);
  });
});

describe('listArchivedBooks', () => {
  it('returns [] without an _archived directory and sorts by title', async () => {
    expect(await lib.service.listArchivedBooks()).toEqual([]);

    await lib.service.createBook('Zeta');
    await lib.service.createBook('Alpha');
    await lib.service.archiveBook('zeta');
    await lib.service.archiveBook('alpha');

    expect((await lib.service.listArchivedBooks()).map((b) => b.title)).toEqual(['Alpha', 'Zeta']);
  });
});
