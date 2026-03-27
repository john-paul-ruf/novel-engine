import { useCallback, useState } from 'react';
import { usePitchRoomStore } from '../../stores/pitchRoomStore';

function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;

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

export function PitchHistory(): React.ReactElement {
  const conversations = usePitchRoomStore((s) => s.conversations);
  const activeConversation = usePitchRoomStore((s) => s.activeConversation);
  const setActiveConversation = usePitchRoomStore((s) => s.setActiveConversation);
  const startNewConversation = usePitchRoomStore((s) => s.startNewConversation);
  const deleteConversation = usePitchRoomStore((s) => s.deleteConversation);
  const isStreaming = usePitchRoomStore((s) => s.isStreaming);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (deletingId === id) {
        await deleteConversation(id);
        setDeletingId(null);
      } else {
        setDeletingId(id);
      }
    },
    [deletingId, deleteConversation],
  );

  const handleSelect = useCallback(
    (id: string) => {
      setDeletingId(null);
      setActiveConversation(id);
    },
    [setActiveConversation],
  );

  return (
    <div className="flex flex-col gap-1 px-2 py-1">
      {/* New pitch button */}
      <button
        onClick={startNewConversation}
        disabled={isStreaming}
        className="mb-1 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-amber-500/40 px-3 py-2 text-xs font-medium text-amber-500 transition-colors hover:border-amber-500 hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-40 dark:text-amber-400 dark:hover:bg-amber-500/10"
      >
        <span className="text-sm leading-none">+</span>
        New Pitch
      </button>

      {/* Conversation list */}
      {conversations.map((conv) => {
        const isActive = conv.id === activeConversation?.id;
        const isConfirmingDelete = deletingId === conv.id;

        return (
          <div
            key={conv.id}
            onClick={() => handleSelect(conv.id)}
            className={`group flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
              isActive
                ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-200'
            }`}
          >
            {/* Amber dot for active, subtle dot otherwise */}
            <div
              className={`h-2 w-2 shrink-0 rounded-full ${
                isActive
                  ? 'bg-amber-500'
                  : 'bg-zinc-300 dark:bg-zinc-700'
              }`}
            />

            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">
                {conv.title || 'New pitch'}
              </div>
              <div className="text-[10px] text-zinc-400 dark:text-zinc-600">
                {formatRelativeTime(conv.updatedAt)}
              </div>
            </div>

            <button
              onClick={(e) => handleDelete(e, conv.id)}
              className={`shrink-0 rounded p-1 text-xs transition-colors ${
                isConfirmingDelete
                  ? 'bg-red-600/20 text-red-500 dark:text-red-400'
                  : 'text-zinc-400 opacity-0 hover:text-red-500 group-hover:opacity-100 dark:text-zinc-600 dark:hover:text-red-400'
              }`}
              title={isConfirmingDelete ? 'Click again to confirm' : 'Delete'}
            >
              {isConfirmingDelete ? '✕' : '×'}
            </button>
          </div>
        );
      })}

      {conversations.length === 0 && (
        <div className="px-3 py-4 text-center text-xs text-zinc-400 dark:text-zinc-600">
          No pitch sessions yet
        </div>
      )}
    </div>
  );
}
