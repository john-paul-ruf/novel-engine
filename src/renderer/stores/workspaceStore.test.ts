import { describe, it, expect, beforeEach } from 'vitest';
import type { PipelinePhase, PipelinePhaseId } from '@domain/types';
import { useWorkspaceStore, openConversationInWorkspace } from './workspaceStore';
import { useBookStore } from './bookStore';
import { usePipelineStore } from './pipelineStore';
import { useViewStore } from './viewStore';
import { installNovelEngineMock } from '../../test/novelEngineMock';
import { resetStoresBeforeEach } from '../../test/resetStores';

// workspaceStore last: restoring bookStore/pipelineStore/viewStore fires the
// cross-store subscriptions, which may write into workspaceStore.
resetStoresBeforeEach(useBookStore, usePipelineStore, useViewStore, useWorkspaceStore);

beforeEach(() => {
  installNovelEngineMock();
});

function phase(id: PipelinePhaseId): PipelinePhase {
  return { id, label: id, agent: 'Spark', status: 'active', description: '' };
}

describe('workspaceStore', () => {
  it('selectPhase sets the phase and clears any ad-hoc conversation', () => {
    useWorkspaceStore.getState().setAdhocConversation('conv-1');
    useWorkspaceStore.getState().selectPhase('scaffold');

    expect(useWorkspaceStore.getState().selectedPhaseId).toBe('scaffold');
    expect(useWorkspaceStore.getState().adhocConversationId).toBeNull();
  });

  it('setCompanionTab switches the companion pane tab', () => {
    expect(useWorkspaceStore.getState().companionTab).toBe('chapter');
    useWorkspaceStore.getState().setCompanionTab('motifs');
    expect(useWorkspaceStore.getState().companionTab).toBe('motifs');
  });

  it('setAdhocConversation sets and clears the ad-hoc conversation', () => {
    useWorkspaceStore.getState().setAdhocConversation('conv-9');
    expect(useWorkspaceStore.getState().adhocConversationId).toBe('conv-9');
    useWorkspaceStore.getState().setAdhocConversation(null);
    expect(useWorkspaceStore.getState().adhocConversationId).toBeNull();
  });

  it('openConversationInWorkspace routes the conversation and navigates to the workspace', () => {
    openConversationInWorkspace('conv-7');

    expect(useWorkspaceStore.getState().adhocConversationId).toBe('conv-7');
    expect(useViewStore.getState().currentView).toBe('workspace');
  });

  describe('cross-store subscriptions', () => {
    it('switching books clears the phase selection and ad-hoc conversation', () => {
      useWorkspaceStore.getState().selectPhase('pitch');
      useWorkspaceStore.getState().setAdhocConversation('conv-1');

      useBookStore.setState({ activeSlug: 'another-book' });

      expect(useWorkspaceStore.getState().selectedPhaseId).toBeNull();
      expect(useWorkspaceStore.getState().adhocConversationId).toBeNull();
    });

    it('adopts the pipeline active phase when a book pipeline loads and nothing is selected', () => {
      usePipelineStore.setState({ displayedSlug: 'book-a', activePhase: phase('pitch') });

      expect(useWorkspaceStore.getState().selectedPhaseId).toBe('pitch');
    });

    it('keeps an existing selection when the displayed pipeline changes book', () => {
      useWorkspaceStore.getState().selectPhase('scaffold');

      usePipelineStore.setState({ displayedSlug: 'book-b', activePhase: phase('first-draft') });

      expect(useWorkspaceStore.getState().selectedPhaseId).toBe('scaffold');
    });

    it('follows a phase advancement when the user was on the previously active phase', () => {
      usePipelineStore.setState({ displayedSlug: 'book-a', activePhase: phase('pitch') });
      expect(useWorkspaceStore.getState().selectedPhaseId).toBe('pitch');

      // Same book, pipeline advances: selection follows
      usePipelineStore.setState({ activePhase: phase('scaffold') });

      expect(useWorkspaceStore.getState().selectedPhaseId).toBe('scaffold');
    });

    it('keeps the selection on advancement when the user selected a different phase', () => {
      usePipelineStore.setState({ displayedSlug: 'book-a', activePhase: phase('pitch') });
      useWorkspaceStore.getState().selectPhase('first-draft');

      usePipelineStore.setState({ activePhase: phase('scaffold') });

      expect(useWorkspaceStore.getState().selectedPhaseId).toBe('first-draft');
    });

    it('adopts a deep-linked phase when navigating to the workspace with a phaseId', () => {
      useWorkspaceStore.getState().selectPhase('pitch');
      useWorkspaceStore.getState().setAdhocConversation('conv-1');

      useViewStore.getState().navigate('workspace', { phaseId: 'copy-edit' });

      expect(useWorkspaceStore.getState().selectedPhaseId).toBe('copy-edit');
      expect(useWorkspaceStore.getState().adhocConversationId).toBeNull();
    });

    it('ignores a phaseId payload when navigating to a non-workspace view', () => {
      useWorkspaceStore.getState().selectPhase('pitch');

      useViewStore.getState().navigate('library', { phaseId: 'copy-edit' });

      expect(useWorkspaceStore.getState().selectedPhaseId).toBe('pitch');
    });
  });
});
