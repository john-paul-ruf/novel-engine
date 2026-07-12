import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ViewId =
  | 'library' | 'workspace' | 'manuscript' | 'exports' | 'query-manager'  // primary
  | 'settings' | 'statistics' | 'pitch-room' | 'onboarding';               // secondary

type ViewPayload = {
  filePath?: string;
  phaseId?: string;
  chapterSlug?: string;
  manuscriptMode?: 'reader' | 'editor';
};

// Persisted views from before the streamlined-workspace conversion are
// rewritten forward so users land in the new UI after updating.
const LEGACY_VIEW_FORWARD: Record<string, ViewId> = {
  dashboard: 'workspace',
  chat: 'workspace',
  reading: 'manuscript',
  build: 'exports',
  files: 'manuscript',
};

type ViewState = {
  currentView: ViewId;
  payload: ViewPayload;
  navigate: (view: ViewId, payload?: ViewPayload) => void;
};

export const useViewStore = create<ViewState>()(
  persist(
    (set) => ({
      currentView: 'library',
      payload: {},

      navigate: (view: ViewId, payload: ViewPayload = {}) => {
        set({ currentView: view, payload });
      },
    }),
    {
      name: 'novel-engine-view',
      version: 6,
      migrate: (persistedState: unknown) => {
        const state = persistedState as Partial<ViewState>;
        // v4 cases — removed views map to their old replacements first
        let view = state.currentView as string;
        if (view === 'motif-ledger') view = 'files';
        if (view === 'revision-queue') view = 'dashboard';
        // v5/v6 — persisted legacy views land in the new UI
        const forwarded = LEGACY_VIEW_FORWARD[view];
        return { ...state, currentView: (forwarded ?? view) as ViewId };
      },
      partialize: (state) => ({
        currentView: state.currentView,
        payload: state.payload,
      }),
    },
  ),
);

/** Deep-link into the workspace at a specific pipeline phase. */
export function navigateToPhase(phaseId: string): void {
  useViewStore.getState().navigate('workspace', { phaseId });
}
