import { AGENT_REGISTRY } from '@domain/constants';
import { useBookStore } from '../../stores/bookStore';
import { useChatStore } from '../../stores/chatStore';

export function ChatTitleBar(): React.ReactElement {
  const { activeSlug, books } = useBookStore();
  // Granular selector — bare useChatStore() re-renders on every streaming delta.
  const activeConversation = useChatStore((s) => s.activeConversation);

  const activeBook = books.find((b) => b.slug === activeSlug);
  const agentMeta = activeConversation
    ? AGENT_REGISTRY[activeConversation.agentName]
    : null;

  return (
    <div className="drag-region flex h-10 shrink-0 items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/50 px-4">
      {/* Left: view label + book title */}
      <div className="no-drag flex items-center gap-2 text-sm">
        <span className="font-medium text-zinc-500 dark:text-zinc-400">Chat</span>
        {activeBook && (
          <>
            <span className="text-zinc-700">/</span>
            <span className="truncate text-zinc-500">{activeBook.title}</span>
          </>
        )}
      </div>

      {/* Right: active agent indicator */}
      <div className="no-drag flex items-center gap-2">
        {agentMeta && activeConversation && (
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: agentMeta.color }}
            />
            <span>{activeConversation.agentName}</span>
          </div>
        )}
      </div>
    </div>
  );
}
