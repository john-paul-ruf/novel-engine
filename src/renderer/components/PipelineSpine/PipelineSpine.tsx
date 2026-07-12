import { useEffect, useState } from 'react';
import type { PipelinePhase } from '@domain/types';
import { useBookStore } from '../../stores/bookStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useViewStore } from '../../stores/viewStore';
import { useResizeHandle } from '../../hooks/useResizeHandle';
import { ResizeHandle } from '../Layout/ResizeHandle';
import { Icon } from '../common/Icon';
import { PhaseNode } from './PhaseNode';
import { STAGES } from './stages';
import { usePhaseAction } from './usePhaseAction';

const SPINE_DEFAULT = 282;
const SPINE_MIN = 220;
const SPINE_MAX = 420;

const PRIMARY_BTN_CLASS =
  'flex w-full items-center justify-center gap-2 rounded-[7px] bg-gradient-to-b from-ne-brass-hi to-ne-brass px-2.5 py-[7px] text-xs font-semibold text-ne-bg0 transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50';

const SECONDARY_BTN_CLASS =
  'flex w-full items-center justify-center gap-2 rounded-[7px] border border-ne-line px-2.5 py-[6px] text-[11px] font-medium text-ne-ink-dim transition-colors hover:border-ne-brass/50 hover:text-ne-ink';

/**
 * Action card under the pipeline's current phase — renders the shared
 * usePhaseAction state (same triggers as PipelineTracker), spine-skinned.
 */
function CurrentPhaseCard({
  phase,
  activeSlug,
}: {
  phase: PipelinePhase;
  activeSlug: string;
}): React.ReactElement {
  const action = usePhaseAction(phase, activeSlug);

  return (
    <div className="mx-3 mb-1 ml-[44px] mt-0.5 rounded-[10px] border border-ne-brass/35 bg-ne-bg2 p-2.5">
      {action.error && (
        <div className="mb-2 rounded bg-ne-sable/10 px-2 py-1 text-[10px] text-ne-sable">
          {action.error}
        </div>
      )}
      {action.micro && (
        <div className="mb-2 flex justify-between gap-2 text-[10.5px] text-ne-ink-dim">
          <span className="truncate">{action.micro.label}</span>
          <b className="shrink-0 font-semibold text-ne-brass-hi">{action.micro.value}</b>
        </div>
      )}
      {action.primary && (
        <button className={PRIMARY_BTN_CLASS} onClick={action.primary.onClick} disabled={action.busy}>
          {action.primary.icon && <Icon name={action.primary.icon} size={11} strokeWidth={2.4} />}
          {action.busy ? 'Building…' : action.primary.label}
        </button>
      )}

      {/* Pending revision-queue phases keep queue access alongside the gate */}
      {action.isPending && action.isRevisionQueuePhase && (
        <button className={`${SECONDARY_BTN_CLASS} mt-1.5`} onClick={action.openRevisionQueue}>
          Open Revision Queue
        </button>
      )}

      {/* Auto Draft may still be finishing while first-draft awaits confirmation */}
      {action.isPending && action.isFirstDraft && action.autoDraftRunning && (
        <button className={`${SECONDARY_BTN_CLASS} mt-1.5`} onClick={action.stopAutoDraft}>
          {action.confirming === 'stop' ? 'Confirm stop?' : 'Stop Auto Draft'}
        </button>
      )}

      {/* Revision's dedicated gate: archive reports + advance to Second Read */}
      {phase.id === 'revision' && (
        <button
          className={`${SECONDARY_BTN_CLASS} mt-1.5 ${
            action.confirming === 'complete-revision' ? 'border-ne-lumen/60 text-ne-lumen' : ''
          }`}
          onClick={action.completeRevisionAction}
          title="Archive revision reports and advance the pipeline to Second Read"
        >
          {action.confirming === 'complete-revision' ? 'Confirm complete?' : 'Complete Revision'}
        </button>
      )}
    </div>
  );
}

/**
 * The Workspace's left panel: book header + the pipeline as navigation.
 * Replaces Dashboard's PipelineCard and the right-dock PipelineTracker
 * (both stay mounted until SESSION-14).
 */
