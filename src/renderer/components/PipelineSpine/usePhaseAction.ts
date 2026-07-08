import { useEffect, useState } from 'react';
import type { PipelinePhase } from '@domain/types';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useViewStore } from '../../stores/viewStore';
import { useChatStore } from '../../stores/chatStore';
import { useAutoDraftStore } from '../../stores/autoDraftStore';
import { useRevisionQueueStore } from '../../stores/revisionQueueStore';
import { useDashboardStore } from '../../stores/dashboardStore';

/** Contextual primary-action labels per phase (visual contract: mock spine). */
const PHASE_ACTION_LABELS: Record<string, string> = {
  pitch: 'Revisit Pitch',
  scaffold: 'Open Scaffold',
  'first-draft': 'Continue Auto Draft',
  'first-read': 'Start First Read',
  'first-assessment': 'Run Assessment',
  'revision-plan-1': 'Build Revision Plan',
  revision: 'Start Revision',
  'second-read': 'Start Second Read',
  'second-assessment': 'Run Assessment',
  'copy-edit': 'Start Copy Edit',
  'revision-plan-2': 'Plan Fixes',
  'mechanical-fixes': 'Apply Fixes',
  build: 'Run Build',
  publish: 'Run Audit',
};

const REVISION_QUEUE_PHASES: ReadonlySet<string> = new Set(['revision', 'mechanical-fixes']);

export type PhaseActionState = {
  /** The contextual primary action for the phase, or null when phase is null. */
  primary: { label: string; icon?: 'play' | 'check'; onClick: () => void } | null;
  /** Micro-progress row (auto draft / revision tasks / gate hint), if any. */
  micro: { label: string; value: string } | null;
  error: string | null;
  /** True while a pre-Quill build is running. */
  busy: boolean;
  confirming: 'stop' | 'complete-revision' | null;
  isPending: boolean;
  isFirstDraft: boolean;
  isRevisionQueuePhase: boolean;
  autoDraftRunning: boolean;
  stopAutoDraft: () => void;
  completeRevisionAction: () => void;
  openRevisionQueue: () => void;
};

/**
 * The PipelineTracker trigger logic (Auto Draft, confirm gate, revision queue,
 * build, Quill) as one hook — shared by the spine's current-phase card (S07)
 * and the workbench phase header (S08).
 */
