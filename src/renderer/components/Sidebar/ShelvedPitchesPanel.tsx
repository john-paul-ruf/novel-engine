import { useEffect, useState } from 'react';
import { usePitchShelfStore } from '../../stores/pitchShelfStore';
import { useBookStore } from '../../stores/bookStore';
import type { ShelvedPitchMeta } from '@domain/types';

type Props = {
  onBack: () => void;
  onBookRestored: (slug: string) => void;
};

export function ShelvedPitchesPanel({ onBack, onBookRestored }: Props): React.ReactElement {
  const { pitches, loading, loadPitches, deletePitch, restorePitch, shelveCurrentPitch, previewPitchBySlug } =
    usePitchShelfStore();
  const { activeSlug } = useBookStore();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [shelving, setShelving] = useState(false);
  const [shelveSuccess, setShelveSuccess] = useState(false);

  useEffect(() => {
    loadPitches();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRestore = async (slug: string) => {
    try {
      const bookSlug = await restorePitch(slug);
      setConfirmRestore(null);
      onBookRestored(bookSlug);
    } catch (err) {
      console.error('Failed to restore pitch:', err);
    }
  };

  const handleDelete = async (slug: string) => {
    try {
      await deletePitch(slug);
      setConfirmDelete(null);
    } catch (err) {
      console.error('Failed to delete pitch:', err);
    }
  };

  const handleShelve = async () => {
    if (!activeSlug) return;
    setShelving(true);
    try {
      await shelveCurrentPitch(activeSlug);
      setShelveSuccess(true);
      setTimeout(() => setShelveSuccess(false), 2000);
    } catch (err) {
      console.error('Failed to shelve pitch:', err);
    } finally {
      setShelving(false);
    }
  };

  return (
    <div className="flex flex-col">
      {/* Header with back button */}
      <button
        onClick={onBack}
        className="no-drag flex items-center gap-2 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-800"
      >
        <span>←</span>
        <span>Back to Books</span>
      </button>

      <div className="px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Shelved Pitches
        </h3>
      </div>

      {/* Pitch list */}
      <div className="max-h-64 overflow-y-auto">
        {loading && (
          <div className="px-3 py-4 text-center text-xs text-zinc-500">Loading...</div>
        )}

        {!loading && pitches.length === 0 && (
          <div className="px-3 py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
            No shelved pitches yet. Shelve a pitch from Spark to save it for later.
          </div>
        )}

        {pitches.map((pitch) => (
          <PitchCard
            key={pitch.slug}
            pitch={pitch}
            isConfirmingDelete={confirmDelete === pitch.slug}
            isConfirmingRestore={confirmRestore === pitch.slug}
            onPreview={() => previewPitchBySlug(pitch.slug)}
            onRestore={() => {
              if (confirmRestore === pitch.slug) {
                handleRestore(pitch.slug);
              } else {
                setConfirmRestore(pitch.slug);
                setConfirmDelete(null);
              }
            }}
            onDelete={() => {
              if (confirmDelete === pitch.slug) {
                handleDelete(pitch.slug);
              } else {
                setConfirmDelete(pitch.slug);
                setConfirmRestore(null);
              }
            }}
            onCancelConfirm={() => {
              setConfirmDelete(null);
              setConfirmRestore(null);
            }}
          />
        ))}
      </div>

      {/* Shelve current pitch button */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 p-2">
        <button
          onClick={handleShelve}
          disabled={!activeSlug || shelving}
          className="no-drag flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {shelveSuccess ? (
            <span className="text-green-600 dark:text-green-400">✓ Pitch shelved</span>
          ) : shelving ? (
            <span>Shelving...</span>
          ) : (
            <>
              <span>📦</span>
              <span>Shelve Current Pitch</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function PitchCard({
  pitch,
  isConfirmingDelete,
  isConfirmingRestore,
  onPreview,
  onRestore,
  onDelete,
  onCancelConfirm,
}: {
  pitch: ShelvedPitchMeta;
  isConfirmingDelete: boolean;
  isConfirmingRestore: boolean;
  onPreview: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onCancelConfirm: () => void;
}): React.ReactElement {
  const shelvedDate = pitch.shelvedAt
    ? new Date(pitch.shelvedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : '';

  return (
    <div className="border-b border-zinc-100 dark:border-zinc-800 px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
      <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {pitch.title}
      </div>
      {pitch.logline && (
        <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
          {pitch.logline}
        </div>
      )}
      <div className="mt-1 text-[10px] text-zinc-400 dark:text-zinc-500">
        {shelvedDate && `Shelved ${shelvedDate}`}
        {shelvedDate && pitch.shelvedFrom && ' · '}
        {pitch.shelvedFrom && `from ${pitch.shelvedFrom}`}
      </div>

      {/* Confirmation bars */}
      {isConfirmingDelete && (
        <div className="mt-2 flex items-center gap-2 rounded bg-red-50 dark:bg-red-950/30 px-2 py-1.5">
          <span className="text-xs text-red-600 dark:text-red-400">Delete permanently?</span>
          <button
            onClick={onDelete}
            className="no-drag rounded bg-red-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-red-500"
          >
            Yes
          </button>
          <button
            onClick={onCancelConfirm}
            className="no-drag text-[10px] text-zinc-500 hover:text-zinc-300"
          >
            No
          </button>
        </div>
      )}

      {isConfirmingRestore && (
        <div className="mt-2 flex items-center gap-2 rounded bg-blue-50 dark:bg-blue-950/30 px-2 py-1.5">
          <span className="text-xs text-blue-600 dark:text-blue-400">Create book from pitch?</span>
          <button
            onClick={onRestore}
            className="no-drag rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-500"
          >
            Yes
          </button>
          <button
            onClick={onCancelConfirm}
            className="no-drag text-[10px] text-zinc-500 hover:text-zinc-300"
          >
            No
          </button>
        </div>
      )}

      {/* Action buttons (hidden during confirmation) */}
      {!isConfirmingDelete && !isConfirmingRestore && (
        <div className="mt-1.5 flex items-center gap-2">
          <button
            onClick={onPreview}
            className="no-drag text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
          >
            Preview
          </button>
          <button
            onClick={onRestore}
            className="no-drag text-[10px] text-green-600 dark:text-green-400 hover:underline"
          >
            Restore
          </button>
          <button
            onClick={onDelete}
            className="no-drag text-[10px] text-red-500 dark:text-red-400 hover:underline"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
