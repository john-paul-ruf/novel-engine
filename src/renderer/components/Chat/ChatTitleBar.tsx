import { AGENT_REGISTRY } from '@domain/constants';
import { useBookStore } from '../../stores/bookStore';
import { useChatStore } from '../../stores/chatStore';
import { useCliActivityStore } from '../../stores/cliActivityStore';

export function ChatTitleBar(): React.ReactElement {
  const { activeSlug, books } = useBookStore();
  // Granular selector — bare useChatStore() re-renders on every streaming delta.
  const activeConversation = useChatStore((s) => s.activeConversation);
  const cliPanelOpen = useCliActivityStore((s) => s.isOpen);
  const toggleCliPanel = useCliActivityStore((s) => s.toggle);
  const cliCalls = useCliActivityStore((s) => s.calls);
  const cliActive = Object.values(cliCalls).some((c) => c.isActive);
  const totalEntries = Object.values(cliCalls).reduce((sum, c) => sum + c.entries.length, 0);

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

      {/* Right: active agent indicator + streaming status + CLI activity button */}
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

        {/* CLI Activity toggle button */}
        <button
          onClick={toggleCliPanel}
          className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
            cliPanelOpen
              ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
              : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
          title="Toggle CLI Activity Monitor"
        >
          {cliActive ? (
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
          ) : (
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600" />
          )}
          <span>CLI</span>
          {totalEntries > 0 && (
            <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1 font-mono text-[10px] text-zinc-500">
              {totalEntries}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
