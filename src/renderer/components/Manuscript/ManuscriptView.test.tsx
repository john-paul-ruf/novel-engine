import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { screen, fireEvent, act, waitFor } from '@testing-library/react';
import type { FileEntry } from '@domain/types';
import { ManuscriptView } from './ManuscriptView';
import { useBookStore } from '../../stores/bookStore';
import { useCliActivityStore } from '../../stores/cliActivityStore';
import { useFileChangeStore } from '../../stores/fileChangeStore';
import { useViewStore } from '../../stores/viewStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';

resetStoresBeforeEach(useBookStore, useCliActivityStore, useFileChangeStore, useViewStore);

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
  if (typeof IntersectionObserver === 'undefined') {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
  }
});

afterEach(() => {
  useCliActivityStore.getState().destroyListener();
});

const CHAPTER_DIRS: FileEntry[] = [
  { name: '00-0-copyright', path: 'chapters/00-0-copyright', isDirectory: true },
  { name: '01-opening', path: 'chapters/01-opening', isDirectory: true },
  { name: '02-the-burger', path: 'chapters/02-the-burger', isDirectory: true },
];

const DRAFTS: Record<string, string> = {
  'chapters/01-opening/draft.md': 'Opening prose.',
  'chapters/02-the-burger/draft.md': 'Burger prose.',
};

function renderView(viewSeed: Record<string, unknown> = {}) {
  return renderApp(<ManuscriptView />, {
    stores: [
      [useBookStore, { activeSlug: 'book-a' }],
      [useViewStore, viewSeed],
    ],
    bridge: {
      files: {
        listDir: vi.fn(async () => CHAPTER_DIRS),
        exists: vi.fn(async (_slug: string, path: string) => path in DRAFTS),
        read: vi.fn(async (_slug: string, path: string) => {
          const content = DRAFTS[path];
          if (content === undefined) throw new Error('ENOENT');
          return content;
        }),
      },
      books: {
        wordCount: vi.fn(async () => [
          { slug: '01-opening', wordCount: 1200 },
          { slug: '02-the-burger', wordCount: 900 },
        ]),
      },
    },
  });
}

