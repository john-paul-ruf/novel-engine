import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IManuscriptImportService, ISeriesService } from '@domain/interfaces';
import type { ImportPreview } from '@domain/types';
import { SeriesImportService } from './SeriesImportService';

function makePreview(title: string, words = 100): ImportPreview {
  return {
    sourceFile: `/in/${title}.md`,
    sourceFormat: 'markdown',
    markdownContent: '',
    chapters: [
      { index: 0, title: 'Chapter 1', startLine: 0, endLine: 1, wordCount: words, content: 'prose' },
    ],
    totalWordCount: words,
    detectedTitle: title,
    detectedAuthor: 'Auth',
    ambiguous: false,
  };
}

let manuscriptImport: {
  preview: ReturnType<typeof vi.fn>;
  commit: ReturnType<typeof vi.fn>;
};
let series: {
  createSeries: ReturnType<typeof vi.fn>;
  getSeries: ReturnType<typeof vi.fn>;
  addVolume: ReturnType<typeof vi.fn>;
};
let service: SeriesImportService;

beforeEach(() => {
  manuscriptImport = {
    preview: vi.fn(async () => makePreview('Untitled')), // overridden per test
    commit: vi.fn(async (config: { title: string }) => ({
      bookSlug: config.title.toLowerCase().replace(/\s+/g, '-'),
      title: config.title,
      chapterCount: 1,
      totalWordCount: 100,
    })),
  };
  series = {
    createSeries: vi.fn(async (name: string) => ({ slug: 'the-saga', name, description: '', volumes: [], created: '', updated: '' })),
    getSeries: vi.fn(async () => null),
    addVolume: vi.fn(async () => ({})),
  };
  service = new SeriesImportService(
    manuscriptImport as unknown as IManuscriptImportService,
    series as unknown as ISeriesService
  );
});

describe('preview', () => {
  it('previews each file, numbers volumes, and detects the series name from common title prefixes', async () => {
    manuscriptImport.preview
      .mockResolvedValueOnce(makePreview('The Saga Book 1', 100))
      .mockResolvedValueOnce(makePreview('The Saga Book 2', 200));

    const preview = await service.preview(['/in/a.md', '/in/b.md']);

    expect(preview.seriesName).toBe('The Saga');
    expect(preview.volumes.map((v) => v.volumeNumber)).toEqual([1, 2]);
    expect(preview.totalWordCount).toBe(300);
    expect(preview.totalChapterCount).toBe(2);
  });

  it('falls back to the common parent directory, then to "Imported Series"', async () => {
    manuscriptImport.preview
      .mockResolvedValueOnce(makePreview('Alpha', 10))
      .mockResolvedValueOnce(makePreview('Zeta', 10));

    const byDir = await service.preview(['/books/the-hollow-cycle/a.md', '/books/the-hollow-cycle/b.md']);
    expect(byDir.seriesName).toBe('The Hollow Cycle');

    manuscriptImport.preview
      .mockResolvedValueOnce(makePreview('Alpha', 10))
      .mockResolvedValueOnce(makePreview('Zeta', 10));
    const fallback = await service.preview(['/x/a.md', '/y/b.md']);
    expect(fallback.seriesName).toBe('Imported Series');
  });

  it('rejects empty selections and wraps per-file preview failures', async () => {
    await expect(service.preview([])).rejects.toThrow(/No files selected/);

    manuscriptImport.preview.mockRejectedValueOnce(new Error('bad docx'));
    await expect(service.preview(['/in/a.docx'])).rejects.toThrow(
      /Failed to preview file "\/in\/a.docx": bad docx/
    );
  });
});

describe('commit', () => {
  const volumes = [
    { volumeNumber: 2, title: 'Saga Two', chapters: [] },
    { volumeNumber: 1, title: 'Saga One', chapters: [] },
  ];

  it('creates the series and imports volumes in volume order, linking each', async () => {
    const result = await service.commit({ seriesName: 'The Saga', existingSeriesSlug: null, author: 'Auth', volumes });

    expect(series.createSeries).toHaveBeenCalledWith('The Saga');
    expect(manuscriptImport.commit.mock.calls.map((c) => c[0].title)).toEqual(['Saga One', 'Saga Two']);
    expect(series.addVolume.mock.calls).toEqual([
      ['the-saga', 'saga-one', 1],
      ['the-saga', 'saga-two', 2],
    ]);
    expect(result).toMatchObject({ seriesSlug: 'the-saga', totalBooks: 2, totalChapters: 2, totalWordCount: 200 });
  });

  it('reuses an existing series and rejects unknown slugs', async () => {
    series.getSeries.mockResolvedValueOnce({ slug: 'existing', name: 'Existing', volumes: [] });

    await service.commit({ seriesName: 'ignored', existingSeriesSlug: 'existing', author: 'A', volumes: [volumes[1]] });
    expect(series.createSeries).not.toHaveBeenCalled();
    expect(series.addVolume).toHaveBeenCalledWith('existing', 'saga-one', 1);

    series.getSeries.mockResolvedValueOnce(null);
    await expect(
      service.commit({ seriesName: 'x', existingSeriesSlug: 'ghost', author: 'A', volumes: [volumes[1]] })
    ).rejects.toThrow(/Series "ghost" not found/);

    await expect(service.commit({ seriesName: 'x', existingSeriesSlug: null, author: 'A', volumes: [] })).rejects.toThrow(/No volumes to import/);
  });

  it('a failing volume aborts the batch but leaves earlier volumes imported and linked', async () => {
    manuscriptImport.commit
      .mockImplementationOnce(async (config: { title: string }) => ({
        bookSlug: 'saga-one',
        title: config.title,
        chapterCount: 1,
        totalWordCount: 100,
      }))
      .mockRejectedValueOnce(new Error('disk full'));

    await expect(service.commit({ seriesName: 'The Saga', existingSeriesSlug: null, author: 'A', volumes })).rejects.toThrow(
      /Failed to import volume 2 "Saga Two": disk full/
    );

    // Volume 1 was fully imported and linked before the failure — partial state persists
    expect(series.addVolume).toHaveBeenCalledTimes(1);
    expect(series.addVolume).toHaveBeenCalledWith('the-saga', 'saga-one', 1);
  });
});
