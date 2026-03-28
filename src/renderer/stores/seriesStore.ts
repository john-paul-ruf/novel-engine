import { create } from 'zustand';
import type { SeriesMeta, SeriesSummary } from '@domain/types';

type SeriesState = {
  /** All series with summary data. */
  seriesList: SeriesSummary[];

  /** Currently selected series for management (null when none selected). */
  activeSeries: SeriesMeta | null;

  /** Series bible content for the active series. */
  bibleContent: string;

  /** Whether the bible editor has unsaved changes. */
  bibleDirty: boolean;

  /** Loading state for async operations. */
  loading: boolean;

  /** Error message from the last failed operation. */
  error: string | null;

  /** Whether the series management modal is open. */
  isModalOpen: boolean;

  /** Current modal view mode. */
  modalMode: 'list' | 'create' | 'edit' | 'bible';

  // Actions

  /** Open the series management modal. */
  openModal: (mode?: 'list' | 'create' | 'edit' | 'bible') => void;

  /** Close the series management modal. */
  closeModal: () => void;

  /** Load all series from the backend. */
  loadSeries: () => Promise<void>;

  /** Create a new series. */
  createSeries: (name: string, description?: string) => Promise<SeriesMeta>;

  /** Update series metadata. */
  updateSeries: (slug: string, partial: Partial<Pick<SeriesMeta, 'name' | 'description'>>) => Promise<void>;

  /** Delete a series. Clears activeSeries if it was the deleted one. */
  deleteSeries: (slug: string) => Promise<void>;

  /** Select a series for management — loads its full data and bible. */
  selectSeries: (slug: string) => Promise<void>;

  /** Clear the active series selection. */
  clearSelection: () => void;

  /** Add a book to the active series. */
  addVolume: (bookSlug: string, volumeNumber?: number) => Promise<void>;

  /** Remove a book from the active series. */
  removeVolume: (bookSlug: string) => Promise<void>;

  /** Reorder volumes in the active series. */
  reorderVolumes: (orderedSlugs: string[]) => Promise<void>;

  /** Update the local bible content (marks dirty). */
  setBibleContent: (content: string) => void;

  /** Save the bible content to disk. */
  saveBible: () => Promise<void>;

  /** Load the bible content for a series. */
  loadBible: (seriesSlug: string) => Promise<void>;

  /**
   * Resolve which series the given book belongs to.
   * Returns the series meta, or null if the book is standalone.
   */
  getSeriesForBook: (bookSlug: string) => Promise<SeriesMeta | null>;
};

export const useSeriesStore = create<SeriesState>((set, get) => ({
  seriesList: [],
  activeSeries: null,
  bibleContent: '',
  bibleDirty: false,
  loading: false,
  error: null,
  isModalOpen: false,
  modalMode: 'list',

  openModal: (mode = 'list') => set({ isModalOpen: true, modalMode: mode }),
  closeModal: () => set({ isModalOpen: false }),

  loadSeries: async () => {
    set({ loading: true, error: null });
    try {
      const seriesList = await window.novelEngine.series.list();
      set({ seriesList, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), loading: false });
    }
  },

  createSeries: async (name, description) => {
    set({ loading: true, error: null });
    try {
      const created = await window.novelEngine.series.create(name, description);
      await get().loadSeries();
      set({ loading: false });
      return created;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), loading: false });
      throw err;
    }
  },

  updateSeries: async (slug, partial) => {
    set({ error: null });
    try {
      const updated = await window.novelEngine.series.update(slug, partial);
      const { activeSeries } = get();
      if (activeSeries?.slug === slug) {
        set({ activeSeries: updated });
      }
      await get().loadSeries();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  deleteSeries: async (slug) => {
    set({ error: null });
    try {
      await window.novelEngine.series.delete(slug);
      const { activeSeries } = get();
      if (activeSeries?.slug === slug) {
        set({ activeSeries: null, bibleContent: '', bibleDirty: false });
      }
      await get().loadSeries();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  selectSeries: async (slug) => {
    set({ loading: true, error: null });
    try {
      const series = await window.novelEngine.series.get(slug);
      set({ activeSeries: series, loading: false });
      if (series) {
        await get().loadBible(slug);
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), loading: false });
    }
  },

  clearSelection: () => {
    set({ activeSeries: null, bibleContent: '', bibleDirty: false });
  },

  addVolume: async (bookSlug, volumeNumber) => {
    const { activeSeries } = get();
    if (!activeSeries) return;
    set({ error: null });
    try {
      const updated = await window.novelEngine.series.addVolume(activeSeries.slug, bookSlug, volumeNumber);
      set({ activeSeries: updated });
      await get().loadSeries();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  removeVolume: async (bookSlug) => {
    const { activeSeries } = get();
    if (!activeSeries) return;
    set({ error: null });
    try {
      const updated = await window.novelEngine.series.removeVolume(activeSeries.slug, bookSlug);
      set({ activeSeries: updated });
      await get().loadSeries();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  reorderVolumes: async (orderedSlugs) => {
    const { activeSeries } = get();
    if (!activeSeries) return;
    set({ error: null });
    try {
      const updated = await window.novelEngine.series.reorderVolumes(activeSeries.slug, orderedSlugs);
      set({ activeSeries: updated });
      await get().loadSeries();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  setBibleContent: (content) => {
    set({ bibleContent: content, bibleDirty: true });
  },

  saveBible: async () => {
    const { activeSeries, bibleContent } = get();
    if (!activeSeries) return;
    set({ error: null });
    try {
      await window.novelEngine.series.writeBible(activeSeries.slug, bibleContent);
      set({ bibleDirty: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  loadBible: async (seriesSlug) => {
    set({ error: null });
    try {
      const content = await window.novelEngine.series.readBible(seriesSlug);
      set({ bibleContent: content, bibleDirty: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  getSeriesForBook: async (bookSlug) => {
    try {
      return await window.novelEngine.series.getForBook(bookSlug);
    } catch {
      return null;
    }
  },
}));
