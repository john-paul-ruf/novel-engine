import { useEffect } from 'react';
import { VersionHistoryPanel } from '../Files/VersionHistoryPanel';

type VersionHistoryModalProps = {
  bookSlug: string;
  filePath: string;
  onClose: () => void;
  /** Optional: hosts with editable local state reload after a revert. */
  onReverted?: () => void;
};

/**
 * Standalone modal wrapper around VersionHistoryPanel so any surface can
 * show a file's version history (and revert) with just a slug + path.
 * Read-only hosts omit onReverted — the file-change watcher refreshes them.
 */
export function VersionHistoryModal({
  bookSlug,
  filePath,
  onClose,
  onReverted,
}: VersionHistoryModalProps): React.ReactElement {
  // Escape key closes the modal (match UserEditsDiffModal's handling)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-ne-line bg-ne-bg1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <VersionHistoryPanel
          bookSlug={bookSlug}
          filePath={filePath}
          onClose={onClose}
          onReverted={onReverted}
          frameless
        />
      </div>
    </div>
  );
}
