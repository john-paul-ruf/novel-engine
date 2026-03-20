import { create } from 'zustand';

type ViewId = 'onboarding' | 'chat' | 'files' | 'build' | 'settings';

type ViewPayload = {
  filePath?: string;
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
    set({ currentView: view, payload });
  },
}));