export function usePhaseAction(
  phase: PipelinePhase | null,
  activeSlug: string,
): PhaseActionState {
  const { confirmPhaseAdvancement, completeRevision } = usePipelineStore();
  const autoDraftSession = useAutoDraftStore((s) =>
    activeSlug ? s.sessions[activeSlug] ?? null : null,
  );
  const { start: autoDraftStart, stop: autoDraftStop, resume: autoDraftResume } = useAutoDraftStore();
  const dashboardData = useDashboardStore((s) => s.data);

  const [hasRevisionPlan, setHasRevisionPlan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<'stop' | 'complete-revision' | null>(null);

  const phaseId = phase?.id ?? null;
  const phaseStatus = phase?.status ?? null;

  useEffect(() => {
    if (!activeSlug || !phaseId) {
      setHasRevisionPlan(false);
      return;
    }
    Promise.all([
      window.novelEngine.files.exists(activeSlug, 'source/project-tasks.md'),
      window.novelEngine.files.exists(activeSlug, 'source/revision-prompts.md'),
    ]).then(([hasTasks, hasPrompts]) => {
      setHasRevisionPlan(hasTasks || hasPrompts);
    });
  }, [activeSlug, phaseId, phaseStatus]);

  const showError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 6000);
  };

  /** First click arms the confirmation; it auto-cancels after 4s. */
  const arm = (kind: 'stop' | 'complete-revision') => {
    setConfirming(kind);
    setTimeout(() => setConfirming((prev) => (prev === kind ? null : prev)), 4000);
  };

  const openConversation = async () => {
    if (!phase?.agent) return;
    const { conversations, createConversation, setActiveConversation } = useChatStore.getState();
    const existing = conversations.find(
      (c) => c.agentName === phase.agent && c.pipelinePhase === phase.id,
    );
    if (existing) {
      await setActiveConversation(existing.id);
    } else {
      await createConversation(phase.agent, activeSlug, phase.id);
    }
    // Phase-tagged conversation — the workspace chat pane picks it up.
    useViewStore.getState().navigate('workspace', { phaseId: phase.id });
  };

  /**
   * Same guard as PipelineTracker: auto-run the build before opening Quill
   * if the dist artifacts are missing.
   */
  const ensureBuildForQuill = async (): Promise<boolean> => {
    try {
      const exists = await window.novelEngine.files.exists(activeSlug, `dist/${activeSlug}.md`);
      if (exists) return true;
    } catch {
      // If the existence check fails, proceed — the build surfaces any real error
    }
    setBusy(true);
    try {
      const result = await window.novelEngine.build.run(activeSlug);
      const allFailed = result.formats.length > 0 && result.formats.every((f) => !!f.error);
      if (allFailed) {
        showError('Build failed — check the build output for details.');
        return false;
      }
      return true;
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Build failed');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmAdvance = async () => {
    if (!phase) return;
    try {
      await confirmPhaseAdvancement(activeSlug, phase.id);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const completeRevisionAction = () => {
    if (confirming !== 'complete-revision') {
      arm('complete-revision');
      return;
    }
    setConfirming(null);
    completeRevision(activeSlug).catch((err: unknown) => {
      showError(err instanceof Error ? err.message : 'Unknown error');
    });
  };

  const stopAutoDraft = () => {
    if (confirming !== 'stop') {
      arm('stop');
      return;
    }
    setConfirming(null);
    autoDraftStop(activeSlug);
  };

  const openRevisionQueue = () => {
    const { isRunning } = useRevisionQueueStore.getState();
    if (!isRunning) {
      useRevisionQueueStore.setState({ plan: null, planId: null, error: null });
    }
    useRevisionQueueStore.getState().openModal(activeSlug);
  };

  const handlePrimaryAction = async () => {
    if (!phase) return;
    if (phase.id === 'build') {
      useViewStore.getState().navigate('exports');
      return;
    }
    if (phase.id === 'publish') {
      const ready = await ensureBuildForQuill();
      if (!ready) return;
    }
    await openConversation();
  };

  const isPending = phaseStatus === 'pending-completion';
  const isFirstDraft = phaseId === 'first-draft';
  const isRevisionQueuePhase =
    phaseId !== null && REVISION_QUEUE_PHASES.has(phaseId) && hasRevisionPlan;
  const autoDraftRunning = autoDraftSession?.isRunning ?? false;
  const autoDraftPaused = autoDraftSession?.isPaused ?? false;
  const revisionTasks =
    isRevisionQueuePhase && dashboardData?.bookSlug === activeSlug
      ? dashboardData.revisionTasks
      : null;

  // Micro-progress row content
  let micro: { label: string; value: string } | null = null;
  if (isFirstDraft && autoDraftPaused) {
    micro = {
      label: 'Auto Draft paused',
      value: autoDraftSession?.pauseReason?.slice(0, 32) ?? 'CLI error',
    };
  } else if (isFirstDraft && autoDraftRunning) {
    micro = {
      label: autoDraftSession?.stageLabel ?? 'Auto Draft running',
      value: `${autoDraftSession?.chaptersWritten ?? 0} chapters`,
    };
  } else if (revisionTasks && revisionTasks.total > 0) {
    micro = {
      label: 'Revision tasks',
      value: `${revisionTasks.completed} / ${revisionTasks.total} done`,
    };
  } else if (isPending) {
    micro = { label: 'Agent finished', value: 'ready to advance' };
  }

  // Primary button
  let primary: PhaseActionState['primary'] = null;
  if (phase) {
    if (isPending) {
      primary = { label: 'Confirm & advance', icon: 'check', onClick: () => void handleConfirmAdvance() };
    } else if (isFirstDraft) {
      if (autoDraftRunning) {
        primary = {
          label: confirming === 'stop' ? 'Confirm stop?' : 'Stop Auto Draft',
          onClick: stopAutoDraft,
        };
      } else if (autoDraftPaused) {
        primary = { label: 'Retry Auto Draft', icon: 'play', onClick: () => autoDraftResume(activeSlug) };
      } else {
        primary = { label: 'Start Auto Draft', icon: 'play', onClick: () => autoDraftStart(activeSlug) };
      }
    } else if (isRevisionQueuePhase) {
      primary = { label: 'Open Revision Queue', icon: 'play', onClick: openRevisionQueue };
    } else {
      primary = {
        label: PHASE_ACTION_LABELS[phase.id] ?? 'Open conversation',
        icon: 'play',
        onClick: () => void handlePrimaryAction(),
      };
    }
  }

  return {
    primary,
    micro,
    error,
    busy,
    confirming,
    isPending,
    isFirstDraft,
    isRevisionQueuePhase,
    autoDraftRunning,
    stopAutoDraft,
    completeRevisionAction,
    openRevisionQueue,
  };
}
