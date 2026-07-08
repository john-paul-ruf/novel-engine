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
  selectPhase: (id: string) => void;
  setCompanionTab: (tab: CompanionTab) => void;
};

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  selectedPhaseId: null,
  companionTab: 'chapter',
  selectPhase: (id: string) => set({ selectedPhaseId: id }),
  setCompanionTab: (tab: CompanionTab) => set({ companionTab: tab }),
}));

// ─── Cross-store subscriptions ───────────────────────────────────────────────

// Switching books clears the selection so the new book's current phase is adopted.
useBookStore.subscribe((state, prev) => {
  if (state.activeSlug !== prev.activeSlug) {
    useWorkspaceStore.setState({ selectedPhaseId: null });
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
    useWorkspaceStore.setState({ selectedPhaseId: phaseId });
  }
});
