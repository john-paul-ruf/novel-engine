import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { SeriesMeta, SeriesSummary } from '@domain/types';
import { SeriesModal } from './SeriesModal';
import { useSeriesStore } from '../../stores/seriesStore';
import { useBookStore } from '../../stores/bookStore';
import { renderApp, type StoreSeed } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { makeBookSummary, type BridgeOverrides } from '../../../test/novelEngineMock';

resetStoresBeforeEach(useSeriesStore, useBookStore);

const META: SeriesMeta = {
  slug: 'saga',
  name: 'The Saga',
  description: 'Epic tale',
  volumes: [{ bookSlug: 'book-a', volumeNumber: 1 }],
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-01-01T00:00:00.000Z',
};

const SUMMARY: SeriesSummary = { ...META, volumeCount: 1, totalWordCount: 1000 };

function renderModal(stores: StoreSeed, bridge: BridgeOverrides = {}) {
  return renderApp(<SeriesModal />, { bridge, stores });
}

describe('SeriesModal', () => {
  it('list mode shows all series and routes to create mode', async () => {
    renderModal([], { series: { list: vi.fn(async () => [SUMMARY]) } });

    expect(screen.getByText('Manage Series')).toBeInTheDocument();
    expect(await screen.findByText('The Saga')).toBeInTheDocument();
    expect(screen.getByText('1 volume')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Create New Series/ }));
    // Title and submit button both read "Create Series"
    expect(screen.getByRole('heading', { name: 'Create Series' })).toBeInTheDocument();
    expect(screen.getByLabelText('Series Name')).toBeInTheDocument();
  });

  it('deleting a series asks for confirmation first', async () => {
    const { bridge } = renderModal([], { series: { list: vi.fn(async () => [SUMMARY]) } });
    await screen.findByText('The Saga');

    fireEvent.click(screen.getByTitle('Delete series'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(bridge.series.delete).toHaveBeenCalledWith('saga'));
  });

  it('creating a series opens it in edit mode', async () => {
    const { bridge } = renderModal(
      [[useSeriesStore, { modalMode: 'create' }]],
      {
        series: {
          create: vi.fn(async () => META),
          get: vi.fn(async () => META),
        },
      },
    );

    fireEvent.change(screen.getByLabelText('Series Name'), { target: { value: 'The Saga' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Series' }));

    await waitFor(() => expect(bridge.series.create).toHaveBeenCalledWith('The Saga', ''));
    expect(await screen.findByText('Edit Series — The Saga')).toBeInTheDocument();
  });

  it('edit mode shows volumes and switches to the bible editor', () => {
    renderModal([
      [
        useSeriesStore,
        { modalMode: 'edit', activeSeries: META, bibleContent: '# Bible notes', bibleDirty: false },
      ],
      [useBookStore, { books: [makeBookSummary({ slug: 'book-a', title: 'Book A' })] }],
    ]);

    expect(screen.getByText('Edit Series — The Saga')).toBeInTheDocument();
    expect(screen.getByText('Book A')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Series Bible/ }));
    expect(screen.getByDisplayValue('# Bible notes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Saved' })).toBeDisabled();
  });

  it('renames the series through the inline form', async () => {
    const { bridge } = renderModal([
      [useSeriesStore, { modalMode: 'edit', activeSeries: META }],
    ]);
    bridge.series.update.mockResolvedValue({ ...META, name: 'New Saga' });

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.change(screen.getByDisplayValue('The Saga'), { target: { value: 'New Saga' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() =>
      expect(bridge.series.update).toHaveBeenCalledWith('saga', {
        name: 'New Saga',
        description: 'Epic tale',
      }),
    );
  });

  it('archiving a series archives every volume and closes the modal', async () => {
    const { bridge } = renderModal([
      [useSeriesStore, { modalMode: 'edit', activeSeries: META, isModalOpen: true }],
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Archive Series' }));
    expect(screen.getByText(/Archive all 1 book in this series/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(bridge.books.archive).toHaveBeenCalledWith('book-a'));
    await waitFor(() => expect(useSeriesStore.getState().isModalOpen).toBe(false));
  });

  it('Escape closes the modal', () => {
    renderModal([[useSeriesStore, { isModalOpen: true }]]);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(useSeriesStore.getState().isModalOpen).toBe(false);
  });
});
