import { usePitchRoomStore } from '../../stores/pitchRoomStore';

export function PitchDraftSidebar(): React.ReactElement {
  const drafts = usePitchRoomStore((s) => s.drafts);
  const activeConversation = usePitchRoomStore((s) => s.activeConversation);
  const selectDraft = usePitchRoomStore((s) => s.selectDraft);
  const loading = usePitchRoomStore((s) => s.loading);

  if (loading) {
    return (
      <div className="flex w-48 shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800 p-3">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Drafts
        </h3>
        <div className="text-xs text-zinc-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex w-48 shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto">
      <div className="p-3">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Drafts ({drafts.length})
        </h3>
      </div>

      {drafts.length === 0 && (
        <div className="px-3 text-xs text-zinc-400">
          No drafts yet. Click &ldquo;+ New Pitch&rdquo; to start brainstorming.
        </div>
      )}

      <div className="flex flex-col gap-1 px-2">
        {drafts.map((draft) => {
          const isActive = activeConversation?.id === draft.conversationId;
          const dateStr = new Date(draft.updatedAt || draft.createdAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          });

          return (
            <button
              key={draft.conversationId}
              onClick={() => selectDraft(draft.conversationId)}
              className={`rounded-md px-3 py-2 text-left transition-colors ${
                isActive
                  ? 'bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-200 dark:ring-amber-800'
                  : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <div className="flex items-start gap-2">
                <span
                  className={`mt-1 block h-2 w-2 shrink-0 rounded-full ${
                    draft.hasPitch
                      ? 'bg-amber-500'
                      : 'border border-zinc-400 dark:border-zinc-600'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {draft.title}
                  </div>
                  <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
                    {dateStr}
                    {isActive && (
                      <span className="ml-1 text-amber-600 dark:text-amber-400">active</span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
