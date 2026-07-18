import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SeriesService } from './SeriesService';
import { cleanupTempDirs, makeTempDir } from '../../test/tempDir';

let userDataDir: string;
let service: SeriesService;

beforeEach(async () => {
  userDataDir = await makeTempDir();
  service = new SeriesService(userDataDir);
});

afterEach(async () => {
  await cleanupTempDirs();
});

describe('createSeries', () => {
  it('slugifies the name and writes series.json', async () => {
    const meta = await service.createSeries('My Great Series!', 'A trilogy');

    expect(meta.slug).toBe('my-great-series');
    expect(meta.name).toBe('My Great Series!');
    expect(meta.description).toBe('A trilogy');
    expect(meta.volumes).toEqual([]);

    const onDisk = JSON.parse(
      await readFile(join(userDataDir, 'series', 'my-great-series', 'series.json'), 'utf-8')
    );
    expect(onDisk.slug).toBe('my-great-series');
  });

  it('rejects names that produce an empty slug', async () => {
    await expect(service.createSeries('!!!')).rejects.toThrow(/empty slug/);
  });

  it('rejects slug collisions', async () => {
    await service.createSeries('Twin Suns');
    await expect(service.createSeries('Twin Suns')).rejects.toThrow(/already exists/);
  });
});

describe('listSeries / getSeries', () => {
  it('lists series sorted by name and skips corrupt manifests', async () => {
    await service.createSeries('Zeta Cycle');
    await service.createSeries('Alpha Saga');
    const corruptDir = join(userDataDir, 'series', 'corrupt');
    await mkdir(corruptDir, { recursive: true });
    await writeFile(join(corruptDir, 'series.json'), '{broken', 'utf-8');

    const list = await service.listSeries();
    expect(list.map((s) => s.name)).toEqual(['Alpha Saga', 'Zeta Cycle']);
    expect(list[0].volumeCount).toBe(0);
  });

  it('returns null for a missing or malformed series', async () => {
    expect(await service.getSeries('nope')).toBeNull();

    const badDir = join(userDataDir, 'series', 'bad');
    await mkdir(badDir, { recursive: true });
    await writeFile(join(badDir, 'series.json'), 'not json', 'utf-8');
    expect(await service.getSeries('bad')).toBeNull();
  });
});

describe('updateSeries / deleteSeries', () => {
  it('updates name and description and bumps the updated timestamp', async () => {
    const created = await service.createSeries('Working Title');
    const updated = await service.updateSeries('working-title', { name: 'Final Title' });

    expect(updated.name).toBe('Final Title');
    expect(updated.slug).toBe('working-title');
    expect(Date.parse(updated.updated)).toBeGreaterThanOrEqual(Date.parse(created.created));
  });

  it('deletes the series directory and tolerates deleting a missing series', async () => {
    await service.createSeries('Doomed');
    await service.deleteSeries('doomed');
    expect(existsSync(join(userDataDir, 'series', 'doomed'))).toBe(false);
    expect(await service.getSeries('doomed')).toBeNull();

    await expect(service.deleteSeries('never-existed')).resolves.toBeUndefined();
  });
});

describe('volumes', () => {
  beforeEach(async () => {
    await service.createSeries('Saga');
  });

  it('appends volumes with sequential numbering', async () => {
    await service.addVolume('saga', 'book-one');
    const meta = await service.addVolume('saga', 'book-two');
    expect(meta.volumes).toEqual([
      { bookSlug: 'book-one', volumeNumber: 1 },
      { bookSlug: 'book-two', volumeNumber: 2 },
    ]);
  });

  it('inserts at a requested position and renumbers', async () => {
    await service.addVolume('saga', 'book-one');
    await service.addVolume('saga', 'book-three');
    const meta = await service.addVolume('saga', 'book-two', 2);
    expect(meta.volumes.map((v) => v.bookSlug)).toEqual(['book-one', 'book-two', 'book-three']);
    expect(meta.volumes.map((v) => v.volumeNumber)).toEqual([1, 2, 3]);
  });

  it('rejects duplicates within a series', async () => {
    await service.addVolume('saga', 'book-one');
    await expect(service.addVolume('saga', 'book-one')).rejects.toThrow(/already in series/);
  });

  it('rejects adding a book that belongs to another series', async () => {
    await service.createSeries('Other');
    await service.addVolume('other', 'book-one');
    await expect(service.addVolume('saga', 'book-one')).rejects.toThrow(/already in series "Other"/);
  });

  it('removes a volume and renumbers the rest', async () => {
    await service.addVolume('saga', 'book-one');
    await service.addVolume('saga', 'book-two');
    await service.addVolume('saga', 'book-three');

    const meta = await service.removeVolume('saga', 'book-two');
    expect(meta.volumes).toEqual([
      { bookSlug: 'book-one', volumeNumber: 1 },
      { bookSlug: 'book-three', volumeNumber: 2 },
    ]);
  });

  it('reorders volumes when given the exact same slug set', async () => {
    await service.addVolume('saga', 'book-one');
    await service.addVolume('saga', 'book-two');

    const meta = await service.reorderVolumes('saga', ['book-two', 'book-one']);
    expect(meta.volumes).toEqual([
      { bookSlug: 'book-two', volumeNumber: 1 },
      { bookSlug: 'book-one', volumeNumber: 2 },
    ]);
  });

  it('rejects reorders that change the slug set', async () => {
    await service.addVolume('saga', 'book-one');
    await expect(service.reorderVolumes('saga', ['book-x'])).rejects.toThrow(/not in this series/);
    await expect(service.reorderVolumes('saga', [])).rejects.toThrow(/same books/);
  });

  it('resolves a book back to its series, including after mutations', async () => {
    await service.addVolume('saga', 'book-one');
    expect((await service.getSeriesForBook('book-one'))?.slug).toBe('saga');
    expect(await service.getSeriesForBook('loose-book')).toBeNull();

    await service.removeVolume('saga', 'book-one');
    expect(await service.getSeriesForBook('book-one')).toBeNull();
  });
});

describe('series bible', () => {
  it('returns an empty string when no bible exists', async () => {
    await service.createSeries('Saga');
    expect(await service.readSeriesBible('saga')).toBe('');
  });

  it('round-trips bible content', async () => {
    await service.createSeries('Saga');
    await service.writeSeriesBible('saga', '# Bible\nCanon.');
    expect(await service.readSeriesBible('saga')).toBe('# Bible\nCanon.');
  });

  it('resolves the bible path for a book in a series, null otherwise', async () => {
    await service.createSeries('Saga');
    await service.addVolume('saga', 'book-one');

    expect(await service.getSeriesBiblePath('book-one')).toBe(
      join(userDataDir, 'series', 'saga', 'series-bible.md')
    );
    expect(await service.getSeriesBiblePath('unaffiliated')).toBeNull();
  });
});
