import { create } from 'zustand';
import type { BookDashboardData } from '@domain/types';

type DashboardState = {
  data: BookDashboardData | null;
  loading: boolean;
  error: string | null;
  loadedSlug: string;
  load: (bookSlug: string) => Promise<void>;
  refresh: () => Promise<void>;
};

export const useDashboardStore = create<DashboardState>((set, get) => ({
  data: null,
  loading: false,
  error: null,
  loadedSlug: '',

  load: async (bookSlug: string) => {
    if (!bookSlug) return;
    set({ loading: true, error: null, loadedSlug: bookSlug });
    try {
      const data = await window.novelEngine.dashboard.getData(bookSlug);
      if (get().loadedSlug === bookSlug) {
        set({ data, loading: false });
      }
    } catch (error) {
      console.error('Failed to load dashboard:', error);
      if (get().loadedSlug === bookSlug) {
        set({ error: 'Failed to load dashboard data', loading: false });
      }
    }
  },

  refresh: async () => {
    const { loadedSlug } = get();
    if (loadedSlug) {
      await get().load(loadedSlug);
    }
  },
}));
