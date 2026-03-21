import { create } from 'zustand';
import type { PipelinePhase, PipelinePhaseId } from '@domain/types';

type PipelineState = {
  phases: PipelinePhase[];
  activePhase: PipelinePhase | null;
  loading: boolean;
  loadPipeline: (bookSlug: string) => Promise<void>;
  markPhaseComplete: (bookSlug: string, phaseId: PipelinePhaseId) => Promise<void>;
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
    try {
      await window.novelEngine.pipeline.markPhaseComplete(bookSlug, phaseId);
      // Reload the pipeline to reflect the new state
      await get().loadPipeline(bookSlug);
    } catch (error) {
      console.error('Failed to mark phase complete:', error);
    }
  },
}));
