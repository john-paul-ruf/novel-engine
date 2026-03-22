import { useRevisionQueueStore } from '../../stores/revisionQueueStore';
import { useBookStore } from '../../stores/bookStore';
import type { QueueMode } from '@domain/types';

const MODE_OPTIONS: { value: QueueMode; label: string; description: string }[] = [
  { value: 'manual', label: 'Manual', description: 'Approve each step' },
  { value: 'auto-approve', label: 'Auto-Approve', description: 'Run all, auto-approve gates' },
  { value: 'auto-skip', label: 'Auto-Skip', description: 'Run all, skip all gates' },
  { value: 'selective', label: 'Selective', description: 'Pick sessions to run' },
];

export function QueueControls() {
  const { activeSlug } = useBookStore();
  const {
    plan, isRunning, isPaused, isLoading,
    setMode, runNext, runAll, pause, clearCache,
    startVerification, isVerifying, verificationConversationId,
  } = useRevisionQueueStore();

  if (!plan) return null;

  const hasPending = plan.sessions.some(s => s.status === 'pending');
  const allDone = plan.sessions.length > 0 && plan.sessions.every(
    s => s.status === 'approved' || s.status === 'skipped',
  );
  const canVerify = allDone && !isRunning;

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

      {canVerify && !verificationConversationId && (
        <button
          onClick={startVerification}
          disabled={isVerifying}
          title="Open a verification chat with Verity to confirm all revisions are complete"
          className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition-colors"
        >
          {isVerifying ? 'Starting...' : 'Verify'}
        </button>
      )}

      {canVerify && verificationConversationId && (
        <button
          onClick={() => useRevisionQueueStore.getState().setViewingSession('__verification__')}
          className="flex items-center gap-1.5 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors hover:bg-purple-500/30"
        >
          View Verification
        </button>
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