describe('ManuscriptView', () => {
  it('asks for a book when none is active', () => {
    renderApp(<ManuscriptView />);
    expect(
      screen.getByText('Select a book in the Library to read its manuscript'),
    ).toBeInTheDocument();
  });

  it('defaults to the first body chapter and shows its draft with position info', async () => {
    renderView();

    expect(await screen.findByText('Opening prose.')).toBeInTheDocument();
    expect(screen.getByText(/Chapter 1 of 2/)).toBeInTheDocument();
    expect(screen.getByText(/2,100 words/)).toBeInTheDocument();
  });

  it('loads another chapter when selected in the rail', async () => {
    renderView();
    await screen.findByText('Opening prose.');

    fireEvent.click(screen.getByText('The Burger'));

    expect(await screen.findByText('Burger prose.')).toBeInTheDocument();
    expect(screen.getByText(/Chapter 2 of 2/)).toBeInTheDocument();
  });

  it('shows the no-draft message for chapters without a draft', async () => {
    renderView();
    await screen.findByText('Opening prose.');

    fireEvent.click(screen.getByText('Copyright'));

    expect(await screen.findByText('No draft yet for Copyright.')).toBeInTheDocument();
  });

  it('edits an untracked chapter in Editor mode and saves through the bridge', async () => {
    const { bridge } = renderView();
    await screen.findByText('Opening prose.');

    fireEvent.click(screen.getByRole('button', { name: 'Editor' }));

    const textarea = await screen.findByPlaceholderText('Start writing...');
    expect(textarea).toHaveValue('Opening prose.');
    // Chapter 01 is below the tracked threshold — no tracked-edit banner
    expect(screen.queryByText(/editing Verity's draft/)).toBeNull();

    fireEvent.change(textarea, { target: { value: 'Opening prose, revised.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(bridge.files.write).toHaveBeenCalledWith(
        'book-a',
        'chapters/01-opening/draft.md',
        'Opening prose, revised.',
      ),
    );
  });

  it('shows the tracked-edit banner for Verity drafts (chapter 02+) and opens the edits modal', async () => {
    renderView();
    await screen.findByText('Opening prose.');

    fireEvent.click(screen.getByText('The Burger'));
    fireEvent.click(screen.getByRole('button', { name: 'Editor' }));

    expect(await screen.findByText(/You're editing Verity's draft\./)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View my changes' }));
    // versions.getUserEdits default → null → no-edits message
    expect(
      await screen.findByText("No edits since Verity's last draft."),
    ).toBeInTheDocument();
  });

  it('pauses tracked-draft editing while an agent call is active for this book', async () => {
    renderView();
    await screen.findByText('Opening prose.');

    act(() => {
      useCliActivityStore.getState().handleStreamEvent({
        type: 'callStart',
        agentName: 'Verity',
        model: 'test-model',
        bookSlug: 'book-a',
        callId: 'call-1',
        conversationId: 'conv-1',
      });
    });

    fireEvent.click(screen.getByText('The Burger'));
    fireEvent.click(screen.getByRole('button', { name: 'Editor' }));

    expect(
      await screen.findByText(/Verity is working on this book — editing is paused\./),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Start writing...')).toHaveAttribute('readonly');
  });

  it('honours chapter deep links from the view payload', async () => {
    renderView({
      currentView: 'manuscript',
      payload: { chapterSlug: '02-the-burger' },
    });

    expect(await screen.findByText('Burger prose.')).toBeInTheDocument();
  });

  it('assembles the full book in Full book scope', async () => {
    const { bridge } = renderView();
    await screen.findByText('Opening prose.');

    bridge.books.assembleManuscript.mockResolvedValue({
      content: '# Opening\n\nOpening prose.\n\n---\n\n# The Burger\n\nBurger prose.',
      chapterCount: 2,
      wordCount: 2100,
      chapters: [
        { slug: '01-opening', title: 'Opening', wordCount: 1200 },
        { slug: '02-the-burger', title: 'The Burger', wordCount: 900 },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Full book' }));

    expect(await screen.findByText(/Opening prose\./)).toBeInTheDocument();
    expect(screen.getByText(/Burger prose\./)).toBeInTheDocument();
  });

  it('opens Find & Replace from the toolbar', async () => {
    renderView();
    await screen.findByText('Opening prose.');

    fireEvent.click(screen.getByTitle('Find & Replace'));

    expect(screen.getByText('Find & Replace')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Find…')).toBeInTheDocument();
  });

  it('skips a draftless body chapter and selects the first drafted one as default', async () => {
    const chapterDirs: FileEntry[] = [
      { name: '00-0-copyright', path: 'chapters/00-0-copyright', isDirectory: true },
      { name: '01-empty', path: 'chapters/01-empty', isDirectory: true },
      { name: '02-written', path: 'chapters/02-written', isDirectory: true },
    ];
    const drafts: Record<string, string> = {
      'chapters/02-written/draft.md': 'Written prose.',
    };
    const readMock = vi.fn(async (_slug: string, path: string) => {
      const content = drafts[path];
      if (content === undefined) throw new Error('ENOENT');
      return content;
    });
    renderApp(<ManuscriptView />, {
      stores: [
        [useBookStore, { activeSlug: 'book-a' }],
        [useViewStore, {}],
      ],
      bridge: {
        files: {
          listDir: vi.fn(async () => chapterDirs),
          exists: vi.fn(async (_slug: string, path: string) => path in drafts),
          read: readMock,
        },
        books: {
          wordCount: vi.fn(async () => [
            { slug: '01-empty', wordCount: 0 },
            { slug: '02-written', wordCount: 700 },
          ]),
        },
      },
    });

    expect(await screen.findByText('Written prose.')).toBeInTheDocument();
    expect(readMock).not.toHaveBeenCalledWith('book-a', 'chapters/01-empty/draft.md');
    expect(readMock).toHaveBeenCalledWith('book-a', 'chapters/02-written/draft.md');
  });
});
