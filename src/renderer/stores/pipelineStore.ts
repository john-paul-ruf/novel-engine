import { create } from 'zustand';
import type { PipelinePhase, PipelinePhaseId } from '@domain/types';

type PipelineState = {
  phases: PipelinePhase[];
  activePhase: PipelinePhase | null;
  loading: boolean;
  loadPipeline: (bookSlug: string) => Promise<void>;
  markPhaseComplete: (bookSlug: string, phaseId: PipelinePhaseId) => Promise<void>;
  completeRevision: (bookSlug: string) => Promise<void>;
  /**
   * Confirm that a phase's work is accepted and advance the pipeline.
   * Transitions a 'pending-completion' phase to 'complete' and unlocks
   * the next phase. Reloads the pipeline after writing.
   */
  confirmPhaseAdvancement: (bookSlug: string, phaseId: PipelinePhaseId) => Promise<void>;
};

export const usePipelineStore = create<PipelineState>((set, get) => ({
  phases: [],
  activePhase: null,
  loading: false,

  loadPipeline: async (bookSlug: string) => {
    set({ loading: true });
    try {
      const [phases, activePhase] = await Promise.all([
        window.novelEngine.pipeline.detect(bookSlug),
        window.novelEngine.pipeline.getActive(bookSlug),
      ]);
      set({ phases, activePhase, loading: false });
    } catch (error) {
      console.error('Failed to load pipeline:', error);
      set({ loading: false });
    }
  },

  markPhaseComplete: async (bookSlug: string, phaseId: PipelinePhaseId) => {
    // Let errors propagate — callers (PipelineTracker) display them to the user
    await window.novelEngine.pipeline.markPhaseComplete(bookSlug, phaseId);
    // Reload the pipeline to reflect the new state
    await get().loadPipeline(bookSlug);
  },

  completeRevision: async (bookSlug: string) => {
    await window.novelEngine.pipeline.completeRevision(bookSlug);
    // Reload the pipeline — revision phase will now show complete, second-read unlocks
    await get().loadPipeline(bookSlug);
  },

  confirmPhaseAdvancement: async (bookSlug: string, phaseId: PipelinePhaseId) => {
    // Let errors propagate — PipelineTracker displays them to the user
    await window.novelEngine.pipeline.confirmAdvancement(bookSlug, phaseId);
    // Reload to reflect the transition: pending-completion → complete, next → active
    await get().loadPipeline(bookSlug);
  },
}));
