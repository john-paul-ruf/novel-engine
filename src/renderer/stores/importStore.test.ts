import { describe, it, expect, beforeEach } from 'vitest';
import type { DetectedChapter, ImportPreview, ImportResult } from '@domain/types';
import { useImportStore } from './importStore';
import { installNovelEngineMock, makeAppSettings, type NovelEngineMock } from '../../test/novelEngineMock';
import { resetStoresBeforeEach } from '../../test/resetStores';

resetStoresBeforeEach(useImportStore);

function chapter(index: number, title: string, content = `content ${index}`): DetectedChapter {
  return { index, title, startLine: index * 10, endLine: index * 10 + 9, wordCount: 100, content };
}

function makePreview(overrides: Partial<ImportPreview> = {}): ImportPreview {
  return {
    sourceFile: '/tmp/manuscript.md',
    sourceFormat: 'markdown',
    markdownContent: '# Book',
    chapters: [chapter(0, 'One'), chapter(1, 'Two'), chapter(2, 'Three')],
    totalWordCount: 300,
    detectedTitle: 'Detected Title',
    detectedAuthor: 'Detected Author',
    ambiguous: false,
    ...overrides,
  };
}

const importResult: ImportResult = {
  bookSlug: 'imported-book',
  title: 'Detected Title',
  chapterCount: 3,
  totalWordCount: 300,
};

let mock: NovelEngineMock;

beforeEach(() => {
  mock = installNovelEngineMock();
});

