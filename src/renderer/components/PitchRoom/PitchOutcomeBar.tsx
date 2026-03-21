import { useState } from 'react';
import { usePitchRoomStore } from '../../stores/pitchRoomStore';

export function PitchOutcomeBar(): React.ReactElement | null {
  const activeConversation = usePitchRoomStore((s) => s.activeConversation);
  const drafts = usePitchRoomStore((s) => s.drafts);
  const isStreaming = usePitchRoomStore((s) => s.isStreaming);
  const promoteToBook = usePitchRoomStore((s) => s.promoteToBook);
  const shelveDraft = usePitchRoomStore((s) => s.shelveDraft);
  const discardDraft = usePitchRoomStore((s) => s.discardDraft);

  const [confirmAction, setConfirmAction] = useState<'promote' | 'shelve' | 'discard' | null>(null);
  const [loglineInput, setLoglineInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!activeConversation) return null;

  const draft = drafts.find((d) => d.conversationId === activeConversation.id);
  const hasPitch = draft?.hasPitch ?? false;
  const disabled = isStreaming || isProcessing;

  const handlePromote = async () => {
    setIsProcessing(true);
    try {
      await promoteToBook(activeConversation.id);
    } catch (error) {
      console.error('Failed to promote pitch:', error);
    } finally {
      setIsProcessing(false);
      setConfirmAction(null);
    }
  };

  const handleShelve = async () => {
    setIsProcessing(true);
    try {
      await shelveDraft(activeConversation.id, loglineInput.trim() || undefined);
    } catch (error) {
      console.error('Failed to shelve pitch:', error);
    } finally {
      setIsProcessing(false);
      setConfirmAction(null);
      setLoglineInput('');
    }
  };

  const handleDiscard = async () => {
    setIsProcessing(true);
    try {
      await discardDraft(activeConversation.id);
    } catch (error) {
      console.error('Failed to discard pitch:', error);
    } finally {
      setIsProcessing(false);
      setConfirmAction(null);
    }
  };

  if (confirmAction) {
    return (
      <div className="border-t border-zinc-200 dark:border-zinc-800 px-6 py-4">
        {confirmAction === 'promote' && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-zinc-600 dark:text-zinc-300">
              Create a new book from this pitch?
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmAction(null)}
                disabled={isProcessing}
                className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePromote}
                disabled={isProcessing}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isProcessing ? 'Creating...' : 'Confirm'}
              </button>
            </div>
          </div>
        )}

        {confirmAction === 'shelve' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-600 dark:text-zinc-300">
                Shelve this pitch for later?
              </span>
            </div>
            <input
              type="text"
              value={loglineInput}
              onChange={(e) => setLoglineInput(e.target.value)}
              placeholder="Optional logline (one-line description)..."
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setConfirmAction(null); setLoglineInput(''); }}
                disabled={isProcessing}
                className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleShelve}
                disabled={isProcessing}
                className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {isProcessing ? 'Shelving...' : 'Shelve'}
              </button>
            </div>
          </div>
        )}

        {confirmAction === 'discard' && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-zinc-600 dark:text-zinc-300">
              Discard this pitch draft and conversation?
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmAction(null)}
                disabled={isProcessing}
                className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDiscard}
                disabled={isProcessing}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isProcessing ? 'Discarding...' : 'Discard'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-800 px-6 py-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setConfirmAction('promote')}
          disabled={!hasPitch || disabled}
          title={hasPitch ? 'Create a new book from this pitch' : 'Spark needs to write a pitch first'}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span>📖</span>
          Make Book
        </button>
        <button
          onClick={() => setConfirmAction('shelve')}
          disabled={!hasPitch || disabled}
          title={hasPitch ? 'Save to shelf for later' : 'Spark needs to write a pitch first'}
          className="flex items-center gap-1.5 rounded-md border border-amber-300 dark:border-amber-700 px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-400 transition-colors hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span>📋</span>
          Shelve for Later
        </button>
        <button
          onClick={() => setConfirmAction('discard')}
          disabled={disabled}
          className="flex items-center gap-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 transition-colors hover:border-red-300 dark:hover:border-red-700 hover:text-red-600 dark:hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span>🗑</span>
          Discard
        </button>
      </div>
    </div>
  );
}
