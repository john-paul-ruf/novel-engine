import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import type { SeriesSummary, SeriesVolume } from '@domain/types';
import { VolumeList } from './VolumeList';
import { useSeriesStore } from '../../stores/seriesStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { makeBookSummary } from '../../../test/novelEngineMock';

resetStoresBeforeEach(useSeriesStore);

const VOLUMES: SeriesVolume[] = [
  { bookSlug: 'book-a', volumeNumber: 1 },
  { bookSlug: 'book-b', volumeNumber: 2 },
];

const BOOKS = [
  makeBookSummary({ slug: 'book-a', title: 'Book A' }),
  makeBookSummary({ slug: 'book-b', title: 'Book B' }),
  makeBookSummary({ slug: 'standalone', title: 'Standalone' }),
];

// The picker excludes books already in ANY series (from the store's seriesList)
const SERIES_LIST: SeriesSummary[] = [
  {
    slug: 'saga',
    name: 'Saga',
    description: '',
    volumes: VOLUMES,
    created: '',
    updated: '',
    volumeCount: 2,
    totalWordCount: 0,
  },
];

function renderList(volumes: SeriesVolume[] = VOLUMES) {
  const handlers = { onReorder: vi.fn(), onRemove: vi.fn(), onAdd: vi.fn() };
  const utils = renderApp(
    <VolumeList volumes={volumes} books={BOOKS} {...handlers} />,
    { stores: [[useSeriesStore, { seriesList: SERIES_LIST }]] },
  );
  return { ...utils, handlers };
}

describe('VolumeList', () => {
  it('lists volumes with numbers and resolved titles', () => {
    renderList();

    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('Book A')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('Book B')).toBeInTheDocument();
  });

  it('reorders by swapping slugs and removes volumes', () => {
    const { handlers } = renderList();

    fireEvent.click(screen.getAllByTitle('Move down')[0]);
    expect(handlers.onReorder).toHaveBeenCalledWith(['book-b', 'book-a']);

    fireEvent.click(screen.getAllByTitle('Remove from series')[1]);
    expect(handlers.onRemove).toHaveBeenCalledWith('book-b');
  });

  it('edge rows cannot move outward', () => {
    renderList();
    expect(screen.getAllByTitle('Move up')[0]).toBeDisabled();
    expect(screen.getAllByTitle('Move down')[1]).toBeDisabled();
  });

  it('the picker offers only books not yet in a series', () => {
    const { handlers } = renderList();

    fireEvent.click(screen.getByRole('button', { name: /Add Book/ }));

    expect(screen.getByText('Standalone')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Book A' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Standalone'));
    expect(handlers.onAdd).toHaveBeenCalledWith('standalone');
    // Picker closes after adding
    expect(screen.queryByText('Select a book to add:')).not.toBeInTheDocument();
  });

  it('shows the empty state without volumes', () => {
    renderList([]);
    expect(screen.getByText(/No books in this series yet/)).toBeInTheDocument();
  });
});
