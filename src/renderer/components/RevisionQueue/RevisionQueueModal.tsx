import { useEffect } from 'react';
import { useRevisionQueueStore } from '../../stores/revisionQueueStore';
import { useBookStore } from '../../stores/bookStore';
import { useRevisionQueueEvents } from '../../hooks/useRevisionQueueEvents';
import { QueueControls } from './QueueControls';
import { SessionCard } from './SessionCard';
import { TaskProgress } from './TaskProgress';
import { RevisionSessionPanel } from './RevisionSessionPanel';

// ---------------------------------------------------------------------------
// MinimizedBadge — shown when modal is open but user switched to another book
// ---------------------------------------------------------------------------

function MinimizedBadge({ bookSlug }: { bookSlug: string }): React.ReactElement {
  const books = useBookStore((s) => s.books);
  const bookTitle = books.find((b) => b.slug === bookSlug)?.title ?? bookSlug;

  return (
    <div className="fixed bottom-4 right-4 z-40 rounded-full bg-amber-600 px-3 py-1.5 text-xs text-white shadow-lg pointer-events-auto">
      Revision queue running on {bookTitle}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MinimizedBar — slim bar at the bottom when minimized on the correct book
// ---------------------------------------------------------------------------

function MinimizedBar({ onExpand, onClose }: { onExpand: () => void; onClose: () => void }): React.ReactElement {
  const plan = useRevisionQueueStore((s) => s.plan);
  const activeSessionId = useRevisionQueueStore((s) => s.activeSessionId);
  const isRunning = useRevisionQueueStore((s) => s.isRunning);

  const activeSession = plan?.sessions.find((s) => s.id === activeSessionId);
  const completedCount = plan?.sessions.filter((s) => s.status === 'approved').length ?? 0;
  const totalCount = plan?.sessions.length ?? 0;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 h-12 border-t border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 flex items-center px-4 shadow-lg pointer-events-auto">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {isRunning && (
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-40" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
          </span>
        )}
        <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate">
          {activeSession ? activeSession.title : 'Revision Queue'}
        </span>
        <div className="w-24 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden shrink-0">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs text-zinc-500 dark:text-zinc-400 shrink-0">
          {completedCount}/{totalCount}
        </span>
      </div>
      <div className="flex items-center gap-1 ml-2">
        <button
          onClick={onExpand}
          className="rounded p-1 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          title="Expand"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clipRule="evenodd" />
          </svg>
        </button>
        <button
          onClick={onClose}
          className="rounded p-1 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          title="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExpandedModal — full floating panel
// ---------------------------------------------------------------------------

function ExpandedModal({ onMinimize, onClose }: { onMinimize: () => void; onClose: () => void }): React.ReactElement {
  const {
    plan, isLoading, loadingStep, isRunning, error, viewingSessionId, activeSessionId,
    verificationConversationId,
  } = useRevisionQueueStore();

  const showPanel = viewingSessionId !== null;

  return (
    <>
      {/* Non-blocking backdrop */}
      <div className="fixed inset-0 z-30 bg-black/10 pointer-events-none" />

      {/* Modal */}
      <div className="fixed top-14 right-4 bottom-4 z-40 w-[600px] max-w-[50vw] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl flex flex-col overflow-hidden pointer-events-auto">
        {/* Title bar */}
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700 px-4 py-2 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">Revision Queue</h2>
            {plan && <TaskProgress plan={plan} />}
            {isRunning && (
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-40" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={onMinimize}
              className="rounded p-1 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Minimize"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M5 10a.75.75 0 01.75-.75h8.5a.75.75 0 010 1.5h-8.5A.75.75 0 015 10z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="rounded p-1 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Error state (no plan loaded) */}
        {error && !plan && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <div className="text-4xl mb-4">&#128203;</div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">No Revision Plan</h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm">{error}</p>
              <p className="text-zinc-500 text-xs mt-2">
                Run Forge to generate a revision task list and session prompts.
              </p>
            </div>
          </div>
        )}

        {/* Loading state */}
        {(!plan || isLoading) && !error && (
          <div className="flex-1 flex items-center justify-center">
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
        )}

        {/* Plan loaded — show content */}
        {plan && !isLoading && (
          <div className="flex flex-1 min-h-0">
            {/* Session list */}
            <div className={`flex flex-col ${showPanel ? 'w-52 border-r border-zinc-200 dark:border-zinc-700' : 'flex-1'} h-full`}>
              <div className="border-b border-zinc-200 dark:border-zinc-700 p-3 shrink-0">
                <QueueControls />
                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-1.5 text-xs text-red-400 mt-2">
                    {error}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {plan.sessions.map((session) => (
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

                {verificationConversationId && (
                  <button
                    onClick={() => useRevisionQueueStore.getState().setViewingSession('__verification__')}
                    className={`w-full text-left border rounded-lg transition-colors mt-2 ${
                      viewingSessionId === '__verification__'
                        ? 'border-purple-500 bg-purple-500/10 ring-1 ring-purple-500/30'
                        : 'border-purple-500/30 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 p-2">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-xs text-purple-400">Verification</span>
                        <span className="text-xs text-zinc-500 ml-2">Verity</span>
                      </div>
                    </div>
                  </button>
                )}
              </div>
            </div>

            {/* Session panel */}
            {showPanel && (
              <div className="flex-1 h-full min-w-0">
                <RevisionSessionPanel />
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function RevisionQueueModal(): React.ReactElement | null {
  const { isModalOpen, isMinimized, modalBookSlug, toggleMinimize, closeModal } = useRevisionQueueStore();
  const activeSlug = useBookStore((s) => s.activeSlug);

  useRevisionQueueEvents();

  // Auto-load plan when modal opens on the active book
  useEffect(() => {
    if (!isModalOpen || !modalBookSlug) return;
    const current = useRevisionQueueStore.getState();
    if (current.isLoading) return;
    if (!current.plan || current.plan.bookSlug !== modalBookSlug) {
      useRevisionQueueStore.getState().switchToBook(modalBookSlug);
    }
  }, [isModalOpen, modalBookSlug]);

  if (!isModalOpen) return null;

  // Different book — show small badge
  if (activeSlug !== modalBookSlug) {
    return <MinimizedBadge bookSlug={modalBookSlug} />;
  }

  // Minimized on the correct book
  if (isMinimized) {
    return <MinimizedBar onExpand={toggleMinimize} onClose={closeModal} />;
  }

  // Expanded modal
  return <ExpandedModal onMinimize={toggleMinimize} onClose={closeModal} />;
}
