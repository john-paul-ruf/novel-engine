import { useState } from 'react';
import { useRevisionQueueStore } from '../../stores/revisionQueueStore';
import { useBookStore } from '../../stores/bookStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import type { QueueMode } from '@domain/types';

const MODE_OPTIONS: { value: QueueMode; label: string; description: string }[] = [
  { value: 'manual', label: 'Manual', description: 'Approve each step' },
  { value: 'auto-approve', label: 'Auto-Approve', description: 'Run all, auto-approve gates' },
  { value: 'auto-skip', label: 'Auto-Skip', description: 'Run all, skip all gates' },
  { value: 'selective', label: 'Selective', description: 'Pick sessions to run' },
];

export function QueueControls() {
  const { activeSlug } = useBookStore();
  const { loadPipeline } = usePipelineStore();
  const {
    plan, isRunning, isPaused, isLoading, isArchiving, isQueueArchived,
    setMode, runNext, runAll, pause, clearCache, completeQueue,
  } = useRevisionQueueStore();
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  if (!plan) return null;

  const hasPending = plan.sessions.some(s => s.status === 'pending');
  const allDone = plan.sessions.length > 0 && plan.sessions.every(
    s => s.status === 'approved' || s.status === 'skipped',
  );
  // Show the archive button when all sessions are resolved and not yet archived
  const canArchive = allDone && !isQueueArchived && !isRunning && !isArchiving;

  const handleArchive = async () => {
    setShowArchiveConfirm(false);
    await completeQueue();
    // Refresh pipeline tracker so the sidebar reflects the new phase state
    if (activeSlug) {
      loadPipeline(activeSlug);
    }
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <select
        value={plan.mode}
        onChange={(e) => setMode(e.target.value as QueueMode)}
        disabled={isRunning}
        className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-800 dark:text-zinc-200 disabled:opacity-50"
      >
        {MODE_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label} — {opt.description}
          </option>
        ))}
      </select>

      {!isRunning ? (
        <div className="flex gap-2">
          <button
            onClick={runNext}
            disabled={!hasPending}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-200 dark:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition-colors"
          >
            &#9654; Run Next
          </button>
          <button
            onClick={runAll}
            disabled={!hasPending}
            className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:bg-zinc-200 dark:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition-colors"
          >
            &#9654;&#9654; Run All
          </button>
        </div>
      ) : (
        <button
          onClick={pause}
          className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition-colors"
        >
          &#9646;&#9646; {isPaused ? 'Pausing...' : 'Pause'}
        </button>
      )}

      {/* Complete & Archive — appears when every session is approved or skipped */}
      {canArchive && !showArchiveConfirm && (
        <button
          onClick={() => setShowArchiveConfirm(true)}
          title="Archive revision files and advance the pipeline to the next stage"
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition-colors"
        >
          &#10003; Complete &amp; Archive
        </button>
      )}

      {showArchiveConfirm && (
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-1.5">
          <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
            Archive project-tasks &amp; revision-prompts?
          </span>
          <button
            onClick={handleArchive}
            disabled={isArchiving}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded px-3 py-1 text-xs font-medium transition-colors"
          >
            {isArchiving ? 'Archiving…' : 'Confirm'}
          </button>
          <button
            onClick={() => setShowArchiveConfirm(false)}
            disabled={isArchiving}
            className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 text-xs transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}

      {isQueueArchived && (
        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          &#10003; Archived — pipeline advancing
        </span>
      )}

      <button
        onClick={() => activeSlug && clearCache(activeSlug)}
        disabled={isRunning || isLoading || !plan.sessions.length}
        title="Clear cache and reload the plan from source files"
        className="flex items-center gap-1.5 bg-zinc-500 hover:bg-zinc-600 disabled:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 disabled:text-zinc-400 text-white rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
      >
        ↻ Clear Cache
      </button>
    </div>
  );
}
