import { useCliActivityStore } from '../../stores/cliActivityStore';

/**
 * Sidebar button that toggles the CLI Activity panel.
 * Visible from every view — shows a live pulsing dot and active call count
 * while CLI calls are in flight.
 */
export function CliActivityButton(): React.ReactElement {
  const isOpen = useCliActivityStore((s) => s.isOpen);
  const calls = useCliActivityStore((s) => s.calls);
  const toggle = useCliActivityStore((s) => s.toggle);

  const activeCount = Object.values(calls).filter((c) => c.isActive).length;
  const isActive = activeCount > 0;

  return (
    <button
      onClick={toggle}
      title={isOpen ? 'Hide CLI activity' : 'Show CLI activity'}
      className={`no-drag mb-0.5 flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
        isOpen
          ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
          : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-zinc-200'
      }`}
    >
      {/* Terminal icon with optional live-activity badge */}
      <span className="relative flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center text-base">
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-full w-full"
          aria-hidden="true"
        >
          <rect x="1" y="2" width="14" height="12" rx="1.5" />
          <polyline points="4,6 7,8 4,10" />
          <line x1="8.5" y1="10" x2="11.5" y2="10" />
        </svg>

        {/* Pulsing dot — only visible when a CLI call is in-flight */}
        {isActive && (
          <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
          </span>
        )}
      </span>

      <span>CLI Activity</span>

      {/* "Live" badge when active — shows count when multiple calls are in flight */}
      {isActive && !isOpen && (
        <span className="ml-auto flex items-center gap-1 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
          <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-blue-400" />
          {activeCount > 1 ? `${activeCount} Live` : 'Live'}
        </span>
      )}
    </button>
  );
}
