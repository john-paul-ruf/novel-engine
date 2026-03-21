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
  isArchiving: boolean;
  isQueueArchived: boolean;
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
  switchToBook: (bookSlug: string) => Promise<void>;
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
  completeQueue: () => Promise<void>;
  reset: () => void;
};

// ── Per-book state cache ──────────────────────────────────────────────
// Survives book switches so we don't lose running state when the user
// navigates to a different book and back. Keyed by bookSlug.

type CachedBookState = {
  plan: RevisionPlan | null;
  planId: string | null;
  isRunning: boolean;
  isPaused: boolean;
  isArchiving: boolean;
  isQueueArchived: boolean;
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
};

const bookStateCache = new Map<string, CachedBookState>();

function snapshotState(state: RevisionQueueState): CachedBookState {
  return {
    plan: state.plan,
    planId: state.planId,
    isRunning: state.isRunning,
    isPaused: state.isPaused,
    isArchiving: state.isArchiving,
    isQueueArchived: state.isQueueArchived,
    activeSessionId: state.activeSessionId,
    viewingSessionId: state.viewingSessionId,
    streamingResponse: state.streamingResponse,
    streamingThinking: state.streamingThinking,
    gateSessionId: state.gateSessionId,
    gateText: state.gateText,
    error: state.error,
    selectedSessionIds: new Set(state.selectedSessionIds),
    panelMessages: state.panelMessages,
    panelMessagesConvId: state.panelMessagesConvId,
  };
}

export const useRevisionQueueStore = create<RevisionQueueState>((set, get) => ({
  plan: null,
  planId: null,
  isLoading: false,
  loadingStep: '',
  isRunning: false,
  isPaused: false,
  isArchiving: false,
  isQueueArchived: false,
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

  switchToBook: async (bookSlug: string) => {
    const current = get();
    const currentSlug = current.plan?.bookSlug;

    // Same book — nothing to do
    if (currentSlug === bookSlug) return;

    // Save current state to cache (if we have a plan loaded)
    if (currentSlug) {
      bookStateCache.set(currentSlug, snapshotState(current));
    }

    // Check if we have cached state for the target book
    const cached = bookStateCache.get(bookSlug);
    if (cached) {
      // Restore cached state
      set({
        ...cached,
        isLoading: false,
        loadingStep: '',
      });

      // Verify against backend — the queue may have finished while we were away
      try {
        const status = await window.novelEngine.revision.getQueueStatus(bookSlug);
        if (cached.isRunning && !status.isRunning) {
          // Queue finished while we were on another book — reload plan from disk
          // to get the final session statuses
          set({ isRunning: false, isPaused: false, activeSessionId: null, streamingResponse: '', streamingThinking: '' });
          const loaded = await window.novelEngine.revision.loadPlan(bookSlug);
          set({
            plan: loaded,
            planId: loaded.id,
            selectedSessionIds: new Set(loaded.sessions.map(s => s.id)),
          });
          bookStateCache.set(bookSlug, snapshotState(get()));
        } else if (!cached.isRunning && status.isRunning) {
          // Queue started running (e.g. via another window) — pick up the state
          set({ isRunning: true, activeSessionId: status.activeSessionId });
        }
      } catch {
        // Best-effort — cached state is still better than nothing
      }
      return;
    }

    // No cached state — reset and load fresh
    set({
      plan: null,
      planId: null,
      isLoading: false,
      loadingStep: '',
      isRunning: false,
      isPaused: false,
      isArchiving: false,
      isQueueArchived: false,
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

    // Load plan + check running status from backend
    await get().loadPlan(bookSlug);

    try {
      const status = await window.novelEngine.revision.getQueueStatus(bookSlug);
      if (status.isRunning) {
        set({ isRunning: true, activeSessionId: status.activeSessionId });
      }
    } catch {
      // Best-effort
    }
  },

  loadPlan: async (bookSlug: string) => {
    const { plan, isLoading } = get();
    if (isLoading) return;
    if (plan && plan.bookSlug === bookSlug && plan.sessions.length > 0) return;

    try {
      set({ error: null, isLoading: true, loadingStep: 'Initializing\u2026', isQueueArchived: false });
      const loaded = await window.novelEngine.revision.loadPlan(bookSlug);
      set({
        plan: loaded,
        planId: loaded.id,
        isLoading: false,
        loadingStep: '',
        isQueueArchived: false,
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
        isQueueArchived: false,
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
      const loaded = await window.novelEngine.revision.loadPlan(bookSlug);
      set({
        plan: loaded,
        planId: loaded.id,
        isLoading: false,
        loadingStep: '',
        isQueueArchived: false,
        selectedSessionIds: new Set(loaded.sessions.map(s => s.id)),
        error: null,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), isLoading: false, loadingStep: '' });
    }
  },

  runNext: async () => {
    const { plan, planId, isRunning } = get();
    if (!plan || !planId || isRunning) return;
    const next = plan.sessions.find(s => s.status === 'pending');
    if (!next) return;
    const startedPlanId = planId;
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
      if (get().planId === startedPlanId) {
        set({ error: err instanceof Error ? err.message : String(err) });
      }
    } finally {
      if (get().planId === startedPlanId) {
        set({ isRunning: false, activeSessionId: null, streamingResponse: '', streamingThinking: '' });
      }
    }
  },

  runAll: async () => {
    const { planId, plan, selectedSessionIds, isRunning } = get();
    if (!planId || isRunning) return;
    const startedPlanId = planId;
    set({ isRunning: true });
    try {
      const sessionIds = plan?.mode === 'selective'
        ? Array.from(selectedSessionIds)
        : undefined;
      await window.novelEngine.revision.runAll(planId, sessionIds);
    } catch (err) {
      if (get().planId === startedPlanId) {
        set({ error: err instanceof Error ? err.message : String(err) });
      }
    } finally {
      if (get().planId === startedPlanId) {
        set({ isRunning: false });
      }
    }
  },

  runSession: async (sessionId: string) => {
    const { planId, isRunning } = get();
    if (!planId || isRunning) return;
    const startedPlanId = planId;
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
      if (get().planId === startedPlanId) {
        set({ error: err instanceof Error ? err.message : String(err) });
      }
    } finally {
      if (get().planId === startedPlanId) {
        set({ isRunning: false, activeSessionId: null, streamingResponse: '', streamingThinking: '' });
      }
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

  completeQueue: async () => {
    const { planId, plan } = get();
    if (!planId) return;
    set({ isArchiving: true, error: null });
    try {
      await window.novelEngine.revision.completeQueue(planId);
      // isQueueArchived will be set to true via the queue:archived event handler
      // Also clear the book cache so a fresh load happens next time
      if (plan?.bookSlug) {
        bookStateCache.delete(plan.bookSlug);
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), isArchiving: false });
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
      isArchiving: false,
      isQueueArchived: false,
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