export function PipelineSpine(): React.ReactElement {
  const { phases } = usePipelineStore();
  const { activeSlug, books, totalWordCount } = useBookStore();
  const { selectedPhaseId, selectPhase } = useWorkspaceStore();
  const [coverError, setCoverError] = useState(false);

  const { width, isDragging, onMouseDown, resetWidth } = useResizeHandle({
    direction: 'left', // handle on right edge: dragging right = wider
    initialWidth: SPINE_DEFAULT,
    minWidth: SPINE_MIN,
    maxWidth: SPINE_MAX,
    storageKey: 'novel-engine:pipeline-spine-width',
  });

  useEffect(() => {
    setCoverError(false);
  }, [activeSlug]);

  const book = books.find((b) => b.slug === activeSlug) ?? null;

  // Overall progress — same derivation as Library BookCard / Dashboard PipelineCard
  const total = phases.length;
  const completed = phases.filter((p) => p.status === 'complete').length;
  const isComplete = total > 0 && completed === total;
  const currentPhase =
    phases.find((p) => p.status === 'active' || p.status === 'pending-completion') ?? null;
  const currentIdx = currentPhase ? phases.findIndex((p) => p.id === currentPhase.id) : -1;
  const phaseNumber = currentIdx >= 0 ? currentIdx + 1 : isComplete ? total : completed + 1;
  const phaseById = new Map(phases.map((p) => [p.id, p]));

  return (
    <div
      data-tour="pipeline-spine"
      className="relative flex h-full shrink-0 flex-col border-r border-ne-line bg-ne-bg1"
      style={{ width }}
    >
      {/* Book header */}
      <div className="shrink-0 border-b border-ne-line-soft px-4 pb-3.5 pt-4">
        {book ? (
          <>
            <div className="flex items-center gap-3">
              {coverError ? (
                <div className="flex h-[57px] w-[38px] shrink-0 items-center justify-center rounded border border-ne-line bg-ne-bg2 text-ne-ink-faint">
                  <Icon name="manuscript" size={16} />
                </div>
              ) : (
                <img
                  src={`novel-asset://cover/${book.slug}`}
                  alt=""
                  className="h-[57px] w-[38px] shrink-0 rounded border border-ne-line object-cover shadow-md"
                  onError={() => setCoverError(true)}
                />
              )}
              <div className="min-w-0">
                <div className="truncate font-ne-serif text-base font-medium text-ne-ink">
                  {book.title}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="rounded-full border border-ne-brass/30 bg-ne-brass-dim px-2 py-px text-[10px] font-semibold uppercase tracking-wide text-ne-brass-hi">
                    {book.status}
                  </span>
                  <span className="text-[11px] tabular-nums text-ne-ink-faint">
                    {totalWordCount.toLocaleString()} w
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-3">
              <div className="mb-1.5 flex justify-between text-[10.5px] text-ne-ink-faint">
                <span>Pipeline</span>
                <span>{total > 0 ? `Phase ${phaseNumber} of ${total}` : '—'}</span>
              </div>
              <div className="h-[3px] overflow-hidden rounded-full bg-ne-bg3">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: total > 0 ? `${(completed / total) * 100}%` : '0%',
                    background: isComplete
                      ? 'var(--ne-lumen)'
                      : 'linear-gradient(90deg, var(--ne-brass), var(--ne-brass-hi))',
                  }}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="text-xs text-ne-ink-faint">No book selected</div>
        )}
      </div>

      {/* Spine */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-4 pt-2.5">
        {phases.length === 0 ? (
          <div className="px-4 py-3 text-xs text-ne-ink-faint">No pipeline yet</div>
        ) : (
          STAGES.map((stage) => (
            <div key={stage.label}>
              <div className="pb-1.5 pl-[52px] pr-4 pt-3.5 text-[9.5px] font-bold tracking-[.14em] text-ne-ink-faint">
                {stage.label}
              </div>
              {stage.phaseIds.map((id) => {
                const phase = phaseById.get(id);
                if (!phase) return null;
                return (
                  <div key={id}>
                    <PhaseNode
                      phase={phase}
                      isSelected={selectedPhaseId === phase.id}
                      onSelect={() => {
                        if (phase.id === 'query-agents') {
                          useViewStore.getState().navigate('query-manager');
                        } else {
                          selectPhase(phase.id);
                        }
                      }}
                    />
                    {currentPhase?.id === phase.id && activeSlug && (
                      <CurrentPhaseCard phase={phase} activeSlug={activeSlug} />
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Right-edge drag handle */}
      <ResizeHandle
        side="right"
        isDragging={isDragging}
        onMouseDown={onMouseDown}
        onDoubleClick={resetWidth}
      />
    </div>
  );
}
