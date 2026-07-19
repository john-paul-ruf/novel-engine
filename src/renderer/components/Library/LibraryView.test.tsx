import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { BookDashboardData, SeriesSummary, ShelvedPitchMeta } from '@domain/types';
import { LibraryView } from './LibraryView';
import { useBookStore } from '../../stores/bookStore';
import { useSeriesStore } from '../../stores/seriesStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { usePitchShelfStore } from '../../stores/pitchShelfStore';
import { useImportStore } from '../../stores/importStore';
import { useViewStore } from '../../stores/viewStore';
import { renderApp, type StoreSeed } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { makeBookSummary, type BridgeOverrides } from '../../../test/novelEngineMock';

resetStoresBeforeEach(
  useBookStore,
  useSeriesStore,
  usePipelineStore,
  usePitchShelfStore,
  useImportStore,
  useViewStore,
);

const BOOKS = [
  makeBookSummary({ slug: 'alpha', title: 'Alpha', wordCount: 1000 }),
  makeBookSummary({ slug: 'beta', title: 'Beta', wordCount: 500 }),
];

function makeSeries(overrides: Partial<SeriesSummary> = {}): SeriesSummary {
  return {
    slug: 'saga',
    name: 'The Saga',
    description: '',
    volumes: [{ bookSlug: 'beta', volumeNumber: 1 }],
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
    volumeCount: 1,
    totalWordCount: 500,
    ...overrides,
  };
}

function makeDashboardData(overrides: Partial<BookDashboardData> = {}): BookDashboardData {
  return {
    bookSlug: 'alpha',
    pipeline: { currentPhase: null, completedCount: 0, totalCount: 0 },
    wordCount: { current: 1000, target: null, perChapter: [] },
    lastInteraction: null,
    revisionTasks: { total: 0, completed: 0, items: [] },
    recentFiles: [],
    daysInProgress: 1,
    bookTitle: 'Alpha',
    bookStatus: 'first-draft',
    ...overrides,
  };
}

function makePitch(slug: string): ShelvedPitchMeta {
  return { slug, title: slug, logline: '', shelvedAt: '2026-01-01T00:00:00.000Z', shelvedFrom: '' };
}

function renderLibrary(opts: { bridge?: BridgeOverrides; stores?: StoreSeed } = {}) {
  return renderApp(<LibraryView />, {
    bridge: {
      books: { list: vi.fn(async () => BOOKS) },
      ...opts.bridge,
    },
    stores: opts.stores,
  });
}

describe('LibraryView', () => {
  it('renders the shelf from loaded books with header totals', async () => {
    renderLibrary();

    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText(/2 books · 1,500 words in production/)).toBeInTheDocument();
  });

  it('selecting a book activates it and navigates to the workspace', async () => {
    const { bridge } = renderLibrary();

    fireEvent.click(await screen.findByRole('button', { name: /Alpha/ }));

    await waitFor(() => expect(bridge.books.setActive).toHaveBeenCalledWith('alpha'));
    expect(useViewStore.getState().currentView).toBe('workspace');
  });

  it('creates a book through the New Book modal and opens it', async () => {
    const { bridge } = renderLibrary();
    await screen.findByText('Alpha');

    fireEvent.click(screen.getByRole('button', { name: /New Book/ }));
    const input = screen.getByPlaceholderText('Book Title');
    fireEvent.change(input, { target: { value: 'My Novel' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(bridge.books.create).toHaveBeenCalledWith('My Novel'));
    // create's default meta has slug 'test-book' — the new book is activated
    await waitFor(() => expect(bridge.books.setActive).toHaveBeenCalledWith('test-book'));
    expect(useViewStore.getState().currentView).toBe('workspace');
  });

  it('archives a book after confirmation and refreshes the archived list', async () => {
    const { bridge } = renderLibrary();
    await screen.findByText('Alpha');

    // First card in the standalone grid is Alpha
    fireEvent.click(screen.getAllByTitle('Book actions')[0]);
    fireEvent.click(screen.getByText('Archive'));

    expect(screen.getByText('Archive Book')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(bridge.books.archive).toHaveBeenCalledWith('alpha'));
    await waitFor(() => expect(bridge.books.listArchived).toHaveBeenCalled());
  });

  it('restores a book from the Archived modal', async () => {
    const { bridge } = renderLibrary({
      bridge: {
        books: {
          list: vi.fn(async () => BOOKS),
          listArchived: vi.fn(async () => [
            makeBookSummary({ slug: 'old-book', title: 'Old Book' }),
          ]),
        },
        // Restore activates the book, which triggers a dashboard load
        dashboard: { getData: vi.fn(async () => makeDashboardData({ bookSlug: 'test-book' })) },
      },
    });
    await screen.findByText('Alpha');

    fireEvent.click(screen.getByRole('button', { name: /Archived/ }));
    expect(await screen.findByText('Old Book')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(bridge.books.unarchive).toHaveBeenCalledWith('old-book'));
    // Modal closes and we stay on the shelf
    await waitFor(() => expect(screen.queryByText('Archived Books')).not.toBeInTheDocument());
    expect(useViewStore.getState().currentView).toBe('library');
  });

  it('groups series volumes into a titled section with volume numbers', async () => {
    renderLibrary({
      bridge: { series: { list: vi.fn(async () => [makeSeries()]) } },
    });

    expect(await screen.findByText('The Saga')).toBeInTheDocument();
    expect(screen.getByText('1 volume')).toBeInTheDocument();
    expect(screen.getByText('Vol. 1')).toBeInTheDocument();
    // Alpha stays standalone — no volume badge of its own
    expect(screen.getAllByText(/^Vol\./)).toHaveLength(1);
  });

  it('shows the shelved-pitch count and navigates to the pitch room', async () => {
    renderLibrary({
      bridge: { pitches: { list: vi.fn(async () => [makePitch('p1'), makePitch('p2')]) } },
    });

    expect(await screen.findByText('2 shelved')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Pitch an idea with Spark/ }));
    expect(useViewStore.getState().currentView).toBe('pitch-room');
  });

  it('shows the Recent line for the active book from dashboard data', async () => {
    renderLibrary({
      bridge: {
        books: {
          list: vi.fn(async () => BOOKS),
          getActiveSlug: vi.fn(async () => 'alpha'),
        },
        dashboard: {
          getData: vi.fn(async () =>
            makeDashboardData({
              recentFiles: [
                { path: 'chapters/02-x/draft.md', modifiedAt: new Date().toISOString(), wordCount: 10 },
              ],
              lastInteraction: {
                agentName: 'Verity',
                timestamp: new Date().toISOString(),
                conversationTitle: 'Draft',
              },
            }),
          ),
        },
      },
    });

    expect(await screen.findByText('Verity')).toBeInTheDocument();
    expect(screen.getByText('chapters/02-x/draft.md')).toBeInTheDocument();
    expect(screen.getByText(/just now/)).toBeInTheDocument();
  });

  it('opens the import choice modal and starts a manuscript import', async () => {
    const startImport = vi.fn();
    renderLibrary({ stores: [[useImportStore, { startImport }]] });
    await screen.findByText('Alpha');

    fireEvent.click(screen.getByRole('button', { name: /^Import$/ }));
    fireEvent.click(screen.getByText('Import a manuscript from a folder'));

    expect(startImport).toHaveBeenCalledTimes(1);
  });
});
