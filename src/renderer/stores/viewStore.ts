import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ViewId = 'dashboard' | 'onboarding' | 'chat' | 'files' | 'build' | 'settings' | 'revision-queue' | 'pitch-room' | 'reading';

export type FileViewMode = 'browser' | 'reader' | 'editor';

type ViewPayload = {
  filePath?: string;
  fileViewMode?: FileViewMode;
  fileBrowserPath?: string;
  conversationId?: string;
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
      version: 3,
      migrate: (persistedState: unknown) => {
        const state = persistedState as Partial<ViewState>;
        if ((state.currentView as string) === 'motif-ledger') {
          return { ...state, currentView: 'files' as ViewId };
        }
        return state;
      },
      partialize: (state) => ({
        currentView: state.currentView,
        payload: state.payload,
      }),
    },
  ),
);
