import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type {
  ImportPreview,
  SeriesImportResult,
  SeriesImportVolume,
  SeriesSummary,
} from '@domain/types';
import { ImportSeriesWizard } from './ImportSeriesWizard';
import { useSeriesImportStore } from '../../stores/seriesImportStore';
import { useSeriesStore } from '../../stores/seriesStore';
import { useBookStore } from '../../stores/bookStore';
import { renderApp, type StoreSeed } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { type BridgeOverrides } from '../../../test/novelEngineMock';

resetStoresBeforeEach(useSeriesImportStore, useSeriesStore, useBookStore);

function preview(title: string, words = 1000): ImportPreview {
  return {
    sourceFile: `/tmp/${title}.md`,
    sourceFormat: 'markdown',
    markdownContent: '',
    chapters: [{ index: 0, title: 'One', startLine: 0, endLine: 5, wordCount: words, content: 'x' }],
    totalWordCount: words,
    detectedTitle: title,
    detectedAuthor: '',
    ambiguous: false,
  };
}

function volume(index: number, title: string, skipped = false): SeriesImportVolume {
  return { index, preview: preview(title), volumeNumber: index + 1, skipped };
}

const RESULT: SeriesImportResult = {
  seriesSlug: 'the-saga',
  seriesName: 'The Saga',
  volumeResults: [
    { bookSlug: 'book-a', title: 'Book A', chapterCount: 1, totalWordCount: 1000 },
    { bookSlug: 'book-b', title: 'Book B', chapterCount: 1, totalWordCount: 1000 },
  ],
  totalBooks: 2,
  totalChapters: 2,
  totalWordCount: 2000,
};

const EXISTING: SeriesSummary = {
  slug: 'old-saga',
  name: 'Old Saga',
  description: '',
  volumes: [{ bookSlug: 'v1', volumeNumber: 1 }],
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-01-01T00:00:00.000Z',
  volumeCount: 1,
  totalWordCount: 100,
};

function seedPreview(overrides: Record<string, unknown> = {}): StoreSeed {
  return [
    [
      useSeriesImportStore,
      {
        step: 'preview',
        seriesName: 'The Saga',
        author: 'A. Writer',
        volumes: [volume(0, 'Book A'), volume(1, 'Book B')],
        existingSeriesSlug: null,
        ...overrides,
      },
    ],
  ];
}

function renderWizard(opts: { bridge?: BridgeOverrides; stores?: StoreSeed } = {}) {
  return renderApp(<ImportSeriesWizard />, opts);
}

describe('ImportSeriesWizard', () => {
  it('renders nothing while idle', () => {
    const { container } = renderWizard();
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the preview with volume totals and series fields', () => {
    renderWizard({ stores: seedPreview() });

    expect(screen.getByText('Import Series')).toBeInTheDocument();
    expect(screen.getByText(/2 volumes/)).toBeInTheDocument();
    expect(screen.getByText(/2,000 words total/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('The Saga')).toBeInTheDocument();
    expect(screen.getByDisplayValue('A. Writer')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Book A')).toBeInTheDocument();
    // No existing series → no New/Existing toggle
    expect(screen.queryByText('Add to Existing')).not.toBeInTheDocument();
  });

  it('skipped volumes are excluded from the totals and the commit button label', () => {
    renderWizard({
      stores: seedPreview({ volumes: [volume(0, 'Book A'), volume(1, 'Book B', true)] }),
    });

    expect(screen.getByText(/1 volume\b/)).toBeInTheDocument();
    expect(screen.getByText(/1,000 words total/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import 1 Volume' })).toBeInTheDocument();
  });

  it('commits active volumes and shows the per-volume success summary', async () => {
    const commit = vi.fn(async () => RESULT);
    renderWizard({ bridge: { seriesImport: { commit } }, stores: seedPreview() });

    fireEvent.click(screen.getByRole('button', { name: 'Import 2 Volumes' }));

    await waitFor(() =>
      expect(commit).toHaveBeenCalledWith({
        seriesName: 'The Saga',
        existingSeriesSlug: null,
        author: 'A. Writer',
        volumes: [
          { volumeNumber: 1, title: 'Book A', chapters: preview('Book A').chapters },
          { volumeNumber: 2, title: 'Book B', chapters: preview('Book B').chapters },
        ],
      }),
    );
    expect(await screen.findByText('Series Import Complete')).toBeInTheDocument();
    expect(screen.getByText(/2 books/)).toBeInTheDocument();
    expect(screen.getByText(/Vol 1: Book A/)).toBeInTheDocument();
    expect(screen.getByText(/Vol 2: Book B/)).toBeInTheDocument();
  });

  it('Open First Book activates the first imported volume and closes', async () => {
    const { bridge, container } = renderWizard({
      stores: [[useSeriesImportStore, { step: 'success', result: RESULT }]],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open First Book' }));

    await waitFor(() => expect(bridge.books.setActive).toHaveBeenCalledWith('book-a'));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('adds to an existing series once one is selected', async () => {
    const commit = vi.fn(async () => RESULT);
    renderWizard({
      bridge: {
        seriesImport: { commit },
        series: { list: vi.fn(async () => [EXISTING]) },
      },
      stores: seedPreview(),
    });

    fireEvent.click(await screen.findByRole('radio', { name: 'Add to Existing' }));
    // Nothing selected yet — commit is gated
    expect(screen.getByRole('button', { name: 'Import 2 Volumes' })).toBeDisabled();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'old-saga' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import 2 Volumes' }));

    await waitFor(() =>
      expect(commit).toHaveBeenCalledWith(
        expect.objectContaining({ existingSeriesSlug: 'old-saga' }),
      ),
    );
  });

  it('shows the error state with retry', async () => {
    const selectFiles = vi.fn(async () => null);
    renderWizard({
      bridge: { seriesImport: { selectFiles } },
      stores: [[useSeriesImportStore, { step: 'error', error: 'Bad folder' }]],
    });

    expect(screen.getByText('Import Failed')).toBeInTheDocument();
    expect(screen.getByText('Bad folder')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    await waitFor(() => expect(selectFiles).toHaveBeenCalled());
  });
});
