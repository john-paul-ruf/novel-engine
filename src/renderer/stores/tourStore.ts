import { create } from 'zustand';
import type { TourId } from '@domain/types';

type TourStoreState = {
  activeTourId: TourId | null;
  completedTours: Set<TourId>;
  isHydrated: boolean;

  /** Load completed tours from settings on app mount. */
  hydrate: (completedTours: TourId[]) => void;
  /** Start a tour. No-op if another tour is already active. */
  startTour: (tourId: TourId) => void;
  /** Mark the active tour as completed and persist to settings. */
  completeTour: () => Promise<void>;
  /** Dismiss the active tour without marking it complete. */
  dismissTour: () => void;
  /** Check if a tour has been completed. O(1) via Set lookup. */
  isTourCompleted: (tourId: TourId) => boolean;
  /** Remove a tour from completed list (for replay) and persist. */
  resetTour: (tourId: TourId) => Promise<void>;
};

export const useTourStore = create<TourStoreState>()((set, get) => ({
  activeTourId: null,
  completedTours: new Set<TourId>(),
  isHydrated: false,

  hydrate: (completedTours: TourId[]) => {
    set({
      completedTours: new Set(completedTours),
      isHydrated: true,
    });
  },

  startTour: (tourId: TourId) => {
    const { activeTourId } = get();
    if (activeTourId !== null) return;
    set({ activeTourId: tourId });
  },

  completeTour: async () => {
    const { activeTourId, completedTours } = get();
    if (!activeTourId) return;

    const updated = new Set(completedTours);
    updated.add(activeTourId);

    set({ activeTourId: null, completedTours: updated });

    try {
      await window.novelEngine.settings.update({
        completedTours: Array.from(updated),
      });
    } catch (err) {
      console.error('[tourStore] Failed to persist completed tour:', err);
    }
  },

  dismissTour: () => {
    set({ activeTourId: null });
  },

  isTourCompleted: (tourId: TourId) => {
    return get().completedTours.has(tourId);
  },

  resetTour: async (tourId: TourId) => {
    const { completedTours } = get();
    const updated = new Set(completedTours);
    updated.delete(tourId);

    set({ completedTours: updated });

    try {
      await window.novelEngine.settings.update({
        completedTours: Array.from(updated),
      });
    } catch (err) {
      console.error('[tourStore] Failed to persist tour reset:', err);
    }
  },
}));
