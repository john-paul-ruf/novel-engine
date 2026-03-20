import { create } from 'zustand';

type ViewId = 'onboarding' | 'chat' | 'files' | 'build' | 'settings' | 'revision-queue';

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

export const useViewStore = create<ViewState>((set) => ({
  currentView: 'chat',
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
}));
