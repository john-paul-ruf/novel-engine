import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, render } from '@testing-library/react';
import type { ImportPreview, SeriesImportVolume } from '@domain/types';
import { VolumePreviewList } from './VolumePreviewList';

function preview(title: string, overrides: Partial<ImportPreview> = {}): ImportPreview {
  return {
    sourceFile: `/tmp/${title}.md`,
    sourceFormat: 'markdown',
    markdownContent: '',
    chapters: [
      { index: 0, title: 'One', startLine: 0, endLine: 5, wordCount: 700, content: '' },
      { index: 1, title: 'Two', startLine: 6, endLine: 10, wordCount: 800, content: '' },
    ],
    totalWordCount: 1500,
    detectedTitle: title,
    detectedAuthor: '',
    ambiguous: false,
    ...overrides,
  };
}

function volume(index: number, title: string, overrides: Partial<SeriesImportVolume> = {}): SeriesImportVolume {
  return { index, preview: preview(title), volumeNumber: index + 1, skipped: false, ...overrides };
}

function renderList(volumes: SeriesImportVolume[]) {
  const handlers = {
    onUpdateTitle: vi.fn(),
    onToggleSkip: vi.fn(),
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
  };
  const utils = render(<VolumePreviewList volumes={volumes} {...handlers} />);
  return { ...utils, handlers };
}

describe('VolumePreviewList', () => {
  it('renders each volume with number, title, stats, and source file', () => {
    renderList([volume(0, 'Book A'), volume(1, 'Book B')]);

    expect(screen.getByText('Vol 1')).toBeInTheDocument();
    expect(screen.getByText('Vol 2')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Book A')).toBeInTheDocument();
    expect(screen.getAllByText('2 ch.')).toHaveLength(2);
    expect(screen.getAllByText('1,500 words')).toHaveLength(2);
    expect(screen.getByText('Book A.md')).toBeInTheDocument();
  });

  it('marks skipped volumes and flags ambiguous detection', () => {
    renderList([
      volume(0, 'Book A', { skipped: true }),
      volume(1, 'Book B', { preview: preview('Book B', { ambiguous: true }) }),
    ]);

    expect(screen.getByText('Skip')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Book A')).toBeDisabled();
    expect(screen.getByText('Chapter detection uncertain')).toBeInTheDocument();
    expect(screen.getByTitle('Include this volume')).toBeInTheDocument();
    expect(screen.getByTitle('Skip this volume')).toBeInTheDocument();
  });

  it('routes title edits, reorder, and skip actions with volume indices', () => {
    const { handlers } = renderList([volume(0, 'Book A'), volume(1, 'Book B')]);

    fireEvent.change(screen.getByDisplayValue('Book B'), { target: { value: 'Renamed' } });
    expect(handlers.onUpdateTitle).toHaveBeenCalledWith(1, 'Renamed');

    fireEvent.click(screen.getAllByTitle('Move up')[1]);
    expect(handlers.onMoveUp).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getAllByTitle('Move down')[0]);
    expect(handlers.onMoveDown).toHaveBeenCalledWith(0);

    fireEvent.click(screen.getAllByTitle('Skip this volume')[0]);
    expect(handlers.onToggleSkip).toHaveBeenCalledWith(0);
  });

  it('disables move-up on the first row and move-down on the last', () => {
    renderList([volume(0, 'Book A'), volume(1, 'Book B')]);

    expect(screen.getAllByTitle('Move up')[0]).toBeDisabled();
    expect(screen.getAllByTitle('Move up')[1]).toBeEnabled();
    expect(screen.getAllByTitle('Move down')[0]).toBeEnabled();
    expect(screen.getAllByTitle('Move down')[1]).toBeDisabled();
  });
});
