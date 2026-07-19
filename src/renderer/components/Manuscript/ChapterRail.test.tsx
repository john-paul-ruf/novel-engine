import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { ChapterRail, type ChapterInfo } from './ChapterRail';
import { useBookStore } from '../../stores/bookStore';
import { useFileChangeStore } from '../../stores/fileChangeStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';

resetStoresBeforeEach(useBookStore, useFileChangeStore);

function chapter(overrides: Partial<ChapterInfo>): ChapterInfo {
  return {
    slug: '02-the-burger',
    number: 2,
    title: 'The Burger',
    wordCount: 900,
    hasDraft: true,
    hasNotes: false,
    hasUserEdits: false,
    kind: 'body',
    ...overrides,
  };
}

const CHAPTERS: ChapterInfo[] = [
  chapter({ slug: '00-0-copyright', number: 0, title: 'Copyright', kind: 'copyright', wordCount: 0 }),
  chapter({ slug: '01-opening', number: 1, title: 'Opening', wordCount: 1200 }),
  chapter({ slug: '02-the-burger' }),
  chapter({ slug: 'z0-acknowledgments', number: 0, title: 'Acknowledgments', kind: 'backmatter', hasDraft: false, wordCount: 0 }),
];

function renderRail(overrides: Partial<Parameters<typeof ChapterRail>[0]> = {}) {
  const onSelect = vi.fn();
  const onOpenNotes = vi.fn();
  const onDeepDive = vi.fn();
  const utils = renderApp(
    <ChapterRail
      activeSlug="book-a"
      chapters={CHAPTERS}
      loading={false}
      selectedSlug="01-opening"
      onSelect={onSelect}
      onOpenNotes={onOpenNotes}
      onDeepDive={onDeepDive}
      isDeepDiving={false}
      {...overrides}
    />,
  );
  return { ...utils, onSelect, onOpenNotes, onDeepDive };
}

describe('ChapterRail', () => {
  it('groups chapters into front matter, story chapters, and back matter', () => {
    renderRail();

    expect(screen.getByText('FRONT MATTER')).toBeInTheDocument();
    expect(screen.getByText('STORY CHAPTERS')).toBeInTheDocument();
    expect(screen.getByText('BACK MATTER')).toBeInTheDocument();

    expect(screen.getByText('Copyright')).toBeInTheDocument();
    expect(screen.getByText('Opening')).toBeInTheDocument();
    expect(screen.getByText('1,200 words')).toBeInTheDocument();
    expect(screen.getByText('Acknowledgments')).toBeInTheDocument();
  });

  it('badges rows by state: AUTO, DRAFT, EDITED, EMPTY', () => {
    renderRail({
      chapters: [
        chapter({ slug: '00-0-copyright', number: 0, title: 'Copyright', kind: 'copyright' }),
        chapter({ slug: '01-opening', number: 1, title: 'Opening' }),
        chapter({ slug: '02-the-burger', hasUserEdits: true }),
        chapter({ slug: '03-empty', number: 3, title: 'Empty One', hasDraft: false }),
      ],
    });

    expect(screen.getByText('AUTO')).toBeInTheDocument();
    expect(screen.getByText('DRAFT')).toBeInTheDocument();
    expect(screen.getByText('EDITED')).toBeInTheDocument();
    expect(screen.getByText('EMPTY')).toBeInTheDocument();
  });

  it('shows the empty state and the loading skeleton', () => {
    const { rerender } = renderRail({ chapters: [], loading: false });
    expect(
      screen.getByText('Chapters appear here as Verity writes the first draft.'),
    ).toBeInTheDocument();

    rerender(
      <ChapterRail
        activeSlug="book-a"
        chapters={[]}
        loading={true}
        selectedSlug={null}
        onSelect={vi.fn()}
        onOpenNotes={vi.fn()}
        onDeepDive={vi.fn()}
        isDeepDiving={false}
      />,
    );
    expect(
      screen.queryByText('Chapters appear here as Verity writes the first draft.'),
    ).toBeNull();
  });

  it('selects a chapter on row click', () => {
    const { onSelect } = renderRail();
    fireEvent.click(screen.getByText('The Burger'));
    expect(onSelect).toHaveBeenCalledWith('02-the-burger');
  });

  it('opens notes and Deep Dive from the row context menu (body chapters with drafts)', () => {
    const { onOpenNotes, onDeepDive } = renderRail();

    const menuButtons = screen.getAllByTitle('Chapter actions');
    fireEvent.click(menuButtons[1]); // 02-the-burger (copyright has no menu)

    fireEvent.click(screen.getByText('Deep Dive (Lumen)'));
    expect(onDeepDive).toHaveBeenCalledWith('02-the-burger');

    fireEvent.click(menuButtons[1]);
    fireEvent.click(screen.getByText('Notes (new)'));
    expect(onOpenNotes).toHaveBeenCalledWith('02-the-burger');
  });

  it('hides Deep Dive for draftless chapters', () => {
    renderRail({
      chapters: [chapter({ slug: '03-empty', number: 3, title: 'Empty One', hasDraft: false })],
    });

    fireEvent.click(screen.getByTitle('Chapter actions'));
    expect(screen.queryByText(/Deep Dive/)).toBeNull();
  });

  it('deletes a chapter after the confirm modal, warning about Verity drafts', async () => {
    const { bridge } = renderRail();

    fireEvent.click(screen.getAllByTitle('Chapter actions')[1]); // 02-the-burger
    fireEvent.click(screen.getByText('Delete'));

    expect(screen.getByText('Delete folder?')).toBeInTheDocument();
    expect(
      screen.getByText(/This is a Verity-authored draft/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(bridge.files.delete).toHaveBeenCalledWith('book-a', 'chapters/02-the-burger'),
    );
  });

  it('adds a back matter chapter as zN-slug and selects it', async () => {
    const { bridge, onSelect } = renderRail();

    fireEvent.click(screen.getByRole('button', { name: /Add back matter/ }));
    fireEvent.change(screen.getByPlaceholderText('Chapter title'), {
      target: { value: 'About the Author' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    // Existing back matter is z0 → next is z1
    await waitFor(() =>
      expect(bridge.files.write).toHaveBeenCalledWith(
        'book-a',
        'chapters/z1-about-the-author/draft.md',
        '# About the Author\n\n',
      ),
    );
    expect(onSelect).toHaveBeenCalledWith('z1-about-the-author');
  });
});
