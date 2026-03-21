import { create } from 'zustand';
import type { PipelinePhase, PipelinePhaseId } from '@domain/types';

/**
 * Per-book pipeline cache entry.
 */
type BookPipelineCache = {
  phases: PipelinePhase[];
  activePhase: PipelinePhase | null;
};

type PipelineState = {
  /** Per-book pipeline cache — keyed by bookSlug. */
  cache: Record<string, BookPipelineCache>;
  /** The book slug whose pipeline is currently displayed. */
  displayedSlug: string;
  loading: boolean;

  /** Derived: phases for the currently displayed book. */
  phases: PipelinePhase[];
  /** Derived: active phase for the currently displayed book. */
  activePhase: PipelinePhase | null;

  loadPipeline: (bookSlug: string) => Promise<void>;
  markPhaseComplete: (bookSlug: string, phaseId: PipelinePhaseId) => Promise<void>;
  completeRevision: (bookSlug: string) => Promise<void>;
  /**
   * Confirm that a phase's work is accepted and advance the pipeline.
   * Transitions a 'pending-completion' phase to 'complete' and unlocks
   * the next phase. Reloads the pipeline after writing.
   */
  confirmPhaseAdvancement: (bookSlug: string, phaseId: PipelinePhaseId) => Promise<void>;
  /**
   * Revert a completed phase back to pending-completion or active.
   * All subsequent phases revert to locked. Reloads the pipeline after writing.
   */
  revertPhase: (bookSlug: string, phaseId: PipelinePhaseId) => Promise<void>;
  /**
   * Switch which book's pipeline is displayed.
   * If a cached entry exists it's shown instantly; a background refresh follows.
   */
  setDisplayedBook: (bookSlug: string) => void;
};

/**
 * Extract the displayed phases/activePhase from the cache for a given slug.
 */
function deriveDisplayed(cache: Record<string, BookPipelineCache>, slug: string): {
  phases: PipelinePhase[];
  activePhase: PipelinePhase | null;
} {
  const entry = cache[slug];
  return {
    phases: entry?.phases ?? [],
    activePhase: entry?.activePhase ?? null,
  };
}

export const usePipelineStore = create<PipelineState>((set, get) => ({
  cache: {},
  displayedSlug: '',
  loading: false,
  phases: [],
  activePhase: null,

  loadPipeline: async (bookSlug: string) => {
    // Only show the loading spinner if this is the displayed book
    const isDisplayed = bookSlug === get().displayedSlug;
    if (isDisplayed) {
      set({ loading: true });
    }

    try {
      const [phases, activePhase] = await Promise.all([
        window.novelEngine.pipeline.detect(bookSlug),
        window.novelEngine.pipeline.getActive(bookSlug),
      ]);

      const entry: BookPipelineCache = { phases, activePhase };
      const newCache = { ...get().cache, [bookSlug]: entry };

      // Only update the displayed phases if this book is still the displayed one
      if (bookSlug === get().displayedSlug) {
        set({
          cache: newCache,
          loading: false,
          ...deriveDisplayed(newCache, bookSlug),
        });
      } else {
        // Silently cache the result for the background book
        set({ cache: newCache });
      }
    } catch (error) {
      console.error('Failed to load pipeline:', error);
      if (bookSlug === get().displayedSlug) {
        set({ loading: false });
      }
    }
  },

  markPhaseComplete: async (bookSlug: string, phaseId: PipelinePhaseId) => {
    await window.novelEngine.pipeline.markPhaseComplete(bookSlug, phaseId);
    await get().loadPipeline(bookSlug);
  },

  completeRevision: async (bookSlug: string) => {
    await window.novelEngine.pipeline.completeRevision(bookSlug);
    await get().loadPipeline(bookSlug);
  },

  confirmPhaseAdvancement: async (bookSlug: string, phaseId: PipelinePhaseId) => {
    await window.novelEngine.pipeline.confirmAdvancement(bookSlug, phaseId);
    await get().loadPipeline(bookSlug);
  },

  revertPhase: async (bookSlug: string, phaseId: PipelinePhaseId) => {
    await window.novelEngine.pipeline.revertPhase(bookSlug, phaseId);
    await get().loadPipeline(bookSlug);
  },

  setDisplayedBook: (bookSlug: string) => {
    const { cache } = get();
    set({
      displayedSlug: bookSlug,
      ...deriveDisplayed(cache, bookSlug),
    });
  },
}));
