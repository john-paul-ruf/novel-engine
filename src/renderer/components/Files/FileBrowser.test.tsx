import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { FileEntry } from '@domain/types';
import { FileBrowser } from './FileBrowser';
import { useBookStore } from '../../stores/bookStore';
import { useFileChangeStore } from '../../stores/fileChangeStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';

resetStoresBeforeEach(useBookStore, useFileChangeStore);

const TREE: FileEntry[] = [
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
          { name: 'draft.md', path: 'chapters/02-the-burger/draft.md', isDirectory: false },
        ],
      },
    ],
  },
  { name: 'pitch.md', path: 'pitch.md', isDirectory: false },
];

const FILES: Record<string, string> = {
  'pitch.md': '# Pitch\nA story about a burger.',
  'chapters/02-the-burger/draft.md': 'Burger prose with five words.',
};

function renderBrowser(
  currentPath = '',
  { listDir }: { listDir?: () => Promise<FileEntry[]> } = {},
) {
  const onNavigate = vi.fn();
  const onFileSelect = vi.fn();
  const utils = renderApp(
    <FileBrowser currentPath={currentPath} onNavigate={onNavigate} onFileSelect={onFileSelect} />,
    {
      stores: [[useBookStore, { activeSlug: 'book-a' }]],
      bridge: {
        files: {
          listDir: vi.fn(listDir ?? (async () => TREE)),
          read: vi.fn(async (_slug: string, path: string) => {
            const content = FILES[path];
            if (content === undefined) throw new Error('ENOENT');
            return content;
          }),
        },
      },
    },
  );
  return { ...utils, onNavigate, onFileSelect };
}

describe('FileBrowser', () => {
  it('shows the empty state without an active book', () => {
    renderApp(
      <FileBrowser currentPath="" onNavigate={vi.fn()} onFileSelect={vi.fn()} />,
    );
    expect(screen.getByText('This directory is empty.')).toBeInTheDocument();
  });

  it('lists the root: directories first, markdown metadata loaded lazily', async () => {
    renderBrowser();

    expect(await screen.findByText('chapters')).toBeInTheDocument();
    expect(screen.getByText('pitch')).toBeInTheDocument(); // .md stripped in grid cards
    expect(screen.getByText('1 item')).toBeInTheDocument(); // chapters dir child count

    // Metadata: word count (heading tokens included) + first non-heading line preview
    expect(await screen.findByText('7 words')).toBeInTheDocument();
    expect(screen.getByText('A story about a burger.')).toBeInTheDocument();
  });

  it('navigates into directories and opens files', async () => {
    const { onNavigate, onFileSelect } = renderBrowser();

    fireEvent.click(await screen.findByText('chapters'));
    expect(onNavigate).toHaveBeenCalledWith('chapters');

    fireEvent.click(screen.getByText('pitch'));
    expect(onFileSelect).toHaveBeenCalledWith('pitch.md');
  });

  it('renders chapter folders as chapter cards with Draft/Notes shortcuts', async () => {
    const { onFileSelect } = renderBrowser('chapters');

    expect(await screen.findByText('Chapter 2')).toBeInTheDocument();
    expect(screen.getByText('The Burger')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
    expect(onFileSelect).toHaveBeenCalledWith('chapters/02-the-burger/draft.md');

    fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
    expect(onFileSelect).toHaveBeenCalledWith('chapters/02-the-burger/notes.md');
  });

  it('switches to the list layout', async () => {
    renderBrowser('chapters');
    await screen.findByText('Chapter 2');

    fireEvent.click(screen.getByTitle('List view'));

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Chapter 2: The Burger')).toBeInTheDocument();
    expect(screen.getByText('Folder')).toBeInTheDocument();
  });

  it('deletes a file through the confirm modal and refreshes the listing', async () => {
    const { bridge } = renderBrowser();
    await screen.findByText('pitch');

    fireEvent.click(screen.getByTitle('Delete file'));
    expect(screen.getByText('Delete file?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(bridge.files.delete).toHaveBeenCalledWith('book-a', 'pitch.md'),
    );
    // refreshKey bump reloads the directory
    await waitFor(() => expect(bridge.files.listDir.mock.calls.length).toBeGreaterThan(1));
  });

  it('surfaces listing failures', async () => {
    renderBrowser('', {
      listDir: async () => {
        throw new Error('EACCES: permission denied');
      },
    });

    expect(await screen.findByText('Failed to load directory')).toBeInTheDocument();
    expect(screen.getByText('EACCES: permission denied')).toBeInTheDocument();
  });
});
