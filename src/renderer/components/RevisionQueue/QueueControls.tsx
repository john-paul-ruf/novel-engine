import { useRevisionQueueStore } from '../../stores/revisionQueueStore';
import type { QueueMode } from '@domain/types';

const MODE_OPTIONS: { value: QueueMode; label: string; description: string }[] = [
  { value: 'manual', label: 'Manual', description: 'Approve each step' },
  { value: 'auto-approve', label: 'Auto-Approve', description: 'Run all, auto-approve gates' },
  { value: 'auto-skip', label: 'Auto-Skip', description: 'Run all, skip all gates' },
  { value: 'selective', label: 'Selective', description: 'Pick sessions to run' },
];

export function QueueControls() {
  const { plan, isRunning, isPaused, setMode, runNext, runAll, pause } = useRevisionQueueStore();

  if (!plan) return null;

  const hasPending = plan.sessions.some(s => s.status === 'pending');

  return (
    <div className="flex items-center gap-3">
      <select
        value={plan.mode}
        onChange={(e) => setMode(e.target.value as QueueMode)}
        disabled={isRunning}
        className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 disabled:opacity-50"
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
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition-colors"
          >
            &#9654; Run Next
          </button>
          <button
            onClick={runAll}
            disabled={!hasPending}
            className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition-colors"
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
    </div>
  );
}
