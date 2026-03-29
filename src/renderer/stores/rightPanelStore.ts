import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type RightPanelState = {
  pipelineOpen: boolean;
  openPipeline: () => void;
  closePipeline: () => void;
  togglePipeline: () => void;
};

export const useRightPanelStore = create<RightPanelState>()(
  persist(
    (set) => ({
      pipelineOpen: true,
      openPipeline: () => set({ pipelineOpen: true }),
      closePipeline: () => set({ pipelineOpen: false }),
      togglePipeline: () => set((s) => ({ pipelineOpen: !s.pipelineOpen })),
    }),
    {
      name: 'novel-engine:right-panel',
      partialize: (s) => ({ pipelineOpen: s.pipelineOpen }),
    },
  ),
);
