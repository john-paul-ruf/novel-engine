import { useEffect, useState } from 'react';
import type { FileDiff } from '@domain/types';
import { DiffViewer } from '../Files/DiffViewer';
import { Icon } from '../common/Icon';

type UserEditsDiffModalProps = {
  bookSlug: string;
  filePath: string; // chapters/NN-slug/draft.md
  chapterTitle: string;
  onClose: () => void;
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
}: UserEditsDiffModalProps): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diff, setDiff] = useState<FileDiff | null>(null);

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
        className="relative flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            My changes — {chapterTitle}
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <Icon name="x" size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="py-8 text-center text-sm text-zinc-500">Loading changes…</div>
          ) : error ? (
            <div className="py-8 text-center text-sm text-red-400">{error}</div>
          ) : diff === null ? (
            <div className="py-8 text-center text-sm text-zinc-500">
              No edits since Verity's last draft.
            </div>
          ) : (
            <DiffViewer diff={diff} />
          )}
        </div>
      </div>
    </div>
  );
}
