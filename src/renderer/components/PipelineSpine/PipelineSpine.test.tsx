import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import type { PipelinePhase, PipelinePhaseId, PhaseStatus } from '@domain/types';
import { PipelineSpine } from './PipelineSpine';
import { useBookStore } from '../../stores/bookStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useViewStore } from '../../stores/viewStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { makeBookSummary } from '../../../test/novelEngineMock';

// workspaceStore has cross-store subscriptions — register it last (S22 rule)
resetStoresBeforeEach(useBookStore, usePipelineStore, useViewStore, useWorkspaceStore);

function phase(id: string, status: PhaseStatus, agent: PipelinePhase['agent'] = null): PipelinePhase {
  return { id: id as PipelinePhaseId, label: `Label ${id}`, agent, status, description: '' };
}

const PHASES = [
  phase('pitch', 'complete', 'Spark'),
  phase('scaffold', 'active', 'Sable'),
  phase('first-draft', 'locked', 'Verity'),
  phase('query-agents', 'locked'),
];

function renderSpine(phases: PipelinePhase[] = PHASES) {
  return renderApp(<PipelineSpine />, {
    stores: [
      [
        useBookStore,
        {
          activeSlug: 'test-book',
          books: [makeBookSummary({ slug: 'test-book', title: 'Test Book' })],
          totalWordCount: 42000,
        },
      ],
      [usePipelineStore, { phases }],
    ],
  });
}

describe('PipelineSpine', () => {
  it('shows empty states without a book or pipeline', () => {
    renderApp(<PipelineSpine />);

    expect(screen.getByText('No book selected')).toBeInTheDocument();
    expect(screen.getByText('No pipeline yet')).toBeInTheDocument();
  });

  it('renders the book header with progress and staged phase nodes', () => {
    renderSpine();

    expect(screen.getByText('Test Book')).toBeInTheDocument();
    expect(screen.getByText('first-draft')).toBeInTheDocument(); // status chip
    expect(screen.getByText('42,000 w')).toBeInTheDocument();
    // scaffold (index 1) is the current phase of 4
    expect(screen.getByText('Phase 2 of 4')).toBeInTheDocument();

    // Stage headers only render around present phases; all five are static
    expect(screen.getByText('CONCEIVE')).toBeInTheDocument();
    expect(screen.getByText('DRAFT')).toBeInTheDocument();
    expect(screen.getByText('Label pitch')).toBeInTheDocument();
    expect(screen.getByText('Label scaffold')).toBeInTheDocument();
    // Agent chips
    expect(screen.getByText('Spark')).toBeInTheDocument();
    expect(screen.getByText('Sable')).toBeInTheDocument();
  });

  it('renders the current-phase action card with the contextual primary action', () => {
    renderSpine();
    expect(screen.getByRole('button', { name: /Open Scaffold/ })).toBeInTheDocument();
  });

  it('selecting a phase updates the workspace selection', () => {
    renderSpine();

    fireEvent.click(screen.getByText('Label first-draft'));

    expect(useWorkspaceStore.getState().selectedPhaseId).toBe('first-draft');
  });

  it('the query-agents phase navigates to the Query Manager instead', () => {
    renderSpine();

    fireEvent.click(screen.getByText('Label query-agents'));

    expect(useViewStore.getState().currentView).toBe('query-manager');
    expect(useWorkspaceStore.getState().selectedPhaseId).not.toBe('query-agents');
  });
});
