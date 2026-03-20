import { create } from 'zustand';
import type { PipelinePhase } from '@domain/types';

type PipelineState = {
  phases: PipelinePhase[];
  activePhase: PipelinePhase | null;
  loading: boolean;
  loadPipeline: (bookSlug: string) => Promise<void>;
};

export const usePipelineStore = create<PipelineState>((set) => ({
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
}));