describe('importStore', () => {
  describe('startImport', () => {
    it('stays idle when the user cancels the file picker', async () => {
      mock.import.selectFile.mockResolvedValue(null);

      await useImportStore.getState().startImport();

      expect(useImportStore.getState().step).toBe('idle');
      expect(mock.import.preview).not.toHaveBeenCalled();
    });

    it('loads the preview with detected title/author and a chapters copy', async () => {
      mock.import.selectFile.mockResolvedValue('/tmp/manuscript.md');
      mock.import.preview.mockResolvedValue(makePreview());

      await useImportStore.getState().startImport();

      const state = useImportStore.getState();
      expect(state.step).toBe('preview');
      expect(state.title).toBe('Detected Title');
      expect(state.author).toBe('Detected Author');
      expect(state.chapters).toHaveLength(3);
      expect(mock.import.preview).toHaveBeenCalledWith('/tmp/manuscript.md');
    });

    it('falls back to the settings author name when none was detected', async () => {
      mock.import.selectFile.mockResolvedValue('/tmp/manuscript.md');
      mock.import.preview.mockResolvedValue(makePreview({ detectedAuthor: '', detectedTitle: '' }));
      mock.settings.load.mockResolvedValue(makeAppSettings({ authorName: 'Settings Author' }));

      await useImportStore.getState().startImport();

      expect(useImportStore.getState().title).toBe('Untitled');
      expect(useImportStore.getState().author).toBe('Settings Author');
    });

    it('preview failure lands in the error step', async () => {
      mock.import.selectFile.mockResolvedValue('/tmp/manuscript.md');
      mock.import.preview.mockRejectedValue(new Error('unreadable docx'));

      await useImportStore.getState().startImport();

      expect(useImportStore.getState().step).toBe('error');
      expect(useImportStore.getState().error).toBe('unreadable docx');
    });
  });

  describe('chapter editing', () => {
    beforeEach(async () => {
      mock.import.selectFile.mockResolvedValue('/tmp/manuscript.md');
      mock.import.preview.mockResolvedValue(makePreview());
      await useImportStore.getState().startImport();
    });

    it('renameChapter retitles in place and ignores out-of-range indices', () => {
      useImportStore.getState().renameChapter(1, 'Renamed');
      useImportStore.getState().renameChapter(99, 'Nope');

      expect(useImportStore.getState().chapters.map((c) => c.title)).toEqual(['One', 'Renamed', 'Three']);
    });

    it('mergeWithNext combines content/word counts and reindexes; last chapter cannot merge', () => {
      useImportStore.getState().mergeWithNext(2); // no next — no-op
      useImportStore.getState().mergeWithNext(0);

      const chapters = useImportStore.getState().chapters;
      expect(chapters).toHaveLength(2);
      expect(chapters[0].content).toBe('content 0\n\ncontent 1');
      expect(chapters[0].wordCount).toBe(200);
      expect(chapters[0].endLine).toBe(19);
      expect(chapters.map((c) => c.index)).toEqual([0, 1]);
    });

    it('removeChapter folds content into the previous chapter, discards for the first, keeps the last one', () => {
      useImportStore.getState().removeChapter(1);
      let chapters = useImportStore.getState().chapters;
      expect(chapters).toHaveLength(2);
      expect(chapters[0].content).toBe('content 0\n\ncontent 1');
      expect(chapters.map((c) => c.index)).toEqual([0, 1]);

      // Removing the FIRST chapter discards its content
      useImportStore.getState().removeChapter(0);
      chapters = useImportStore.getState().chapters;
      expect(chapters).toHaveLength(1);
      expect(chapters[0].content).toBe('content 2');

      // The last remaining chapter cannot be removed
      useImportStore.getState().removeChapter(0);
      expect(useImportStore.getState().chapters).toHaveLength(1);
    });
  });

  describe('commitImport', () => {
    it('commits the edited config and reaches the success step', async () => {
      mock.import.selectFile.mockResolvedValue('/tmp/manuscript.md');
      mock.import.preview.mockResolvedValue(makePreview());
      await useImportStore.getState().startImport();
      useImportStore.getState().updateTitle('Final Title');
      useImportStore.getState().updateAuthor('Final Author');
      mock.import.commit.mockResolvedValue(importResult);

      await useImportStore.getState().commitImport();

      expect(mock.import.commit).toHaveBeenCalledWith({
        title: 'Final Title',
        author: 'Final Author',
        chapters: useImportStore.getState().chapters,
      });
      expect(useImportStore.getState().step).toBe('success');
      expect(useImportStore.getState().result).toEqual(importResult);
    });

    it('commit failure lands in the error step', async () => {
      mock.import.commit.mockRejectedValue(new Error('slug collision'));

      await useImportStore.getState().commitImport();

      expect(useImportStore.getState().step).toBe('error');
      expect(useImportStore.getState().error).toBe('slug collision');
    });
  });

  describe('startGeneration', () => {
    beforeEach(() => {
      useImportStore.setState({ step: 'success', result: importResult });
    });

    it('is a no-op without a commit result', async () => {
      useImportStore.setState({ result: null });
      await useImportStore.getState().startGeneration();
      expect(mock.import.generateSources).not.toHaveBeenCalled();
    });

    it('tracks progress events through to the generated step', async () => {
      await useImportStore.getState().startGeneration();
      expect(mock.import.generateSources).toHaveBeenCalledWith('imported-book');

      const steps = [
        { index: 0, label: 'Story bible', agentName: 'Lumen' as const, status: 'pending' as const },
        { index: 1, label: 'Voice profile', agentName: 'Sable' as const, status: 'pending' as const },
      ];
      mock.emit('import:generationProgress', { type: 'started', steps });
      expect(useImportStore.getState().generationSteps).toHaveLength(2);

      mock.emit('import:generationProgress', { type: 'step-started', index: 0 });
      expect(useImportStore.getState().generationSteps[0].status).toBe('running');

      mock.emit('import:generationProgress', { type: 'step-done', index: 0 });
      expect(useImportStore.getState().generationSteps[0].status).toBe('done');

      mock.emit('import:generationProgress', { type: 'step-error', index: 1, message: 'CLI died' });
      expect(useImportStore.getState().generationSteps[1]).toMatchObject({
        status: 'error',
        error: 'CLI died',
      });

      mock.emit('import:generationProgress', { type: 'done' });
      expect(useImportStore.getState().step).toBe('generated');
    });

    it('a generation error event lands in the error step', async () => {
      await useImportStore.getState().startGeneration();

      mock.emit('import:generationProgress', { type: 'error', message: 'out of tokens' });

      expect(useImportStore.getState().step).toBe('error');
      expect(useImportStore.getState().error).toBe('out of tokens');
    });

    it('generateSources rejection lands in the error step', async () => {
      mock.import.generateSources.mockRejectedValue(new Error('no book'));

      await useImportStore.getState().startGeneration();

      expect(useImportStore.getState().step).toBe('error');
      expect(useImportStore.getState().error).toBe('no book');
    });
  });

  it('reset restores the initial state and unsubscribes from progress events', async () => {
    useImportStore.setState({ step: 'success', result: importResult });
    await useImportStore.getState().startGeneration();
    expect(mock.listenerCount('import:generationProgress')).toBe(1);

    useImportStore.getState().reset();

    expect(mock.listenerCount('import:generationProgress')).toBe(0);
    expect(useImportStore.getState()).toMatchObject({
      step: 'idle',
      preview: null,
      result: null,
      error: '',
      title: '',
      author: '',
      chapters: [],
      generationSteps: [],
      generationCleanup: null,
    });
  });
});
