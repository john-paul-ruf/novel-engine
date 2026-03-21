import { useState } from 'react';
import { useRevisionQueueStore } from '../../stores/revisionQueueStore';
import type { ApprovalAction } from '@domain/types';

export function ApprovalGateOverlay() {
  const { gateText, gateSessionId, respondToGate, streamingResponse, plan } = useRevisionQueueStore();
  const [rejectionMessage, setRejectionMessage] = useState('');
  const [showRejectionInput, setShowRejectionInput] = useState(false);

  if (!gateSessionId) return null;

  const session = plan?.sessions.find(s => s.id === gateSessionId);

  const handleAction = async (action: ApprovalAction) => {
    if (action === 'reject' && !showRejectionInput) {
      setShowRejectionInput(true);
      return;
    }
    await respondToGate(action, action === 'reject' ? rejectionMessage : undefined);
    setRejectionMessage('');
    setShowRejectionInput(false);
  };

  return (
    <div className="border-t border-amber-500/30 bg-amber-500/5 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-amber-600 dark:text-amber-400 text-lg">&#9888;</span>
          <h3 className="text-sm font-semibold text-amber-200">
            Approval Gate — {session?.title ?? 'Session'}
          </h3>
        </div>

        <div className="bg-white dark:bg-zinc-950 rounded-lg p-3 mb-3 max-h-48 overflow-y-auto">
          <div className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
            {streamingResponse.slice(-2000)}
          </div>
        </div>

        {showRejectionInput && (
          <div className="mb-3">
            <textarea
              value={rejectionMessage}
              onChange={(e) => setRejectionMessage(e.target.value)}
              placeholder="Tell Verity what to fix..."
              rows={3}
              className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 resize-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
              autoFocus
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleAction('approve')}
            className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            &#10003; Approve
          </button>
          <button
            onClick={() => handleAction('reject')}
            className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            &#10007; {showRejectionInput ? 'Send Correction' : 'Reject'}
          </button>
          <button
            onClick={() => handleAction('skip')}
            className="flex items-center gap-1.5 bg-zinc-300 dark:bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            &#9197; Skip
          </button>
          <button
            onClick={() => handleAction('retry')}
            className="flex items-center gap-1.5 border border-zinc-300 dark:border-zinc-600 hover:border-zinc-500 text-zinc-700 dark:text-zinc-300 rounded-lg px-4 py-2 text-sm transition-colors"
          >
            &#8635; Retry
          </button>

          {showRejectionInput && (
            <button
              onClick={() => { setShowRejectionInput(false); setRejectionMessage(''); }}
              className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-300 ml-2"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
