import { useEffect, useState } from 'react';
import type { FileDiff } from '@domain/types';
import { DiffViewer } from '../Files/DiffViewer';
import { Icon } from '../common/Icon';

type UserEditsDiffModalProps = {
  bookSlug: string;
  filePath: string; // chapters/NN-slug/draft.md
  chapterTitle: string;
  onClose: () => void;
  /** Called after a successful discard-revert, so the parent can reload the editor. */
  onReverted?: () => void;
};

/**
 * Modal showing the author's pending edits to a Verity-authored chapter draft —
 * the diff from the latest agent baseline to the current disk content.
 */
export function UserEditsDiffModal({
  bookSlug,
  filePath,
  chapterTitle,
  onClose,
  onReverted,
}: UserEditsDiffModalProps): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);

  const handleDiscard = async (): Promise<void> => {
    // Guard: never revert without an agent baseline to revert to
    if (!diff?.oldVersion || discarding) return;
    setDiscarding(true);
    setDiscardError(null);
    try {
      await window.novelEngine.versions.revert(bookSlug, filePath, diff.oldVersion.id);
      onReverted?.();
      onClose();
    } catch (err) {
      setDiscardError(err instanceof Error ? err.message : 'Failed to discard edits');
      setDiscarding(false);
      setConfirmingDiscard(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    window.novelEngine.versions
      .getUserEdits(bookSlug, filePath)
      .then((result) => {
        if (!cancelled) {
          setDiff(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load changes');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bookSlug, filePath]);

  // Escape key closes the modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-ne-line bg-ne-bg1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ne-line-soft px-6 py-4">
          <h2 className="text-base font-semibold text-ne-ink">
            My changes — {chapterTitle}
          </h2>
          <button
            onClick={onClose}
            className="text-ne-ink-dim transition-colors hover:text-ne-ink"
          >
            <Icon name="x" size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="py-8 text-center text-sm text-ne-ink-faint">Loading changes…</div>
          ) : error ? (
            <div className="py-8 text-center text-sm text-ne-sable">{error}</div>
          ) : diff === null ? (
            <div className="py-8 text-center text-sm text-ne-ink-faint">
              No edits since Verity's last draft.
            </div>
          ) : (
            <DiffViewer diff={diff} />
          )}
        </div>

        {/* Footer — discard flow, only when a diff (with baseline) is shown */}
        {!loading && !error && diff !== null && (
          <div className="flex items-center gap-3 border-t border-ne-line-soft px-6 py-3">
            {discardError && (
              <p className="min-w-0 flex-1 truncate text-xs text-ne-sable" title={discardError}>
                {discardError}
              </p>
            )}
            {confirmingDiscard ? (
              <>
                <span className="ml-auto text-xs text-ne-ink-dim">
                  Really discard? This restores Verity's last draft.
                </span>
                <button
                  onClick={() => setConfirmingDiscard(false)}
                  disabled={discarding}
                  className="rounded-md border border-ne-line px-2.5 py-1 text-xs text-ne-ink-dim transition-colors hover:text-ne-ink disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleDiscard()}
                  disabled={discarding || !diff.oldVersion}
                  className="rounded-md border border-ne-sable/40 bg-ne-sable/10 px-2.5 py-1 text-xs font-semibold text-ne-sable transition-colors hover:bg-ne-sable/20 disabled:opacity-50"
                >
                  {discarding ? 'Discarding…' : 'Confirm'}
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmingDiscard(true)}
                disabled={!diff.oldVersion || discarding}
                className="ml-auto rounded-md border border-ne-sable/40 px-2.5 py-1 text-xs text-ne-sable transition-colors hover:bg-ne-sable/10 disabled:opacity-50"
              >
                Discard my edits
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
