import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import type { FileEntry } from '@domain/types';
import { ExplorerTab } from './ExplorerTab';
import { useBookStore } from '../../../stores/bookStore';
import { useFileChangeStore } from '../../../stores/fileChangeStore';
import { useViewStore } from '../../../stores/viewStore';
import { renderApp } from '../../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../../test/resetStores';

resetStoresBeforeEach(useBookStore, useFileChangeStore, useViewStore);

const TREE: FileEntry[] = [
  {
    name: 'source',
    path: 'source',
    isDirectory: true,
    children: [{ name: 'pitch.md', path: 'source/pitch.md', isDirectory: false }],
  },
  {
    name: 'chapters',
    path: 'chapters',
    isDirectory: true,
    children: [
      {
        name: '02-the-burger',
        path: 'chapters/02-the-burger',
        isDirectory: true,
        children: [
          {
            name: 'draft.md',
            path: 'chapters/02-the-burger/draft.md',
            isDirectory: false,
          },
        ],
      },
    ],
  },
  { name: 'about.json', path: 'about.json', isDirectory: false },
];

function renderExplorer(files: Record<string, string> = {}) {
  return renderApp(<ExplorerTab />, {
    stores: [[useBookStore, { activeSlug: 'book-a' }]],
    bridge: {
      files: {
        listDir: vi.fn(async () => TREE),
        read: vi.fn(async (_slug: string, path: string) => {
          const content = files[path];
          if (content === undefined) throw new Error('ENOENT');
          return content;
        }),
      },
    },
  });
}

describe('ExplorerTab', () => {
  it('renders the root listing with a Book breadcrumb', async () => {
    renderExplorer();

    expect(screen.getByRole('button', { name: 'Book' })).toBeInTheDocument();
    expect(await screen.findByText('source')).toBeInTheDocument();
    expect(screen.getByText('about.json')).toBeInTheDocument();
  });

  it('navigates into a directory and updates the breadcrumb', async () => {
    renderExplorer();

    fireEvent.click(await screen.findByText('source'));

    // Breadcrumb now has the segment; the listing shows the child file
    expect(await screen.findByText('pitch')).toBeInTheDocument();
    const crumbs = screen.getAllByText('source');
    expect(crumbs.length).toBeGreaterThan(0);
  });

  it('previews a file read-only with History and Edit affordances', async () => {
    renderExplorer({ 'source/pitch.md': 'A **great** pitch.' });

    fireEvent.click(await screen.findByText('source'));
    fireEvent.click(await screen.findByText('pitch'));

    expect(await screen.findByText(/great/)).toBeInTheDocument();
    expect(screen.getByTitle('Version history')).toBeInTheDocument();
    expect(screen.getByTitle('Edit pitch.md in the manuscript editor')).toBeInTheDocument();

    // Back returns to the browser at the same directory (source/)
    fireEvent.click(screen.getByRole('button', { name: 'Files' }));
    expect(await screen.findByText('pitch')).toBeInTheDocument();
  });

  it('hides the Edit affordance for Verity-authored body chapter drafts', async () => {
    renderExplorer({ 'chapters/02-the-burger/draft.md': 'Chapter prose.' });

    fireEvent.click(await screen.findByText('chapters'));
    // Chapter card exposes a Draft quick-access button
    fireEvent.click(await screen.findByRole('button', { name: 'Draft' }));

    expect(await screen.findByText('Chapter prose.')).toBeInTheDocument();
    expect(screen.queryByTitle(/in the manuscript editor/)).toBeNull();
  });

  it('hands editable files off to the manuscript editor', async () => {
    renderExplorer({ 'source/pitch.md': 'A pitch.' });

    fireEvent.click(await screen.findByText('source'));
    fireEvent.click(await screen.findByText('pitch'));
    fireEvent.click(await screen.findByTitle('Edit pitch.md in the manuscript editor'));

    expect(useViewStore.getState().currentView).toBe('manuscript');
  });
});
