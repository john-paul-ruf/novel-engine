import { useEffect } from 'react';
import { useRevisionQueueStore } from '../../stores/revisionQueueStore';
import { useBookStore } from '../../stores/bookStore';
import { useRevisionQueueEvents } from '../../hooks/useRevisionQueueEvents';
import { QueueControls } from './QueueControls';
import { SessionCard } from './SessionCard';
import { TaskProgress } from './TaskProgress';
import { ApprovalGateOverlay } from './ApprovalGateOverlay';

export function RevisionQueueView() {
  const { activeSlug } = useBookStore();
  const {
    plan, isRunning, error, gateSessionId, loadPlan, activeSessionId,
  } = useRevisionQueueStore();

  useRevisionQueueEvents();

  useEffect(() => {
    if (activeSlug) {
      loadPlan(activeSlug);
    }
  }, [activeSlug, loadPlan]);

  if (error && !plan) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-4">&#128203;</div>
          <h2 className="text-xl font-semibold text-zinc-100 mb-2">No Revision Plan</h2>
          <p className="text-zinc-400 text-sm">{error}</p>
          <p className="text-zinc-500 text-xs mt-2">
            Run Forge to generate a revision task list and session prompts.
          </p>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-zinc-400">Loading revision plan...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="border-b border-zinc-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Revision Queue</h1>
            <TaskProgress plan={plan} />
          </div>
          <QueueControls />
        </div>
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-sm text-red-300">
            {error}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {plan.sessions.map(session => (
          <SessionCard
            key={session.id}
            session={session}
            isActive={session.id === activeSessionId}
            isSelected={useRevisionQueueStore.getState().selectedSessionIds.has(session.id)}
            mode={plan.mode}
          />
        ))}
      </div>

      {gateSessionId && <ApprovalGateOverlay />}
    </div>
  );
}
