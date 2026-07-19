import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import type { PipelinePhase, PipelinePhaseId } from '@domain/types';
import { PIPELINE_PHASES } from '@domain/constants';
import { PhaseHeader } from './PhaseHeader';
import { useAutoDraftStore } from '../../stores/autoDraftStore';
import { useBookStore } from '../../stores/bookStore';
import { useChatStore } from '../../stores/chatStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useRevisionQueueStore } from '../../stores/revisionQueueStore';
import { useViewStore } from '../../stores/viewStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';

resetStoresBeforeEach(
  useAutoDraftStore,
  useBookStore,
  useChatStore,
  useDashboardStore,
  usePipelineStore,
  useRevisionQueueStore,
  useViewStore,
  useWorkspaceStore,
);

function phaseOf(id: PipelinePhaseId, status: PipelinePhase['status']): PipelinePhase {
  const def = PIPELINE_PHASES.find((p) => p.id === id);
  if (!def) throw new Error(`unknown phase ${id}`);
  return { id: def.id, label: def.label, agent: def.agent, description: def.description, status };
}

describe('PhaseHeader', () => {
  it('renders the idle identity without a phase', () => {
    renderApp(<PhaseHeader phase={null} />);
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Select a phase')).toBeInTheDocument();
  });

  it('shows phase label with agent identity', () => {
    renderApp(<PhaseHeader phase={phaseOf('first-draft', 'active')} />, {
      stores: [[useBookStore, { activeSlug: 'book-a' }]],
    });

    expect(screen.getByText('First Draft')).toBeInTheDocument();
    expect(screen.getByText(/Verity — Ghostwriter/)).toBeInTheDocument();
  });

  it('renders artifact chips — existing ones clickable, missing ones disabled', async () => {
    const exists = vi.fn(
      async (_slug: string, path: string) => path === 'source/voice-profile.md',
    );
    renderApp(<PhaseHeader phase={phaseOf('first-draft', 'active')} />, {
      stores: [[useBookStore, { activeSlug: 'book-a' }]],
      bridge: { files: { exists } },
    });

    const voiceChip = await screen.findByRole('button', { name: /voice-profile\.md/ });
    expect(voiceChip).toBeEnabled();

    const outlineChip = screen.getByRole('button', { name: 'scene-outline.md' });
    expect(outlineChip).toBeDisabled();
    expect(outlineChip).toHaveAttribute(
      'title',
      'source/scene-outline.md — not written yet',
    );

    // Clicking an existing artifact routes it to the companion pane
    fireEvent.click(voiceChip);
    expect(useWorkspaceStore.getState().companionTab).toBe('sources');
  });

  it('offers the voice-setup quick action while the voice profile is missing', async () => {
    renderApp(<PhaseHeader phase={phaseOf('first-draft', 'active')} />, {
      stores: [[useBookStore, { activeSlug: 'book-a' }]],
    });

    expect(
      await screen.findByRole('button', { name: /Set Up Voice Profile/ }),
    ).toBeInTheDocument();
  });

  it('offers the Hot Take quick action on assess-stage phases', () => {
    renderApp(<PhaseHeader phase={phaseOf('first-read', 'active')} />, {
      stores: [[useBookStore, { activeSlug: 'book-a' }]],
    });

    expect(screen.getByRole('button', { name: /Hot Take/ })).toBeInTheDocument();
  });

  it('navigates back to the current phase from a non-current phase', () => {
    renderApp(<PhaseHeader phase={phaseOf('pitch', 'complete')} />, {
      stores: [
        [useBookStore, { activeSlug: 'book-a' }],
        [
          usePipelineStore,
          { phases: [phaseOf('pitch', 'complete'), phaseOf('scaffold', 'active')] },
        ],
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Go to current phase' }));
    expect(useWorkspaceStore.getState().selectedPhaseId).toBe('scaffold');
  });

  it('Mark done is a two-click arm-to-confirm that completes the phase', () => {
    const markPhaseComplete = vi.fn(async () => undefined);
    renderApp(<PhaseHeader phase={phaseOf('first-read', 'active')} />, {
      stores: [
        [useBookStore, { activeSlug: 'book-a' }],
        [
          usePipelineStore,
          { phases: [phaseOf('first-read', 'active')], markPhaseComplete },
        ],
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }));
    expect(markPhaseComplete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Mark done?' }));
    expect(markPhaseComplete).toHaveBeenCalledWith('book-a', 'first-read');
  });

  it('Revert here is a two-click arm-to-confirm on completed phases', () => {
    const revertPhase = vi.fn(async () => undefined);
    renderApp(<PhaseHeader phase={phaseOf('pitch', 'complete')} />, {
      stores: [
        [useBookStore, { activeSlug: 'book-a' }],
        [
          usePipelineStore,
          { phases: [phaseOf('pitch', 'complete'), phaseOf('scaffold', 'active')], revertPhase },
        ],
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: '← Revert here' }));
    expect(revertPhase).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Revert here?' }));
    expect(revertPhase).toHaveBeenCalledWith('book-a', 'pitch');
  });
});
