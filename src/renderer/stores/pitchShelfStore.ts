import { create } from 'zustand';
import type { ShelvedPitchMeta, ShelvedPitch } from '@domain/types';

type PitchShelfState = {
  pitches: ShelvedPitchMeta[];
  loading: boolean;
  error: string | null;

  // Preview state
  previewPitch: ShelvedPitch | null;
  previewLoading: boolean;

  // Actions
  loadPitches: () => Promise<void>;
  previewPitchBySlug: (slug: string) => Promise<void>;
  closePreview: () => void;
  restorePitch: (slug: string) => Promise<string>; // returns new book slug
  deletePitch: (slug: string) => Promise<void>;
  shelveCurrentPitch: (bookSlug: string, logline?: string) => Promise<void>;
};

export const usePitchShelfStore = create<PitchShelfState>((set) => ({
  pitches: [],
  loading: false,
  error: null,
  previewPitch: null,
  previewLoading: false,

  loadPitches: async () => {
    set({ loading: true, error: null });
    try {
      const pitches = await window.novelEngine.pitches.list();
      set({ pitches, loading: false });
    } catch (err) {
      console.error('Failed to load shelved pitches:', err);
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load pitches',
      });
    }
  },

  previewPitchBySlug: async (slug: string) => {
    set({ previewLoading: true });
    try {
      const pitch = await window.novelEngine.pitches.read(slug);
      set({ previewPitch: pitch, previewLoading: false });
    } catch (err) {
      console.error('Failed to load pitch preview:', err);
      set({ previewLoading: false });
    }
  },

  closePreview: () => {
    set({ previewPitch: null });
  },

  restorePitch: async (slug: string) => {
    const meta = await window.novelEngine.pitches.restore(slug);
    // Remove from local state immediately
    set((state) => ({
      pitches: state.pitches.filter((p) => p.slug !== slug),
      previewPitch: null,
    }));
    return meta.slug;
  },

  deletePitch: async (slug: string) => {
    await window.novelEngine.pitches.delete(slug);
    set((state) => ({
      pitches: state.pitches.filter((p) => p.slug !== slug),
    }));
  },

  shelveCurrentPitch: async (bookSlug: string, logline?: string) => {
    const newPitch = await window.novelEngine.pitches.shelve(bookSlug, logline);
    set((state) => ({
      pitches: [newPitch, ...state.pitches],
    }));
  },
}));
