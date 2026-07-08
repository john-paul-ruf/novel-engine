import { useEffect, useState } from 'react';
import type { ShelvedPitchMeta } from '@domain/types';
import { useBookStore } from '../../stores/bookStore';
import { usePitchRoomStore } from '../../stores/pitchRoomStore';
import { usePitchShelfStore } from '../../stores/pitchShelfStore';
import { useViewStore } from '../../stores/viewStore';
import { Icon } from '../common/Icon';

function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString();
}

/** Shelved pitch row — preview / restore / delete with inline 2-step confirms. */
function ShelvedPitchRow({ pitch }: { pitch: ShelvedPitchMeta }): React.ReactElement {
  const { deletePitch, restorePitch, previewPitchBySlug } = usePitchShelfStore();
  const setActiveBook = useBookStore((s) => s.setActiveBook);
  const { navigate } = useViewStore();
  const [confirm, setConfirm] = useState<'delete' | 'restore' | null>(null);

  const shelvedDate = pitch.shelvedAt
    ? new Date(pitch.shelvedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '';

  const handleRestore = async (): Promise<void> => {
    try {
      const bookSlug = await restorePitch(pitch.slug);
      setConfirm(null);
      await setActiveBook(bookSlug);
      navigate('workspace');
    } catch (err) {
      console.error('Failed to restore pitch:', err);
    }
  };

  const handleDelete = async (): Promise<void> => {
    try {
      await deletePitch(pitch.slug);
      setConfirm(null);
    } catch (err) {
      console.error('Failed to delete pitch:', err);
    }
  };

  return (
    <div className="border-b border-ne-line-soft px-3 py-2.5 hover:bg-ne-bg1">
      <div className="text-xs font-medium text-ne-ink">{pitch.title}</div>
      {pitch.logline && (
        <div className="mt-0.5 line-clamp-2 text-[11px] text-ne-ink-dim">{pitch.logline}</div>
      )}
      <div className="mt-1 text-[10px] text-ne-ink-faint">
        {shelvedDate && `Shelved ${shelvedDate}`}
        {shelvedDate && pitch.shelvedFrom && ' · '}
        {pitch.shelvedFrom && `from ${pitch.shelvedFrom}`}
      </div>

      {confirm ? (
        <div className="mt-2 flex items-center gap-2 rounded bg-ne-bg2 px-2 py-1.5">
          <span className={`text-[11px] ${confirm === 'delete' ? 'text-ne-sable' : 'text-ne-quill'}`}>
            {confirm === 'delete' ? 'Delete permanently?' : 'Create book from pitch?'}
          </span>
          <button
            onClick={() => void (confirm === 'delete' ? handleDelete() : handleRestore())}
            className={`rounded px-2 py-0.5 text-[10px] font-medium text-white ${
              confirm === 'delete' ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            Yes
          </button>
          <button
            onClick={() => setConfirm(null)}
            className="text-[10px] text-ne-ink-faint hover:text-ne-ink-dim"
          >
            No
          </button>
        </div>
      ) : (
        <div className="mt-1.5 flex items-center gap-2.5">
          <button
            onClick={() => previewPitchBySlug(pitch.slug)}
            className="text-[10px] text-ne-quill hover:underline"
          >
            Preview
          </button>
          <button
            onClick={() => setConfirm('restore')}
            className="text-[10px] text-ne-lumen hover:underline"
          >
            Restore
          </button>
          <button
            onClick={() => setConfirm('delete')}
            className="text-[10px] text-ne-sable hover:underline"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Pitch Room left rail (~250px): new pitch, Spark session history, and the
 * shelved-pitches list — the sidebar-era PitchHistory + ShelvedPitchesPanel
 * content, re-homed and restyled (amber pitch identity preserved via ne-spark).
 */
export function PitchRail(): React.ReactElement {
  const conversations = usePitchRoomStore((s) => s.conversations);
  const activeConversation = usePitchRoomStore((s) => s.activeConversation);
  const setActiveConversation = usePitchRoomStore((s) => s.setActiveConversation);
  const startNewConversation = usePitchRoomStore((s) => s.startNewConversation);
  const deleteConversation = usePitchRoomStore((s) => s.deleteConversation);
  const isStreaming = usePitchRoomStore((s) => s.isStreaming);

  const { pitches, loading, loadPitches, shelveCurrentPitch } = usePitchShelfStore();
  const activeSlug = useBookStore((s) => s.activeSlug);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [shelving, setShelving] = useState(false);
  const [shelveSuccess, setShelveSuccess] = useState(false);

  useEffect(() => {
    void loadPitches();
  }, [loadPitches]);

  const handleDelete = async (e: React.MouseEvent, id: string): Promise<void> => {
    e.stopPropagation();
    if (deletingId === id) {
      await deleteConversation(id);
      setDeletingId(null);
    } else {
      setDeletingId(id);
    }
  };

  const handleShelve = async (): Promise<void> => {
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
    <aside className="flex w-[250px] shrink-0 flex-col border-r border-ne-line bg-ne-bg0">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* New pitch */}
        <div className="px-2 pt-2">
          <button
            onClick={() => void startNewConversation()}
            disabled={isStreaming}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-ne-spark/40 px-3 py-2 text-xs font-medium text-ne-spark transition-colors hover:border-ne-spark hover:bg-ne-spark/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="plus" size={12} strokeWidth={2} />
            New Pitch
          </button>
        </div>

        {/* Sessions */}
        <div className="px-3 pb-1 pt-4 text-[9.5px] font-bold tracking-[0.13em] text-ne-ink-faint">
          SESSIONS
        </div>
        <div className="flex flex-col gap-0.5 px-2">
          {conversations.map((conv) => {
            const isActive = conv.id === activeConversation?.id;
            const isConfirmingDelete = deletingId === conv.id;
            return (
              <div
                key={conv.id}
                onClick={() => {
                  setDeletingId(null);
                  void setActiveConversation(conv.id);
                }}
                className={`group flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 transition-colors ${
                  isActive ? 'bg-ne-spark/10' : 'hover:bg-ne-bg1'
                }`}
              >
                <div
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    isActive ? 'bg-ne-spark' : 'bg-ne-bg3'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div
                    className={`truncate text-xs font-medium ${
                      isActive ? 'text-ne-ink' : 'text-ne-ink-dim'
                    }`}
                  >
                    {conv.title || 'New pitch'}
                  </div>
                  <div className="text-[10px] text-ne-ink-faint">
                    {formatRelativeTime(conv.updatedAt)}
                  </div>
                </div>
                <button
                  onClick={(e) => void handleDelete(e, conv.id)}
                  className={`shrink-0 rounded p-1 transition-colors ${
                    isConfirmingDelete
                      ? 'bg-ne-sable/20 text-ne-sable'
                      : 'text-ne-ink-faint opacity-0 hover:text-ne-sable group-hover:opacity-100'
                  }`}
                  title={isConfirmingDelete ? 'Click again to confirm' : 'Delete'}
                >
                  <Icon name="x" size={11} strokeWidth={2} />
                </button>
              </div>
            );
          })}
          {conversations.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-ne-ink-faint">
              No pitch sessions yet
            </div>
          )}
        </div>

        {/* Shelved pitches */}
        <div className="px-3 pb-1 pt-5 text-[9.5px] font-bold tracking-[0.13em] text-ne-ink-faint">
          SHELVED
        </div>
        {loading ? (
          <div className="px-3 py-4 text-center text-xs text-ne-ink-faint">Loading…</div>
        ) : pitches.length === 0 ? (
          <div className="px-3 py-3 text-center text-[11px] text-ne-ink-faint">
            No shelved pitches yet. Shelve a pitch from Spark to save it for later.
          </div>
        ) : (
          pitches.map((pitch) => <ShelvedPitchRow key={pitch.slug} pitch={pitch} />)
        )}
      </div>

      {/* Shelve current pitch */}
      <div className="shrink-0 border-t border-ne-line-soft p-2">
        <button
          onClick={() => void handleShelve()}
          disabled={!activeSlug || shelving}
          className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs text-ne-ink-dim transition-colors hover:bg-ne-bg1 hover:text-ne-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {shelveSuccess ? (
            <span className="flex items-center gap-1.5 text-ne-lumen">
              <Icon name="check" size={12} strokeWidth={2.4} />
              Pitch shelved
            </span>
          ) : shelving ? (
            'Shelving…'
          ) : (
            <>
              <Icon name="download" size={12} strokeWidth={2} />
              Shelve Current Pitch
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
