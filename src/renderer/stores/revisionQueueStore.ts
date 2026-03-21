import { create } from 'zustand';
import type {
  RevisionPlan,
  QueueMode,
  ApprovalAction,
  Message,
} from '@domain/types';

type RevisionQueueState = {
  plan: RevisionPlan | null;
  planId: string | null;
  isLoading: boolean;
  loadingStep: string;
  isRunning: boolean;
  isPaused: boolean;
  activeSessionId: string | null;
  viewingSessionId: string | null;
  streamingResponse: string;
  streamingThinking: string;
  gateSessionId: string | null;
  gateText: string;
  error: string | null;
  selectedSessionIds: Set<string>;

  panelMessages: Message[];
  panelMessagesConvId: string | null;

  loadPlan: (bookSlug: string) => Promise<void>;
  reloadPlan: (bookSlug: string) => Promise<void>;
  clearCache: (bookSlug: string) => Promise<void>;
  runNext: () => Promise<void>;
  runAll: () => Promise<void>;
  runSession: (sessionId: string) => Promise<void>;
  respondToGate: (action: ApprovalAction, message?: string) => Promise<void>;
  sendGateMessage: (message: string) => Promise<void>;
  approveSession: (sessionId: string) => Promise<void>;
  rejectSession: (sessionId: string) => Promise<void>;
  skipSession: (sessionId: string) => Promise<void>;
  pause: () => void;
  setMode: (mode: QueueMode) => void;
  toggleSessionSelection: (sessionId: string) => void;
  selectAllSessions: () => void;
  deselectAllSessions: () => void;
  setViewingSession: (sessionId: string | null) => void;
  loadPanelMessages: (conversationId: string) => Promise<void>;
  reset: () => void;
};

