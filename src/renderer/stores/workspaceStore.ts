import { create } from 'zustand';
import { useBookStore } from './bookStore';
import { usePipelineStore } from './pipelineStore';
import { useViewStore } from './viewStore';

export type CompanionTab = 'chapter' | 'sources' | 'reports' | 'motifs' | 'explorer';

type WorkspaceState = {
  /** The phase whose workbench is shown. Null until a book's pipeline loads. */
  selectedPhaseId: string | null;
  /** Active tab in the workbench companion pane (S09/S10). */
  companionTab: CompanionTab;
  /**
   * When set, the workbench chat pane shows this conversation instead of the
   * selected phase's conversations (hot takes, chapter deep dives, ad-hoc
   * Spark sessions — conversations without a `pipelinePhase` tag).
   * Cleared by selecting a phase, switching books, or dismissing the banner.
   */
  adhocConversationId: string | null;
  selectPhase: (id: string) => void;
  setCompanionTab: (tab: CompanionTab) => void;
  setAdhocConversation: (conversationId: string | null) => void;
};

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  selectedPhaseId: null,
  companionTab: 'chapter',
  adhocConversationId: null,
  selectPhase: (id: string) => set({ selectedPhaseId: id, adhocConversationId: null }),
  setCompanionTab: (tab: CompanionTab) => set({ companionTab: tab }),
  setAdhocConversation: (conversationId: string | null) =>
    set({ adhocConversationId: conversationId }),
}));

/**
 * Land an untagged (ad-hoc) conversation in the workspace chat pane.
 * The conversation must already be active in chatStore — this only routes
 * the UI. Replaces the legacy `navigate('chat')` destination.
 */
export function openConversationInWorkspace(conversationId: string): void {
  useWorkspaceStore.setState({ adhocConversationId: conversationId });
  useViewStore.getState().navigate('workspace');
}

// ─── Cross-store subscriptions ───────────────────────────────────────────────

// Switching books clears the selection so the new book's current phase is adopted.
useBookStore.subscribe((state, prev) => {
  if (state.activeSlug !== prev.activeSlug) {
    useWorkspaceStore.setState({ selectedPhaseId: null, adhocConversationId: null });
  }
});

// Adopt the pipeline's current phase: when nothing is selected yet, or when the
// pipeline advances past the phase the user was following (confirm & advance).
usePipelineStore.subscribe((state, prev) => {
  if (!state.activePhase) return;
  const { selectedPhaseId } = useWorkspaceStore.getState();

  if (state.displayedSlug !== prev.displayedSlug) {
    if (selectedPhaseId === null) {
      useWorkspaceStore.setState({ selectedPhaseId: state.activePhase.id });
    }
    return;
  }

  if (state.activePhase.id !== prev.activePhase?.id) {
    if (selectedPhaseId === null || selectedPhaseId === prev.activePhase?.id) {
      useWorkspaceStore.setState({ selectedPhaseId: state.activePhase.id });
    }
  }
});

// Deep links: navigateToPhase(...) → navigate('workspace', { phaseId }).
useViewStore.subscribe((state, prev) => {
  if (state.currentView !== 'workspace') return;
  const phaseId = state.payload.phaseId;
  if (!phaseId) return;
  if (prev.currentView !== 'workspace' || prev.payload.phaseId !== phaseId) {
    useWorkspaceStore.setState({ selectedPhaseId: phaseId, adhocConversationId: null });
  }
});
