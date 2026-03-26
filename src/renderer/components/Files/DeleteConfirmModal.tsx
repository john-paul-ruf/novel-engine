import { useState, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DeleteConfirmModalProps = {
  name: string;
  isDirectory: boolean;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Optional extra warning text shown below the standard confirmation line. */
  extraWarning?: string;
};

export type DeleteTarget = {
  path: string;
  name: string;
  isDirectory: boolean;
  /** Optional extra warning text to display in the confirmation modal. */
  extraWarning?: string;
};

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Shared hook for file/folder deletion with confirmation.
 *
 * Manages the pending-delete state, the "deleting" spinner state, and calls
 * `window.novelEngine.files.delete()` on confirmation.
 *
 * @param activeSlug - The book slug whose files are being managed.
 * @param onDeleted  - Callback invoked after a successful delete (e.g. bump refreshKey).
 */
export function useDeleteFile(
  activeSlug: string,
  onDeleted: () => void,
): {
  pendingDelete: DeleteTarget | null;
  deleting: boolean;
  requestDelete: (entry: DeleteTarget, e: React.MouseEvent) => void;
  confirmDelete: () => Promise<void>;
  cancelDelete: () => void;
} {
  const [pendingDelete, setPendingDelete] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  const requestDelete = useCallback((entry: DeleteTarget, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDelete(entry);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete || !activeSlug) return;
    setDeleting(true);
    try {
      await window.novelEngine.files.delete(activeSlug, pendingDelete.path);
      setPendingDelete(null);
      onDeleted();
    } catch (err) {
      console.error('Failed to delete:', err);
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete, activeSlug, onDeleted]);

  const cancelDelete = useCallback(() => {
    setPendingDelete(null);
  }, []);

  return { pendingDelete, deleting, requestDelete, confirmDelete, cancelDelete };
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * A modal dialog that confirms a file or folder deletion.
 *
 * Shared between FileBrowser (raw directory mode), SourcePanel, AgentOutputPanel,
 * and ChaptersPanel (structured browser mode).
 */
export function DeleteConfirmModal({
  name,
  isDirectory,
  deleting,
  onConfirm,
  onCancel,
  extraWarning,
}: DeleteConfirmModalProps): React.ReactElement {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div
        className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Delete {isDirectory ? 'folder' : 'file'}?
        </h3>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Are you sure you want to delete <strong className="text-zinc-800 dark:text-zinc-200">{name}</strong>?
          {isDirectory && ' This will delete all files inside it.'}
          {' '}This action cannot be undone.
        </p>
        {extraWarning && (
          <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
            {extraWarning}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="rounded-lg px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 transition-colors"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
