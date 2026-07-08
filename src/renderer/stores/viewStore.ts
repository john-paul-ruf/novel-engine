import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type LegacyViewId = 'dashboard' | 'chat' | 'files' | 'build' | 'reading';
type ViewId =
  | 'library' | 'workspace' | 'manuscript' | 'exports'        // new primary
  | 'settings' | 'statistics' | 'pitch-room' | 'onboarding'   // carried over
  | LegacyViewId;                                             // removed in SESSION-14

export type FileViewMode = 'browser' | 'reader' | 'editor';

type ViewPayload = {
  filePath?: string;
  fileViewMode?: FileViewMode;
  fileBrowserPath?: string;
  conversationId?: string;
  phaseId?: string;
  chapterSlug?: string;
  manuscriptMode?: 'reader' | 'editor';
};

// Persisted legacy views are rewritten forward so users land in the new UI
// after updating. The legacy views themselves stay routable until SESSION-14.
const LEGACY_VIEW_FORWARD: Record<LegacyViewId, ViewId> = {
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
      currentView: 'dashboard',
      payload: {},

      navigate: (view: ViewId, payload: ViewPayload = {}) => {
        // When navigating to files, infer the default view mode
        if (view === 'files' && !payload.fileViewMode) {
          payload = {
            ...payload,
            fileViewMode: payload.filePath ? 'reader' : 'browser',
          };
        }
        set({ currentView: view, payload });
      },
    }),
    {
      name: 'novel-engine-view',
      version: 5,
      migrate: (persistedState: unknown) => {
        const state = persistedState as Partial<ViewState>;
        // v4 cases — removed views map to their old replacements first
        let view = state.currentView as string;
        if (view === 'motif-ledger') view = 'files';
        if (view === 'revision-queue') view = 'dashboard';
        // v5 — persisted legacy views land in the new UI
        const forwarded = LEGACY_VIEW_FORWARD[view as LegacyViewId];
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
