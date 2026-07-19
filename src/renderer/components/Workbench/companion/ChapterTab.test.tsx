import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { BookDashboardData } from '@domain/types';
import { ChapterTab } from './ChapterTab';
import { useBookStore } from '../../../stores/bookStore';
import { useDashboardStore } from '../../../stores/dashboardStore';
import { useFileChangeStore } from '../../../stores/fileChangeStore';
import { useViewStore } from '../../../stores/viewStore';
import { renderApp } from '../../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../../test/resetStores';

resetStoresBeforeEach(useBookStore, useDashboardStore, useFileChangeStore, useViewStore);

const CHAPTERS = [
  { slug: '00-0-copyright', wordCount: 0 },
  { slug: '01-opening', wordCount: 1200 },
  { slug: '02-the-burger', wordCount: 900 },
];

function makeDashboardData(recentPath: string): BookDashboardData {
  return {
    bookSlug: 'book-a',
    pipeline: { currentPhase: null, completedCount: 0, totalCount: 0 },
    wordCount: { current: 2100, target: null, perChapter: [] },
    lastInteraction: null,
    revisionTasks: { total: 0, completed: 0, items: [] },
    recentFiles: [{ path: recentPath, modifiedAt: '2026-03-01T00:00:00.000Z', wordCount: 5 }],
    daysInProgress: 1,
    bookTitle: 'Test Book',
    bookStatus: 'first-draft',
  };
}

function seedBook() {
  return [useBookStore, { activeSlug: 'book-a', chapters: CHAPTERS }] as const;
}

describe('ChapterTab', () => {
  it('shows the empty hint when the book has no chapters', () => {
    renderApp(<ChapterTab />);
    expect(
      screen.getByText('Chapters appear here as Verity drafts them.'),
    ).toBeInTheDocument();
  });

  it('defaults to the last written chapter and renders its draft', async () => {
    const read = vi.fn(async () => 'The prose of the burger chapter.');
    const { bridge } = renderApp(<ChapterTab />, {
      stores: [seedBook()],
      bridge: { files: { read } },
    });

    expect(
      await screen.findByText('The prose of the burger chapter.'),
    ).toBeInTheDocument();
    expect(bridge.files.read).toHaveBeenCalledWith(
      'book-a',
      'chapters/02-the-burger/draft.md',
    );

    // Human-readable labels: body chapters get "Ch N — Title", front matter its plain title
    expect(
      screen.getByRole('option', { name: /Ch 2 — The Burger · 900w/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Copyright' })).toBeInTheDocument();
  });

  it('prefers the most recently modified chapter from dashboard recents', async () => {
    const { bridge } = renderApp(<ChapterTab />, {
      stores: [
        seedBook(),
        [useDashboardStore, { data: makeDashboardData('chapters/01-opening/draft.md') }],
      ],
    });

    await waitFor(() =>
      expect(bridge.files.read).toHaveBeenCalledWith(
        'book-a',
        'chapters/01-opening/draft.md',
      ),
    );
  });

  it('switches chapters via the dropdown', async () => {
    const { bridge } = renderApp(<ChapterTab />, { stores: [seedBook()] });

    fireEvent.change(screen.getByTitle('Select chapter'), {
      target: { value: '01-opening' },
    });

    await waitFor(() =>
      expect(bridge.files.read).toHaveBeenCalledWith(
        'book-a',
        'chapters/01-opening/draft.md',
      ),
    );
  });

  it('switches chapters via the scrubber dots', async () => {
    const { bridge } = renderApp(<ChapterTab />, { stores: [seedBook()] });

    fireEvent.click(screen.getByTitle('Ch 1 — Opening'));

    await waitFor(() =>
      expect(bridge.files.read).toHaveBeenCalledWith(
        'book-a',
        'chapters/01-opening/draft.md',
      ),
    );
  });

  it('shows the no-draft message when the draft read fails', async () => {
    const read = vi.fn(async () => {
      throw new Error('ENOENT');
    });
    renderApp(<ChapterTab />, {
      stores: [seedBook()],
      bridge: { files: { read } },
    });

    expect(
      await screen.findByText('No draft yet for Ch 2 — The Burger.'),
    ).toBeInTheDocument();
  });

  it('jumps to the manuscript view for the selected chapter', () => {
    renderApp(<ChapterTab />, { stores: [seedBook()] });

    fireEvent.click(screen.getByRole('button', { name: 'Open in Manuscript →' }));

    expect(useViewStore.getState().currentView).toBe('manuscript');
  });
});
