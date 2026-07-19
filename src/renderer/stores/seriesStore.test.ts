import { describe, it, expect, beforeEach } from 'vitest';
import type { SeriesMeta, SeriesSummary } from '@domain/types';
import { useSeriesStore } from './seriesStore';
import { installNovelEngineMock, type NovelEngineMock } from '../../test/novelEngineMock';
import { resetStoresBeforeEach } from '../../test/resetStores';

resetStoresBeforeEach(useSeriesStore);

function makeSeries(overrides: Partial<SeriesMeta> = {}): SeriesMeta {
  return {
    slug: 'storm-cycle',
    name: 'The Storm Cycle',
    description: '',
    volumes: [{ bookSlug: 'book-a', volumeNumber: 1 }],
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeSummary(overrides: Partial<SeriesSummary> = {}): SeriesSummary {
  return { ...makeSeries(), volumeCount: 1, totalWordCount: 1000, ...overrides };
}

let mock: NovelEngineMock;

beforeEach(() => {
  mock = installNovelEngineMock();
  mock.series.list.mockResolvedValue([makeSummary()]);
});

describe('seriesStore', () => {
  it('loadSeries populates the list; failure sets the error', async () => {
    await useSeriesStore.getState().loadSeries();
    expect(useSeriesStore.getState().seriesList).toHaveLength(1);
    expect(useSeriesStore.getState().loading).toBe(false);

    mock.series.list.mockRejectedValue(new Error('fs error'));
    await useSeriesStore.getState().loadSeries();
    expect(useSeriesStore.getState().error).toBe('fs error');
  });

  it('createSeries creates, reloads, and returns; failure sets the error and rethrows', async () => {
    mock.series.create.mockResolvedValue(makeSeries({ slug: 'new-series' }));

    const created = await useSeriesStore.getState().createSeries('New Series', 'desc');

    expect(created.slug).toBe('new-series');
    expect(mock.series.create).toHaveBeenCalledWith('New Series', 'desc');
    expect(mock.series.list).toHaveBeenCalled();

    mock.series.create.mockRejectedValue(new Error('name taken'));
    await expect(useSeriesStore.getState().createSeries('Dup')).rejects.toThrow('name taken');
    expect(useSeriesStore.getState().error).toBe('name taken');
  });

  it('updateSeries refreshes the active series only when it matches', async () => {
    useSeriesStore.setState({ activeSeries: makeSeries() });
    mock.series.update.mockResolvedValue(makeSeries({ name: 'Renamed Cycle' }));

    await useSeriesStore.getState().updateSeries('storm-cycle', { name: 'Renamed Cycle' });
    expect(useSeriesStore.getState().activeSeries?.name).toBe('Renamed Cycle');

    mock.series.update.mockResolvedValue(makeSeries({ slug: 'other', name: 'Other' }));
    await useSeriesStore.getState().updateSeries('other', { name: 'Other' });
    expect(useSeriesStore.getState().activeSeries?.slug).toBe('storm-cycle'); // untouched
  });

  it('deleteSeries clears the selection only when the active one was deleted', async () => {
    useSeriesStore.setState({ activeSeries: makeSeries(), bibleContent: 'bible', bibleDirty: true });

    await useSeriesStore.getState().deleteSeries('unrelated');
    expect(useSeriesStore.getState().activeSeries).not.toBeNull();

    await useSeriesStore.getState().deleteSeries('storm-cycle');
    expect(useSeriesStore.getState().activeSeries).toBeNull();
    expect(useSeriesStore.getState().bibleContent).toBe('');
    expect(useSeriesStore.getState().bibleDirty).toBe(false);
  });

  it('selectSeries loads the meta and its bible; a missing series skips the bible', async () => {
    mock.series.get.mockResolvedValue(makeSeries());
    mock.series.readBible.mockResolvedValue('# Series Bible');

    await useSeriesStore.getState().selectSeries('storm-cycle');
    expect(useSeriesStore.getState().activeSeries?.slug).toBe('storm-cycle');
    expect(useSeriesStore.getState().bibleContent).toBe('# Series Bible');

    mock.series.get.mockResolvedValue(null);
    mock.series.readBible.mockClear();
    await useSeriesStore.getState().selectSeries('ghost');
    expect(mock.series.readBible).not.toHaveBeenCalled();
  });

  it('volume operations require an active series and refresh it from the response', async () => {
    await useSeriesStore.getState().addVolume('book-b');
    expect(mock.series.addVolume).not.toHaveBeenCalled();

    useSeriesStore.setState({ activeSeries: makeSeries() });
    const twoVolumes = makeSeries({
      volumes: [
        { bookSlug: 'book-a', volumeNumber: 1 },
        { bookSlug: 'book-b', volumeNumber: 2 },
      ],
    });
    mock.series.addVolume.mockResolvedValue(twoVolumes);
    await useSeriesStore.getState().addVolume('book-b', 2);
    expect(mock.series.addVolume).toHaveBeenCalledWith('storm-cycle', 'book-b', 2);
    expect(useSeriesStore.getState().activeSeries?.volumes).toHaveLength(2);

    mock.series.removeVolume.mockResolvedValue(makeSeries());
    await useSeriesStore.getState().removeVolume('book-b');
    expect(mock.series.removeVolume).toHaveBeenCalledWith('storm-cycle', 'book-b');

    mock.series.reorderVolumes.mockResolvedValue(twoVolumes);
    await useSeriesStore.getState().reorderVolumes(['book-b', 'book-a']);
    expect(mock.series.reorderVolumes).toHaveBeenCalledWith('storm-cycle', ['book-b', 'book-a']);
  });

  it('bible editing: setBibleContent marks dirty, saveBible persists and clears it', async () => {
    useSeriesStore.setState({ activeSeries: makeSeries() });

    useSeriesStore.getState().setBibleContent('updated bible');
    expect(useSeriesStore.getState().bibleDirty).toBe(true);

    await useSeriesStore.getState().saveBible();
    expect(mock.series.writeBible).toHaveBeenCalledWith('storm-cycle', 'updated bible');
    expect(useSeriesStore.getState().bibleDirty).toBe(false);

    mock.series.writeBible.mockRejectedValue(new Error('read-only fs'));
    useSeriesStore.getState().setBibleContent('again');
    await useSeriesStore.getState().saveBible();
    expect(useSeriesStore.getState().error).toBe('read-only fs');
    expect(useSeriesStore.getState().bibleDirty).toBe(true);
  });

  it('getSeriesForBook passes through and swallows failures as null', async () => {
    mock.series.getForBook.mockResolvedValue(makeSeries());
    expect((await useSeriesStore.getState().getSeriesForBook('book-a'))?.slug).toBe('storm-cycle');

    mock.series.getForBook.mockRejectedValue(new Error('nope'));
    expect(await useSeriesStore.getState().getSeriesForBook('book-a')).toBeNull();
  });

  it('modal open/close tracks the requested mode', () => {
    useSeriesStore.getState().openModal('bible');
    expect(useSeriesStore.getState().isModalOpen).toBe(true);
    expect(useSeriesStore.getState().modalMode).toBe('bible');

    useSeriesStore.getState().closeModal();
    expect(useSeriesStore.getState().isModalOpen).toBe(false);

    useSeriesStore.getState().openModal();
    expect(useSeriesStore.getState().modalMode).toBe('list');
  });

  it('clearSelection drops the active series and bible state', () => {
    useSeriesStore.setState({ activeSeries: makeSeries(), bibleContent: 'x', bibleDirty: true });

    useSeriesStore.getState().clearSelection();

    expect(useSeriesStore.getState().activeSeries).toBeNull();
    expect(useSeriesStore.getState().bibleContent).toBe('');
    expect(useSeriesStore.getState().bibleDirty).toBe(false);
  });
});
