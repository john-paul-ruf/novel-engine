import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import type { DetectedChapter } from '@domain/types';
import { ChapterPreviewList } from './ChapterPreviewList';
import { useImportStore } from '../../stores/importStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';

resetStoresBeforeEach(useImportStore);

function chapter(index: number, title: string, wordCount = 500): DetectedChapter {
  return { index, title, startLine: 0, endLine: 10, wordCount, content: `${title} body text` };
}

function renderList(chapters: DetectedChapter[]) {
  return renderApp(<ChapterPreviewList />, { stores: [[useImportStore, { chapters }]] });
}

describe('ChapterPreviewList', () => {
  it('lists chapters with titles, previews, word counts, and a summary', () => {
    renderList([chapter(0, 'One', 1200), chapter(1, 'Two', 800)]);

    expect(screen.getByDisplayValue('One')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Two')).toBeInTheDocument();
    expect(screen.getByText('One body text')).toBeInTheDocument();
    expect(screen.getByText('1,200w')).toBeInTheDocument();
    expect(screen.getByText('2 chapters · 2,000 words')).toBeInTheDocument();
  });

  it('renames a chapter through its title input', () => {
    renderList([chapter(0, 'One'), chapter(1, 'Two')]);

    fireEvent.change(screen.getByDisplayValue('One'), { target: { value: 'Renamed' } });

    expect(useImportStore.getState().chapters[0].title).toBe('Renamed');
    expect(screen.getByDisplayValue('Renamed')).toBeInTheDocument();
  });

  it('merges a chapter into the next one', () => {
    renderList([chapter(0, 'One', 100), chapter(1, 'Two', 200)]);

    // Merge is only offered on non-final chapters
    expect(screen.getAllByTitle('Merge with next chapter')).toHaveLength(1);
    fireEvent.click(screen.getByTitle('Merge with next chapter'));

    const { chapters } = useImportStore.getState();
    expect(chapters).toHaveLength(1);
    expect(chapters[0].wordCount).toBe(300);
    expect(chapters[0].content).toBe('One body text\n\nTwo body text');
    expect(screen.getByText('1 chapter · 300 words')).toBeInTheDocument();
  });

  it('removes a chapter, folding its content into the previous one', () => {
    renderList([chapter(0, 'One', 100), chapter(1, 'Two', 200)]);

    fireEvent.click(screen.getAllByTitle('Remove chapter')[1]);

    const { chapters } = useImportStore.getState();
    expect(chapters).toHaveLength(1);
    expect(chapters[0].title).toBe('One');
    // Removal folds content into the previous chapter (S24 store pin)
    expect(chapters[0].content).toContain('Two body text');
    // Sole remaining chapter offers no remove action
    expect(screen.queryByTitle('Remove chapter')).not.toBeInTheDocument();
  });
});
