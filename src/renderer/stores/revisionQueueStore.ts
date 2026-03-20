import { create } from 'zustand';
import type {
  RevisionPlan,
  QueueMode,
  ApprovalAction,
} from '@domain/types';

type RevisionQueueState = {
  // State
  plan: RevisionPlan | null;
  planId: string | null;
  isRunning: boolean;
  isPaused: boolean;
  activeSessionId: string | null;
  streamingResponse: string;
  streamingThinking: string;
  gateSessionId: string | null;
  gateText: string;
  error: string | null;
  selectedSessionIds: Set<string>;

  // Actions
  loadPlan: (bookSlug: string) => Promise<void>;
  runNext: () => Promise<void>;
  runAll: () => Promise<void>;
  runSession: (sessionId: string) => Promise<void>;
  respondToGate: (action: ApprovalAction, message?: string) => Promise<void>;
  approveSession: (sessionId: string) => Promise<void>;
  rejectSession: (sessionId: string) => Promise<void>;
  skipSession: (sessionId: string) => Promise<void>;
  pause: () => void;
  setMode: (mode: QueueMode) => void;
  toggleSessionSelection: (sessionId: string) => void;
  selectAllSessions: () => void;
  deselectAllSessions: () => void;
  reset: () => void;
};

export const useRevisionQueueStore = create<RevisionQueueState>((set, get) => ({
  plan: null,
  planId: null,
  isRunning: false,
  isPaused: false,
  activeSessionId: null,
  streamingResponse: '',
  streamingThinking: '',
  gateSessionId: null,
  gateText: '',
  error: null,
  selectedSessionIds: new Set(),

  loadPlan: async (bookSlug: string) => {
    try {
      set({ error: null });
      const plan = await window.novelEngine.revision.loadPlan(bookSlug);
      set({
        plan,
        planId: plan.id,
        selectedSessionIds: new Set(plan.sessions.map(s => s.id)),
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  runNext: async () => {
    const { plan, planId } = get();
    if (!plan || !planId) return;
    const next = plan.sessions.find(s => s.status === 'pending');
    if (!next) return;
    set({ isRunning: true, activeSessionId: next.id, streamingResponse: '', streamingThinking: '' });
    try {
      await window.novelEngine.revision.runSession(planId, next.id);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), isRunning: false });
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
    set({ isRunning: true, activeSessionId: sessionId, streamingResponse: '', streamingThinking: '' });
    try {
      await window.novelEngine.revision.runSession(planId, sessionId);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), isRunning: false });
    }
  },

  respondToGate: async (action: ApprovalAction, message?: string) => {
    const { planId, gateSessionId } = get();
    if (!planId || !gateSessionId) return;
    set({ gateSessionId: null, gateText: '', streamingResponse: '', streamingThinking: '' });
    await window.novelEngine.revision.respondToGate(planId, gateSessionId, action, message);
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

  reset: () => {
    set({
      plan: null,
      planId: null,
      isRunning: false,
      isPaused: false,
      activeSessionId: null,
      streamingResponse: '',
      streamingThinking: '',
      gateSessionId: null,
      gateText: '',
      error: null,
      selectedSessionIds: new Set(),
    });
  },
}));
