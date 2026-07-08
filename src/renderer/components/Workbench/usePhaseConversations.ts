import { useCallback, useEffect, useMemo } from 'react';
import type { Conversation } from '@domain/types';
import { PIPELINE_PHASES } from '@domain/constants';
import { useBookStore } from '../../stores/bookStore';
import { useChatStore } from '../../stores/chatStore';
import { useViewStore } from '../../stores/viewStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';

type PhaseConversations = {
  /** This phase's conversations for the active book, most recent first. */
  conversations: Conversation[];
  /** chatStore's active conversation IF it belongs to this phase, else null. */
  activeConversation: Conversation | null;
  selectConversation: (conversationId: string) => Promise<void>;
  /** Start a fresh conversation with this phase's agent, tagged to the phase. */
  createConversation: () => Promise<void>;
};

/**
 * Phase-scoped conversation access for the workbench.
 *
 * Conversations ARE phase-tagged (`Conversation.pipelinePhase`), so scoping is
 * by agent + phase — the same match PipelineTracker used. chatStore already
 * holds only the active book's conversations.
 *
 * While the workspace view is active, selecting a phase auto-activates its
 * most recent conversation (replaces Dashboard's "Resume Chat").
 */
export function usePhaseConversations(phaseId: string | null): PhaseConversations {
  const activeSlug = useBookStore((s) => s.activeSlug);
  const allConversations = useChatStore((s) => s.conversations);
  const chatActive = useChatStore((s) => s.activeConversation);
  const isWorkspaceActive = useViewStore((s) => s.currentView === 'workspace');

  const phaseDef = useMemo(
    () => PIPELINE_PHASES.find((p) => p.id === phaseId) ?? null,
    [phaseId],
  );

  const conversations = useMemo(() => {
    if (!phaseDef?.agent) return [];
    return allConversations
      .filter((c) => c.agentName === phaseDef.agent && c.pipelinePhase === phaseDef.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [allConversations, phaseDef]);

  const activeConversation =
    chatActive && conversations.some((c) => c.id === chatActive.id) ? chatActive : null;

  // Auto-activate the most recent matching conversation — only while the
  // workspace is the current view, and never while an ad-hoc conversation
  // (hot take / deep dive / Spark) holds the chat pane.
  const adhocConversationId = useWorkspaceStore((s) => s.adhocConversationId);
  useEffect(() => {
    if (!isWorkspaceActive || adhocConversationId !== null || conversations.length === 0) return;
    const { activeConversation: current, setActiveConversation } = useChatStore.getState();
    if (current && conversations.some((c) => c.id === current.id)) return;
    void setActiveConversation(conversations[0].id);
  }, [isWorkspaceActive, adhocConversationId, phaseId, conversations]);

  const selectConversation = useCallback(async (conversationId: string) => {
    await useChatStore.getState().setActiveConversation(conversationId);
  }, []);

  const createConversation = useCallback(async () => {
    if (!phaseDef?.agent || !activeSlug) return;
    await useChatStore.getState().createConversation(phaseDef.agent, activeSlug, phaseDef.id);
  }, [phaseDef, activeSlug]);

  return { conversations, activeConversation, selectConversation, createConversation };
}
