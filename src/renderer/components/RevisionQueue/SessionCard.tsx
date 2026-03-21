import { useEffect } from 'react';
import { useRevisionQueueStore } from '../../stores/revisionQueueStore';
import type { RevisionSession, QueueMode } from '@domain/types';

const STATUS_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  pending:             { icon: '\u23F3', color: 'text-zinc-500 dark:text-zinc-400',   label: 'Pending' },
  running:             { icon: '\uD83D\uDD04', color: 'text-blue-600 dark:text-blue-400',   label: 'Running' },
  'awaiting-approval': { icon: '\uD83D\uDCE5', color: 'text-amber-600 dark:text-amber-400',  label: 'Awaiting Approval' },
  approved:            { icon: '\u2705', color: 'text-green-600 dark:text-green-400',  label: 'Approved' },
  rejected:            { icon: '\u274C', color: 'text-red-600 dark:text-red-400',    label: 'Rejected' },
  skipped:             { icon: '\u23ED\uFE0F', color: 'text-zinc-500',   label: 'Skipped' },
};

type Props = {
  session: RevisionSession;
  isActive: boolean;
  isViewing: boolean;
  isSelected: boolean;
  mode: QueueMode;
  compact: boolean;
};

export function SessionCard({ session, isActive, isViewing, isSelected, mode, compact }: Props) {
  const {
    toggleSessionSelection, setViewingSession, isRunning,
  } = useRevisionQueueStore();

  const status = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.pending;

  useEffect(() => {
    if (isActive) setViewingSession(session.id);
  }, [isActive, session.id, setViewingSession]);

  const handleClick = () => {
    setViewingSession(isViewing ? null : session.id);
  };

  return (
    <button
      onClick={handleClick}
      className={`w-full text-left border rounded-lg transition-colors ${
        isViewing
          ? 'border-blue-500 bg-blue-500/5 dark:bg-blue-500/10 ring-1 ring-blue-500/30'
          : isActive
          ? 'border-blue-500/50 bg-zinc-100 dark:bg-zinc-800/80'
          : session.status === 'approved'
          ? 'border-green-500/20 bg-zinc-100/50 dark:bg-zinc-900/50'
          : session.status === 'awaiting-approval'
          ? 'border-amber-500/40 bg-amber-500/5'
          : session.status === 'skipped'
          ? 'border-zinc-300 dark:border-zinc-700/50 bg-zinc-50 dark:bg-zinc-900/30 opacity-60'
          : 'border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
      }`}
    >
      <div className="flex items-center gap-3 p-3">
        {mode === 'selective' && session.status === 'pending' && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              toggleSessionSelection(session.id);
            }}
            onClick={(e) => e.stopPropagation()}
            className="rounded border-zinc-300 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800 text-blue-500"
          />
        )}

        <span className={`text-lg ${status.color}`}>{status.icon}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100 truncate">
              {compact ? `S${session.index}` : `Session ${session.index}`}: {session.title}
            </span>
            {!compact && (
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                session.model === 'sonnet'
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'bg-purple-500/20 text-purple-300'
              }`}>
                {session.model === 'sonnet' ? 'Sonnet' : 'Opus'}
              </span>
            )}
            {isActive && (
              <span className="flex items-center gap-1 text-xs text-blue-400 animate-pulse">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400" />
                Running
              </span>
            )}
            {session.status === 'awaiting-approval' && !isActive && (
              <span className="flex items-center gap-1 text-xs text-amber-400">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                Review
              </span>
            )}
          </div>
          {!compact && (
            <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5">
              <span>Tasks: {session.taskNumbers.join(', ')}</span>
              {session.chapters.length > 0 && (
                <span>Chapters: {session.chapters.join(', ')}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
