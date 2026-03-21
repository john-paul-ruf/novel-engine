import { useState } from 'react';
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
  isSelected: boolean;
  mode: QueueMode;
};

export function SessionCard({ session, isActive, isSelected, mode }: Props) {
  const [isExpanded, setIsExpanded] = useState(isActive);
  const {
    approveSession, rejectSession, skipSession, runSession,
    toggleSessionSelection, streamingResponse,
  } = useRevisionQueueStore();

  const status = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.pending;

  return (
    <div
      className={`border rounded-lg transition-colors ${
        isActive
          ? 'border-blue-500/50 bg-zinc-100 dark:bg-zinc-800/80'
          : session.status === 'approved'
          ? 'border-green-500/20 bg-zinc-100/50 dark:bg-zinc-900/50'
          : session.status === 'skipped'
          ? 'border-zinc-300 dark:border-zinc-700/50 bg-zinc-50 dark:bg-zinc-900/30 opacity-60'
          : 'border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900'
      }`}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        {mode === 'selective' && session.status === 'pending' && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              toggleSessionSelection(session.id);
            }}
            className="rounded border-zinc-300 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800 text-blue-500"
          />
        )}

        <span className={`text-lg ${status.color}`}>{status.icon}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
              Session {session.index}: {session.title}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              session.model === 'sonnet'
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'bg-purple-500/20 text-purple-300'
            }`}>
              {session.model === 'sonnet' ? 'Sonnet' : 'Opus'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5">
            <span>Tasks: {session.taskNumbers.join(', ')}</span>
            {session.chapters.length > 0 && (
              <span>Chapters: {session.chapters.join(', ')}</span>
            )}
            {session.notes && <span>{session.notes}</span>}
          </div>
        </div>

        <span className={`text-zinc-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
          &#9654;
        </span>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-zinc-300 dark:border-zinc-700/50 px-4 pb-4">
          <details className="mt-3">
            <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-700 dark:text-zinc-300">
              View session prompt
            </summary>
            <pre className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-950 rounded-lg p-3 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">
              {session.prompt}
            </pre>
          </details>

          {isActive && streamingResponse && (
            <div className="mt-3">
              <div className="text-xs text-zinc-500 mb-1">Verity's response:</div>
              <div className="bg-white dark:bg-zinc-950 rounded-lg p-3 max-h-64 overflow-y-auto">
                <div className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
                  {streamingResponse}
                </div>
              </div>
            </div>
          )}

          {!isActive && session.response && (
            <div className="mt-3">
              <div className="text-xs text-zinc-500 mb-1">Verity's response:</div>
              <div className="bg-white dark:bg-zinc-950 rounded-lg p-3 max-h-48 overflow-y-auto">
                <div className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
                  {session.response}
                </div>
              </div>
            </div>
          )}

          {session.status === 'awaiting-approval' && !isActive && (
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => approveSession(session.id)}
                className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg px-3 py-1.5 text-sm transition-colors"
              >
                &#10003; Approve
              </button>
              <button
                onClick={() => rejectSession(session.id)}
                className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg px-3 py-1.5 text-sm transition-colors"
              >
                &#10007; Reject
              </button>
              <button
                onClick={() => skipSession(session.id)}
                className="flex items-center gap-1.5 bg-zinc-300 dark:bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg px-3 py-1.5 text-sm transition-colors"
              >
                &#9197; Skip
              </button>
            </div>
          )}

          {session.status === 'rejected' && (
            <div className="mt-3">
              <button
                onClick={() => runSession(session.id)}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-1.5 text-sm transition-colors"
              >
                &#8635; Re-run Session
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
