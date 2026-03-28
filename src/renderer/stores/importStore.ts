import { create } from 'zustand';
import type { DetectedChapter, ImportPreview, ImportResult, SourceGenerationStep } from '@domain/types';

type ImportStep = 'idle' | 'loading' | 'preview' | 'importing' | 'success' | 'generating' | 'generated' | 'error';

type ImportState = {
  step: ImportStep;
  preview: ImportPreview | null;
  result: ImportResult | null;
  error: string;
  title: string;
  author: string;
  chapters: DetectedChapter[];
  generationSteps: SourceGenerationStep[];
  generationCleanup: (() => void) | null;

  startImport: () => Promise<void>;
  updateTitle: (title: string) => void;
  updateAuthor: (author: string) => void;
  renameChapter: (index: number, newTitle: string) => void;
  mergeWithNext: (index: number) => void;
  removeChapter: (index: number) => void;
  commitImport: () => Promise<void>;
  startGeneration: () => Promise<void>;
  reset: () => void;
};

const initialState = {
  step: 'idle' as ImportStep,
  preview: null as ImportPreview | null,
  result: null as ImportResult | null,
  error: '',
  title: '',
  author: '',
  chapters: [] as DetectedChapter[],
  generationSteps: [] as SourceGenerationStep[],
  generationCleanup: null as (() => void) | null,
};

export const useImportStore = create<ImportState>((set, get) => ({
  ...initialState,

  startImport: async () => {
    try {
      const filePath = await window.novelEngine.import.selectFile();
      if (!filePath) return; // User cancelled file dialog

      set({ step: 'loading', error: '' });

      const data = await window.novelEngine.import.preview(filePath);

      // Fall back to settings author name if no author detected in manuscript
      const settingsAuthor = (await window.novelEngine.settings.load()).authorName;

      set({
        step: 'preview',
        preview: data,
        title: data.detectedTitle || 'Untitled',
        author: data.detectedAuthor || settingsAuthor || '',
        chapters: [...data.chapters],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ step: 'error', error: message });
    }
  },

  updateTitle: (title: string) => set({ title }),

  updateAuthor: (author: string) => set({ author }),

  renameChapter: (index: number, newTitle: string) => {
    const chapters = [...get().chapters];
    if (index < 0 || index >= chapters.length) return;
    chapters[index] = { ...chapters[index], title: newTitle };
    set({ chapters });
  },

  mergeWithNext: (index: number) => {
    const chapters = [...get().chapters];
    if (index < 0 || index >= chapters.length - 1) return;

    const current = chapters[index];
    const next = chapters[index + 1];

    const mergedContent = current.content + '\n\n' + next.content;
    const mergedWordCount = current.wordCount + next.wordCount;

    const merged: DetectedChapter = {
      ...current,
      content: mergedContent,
      wordCount: mergedWordCount,
      endLine: next.endLine,
    };

    chapters.splice(index, 2, merged);

    // Recalculate indices
    const reindexed = chapters.map((ch, i) => ({ ...ch, index: i }));
    set({ chapters: reindexed });
  },

  removeChapter: (index: number) => {
    const chapters = [...get().chapters];
    if (chapters.length <= 1) return; // Don't remove the last chapter
    if (index < 0 || index >= chapters.length) return;

    const removed = chapters[index];

    // Append content to previous chapter (or discard if first)
    if (index > 0) {
      const prev = chapters[index - 1];
      chapters[index - 1] = {
        ...prev,
        content: prev.content + '\n\n' + removed.content,
        wordCount: prev.wordCount + removed.wordCount,
        endLine: removed.endLine,
      };
    }

    chapters.splice(index, 1);

    // Recalculate indices
    const reindexed = chapters.map((ch, i) => ({ ...ch, index: i }));
    set({ chapters: reindexed });
  },

  commitImport: async () => {
    const { title, author, chapters } = get();

    set({ step: 'importing', error: '' });

    try {
      const result = await window.novelEngine.import.commit({ title, author, chapters });
      set({ step: 'success', result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ step: 'error', error: message });
    }
  },

  startGeneration: async () => {
    const { result } = get();
    if (!result) return;

    set({ step: 'generating', generationSteps: [] });

    const cleanup = window.novelEngine.import.onGenerationProgress((event) => {
      if (event.type === 'started') {
        set({ generationSteps: event.steps });
      } else if (event.type === 'step-started') {
        set((s) => ({
          generationSteps: s.generationSteps.map((step) =>
            step.index === event.index ? { ...step, status: 'running' as const } : step
          ),
        }));
      } else if (event.type === 'step-done') {
        set((s) => ({
          generationSteps: s.generationSteps.map((step) =>
            step.index === event.index ? { ...step, status: 'done' as const } : step
          ),
        }));
      } else if (event.type === 'step-error') {
        set((s) => ({
          generationSteps: s.generationSteps.map((step) =>
            step.index === event.index ? { ...step, status: 'error' as const, error: event.message } : step
          ),
        }));
      } else if (event.type === 'done') {
        set({ step: 'generated' });
      } else if (event.type === 'error') {
        set({ step: 'error', error: event.message });
      }
    });

    set({ generationCleanup: cleanup });

    try {
      await window.novelEngine.import.generateSources(result.bookSlug);
    } catch (err: unknown) {
      set({ step: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  },

  reset: () => {
    const { generationCleanup } = get();
    if (generationCleanup) generationCleanup();
    set({ ...initialState });
  },
}));
