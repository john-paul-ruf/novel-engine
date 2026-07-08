import type { PipelinePhase } from '@domain/types';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { PipelineSpine } from '../PipelineSpine/PipelineSpine';
import { PhaseHeader } from './PhaseHeader';
import { usePhaseConversations } from './usePhaseConversations';

/** Quiet card shown when the selected phase is still locked. */
function LockedPhaseCard({
  phase,
  previousLabel,
}: {
  phase: PipelinePhase;
  previousLabel: string | null;
}): React.ReactElement {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-sm rounded-[13px] border border-ne-line bg-ne-bg1 p-6 text-center">
        <div className="font-ne-serif text-lg text-ne-ink">{phase.label}</div>
        {phase.agent && <div className="mt-1 text-xs text-ne-ink-dim">{phase.agent}</div>}
        <p className="mt-3 text-sm leading-relaxed text-ne-ink-dim">{phase.description}</p>
        {previousLabel && (
          <div className="mt-4 text-xs font-medium text-ne-ink-faint">
            Unlocks after {previousLabel}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The Workspace view: PipelineSpine (left) + workbench column (right).
 * The workbench body is a temporary panel — the split chat/companion
 * arrives in SESSION-09.
 */
export function WorkspaceView(): React.ReactElement {
  const phases = usePipelineStore((s) => s.phases);
  const selectedPhaseId = useWorkspaceStore((s) => s.selectedPhaseId);

  const selectedPhase = phases.find((p) => p.id === selectedPhaseId) ?? null;
  const selectedIdx = selectedPhase ? phases.findIndex((p) => p.id === selectedPhase.id) : -1;
  const previousLabel = selectedIdx > 0 ? phases[selectedIdx - 1].label : null;

  // Phase↔conversation wiring: activates the phase's latest conversation
  // while the workspace is open. Locked phases don't activate anything.
  usePhaseConversations(
    selectedPhase && selectedPhase.status !== 'locked' ? selectedPhase.id : null,
  );

  return (
    <div className="flex h-full min-h-0 bg-ne-bg0">
      <PipelineSpine />
      <div className="flex min-w-0 flex-1 flex-col">
        <PhaseHeader phase={selectedPhase} />
        <div className="min-h-0 flex-1">
          {selectedPhase?.status === 'locked' ? (
            <LockedPhaseCard phase={selectedPhase} previousLabel={previousLabel} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-ne-ink-faint">
              {phases.length === 0
                ? 'Select a book in the Library to begin'
                : 'Chat workbench arrives in SESSION-09'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
