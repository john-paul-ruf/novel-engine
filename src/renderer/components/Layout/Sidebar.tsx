import { useViewStore } from '../../stores/viewStore';
import { BookSelector } from '../Sidebar/BookSelector';
import { PipelineTracker } from '../Sidebar/PipelineTracker';
import { FileTree } from '../Sidebar/FileTree';

type ViewId = 'chat' | 'files' | 'build' | 'settings';

const NAV_ITEMS: { id: ViewId; label: string; icon: string }[] = [
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'files', label: 'Files', icon: '📁' },
  { id: 'build', label: 'Build', icon: '📦' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

function NavButton({
  icon,
  label,
  view,
  isActive,
  onClick,
}: {
  icon: string;
  label: string;
  view: ViewId;
  isActive: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className={`no-drag mb-0.5 flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
        isActive
          ? 'bg-zinc-800 text-zinc-100'
          : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
      }`}
    >
      <span className="text-base">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export function Sidebar(): React.ReactElement {
  const { currentView, navigate } = useViewStore();

  return (
    <aside className="flex h-screen w-[260px] shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
      {/* macOS drag region */}
      <div className="drag-region h-8 shrink-0" />

      {/* Book selector */}
      <BookSelector />

      {/* Pipeline tracker + File tree — scrollable */}
      <div className="flex-1 overflow-y-auto">
        <PipelineTracker />

        {/* Divider */}
        <div className="mx-3 my-2 border-t border-zinc-800" />

        {/* File tree */}
        <FileTree />
      </div>

      {/* Bottom nav */}
      <div className="shrink-0 border-t border-zinc-800 p-2">
        {NAV_ITEMS.map((item) => (
          <NavButton
            key={item.id}
            icon={item.icon}
            label={item.label}
            view={item.id}
            isActive={currentView === item.id}
            onClick={() => navigate(item.id)}
          />
        ))}
      </div>
    </aside>
  );
}
