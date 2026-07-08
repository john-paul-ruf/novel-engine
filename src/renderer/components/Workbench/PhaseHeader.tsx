import { useEffect, useState } from 'react';
import type { PipelinePhase, PipelinePhaseId } from '@domain/types';
import { AGENT_REGISTRY, PHASE_OUTPUT_FILES } from '@domain/constants';
import { useBookStore } from '../../stores/bookStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { agentColor } from '../common/agentColors';
import { Icon } from '../common/Icon';
import { usePhaseAction } from '../PipelineSpine/usePhaseAction';
import { openCompanionDoc } from './CompanionPane';

/**
 * Key INPUT artifacts for phases whose outputs aren't single files.
 * All other phases show their completion outputs from PHASE_OUTPUT_FILES.
 */
const PHASE_INPUT_ARTIFACTS: Partial<Record<PipelinePhaseId, string[]>> = {
  'first-draft': ['source/voice-profile.md', 'source/scene-outline.md', 'source/story-bible.md'],
  revision: ['source/project-tasks.md', 'source/revision-prompts.md'],
  'mechanical-fixes': ['source/project-tasks.md', 'source/revision-prompts.md'],
};

function artifactsForPhase(id: PipelinePhaseId): string[] {
  return (PHASE_INPUT_ARTIFACTS[id] ?? PHASE_OUTPUT_FILES[id] ?? []).slice(0, 4);
}

const PRIMARY_BTN_CLASS =
  'flex items-center justify-center gap-2 rounded-[7px] bg-gradient-to-b from-ne-brass-hi to-ne-brass px-3.5 py-[7px] text-xs font-semibold text-ne-bg0 transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Workbench header strip: phase identity (left), artifact chips (center),
 * contextual primary action (right — shared with the spine card via
 * usePhaseAction, so behavior is identical).
 */
export function PhaseHeader({ phase }: { phase: PipelinePhase | null }): React.ReactElement {
  const activeSlug = useBookStore((s) => s.activeSlug);
  const phases = usePipelineStore((s) => s.phases);
  const selectPhase = useWorkspaceStore((s) => s.selectPhase);
  const [artifacts, setArtifacts] = useState<{ path: string; exists: boolean }[]>([]);

  const currentPhase =
    phases.find((p) => p.status === 'active' || p.status === 'pending-completion') ?? null;
  const isCurrent = phase !== null && currentPhase?.id === phase.id;

  // Only the CURRENT phase gets the live action (identical to the spine card).
  const action = usePhaseAction(isCurrent ? phase : null, activeSlug);

  const phaseId = phase?.id ?? null;
  const phaseStatus = phase?.status ?? null;

  useEffect(() => {
    if (!phaseId || !activeSlug) {
      setArtifacts([]);
      return;
    }
    const files = artifactsForPhase(phaseId);
    if (files.length === 0) {
      setArtifacts([]);
      return;
    }
    let cancelled = false;
    Promise.all(
      files.map(async (path) => ({
        path,
        exists: await window.novelEngine.files.exists(activeSlug, path).catch(() => false),
      })),
    ).then((states) => {
      if (!cancelled) setArtifacts(states);
    });
    return () => {
      cancelled = true;
    };
  }, [phaseId, phaseStatus, activeSlug]);

  const agentMeta = phase?.agent ? AGENT_REGISTRY[phase.agent] : null;

  return (
    <div
      data-tour="phase-header"
      className="flex shrink-0 items-center gap-3.5 border-b border-ne-line bg-ne-bg1 px-[18px] py-3"
    >
      {/* Phase identity */}
      <div className="min-w-0 shrink-0">
        <div className="truncate font-ne-serif text-[17px] font-medium text-ne-ink">
          {phase?.label ?? 'Workspace'}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ne-ink-dim">
          {phase?.agent ? (
            <>
              <span
                className="inline-block h-[7px] w-[7px] rounded-full"
                style={{ background: agentColor(phase.agent) }}
              />
              {phase.agent} — {agentMeta?.role}
            </>
          ) : phase ? (
            'Manual step'
          ) : (
            'Select a phase'
          )}
        </div>
      </div>

      {/* Artifact chips — click opens the doc in the companion pane */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-1.5">
        {artifacts.map((artifact) => {
          const name = artifact.path.split('/').pop() ?? artifact.path;
          return (
            <button
              key={artifact.path}
              onClick={artifact.exists ? () => openCompanionDoc(artifact.path) : undefined}
              disabled={!artifact.exists}
              title={
                artifact.exists
                  ? `${artifact.path} — open in the companion pane`
                  : `${artifact.path} — not written yet`
              }
              className={`flex items-center gap-1.5 rounded-md border border-ne-line bg-ne-bg2 px-2 py-[3px] font-ne-mono text-[10px] ${
                artifact.exists
                  ? 'text-ne-ink-dim transition-colors hover:border-ne-brass/50 hover:text-ne-ink'
                  : 'cursor-default text-ne-ink-faint opacity-70'
              }`}
            >
              {artifact.exists && (
                <Icon name="check" size={10} strokeWidth={2.4} className="text-ne-lumen" />
              )}
              {name}
            </button>
          );
        })}
      </div>

      {/* Primary action */}
      <div className="flex shrink-0 items-center gap-2">
        {action.error && (
          <span className="max-w-[180px] truncate text-[10px] text-ne-sable" title={action.error}>
            {action.error}
          </span>
        )}
        {isCurrent && action.primary ? (
          <button
            className={PRIMARY_BTN_CLASS}
            onClick={action.primary.onClick}
            disabled={action.busy}
          >
            {action.primary.icon && (
              <Icon name={action.primary.icon} size={11} strokeWidth={2.4} />
            )}
            {action.busy ? 'Building…' : action.primary.label}
          </button>
        ) : phase && currentPhase ? (
          <button
            onClick={() => selectPhase(currentPhase.id)}
            className="rounded-[7px] border border-ne-line px-3 py-[6px] text-[11px] font-medium text-ne-ink-dim transition-colors hover:border-ne-brass/50 hover:text-ne-ink"
          >
            Go to current phase
          </button>
        ) : null}
      </div>
    </div>
  );
}
