import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import type { PipelinePhase } from '@domain/types';
import { PIPELINE_PHASES } from '@domain/constants';
import { WorkspaceView } from './WorkspaceView';
import { useBookStore } from '../../stores/bookStore';
import { useChatStore } from '../../stores/chatStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useFileChangeStore } from '../../stores/fileChangeStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useViewStore } from '../../stores/viewStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';

resetStoresBeforeEach(
  useBookStore,
  useChatStore,
  useDashboardStore,
  useFileChangeStore,
  usePipelineStore,
  useSettingsStore,
  useViewStore,
  useWorkspaceStore,
);

/** Full pipeline with everything before `activeIdx` complete, after it locked. */
function makePhases(activeIdx: number): PipelinePhase[] {
  return PIPELINE_PHASES.map((def, i) => ({
    id: def.id,
    label: def.label,
    agent: def.agent,
    description: def.description,
    status: i < activeIdx ? 'complete' : i === activeIdx ? 'active' : 'locked',
  }));
}

describe('WorkspaceView', () => {
  it('shows the no-book hint when no pipeline is loaded', () => {
    renderApp(<WorkspaceView />);

    expect(screen.getByText('Select a book in the Library to begin')).toBeInTheDocument();
    // Header falls back to its idle identity
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Select a phase')).toBeInTheDocument();
  });

  it('shows the locked-phase card with the unlock hint', () => {
    const phases = makePhases(0); // pitch active, scaffold locked
    renderApp(<WorkspaceView />, {
      stores: [
        [usePipelineStore, { phases }],
        [useWorkspaceStore, { selectedPhaseId: 'scaffold' }],
      ],
    });

    expect(screen.getByText(phases[1].description)).toBeInTheDocument();
    expect(screen.getByText('Unlocks after Story Pitch')).toBeInTheDocument();
    // The chat/companion split is not mounted for locked phases
    expect(screen.queryByRole('button', { name: 'Sources' })).toBeNull();
  });

  it('mounts the chat ‖ companion split for an unlocked phase', () => {
    renderApp(<WorkspaceView />, {
      stores: [
        [usePipelineStore, { phases: makePhases(1) }], // scaffold active
        [useWorkspaceStore, { selectedPhaseId: 'scaffold' }],
      ],
    });

    // ChatPane empty state (no conversations seeded)
    expect(screen.getByText('No conversation for this phase yet')).toBeInTheDocument();
    // CompanionPane tab bar
    expect(screen.getByRole('button', { name: 'Sources' })).toBeInTheDocument();
    // Phase identity in the header (Verity appears in header + spine)
    expect(screen.getAllByText(/Verity — Ghostwriter/).length).toBeGreaterThan(0);
  });
});
