import { useState } from 'react';
import { useViewStore } from '../../stores/viewStore';
import { useResizeHandle } from '../../hooks/useResizeHandle';
import { ResizeHandle } from './ResizeHandle';
import { BookSelector } from '../Sidebar/BookSelector';
import { HotTakeButton } from '../Sidebar/HotTakeButton';
import { AdhocRevisionButton } from '../Sidebar/AdhocRevisionButton';
import { PipelineTracker } from '../Sidebar/PipelineTracker';
import { FileTree } from '../Sidebar/FileTree';
import { CliActivityButton } from '../Sidebar/CliActivityButton';
import { PitchHistory } from '../Sidebar/PitchHistory';

type ViewId = 'chat' | 'files' | 'build' | 'pitch-room' | 'settings';

const NAV_ITEMS: { id: ViewId; label: string; icon: string }[] = [
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'files', label: 'Files', icon: '📁' },
  { id: 'build', label: 'Build', icon: '📦' },
  { id: 'pitch-room', label: 'Pitch Room', icon: '💡' },
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
          ? view === 'pitch-room'
            ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400'
            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
          : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-zinc-200'
      }`}
    >
      <span className="text-base">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

const SIDEBAR_DEFAULT = 260;
const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 440;

export function Sidebar(): React.ReactElement {
  const { currentView, navigate } = useViewStore();
  const [activeSection, setActiveSection] = useState<'pipeline' | 'files'>('pipeline');

  const toggleSection = (section: 'pipeline' | 'files') => {
    setActiveSection((prev) => (prev === section ? section : section));
  };

  const pipelineOpen = activeSection === 'pipeline';
  const filesOpen = activeSection === 'files';

  const { width, isDragging, onMouseDown, resetWidth } = useResizeHandle({
    direction: 'left',
    initialWidth: SIDEBAR_DEFAULT,
    minWidth: SIDEBAR_MIN,
    maxWidth: SIDEBAR_MAX,
    storageKey: 'novel-engine:sidebar-width',
  });

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900"
      style={{ width }}
    >
      {/* Book selector */}
      <BookSelector />

      {/* Accordion sections — share remaining vertical space */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Pipeline accordion (hidden in pitch room) / Pitch history (shown in pitch room) */}
        {currentView === 'pitch-room' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center border-t border-zinc-200 dark:border-zinc-800 px-3 py-2">
              <span className="text-xs font-medium uppercase tracking-wider text-amber-500 dark:text-amber-400">Pitch Sessions</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <PitchHistory />
            </div>
          </div>
        ) : (
          <div className={`flex flex-col ${pipelineOpen ? 'min-h-0 flex-1' : 'shrink-0'}`}>
            <button
              onClick={() => toggleSection('pipeline')}
              className="no-drag flex w-full shrink-0 items-center gap-1.5 border-t border-zinc-200 dark:border-zinc-800 px-3 py-2 text-left"
            >
              <span className="text-[10px] text-zinc-400 transition-transform duration-150"
                style={{ transform: pipelineOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
              >
                ▶
              </span>
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Pipeline</span>
            </button>
            {pipelineOpen && (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <PipelineTracker />
              </div>
            )}
          </div>
        )}

        {/* Files accordion */}
        <div className={`flex flex-col ${filesOpen ? 'min-h-0 flex-1' : 'shrink-0'}`}>
          <div className="flex shrink-0 items-center border-t border-zinc-200 dark:border-zinc-800">
            <button
              onClick={() => toggleSection('files')}
              className="no-drag flex flex-1 items-center gap-1.5 px-3 py-2 text-left"
            >
              <span className="text-[10px] text-zinc-400 transition-transform duration-150"
                style={{ transform: filesOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
              >
                ▶
              </span>
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Files</span>
            </button>
          </div>
          {filesOpen && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <FileTree />
            </div>
          )}
        </div>
      </div>

      {/* Quick actions — above nav, below scrollable area */}
      {currentView !== 'pitch-room' && (
        <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-800 px-2 py-1">
          <HotTakeButton />
          <AdhocRevisionButton />
        </div>
      )}

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

      {/* Resize handle on right edge */}
      <ResizeHandle
        side="right"
        isDragging={isDragging}
        onMouseDown={onMouseDown}
        onDoubleClick={resetWidth}
      />
    </aside>
  );
}
