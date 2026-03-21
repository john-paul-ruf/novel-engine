import { useEffect } from 'react';
import { useRevisionQueueStore } from '../../stores/revisionQueueStore';
import { useBookStore } from '../../stores/bookStore';
import { useRevisionQueueEvents } from '../../hooks/useRevisionQueueEvents';
import { QueueControls } from './QueueControls';
import { SessionCard } from './SessionCard';
import { TaskProgress } from './TaskProgress';
import { RevisionSessionPanel } from './RevisionSessionPanel';

export function RevisionQueueView() {
  const { activeSlug } = useBookStore();
  const {
    plan, isLoading, loadingStep, isRunning, error, viewingSessionId, loadPlan, activeSessionId,
  } = useRevisionQueueStore();

  useRevisionQueueEvents();

  useEffect(() => {
    if (activeSlug) {
      loadPlan(activeSlug);
    }
  }, [activeSlug, loadPlan]);

  if (error && !plan) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-4">&#128203;</div>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">No Revision Plan</h2>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">{error}</p>
          <p className="text-zinc-500 text-xs mt-2">
            Run Forge to generate a revision task list and session prompts.
          </p>
        </div>
      </div>
    );
  }

  if (!plan || isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-10 w-10">
            <div className="absolute inset-0 rounded-full border-2 border-zinc-200 dark:border-zinc-700" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-orange-500 animate-spin" />
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Loading revision plan</p>
            <div className="flex items-center gap-2 rounded-full bg-zinc-100 dark:bg-zinc-800/80 px-3 py-1">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {loadingStep || 'Initializing\u2026'}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const showPanel = viewingSessionId !== null;

  return (
    <div className="flex h-full">
      <div className={`flex flex-col ${showPanel ? 'w-80 border-r border-zinc-200 dark:border-zinc-700' : 'flex-1'} h-full`}>
        <div className="border-b border-zinc-300 dark:border-zinc-700 p-4 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Revision Queue</h1>
              <TaskProgress plan={plan} />
            </div>
            {!showPanel && <QueueControls />}
          </div>
          {showPanel && (
            <div className="mt-1">
              <QueueControls />
            </div>
          )}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-sm text-red-300 mt-2">
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
              isViewing={session.id === viewingSessionId}
              isSelected={useRevisionQueueStore.getState().selectedSessionIds.has(session.id)}
              mode={plan.mode}
              compact={showPanel}
            />
          ))}
        </div>
      </div>

      {showPanel && (
        <div className="flex-1 h-full">
          <RevisionSessionPanel />
        </div>
      )}
    </div>
  );
}
