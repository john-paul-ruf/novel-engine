import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { DetectedChapter, ImportPreview, ImportResult } from '@domain/types';
import { ImportWizard } from './ImportWizard';
import { useImportStore } from '../../stores/importStore';
import { useBookStore } from '../../stores/bookStore';
import { renderApp, type StoreSeed } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { type BridgeOverrides } from '../../../test/novelEngineMock';

resetStoresBeforeEach(useImportStore, useBookStore);

function chapter(index: number, title: string, wordCount = 1000): DetectedChapter {
  return { index, title, startLine: 0, endLine: 10, wordCount, content: `${title} content` };
}

function makePreview(overrides: Partial<ImportPreview> = {}): ImportPreview {
  return {
    sourceFile: '/tmp/manuscript.md',
    sourceFormat: 'markdown',
    markdownContent: '# My Book',
    chapters: [chapter(0, 'Chapter One'), chapter(1, 'Chapter Two')],
    totalWordCount: 2000,
    detectedTitle: 'My Book',
    detectedAuthor: '',
    ambiguous: false,
    ...overrides,
  };
}

const RESULT: ImportResult = {
  bookSlug: 'my-book',
  title: 'My Book',
  chapterCount: 2,
  totalWordCount: 2000,
};

function renderWizard(opts: { bridge?: BridgeOverrides; stores?: StoreSeed } = {}) {
  return renderApp(<ImportWizard />, opts);
}

describe('ImportWizard', () => {
  it('renders nothing while idle', () => {
    const { container } = renderWizard();
    expect(container).toBeEmptyDOMElement();
  });

  it('advances file-pick → preview with detected metadata and author fallback', async () => {
    renderWizard({
      bridge: {
        import: {
          selectFile: vi.fn(async () => '/tmp/manuscript.md'),
          preview: vi.fn(async () => makePreview()),
        },
      },
    });

    await act(async () => {
      await useImportStore.getState().startImport();
    });

    expect(screen.getByText('Import Manuscript')).toBeInTheDocument();
    expect(screen.getByText(/Source: manuscript\.md \(MARKDOWN\)/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('My Book')).toBeInTheDocument();
    // No detected author — falls back to settings authorName
    expect(screen.getByDisplayValue('Test Author')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Chapter One')).toBeInTheDocument();
    expect(screen.getByText('2 chapters · 2,000 words')).toBeInTheDocument();
  });

  it('stays hidden when the file dialog is cancelled', async () => {
    const { container } = renderWizard(); // selectFile default resolves null

    await act(async () => {
      await useImportStore.getState().startImport();
    });

    expect(container).toBeEmptyDOMElement();
  });

  it('warns when chapter detection was ambiguous', () => {
    renderWizard({
      stores: [
        [
          useImportStore,
          {
            step: 'preview',
            preview: makePreview({ ambiguous: true }),
            title: 'My Book',
            chapters: [chapter(0, 'Only Chapter')],
          },
        ],
      ],
    });

    expect(screen.getByText(/Chapter detection was uncertain/)).toBeInTheDocument();
  });

  it('commits the preview and shows the success summary', async () => {
    const commit = vi.fn(async () => RESULT);
    renderWizard({
      bridge: { import: { commit } },
      stores: [
        [
          useImportStore,
          {
            step: 'preview',
            preview: makePreview(),
            title: 'My Book',
            author: 'A. Writer',
            chapters: [chapter(0, 'Chapter One'), chapter(1, 'Chapter Two')],
          },
        ],
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() =>
      expect(commit).toHaveBeenCalledWith({
        title: 'My Book',
        author: 'A. Writer',
        chapters: [chapter(0, 'Chapter One'), chapter(1, 'Chapter Two')],
      }),
    );
    expect(await screen.findByText('Import Complete')).toBeInTheDocument();
    expect(screen.getByText(/2 chapters, 2,000 words/)).toBeInTheDocument();
  });

  it('disables Import when the title is blank', () => {
    renderWizard({
      stores: [
        [
          useImportStore,
          { step: 'preview', preview: makePreview(), title: '  ', chapters: [chapter(0, 'C')] },
        ],
      ],
    });

    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
  });

  it('Open Book activates the imported book and closes the wizard', async () => {
    const { bridge, container } = renderWizard({
      stores: [[useImportStore, { step: 'success', result: RESULT }]],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open Book' }));

    await waitFor(() => expect(bridge.books.setActive).toHaveBeenCalledWith('my-book'));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('renders generation progress per step', () => {
    renderWizard({
      stores: [
        [
          useImportStore,
          {
            step: 'generating',
            generationSteps: [
              { index: 0, label: 'Story Bible', agentName: 'Lumen', status: 'done' },
              { index: 1, label: 'Voice Profile', agentName: 'Quill', status: 'running' },
              { index: 2, label: 'Outline', agentName: 'Sable', status: 'pending' },
            ],
          },
        ],
      ],
    });

    expect(screen.getByText('Generating Source Documents')).toBeInTheDocument();
    expect(screen.getByText('Story Bible')).toBeInTheDocument();
    expect(screen.getByText('(Lumen)')).toBeInTheDocument();
    expect(screen.getByText('Voice Profile')).toBeInTheDocument();
  });

  it('shows the error state with retry', async () => {
    const selectFile = vi.fn(async () => null);
    renderWizard({
      bridge: { import: { selectFile } },
      stores: [[useImportStore, { step: 'error', error: 'Unreadable file' }]],
    });

    expect(screen.getByText('Import Failed')).toBeInTheDocument();
    expect(screen.getByText('Unreadable file')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    await waitFor(() => expect(selectFile).toHaveBeenCalled());
  });
});
