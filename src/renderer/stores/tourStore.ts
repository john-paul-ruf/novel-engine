import { create } from 'zustand';
import type { TourId } from '@domain/types';
import { useViewStore } from './viewStore';
import { useRightPanelStore } from './rightPanelStore';
import { useChatStore } from './chatStore';
import { useBookStore } from './bookStore';

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

    // Always navigate to chat and open the pipeline panel so tour steps
    // can spotlight both chat and pipeline elements regardless of the
    // view the user was on when they triggered the tour.
    useViewStore.getState().navigate('chat');
    useRightPanelStore.getState().openPipeline();

    // For the welcome tour, auto-start a Spark conversation so the user
    // arrives in a live chat session rather than a blank screen.
    // Fire-and-forget — the tour advances synchronously; conversation
    // creation is async and non-blocking.
    if (tourId === 'welcome') {
      const activeSlug = useBookStore.getState().activeSlug;
      if (activeSlug) {
        useChatStore.getState()
          .createConversation('Spark', activeSlug, 'pitch', 'pipeline')
          .catch((err: unknown) => {
            console.error('[tourStore] Failed to auto-start Spark conversation:', err);
          });
      }
    }

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
