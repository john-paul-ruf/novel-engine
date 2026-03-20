import { useViewStore } from '../../stores/viewStore';

const NAV_ITEMS = [
  { id: 'chat' as const, label: 'Chat', icon: '💬' },
  { id: 'files' as const, label: 'Files', icon: '📄' },
  { id: 'build' as const, label: 'Build', icon: '📦' },
  { id: 'settings' as const, label: 'Settings', icon: '⚙️' },
];

export function Sidebar(): React.ReactElement {
  const { currentView, navigate } = useViewStore();

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-zinc-700 bg-zinc-900">
      {/* macOS drag region */}
      <div className="drag-region h-8 shrink-0" />

      {/* Book selector placeholder */}
      <div className="border-b border-zinc-700 px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Book
        </div>
        <div className="mt-1 text-sm text-zinc-400">No book selected</div>
      </div>

      {/* Pipeline tracker placeholder */}
      <div className="border-b border-zinc-700 px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Pipeline
        </div>
        <div className="mt-1 text-sm text-zinc-400">—</div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-2">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(item.id)}
            className={`mb-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
              currentView === item.id
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
            }`}
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Token usage placeholder */}
      <div className="border-t border-zinc-700 px-4 py-3">
        <div className="text-xs text-zinc-500">Token usage</div>
        <div className="mt-1 text-xs text-zinc-500">—</div>
      </div>
    </aside>
  );
}
