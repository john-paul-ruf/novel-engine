import { describe, it, expect } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { CompanionPane, openCompanionDoc } from './CompanionPane';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useBookStore } from '../../stores/bookStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useFileChangeStore } from '../../stores/fileChangeStore';
import { useViewStore } from '../../stores/viewStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';

resetStoresBeforeEach(
  useBookStore,
  useDashboardStore,
  useFileChangeStore,
  useViewStore,
  useWorkspaceStore,
);

describe('CompanionPane', () => {
  it('renders the five tabs with Chapter active by default', () => {
    renderApp(<CompanionPane />);

    for (const label of ['Chapter', 'Sources', 'Reports', 'Motifs', 'Explorer']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    // ChapterTab (no chapters) is the mounted default
    expect(
      screen.getByText('Chapters appear here as Verity drafts them.'),
    ).toBeInTheDocument();
    // Other tabs are not mounted until visited
    expect(screen.queryByText('No source documents yet.')).toBeNull();
  });

  it('switches tabs through the workspace store', () => {
    renderApp(<CompanionPane />);

    fireEvent.click(screen.getByRole('button', { name: 'Sources' }));

    expect(useWorkspaceStore.getState().companionTab).toBe('sources');
    expect(screen.getByText('No source documents yet.')).toBeInTheDocument();
  });

  it('keeps visited tabs mounted (hidden) when switching away', () => {
    renderApp(<CompanionPane />);

    fireEvent.click(screen.getByRole('button', { name: 'Sources' }));
    const sourcesEmpty = screen.getByText('No source documents yet.');

    fireEvent.click(screen.getByRole('button', { name: 'Chapter' }));

    // Still in the DOM, wrapped in a hidden pane
    expect(sourcesEmpty).toBeInTheDocument();
    expect(sourcesEmpty.closest('.hidden')).not.toBeNull();
    expect(
      screen.getByText('Chapters appear here as Verity drafts them.'),
    ).toBeInTheDocument();
  });

  it('routes source docs to the Sources tab via openCompanionDoc', () => {
    renderApp(<CompanionPane />);

    act(() => {
      openCompanionDoc('source/pitch.md');
    });

    expect(useWorkspaceStore.getState().companionTab).toBe('sources');
    const pitchChip = screen.getByRole('button', { name: 'Pitch' });
    expect(pitchChip.className).toContain('border-ne-brass/60'); // selected styling
  });

  it('routes report docs to the Reports tab via openCompanionDoc', () => {
    renderApp(<CompanionPane />);

    act(() => {
      openCompanionDoc('source/dev-report.md');
    });

    expect(useWorkspaceStore.getState().companionTab).toBe('reports');
    // Reports viewer opens on the requested report
    expect(screen.getByText('Dev Report')).toBeInTheDocument();
  });
});
