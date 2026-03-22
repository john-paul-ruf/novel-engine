import { useViewStore } from '../../stores/viewStore';
import { BookSelector } from '../Sidebar/BookSelector';
import { VoiceSetupButton } from '../Sidebar/VoiceSetupButton';
import { PipelineTracker } from '../Sidebar/PipelineTracker';
import { FileTree } from '../Sidebar/FileTree';
import { CliActivityButton } from '../Sidebar/CliActivityButton';

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
          ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
          : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-zinc-200'
      }`}
    >
      <span className="text-base">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function PitchRoomButton(): React.ReactElement {
  const { currentView, navigate } = useViewStore();

  return (
    <button
      onClick={() => navigate('pitch-room')}
      className={`no-drag flex w-full items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 px-3 py-2 text-sm transition-colors ${
        currentView === 'pitch-room'
          ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400'
          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
      }`}
    >
      <span>💡</span>
      <span>Pitch Room</span>
    </button>
  );
}

export function Sidebar(): React.ReactElement {
  const { currentView, navigate } = useViewStore();

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
      {/* Book selector */}
      <BookSelector />

      {/* Voice setup — contextual to active book */}
      <VoiceSetupButton />

      {/* Pitch Room — always accessible */}
      <PitchRoomButton />

      {/* Pipeline tracker + File tree — scrollable */}
      <div className="flex-1 overflow-y-auto">
        {/* Hide the pipeline tracker in the Pitch Room — that view is a
            pre-pipeline creative space and showing 14 downstream phases
            (First Draft, Revision, Copy Edit, …) is confusing noise. */}
        {currentView !== 'pitch-room' && (
          <>
            <PipelineTracker />

            {/* Divider */}
            <div className="mx-3 my-2 border-t border-zinc-200 dark:border-zinc-800" />
          </>
        )}

        {/* File tree */}
        <FileTree />
      </div>

      {/* Bottom nav */}
      <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-800 p-2">
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
        {/* CLI Activity toggle — docks/undocks the right-side activity panel from any view */}
        <div className="mt-0.5 border-t border-zinc-200 dark:border-zinc-800 pt-1">
          <CliActivityButton />
        </div>
      </div>
    </aside>
  );
}
