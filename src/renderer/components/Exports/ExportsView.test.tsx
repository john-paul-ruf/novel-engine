import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { BuildResult } from '@domain/types';
import { ExportsView } from './ExportsView';
import { useBookStore } from '../../stores/bookStore';
import { useViewStore } from '../../stores/viewStore';
import { renderApp, type StoreSeed } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { makeBookSummary, type BridgeOverrides } from '../../../test/novelEngineMock';

resetStoresBeforeEach(useBookStore, useViewStore);

const BUILD_RESULT: BuildResult = {
  success: true,
  formats: [
    { format: 'md', path: 'dist/test-book.md' },
    { format: 'epub', path: 'dist/test-book.epub', error: 'pandoc exploded' },
  ],
  wordCount: 50000,
};

function renderView(bridge: BridgeOverrides = {}) {
  const stores: StoreSeed = [
    [
      useBookStore,
      {
        activeSlug: 'test-book',
        books: [makeBookSummary({ slug: 'test-book', title: 'Test Book' })],
        totalWordCount: 50000,
      },
    ],
  ];
  return renderApp(<ExportsView />, { stores, bridge });
}

describe('ExportsView', () => {
  it('asks for a book when none is active', () => {
    renderApp(<ExportsView />);
    expect(screen.getByText('Select a book from the Library')).toBeInTheDocument();
  });

  it('warns when Pandoc is missing and disables the build', async () => {
    renderView(); // isPandocAvailable default: false

    expect(screen.getByText('Test Book — 50,000 words')).toBeInTheDocument();
    expect(await screen.findByText('Pandoc not found')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Build manuscript' })).toBeDisabled();
  });

  it('builds, streams progress, and lists output files', async () => {
    const { bridge } = renderView({
      build: {
        isPandocAvailable: vi.fn(async () => true),
        run: vi.fn(async () => BUILD_RESULT),
      },
    });

    const buildButton = await screen.findByRole('button', { name: 'Build manuscript' });
    await waitFor(() => expect(buildButton).toBeEnabled());
    fireEvent.click(buildButton);

    act(() => {
      bridge.emit('build:progress', 'Converting to EPUB...');
    });
    expect(screen.getByText('Converting to EPUB...')).toBeInTheDocument();

    await waitFor(() => expect(bridge.build.run).toHaveBeenCalledWith('test-book'));
    // Successful and failed formats both listed
    expect(await screen.findByText('test-book.md')).toBeInTheDocument();
    expect(screen.getByText('pandoc exploded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download All' })).toBeInTheDocument();
  });

  it('exports a zip and reports the saved path', async () => {
    const { bridge } = renderView({
      build: {
        isPandocAvailable: vi.fn(async () => true),
        run: vi.fn(async () => BUILD_RESULT),
        exportZip: vi.fn(async () => '/tmp/out.zip'),
      },
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Build manuscript' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Download All' }));

    await waitFor(() => expect(bridge.build.exportZip).toHaveBeenCalledWith('test-book'));
    expect(await screen.findByText('Saved to /tmp/out.zip')).toBeInTheDocument();
  });

  it('pre-populates output files from existing dist artifacts', async () => {
    renderView({
      files: {
        listDir: vi.fn(async () => [
          { name: 'test-book.epub', path: 'dist/test-book.epub', isDirectory: false },
        ]),
      },
    });

    expect(await screen.findByText('test-book.epub')).toBeInTheDocument();
    expect(screen.getByText('Output Files')).toBeInTheDocument();
  });

  it('links back to the manuscript view', async () => {
    renderView();

    fireEvent.click(screen.getByRole('button', { name: 'Read it in Manuscript →' }));
    expect(useViewStore.getState().currentView).toBe('manuscript');
  });
});
