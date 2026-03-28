import { create } from 'zustand';
import type { FileDiff, FileVersionSummary } from '@domain/types';

type VersionState = {
  // Current file being viewed
  activeBookSlug: string;
  activeFilePath: string;

  // Version list
  versions: FileVersionSummary[];
  totalCount: number;
  isLoading: boolean;

  // Selected versions for diff
  selectedVersionId: number | null;
  diff: FileDiff | null;
  isDiffLoading: boolean;

  // Error state
  error: string | null;

  // Actions
  loadHistory: (bookSlug: string, filePath: string) => Promise<void>;
  loadMoreHistory: () => Promise<void>;
  selectVersion: (versionId: number) => Promise<void>;
  clearSelection: () => void;
  revertToVersion: (versionId: number) => Promise<void>;
  reset: () => void;
};

const PAGE_SIZE = 30;

export const useVersionStore = create<VersionState>((set, get) => ({
  activeBookSlug: '',
  activeFilePath: '',
  versions: [],
  totalCount: 0,
  isLoading: false,
  selectedVersionId: null,
  diff: null,
  isDiffLoading: false,
  error: null,

  loadHistory: async (bookSlug: string, filePath: string) => {
    set({
      activeBookSlug: bookSlug,
      activeFilePath: filePath,
      versions: [],
      totalCount: 0,
      isLoading: true,
      selectedVersionId: null,
      diff: null,
      error: null,
    });

    try {
      const [versions, totalCount] = await Promise.all([
        window.novelEngine.versions.getHistory(bookSlug, filePath, PAGE_SIZE, 0),
        window.novelEngine.versions.getCount(bookSlug, filePath),
      ]);

      set({ versions, totalCount, isLoading: false });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load version history',
      });
    }
  },

  loadMoreHistory: async () => {
    const { activeBookSlug, activeFilePath, versions, totalCount, isLoading } = get();
    if (isLoading || versions.length >= totalCount) return;

    set({ isLoading: true });

    try {
      const more = await window.novelEngine.versions.getHistory(
        activeBookSlug,
        activeFilePath,
        PAGE_SIZE,
        versions.length,
      );
      set((state) => ({
        versions: [...state.versions, ...more],
        isLoading: false,
      }));
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load more versions',
      });
    }
  },

  selectVersion: async (versionId: number) => {
    const { versions } = get();
    set({ selectedVersionId: versionId, isDiffLoading: true, error: null });

    try {
      // Find the previous version (the one right after this one in the list,
      // since versions are sorted newest-first)
      const idx = versions.findIndex((v) => v.id === versionId);
      const previousVersion = idx >= 0 && idx < versions.length - 1
        ? versions[idx + 1]
        : null;

      const diff = await window.novelEngine.versions.getDiff(
        previousVersion?.id ?? null,
        versionId,
      );

      set({ diff, isDiffLoading: false });
    } catch (err) {
      set({
        isDiffLoading: false,
        error: err instanceof Error ? err.message : 'Failed to compute diff',
      });
    }
  },

  clearSelection: () => {
    set({ selectedVersionId: null, diff: null });
  },

  revertToVersion: async (versionId: number) => {
    const { activeBookSlug, activeFilePath } = get();
    if (!activeBookSlug || !activeFilePath) return;

    try {
      await window.novelEngine.versions.revert(activeBookSlug, activeFilePath, versionId);
      // Reload history to include the new revert snapshot
      await get().loadHistory(activeBookSlug, activeFilePath);
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to revert',
      });
    }
  },

  reset: () => {
    set({
      activeBookSlug: '',
      activeFilePath: '',
      versions: [],
      totalCount: 0,
      isLoading: false,
      selectedVersionId: null,
      diff: null,
      isDiffLoading: false,
      error: null,
    });
  },
}));
