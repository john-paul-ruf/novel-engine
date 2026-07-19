import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { FindReplaceApplyResult, FindReplacePreviewResult } from '@domain/types';
import { FindReplaceModal } from './FindReplaceModal';
import { useBookStore } from '../../stores/bookStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';

resetStoresBeforeEach(useBookStore);

function makePreview(): FindReplacePreviewResult {
  return {
    items: [
      {
        filePath: 'chapters/01-opening/draft.md',
        matchCount: 2,
        matches: [
          { lineNumber: 3, lineText: 'She said whilst walking.', matchStart: 9, matchEnd: 15 },
          { lineNumber: 9, lineText: 'And whilst it rained…', matchStart: 4, matchEnd: 10 },
        ],
      },
      {
        filePath: 'chapters/02-the-burger/draft.md',
        matchCount: 1,
        matches: [
          { lineNumber: 1, lineText: 'He chewed whilst thinking.', matchStart: 10, matchEnd: 16 },
        ],
      },
    ],
    totalMatchCount: 3,
    searchTerm: 'whilst',
    options: { caseSensitive: false, useRegex: false },
  };
}

function makeApplyResult(): FindReplaceApplyResult {
  return {
    filesChanged: 2,
    totalReplacements: 3,
    details: [
      { filePath: 'chapters/01-opening/draft.md', replacements: 2 },
      { filePath: 'chapters/02-the-burger/draft.md', replacements: 1 },
    ],
  };
}

function renderModal(
  preview: () => Promise<FindReplacePreviewResult> = async () => makePreview(),
  apply: () => Promise<FindReplaceApplyResult> = async () => makeApplyResult(),
) {
  const onClose = vi.fn();
  const utils = renderApp(<FindReplaceModal onClose={onClose} />, {
    stores: [[useBookStore, { activeSlug: 'book-a' }]],
    bridge: {
      findReplace: { preview: vi.fn(preview), apply: vi.fn(apply) },
    },
  });
  return { ...utils, onClose };
}

async function runPreview(term = 'whilst') {
  fireEvent.change(screen.getByPlaceholderText('Find…'), { target: { value: term } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  await screen.findByText('01-opening');
}

describe('FindReplaceModal', () => {
  it('disables Preview until a search term is entered', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('Find…'), { target: { value: 'x' } });
    expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled();
  });

  it('previews matches per chapter with expandable highlighted locations', async () => {
    const { bridge } = renderModal();
    await runPreview();

    expect(bridge.findReplace.preview).toHaveBeenCalledWith('book-a', 'whilst', {
      caseSensitive: false,
      useRegex: false,
    });
    expect(screen.getByText('3').closest('p')).toHaveTextContent('3 matches in 2 chapters');
    expect(screen.getByText('02-the-burger')).toBeInTheDocument();

    // Expand the first chapter to see highlighted match lines
    fireEvent.click(screen.getAllByTitle('Expand matches')[0]);
    const marks = document.querySelectorAll('mark');
    expect(marks).toHaveLength(2);
    expect(marks[0]).toHaveTextContent('whilst');
  });

  it('passes the case-sensitive and regex toggles to the preview call', async () => {
    const { bridge } = renderModal();

    fireEvent.click(screen.getByTitle('Case sensitive'));
    fireEvent.click(screen.getByTitle('Regular expression'));
    await runPreview('whil.t');

    expect(bridge.findReplace.preview).toHaveBeenCalledWith('book-a', 'whil.t', {
      caseSensitive: true,
      useRegex: true,
    });
  });

  it('applies replacements to the selected chapters and reports the result', async () => {
    const { bridge } = renderModal();
    await runPreview();

    fireEvent.change(screen.getByPlaceholderText('Replace with…'), {
      target: { value: 'while' },
    });
    // Deselect the second chapter
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Replace in 1 chapter' }));

    await waitFor(() =>
      expect(bridge.findReplace.apply).toHaveBeenCalledWith({
        bookSlug: 'book-a',
        searchTerm: 'whilst',
        replacement: 'while',
        filePaths: ['chapters/01-opening/draft.md'],
        options: { caseSensitive: false, useRegex: false },
      }),
    );
    expect(
      await screen.findByText(/Replaced 3 occurrences in 2 chapters/),
    ).toBeInTheDocument();
    expect(screen.getByText('2 replacements')).toBeInTheDocument();
  });

  it('disables Replace when every chapter is deselected', async () => {
    renderModal();
    await runPreview();

    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(screen.getByRole('button', { name: 'Replace in 0 chapters' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByRole('button', { name: 'Replace in 2 chapters' })).toBeEnabled();
  });

  it('surfaces preview failures (e.g. an invalid regex)', async () => {
    renderModal(async () => {
      throw new Error('Invalid regular expression');
    });

    fireEvent.change(screen.getByPlaceholderText('Find…'), { target: { value: '[' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    expect(await screen.findByText('Invalid regular expression')).toBeInTheDocument();
  });

  it('closes via Cancel', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });
});
