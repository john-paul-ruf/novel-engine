import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { BuildResult } from '@domain/types';
import { ProgressLog, OutputFiles, getOutputFilename } from './buildShared';
import { renderApp } from '../../../test/renderWithState';

describe('getOutputFilename', () => {
  it('joins slug and format', () => {
    expect(getOutputFilename('my-book', 'epub')).toBe('my-book.epub');
  });
});

describe('ProgressLog', () => {
  it('shows the placeholder when idle with no logs', () => {
    renderApp(<ProgressLog logs={[]} isBuilding={false} />);
    expect(screen.getByText('Build output will appear here...')).toBeInTheDocument();
  });

  it('renders log lines and the cursor while building', () => {
    renderApp(
      <ProgressLog logs={['Assembling manuscript...', 'ERROR: pandoc missing']} isBuilding />,
    );

    expect(screen.getByText('Assembling manuscript...')).toBeInTheDocument();
    expect(screen.getByText('ERROR: pandoc missing')).toBeInTheDocument();
    expect(screen.getByText('▊')).toBeInTheDocument();
  });
});

describe('OutputFiles', () => {
  const RESULT: BuildResult = {
    success: true,
    formats: [
      { format: 'md', path: 'dist/my-book.md' },
      { format: 'pdf', path: 'dist/my-book.pdf', error: 'no LaTeX' },
    ],
    wordCount: 1000,
  };

  it('renders nothing when every format failed', () => {
    const { container } = renderApp(
      <OutputFiles
        buildResult={{ success: false, formats: [{ format: 'md', path: '', error: 'x' }], wordCount: 0 }}
        activeSlug="my-book"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists files, shows per-format errors, and opens files via the shell', async () => {
    const { bridge } = renderApp(<OutputFiles buildResult={RESULT} activeSlug="my-book" />);
    bridge.books.getAbsolutePath.mockResolvedValue('/abs/dist/my-book.md');

    expect(screen.getByText('my-book.md')).toBeInTheDocument();
    expect(screen.getByText('no LaTeX')).toBeInTheDocument();
    // Failed formats get no Open button
    expect(screen.getAllByRole('button', { name: 'Open' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() =>
      expect(bridge.books.getAbsolutePath).toHaveBeenCalledWith('my-book', 'dist/my-book.md'),
    );
    await waitFor(() => expect(bridge.shell.openPath).toHaveBeenCalledWith('/abs/dist/my-book.md'));
  });

  it('opens the dist folder', async () => {
    const { bridge } = renderApp(<OutputFiles buildResult={RESULT} activeSlug="my-book" />);
    bridge.books.getAbsolutePath.mockResolvedValue('/abs/dist');

    fireEvent.click(screen.getByRole('button', { name: 'Open Folder' }));
    await waitFor(() =>
      expect(bridge.books.getAbsolutePath).toHaveBeenCalledWith('my-book', 'dist'),
    );
    expect(vi.mocked(bridge.shell.openPath)).toHaveBeenCalledWith('/abs/dist');
  });
});
