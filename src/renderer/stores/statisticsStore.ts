import { create } from 'zustand';
import type { BookStatistics } from '@domain/types';

type StatisticsState = {
  data: BookStatistics | null;
  loading: boolean;
  error: string | null;
  bookFilter: string | null;
  load: (bookSlug?: string) => Promise<void>;
  setBookFilter: (bookSlug: string | null) => void;
};

export const useStatisticsStore = create<StatisticsState>((set, get) => ({
  data: null,
  loading: false,
  error: null,
  bookFilter: null,

  load: async (bookSlug?: string) => {
    set({ loading: true, error: null });
    try {
      const slug = bookSlug ?? get().bookFilter ?? undefined;
      const data = await window.novelEngine.statistics.get(slug);
      set({ data, loading: false });
    } catch (error) {
      console.error('Failed to load statistics:', error);
      set({ error: 'Failed to load statistics', loading: false });
    }
  },

  setBookFilter: (bookSlug: string | null) => {
    set({ bookFilter: bookSlug });
    get().load(bookSlug ?? undefined);
  },
}));