export const useRevisionQueueStore = create<RevisionQueueState>((set, get) => ({
  plan: null,
  planId: null,
  isLoading: false,
  loadingStep: '',
  isRunning: false,
  isPaused: false,
  activeSessionId: null,
  viewingSessionId: null,
  streamingResponse: '',
  streamingThinking: '',
  gateSessionId: null,
  gateText: '',
  error: null,
  selectedSessionIds: new Set(),
  panelMessages: [],
  panelMessagesConvId: null,

  loadPlan: async (bookSlug: string) => {
    const { plan, isLoading } = get();
    if (isLoading) return;
    if (plan && plan.bookSlug === bookSlug) return;

    try {
      set({ error: null, isLoading: true, loadingStep: 'Initializing\u2026' });
      const loaded = await window.novelEngine.revision.loadPlan(bookSlug);
      set({
        plan: loaded,
        planId: loaded.id,
        isLoading: false,
        loadingStep: '',
        selectedSessionIds: new Set(loaded.sessions.map(s => s.id)),
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), isLoading: false, loadingStep: '' });
    }
  },

  reloadPlan: async (bookSlug: string) => {
    const { isLoading } = get();
    if (isLoading) return;
    set({ plan: null, planId: null, error: null });
    try {
      set({ isLoading: true, loadingStep: 'Reloading\u2026' });
      const loaded = await window.novelEngine.revision.loadPlan(bookSlug);
      set({
        plan: loaded,
        planId: loaded.id,
        isLoading: false,
        loadingStep: '',
        selectedSessionIds: new Set(loaded.sessions.map(s => s.id)),
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), isLoading: false, loadingStep: '' });
    }
  },

  clearCache: async (bookSlug: string) => {
    try {
      set({ isLoading: true, loadingStep: 'Clearing cache\u2026' });
      await window.novelEngine.revision.clearCache(bookSlug);
      // Reload the plan after clearing cache to get fresh parse
      const loaded = await window.novelEngine.revision.loadPlan(bookSlug);
      set({
        plan: loaded,
        planId: loaded.id,
        isLoading: false,
        loadingStep: '',
        selectedSessionIds: new Set(loaded.sessions.map(s => s.id)),
        error: null,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), isLoading: false, loadingStep: '' });
    }
  },

  runNext: async () => {
    const { plan, planId } = get();
    if (!plan || !planId) return;
    const next = plan.sessions.find(s => s.status === 'pending');
    if (!next) return;
    set({
      isRunning: true,
      activeSessionId: next.id,
      viewingSessionId: next.id,
      streamingResponse: '',
      streamingThinking: '',
      panelMessages: [],
      panelMessagesConvId: null,
    });
    try {
      await window.novelEngine.revision.runSession(planId, next.id);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ isRunning: false, activeSessionId: null, streamingResponse: '', streamingThinking: '' });
    }
  },

  runAll: async () => {
    const { planId, plan, selectedSessionIds } = get();
    if (!planId) return;
    set({ isRunning: true });
    try {
      const sessionIds = plan?.mode === 'selective'
        ? Array.from(selectedSessionIds)
        : undefined;
      await window.novelEngine.revision.runAll(planId, sessionIds);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ isRunning: false });
    }
  },

  runSession: async (sessionId: string) => {
    const { planId } = get();
    if (!planId) return;
    set({
      isRunning: true,
      activeSessionId: sessionId,
      viewingSessionId: sessionId,
      streamingResponse: '',
      streamingThinking: '',
      panelMessages: [],
      panelMessagesConvId: null,
    });
    try {
      await window.novelEngine.revision.runSession(planId, sessionId);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ isRunning: false, activeSessionId: null, streamingResponse: '', streamingThinking: '' });
    }
  },

  respondToGate: async (action: ApprovalAction, message?: string) => {
    const { planId, gateSessionId } = get();
    if (!planId || !gateSessionId) return;
    set({ gateSessionId: null, gateText: '', streamingResponse: '', streamingThinking: '' });
    await window.novelEngine.revision.respondToGate(planId, gateSessionId, action, message);
  },

  sendGateMessage: async (message: string) => {
    const { planId, gateSessionId, plan } = get();
    if (!planId || !gateSessionId) return;

    const session = plan?.sessions.find(s => s.id === gateSessionId);
    const convId = session?.conversationId;

    const tempMessage: Message = {
      id: 'temp-' + Date.now(),
      role: 'user',
      content: message,
      thinking: '',
      conversationId: convId ?? '',
      timestamp: new Date().toISOString(),
    };

    set(state => ({
      panelMessages: [...state.panelMessages, tempMessage],
      gateSessionId: null,
      gateText: '',
      streamingResponse: '',
      streamingThinking: '',
    }));

    await window.novelEngine.revision.respondToGate(planId, gateSessionId, 'reject', message);
  },

  approveSession: async (sessionId: string) => {
    const { planId } = get();
    if (!planId) return;
    await window.novelEngine.revision.approveSession(planId, sessionId);
  },

  rejectSession: async (sessionId: string) => {
    const { planId } = get();
    if (!planId) return;
    await window.novelEngine.revision.rejectSession(planId, sessionId);
  },

  skipSession: async (sessionId: string) => {
    const { planId } = get();
    if (!planId) return;
    await window.novelEngine.revision.skipSession(planId, sessionId);
  },

  pause: () => {
    const { planId } = get();
    if (!planId) return;
    set({ isPaused: true });
    window.novelEngine.revision.pause(planId);
  },

  setMode: (mode: QueueMode) => {
    const { planId } = get();
    if (!planId) return;
    set(state => ({
      plan: state.plan ? { ...state.plan, mode } : null,
    }));
    window.novelEngine.revision.setMode(planId, mode);
  },

  toggleSessionSelection: (sessionId: string) => {
    set(state => {
      const next = new Set(state.selectedSessionIds);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return { selectedSessionIds: next };
    });
  },

  selectAllSessions: () => {
    set(state => ({
      selectedSessionIds: new Set(state.plan?.sessions.map(s => s.id) ?? []),
    }));
  },

  deselectAllSessions: () => {
    set({ selectedSessionIds: new Set() });
  },

  setViewingSession: (sessionId: string | null) => {
    if (!sessionId) {
      set({ viewingSessionId: null, panelMessages: [], panelMessagesConvId: null });
      return;
    }

    set({ viewingSessionId: sessionId });

    const { plan } = get();
    const session = plan?.sessions.find(s => s.id === sessionId);
    if (session?.conversationId) {
      get().loadPanelMessages(session.conversationId);
    } else {
      set({ panelMessages: [], panelMessagesConvId: null });
    }
  },

  loadPanelMessages: async (conversationId: string) => {
    try {
      const messages = await window.novelEngine.chat.getMessages(conversationId);
      set({ panelMessages: messages, panelMessagesConvId: conversationId });
    } catch {
      set({ panelMessages: [], panelMessagesConvId: conversationId });
    }
  },

  reset: () => {
    set({
      plan: null,
      planId: null,
      isLoading: false,
      loadingStep: '',
      isRunning: false,
      isPaused: false,
      activeSessionId: null,
      viewingSessionId: null,
      streamingResponse: '',
      streamingThinking: '',
      gateSessionId: null,
      gateText: '',
      error: null,
      selectedSessionIds: new Set(),
      panelMessages: [],
      panelMessagesConvId: null,
    });
  },
}));
