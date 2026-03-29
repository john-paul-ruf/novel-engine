import { useState, useRef, useEffect, forwardRef } from 'react';
import { useViewStore } from '../../stores/viewStore';
import { useTourStore } from '../../stores/tourStore';
import { useResizeHandle } from '../../hooks/useResizeHandle';
import { ResizeHandle } from './ResizeHandle';
import { BookSelector } from '../Sidebar/BookSelector';
import { HotTakeButton } from '../Sidebar/HotTakeButton';
import { AdhocRevisionButton } from '../Sidebar/AdhocRevisionButton';
import { PipelineTracker } from '../Sidebar/PipelineTracker';
import { FileTree } from '../Sidebar/FileTree';
import { CliActivityButton } from '../Sidebar/CliActivityButton';
import { PitchHistory } from '../Sidebar/PitchHistory';
import { Tooltip } from '../common/Tooltip';
import type { TourId } from '@domain/types';

type ViewId = 'chat' | 'files' | 'build' | 'pitch-room' | 'settings';

const NAV_TOOLTIPS: Record<ViewId, string> = {
  chat: 'Talk to AI agents about your book',
  files: 'Browse and edit your manuscript files (includes Motif Ledger)',
  build: 'Export your manuscript to DOCX, EPUB, or PDF',
  'pitch-room': 'Free brainstorming space — pitch ideas without committing to a book',
  settings: 'App preferences, model selection, and guided tours',
};

// 'chat' is rendered separately as ChatNavGroup (with Hot Take / Ad Hoc children)
const NAV_ITEMS: { id: ViewId; label: string; icon: string }[] = [
  { id: 'files', label: 'Files', icon: '📁' },
  { id: 'build', label: 'Build', icon: '📦' },
  { id: 'pitch-room', label: 'Pitch Room', icon: '💡' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

const NavButton = forwardRef<HTMLButtonElement, {
  icon: string;
  label: string;
  view: ViewId;
  isActive: boolean;
  onClick: () => void;
}>(function NavButton({ icon, label, view, isActive, onClick, ...rest }, ref) {
  return (
    <button
      ref={ref}
      onClick={onClick}
      className={`no-drag mb-0.5 flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
        isActive
          ? view === 'pitch-room'
            ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400'
            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
          : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-zinc-200'
      }`}
      {...rest}
    >
      <span className="text-base">{icon}</span>
      <span>{label}</span>
    </button>
  );
});

const HELP_TOURS: { id: TourId; label: string }[] = [
  { id: 'welcome', label: 'Welcome Tour' },
  { id: 'pipeline-intro', label: 'Pipeline Guide' },
];

function HelpButton(): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const startTour = useTourStore((s) => s.startTour);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={`no-drag mb-0.5 flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
          isOpen
            ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
            : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-zinc-200'
        }`}
        aria-label="Help menu"
        aria-expanded={isOpen}
      >
        <span className="text-base leading-none">?</span>
        <span>Help</span>
      </button>

      {isOpen && (
        <div className="absolute left-full top-0 ml-2 z-50 w-44 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-lg py-1">
          {HELP_TOURS.map((tour) => (
            <button
              key={tour.id}
              onClick={() => {
                startTour(tour.id);
                setIsOpen(false);
              }}
              className="w-full px-3 py-1.5 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
            >
              {tour.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ChatNavGroup({
  isActive,
  expanded,
  onToggle,
  onNavigateChat,
}: {
  isActive: boolean;
  expanded: boolean;
  onToggle: () => void;
  onNavigateChat: () => void;
}): React.ReactElement {
  return (
    <div>
      <div className="flex items-center">
        <button
          onClick={onNavigateChat}
          className={`no-drag mb-0.5 flex flex-1 items-center gap-3 rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
            isActive
              ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
              : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          <span className="text-base">💬</span>
          <span>Chat</span>
        </button>
        <button
          onClick={onToggle}
          className="no-drag p-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          aria-label={expanded ? 'Collapse chat section' : 'Expand chat section'}
        >
          <span style={{ display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 150ms' }}>▶</span>
        </button>
      </div>
      {expanded && (
        <div className="ml-5 mb-0.5 space-y-0.5">
          <button
            onClick={onNavigateChat}
            className="no-drag flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            💬 <span>Current Chat</span>
          </button>
          <HotTakeButton compact />
          <AdhocRevisionButton compact />
        </div>
      )}
    </div>
  );
}

const SIDEBAR_DEFAULT = 260;
const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 440;

export function Sidebar(): React.ReactElement {
  const { currentView, navigate } = useViewStore();
  const [activeSection, setActiveSection] = useState<'pipeline' | 'files'>('pipeline');
  const [chatExpanded, setChatExpanded] = useState(true);

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
      <div className="flex-1 min-w-0">
        <BookSelector />
      </div>

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
            <div data-tour="file-tree" className="min-h-0 flex-1 overflow-y-auto">
              <FileTree />
            </div>
          )}
        </div>
      </div>

      {/* Bottom nav */}
      <div data-tour="sidebar-nav" className="shrink-0 border-t border-zinc-200 dark:border-zinc-800 p-2">
        {/* Chat nav group with expandable Hot Take / Ad Hoc children */}
        <ChatNavGroup
          isActive={currentView === 'chat'}
          expanded={chatExpanded}
          onToggle={() => setChatExpanded((v) => !v)}
          onNavigateChat={() => navigate('chat')}
        />
        {NAV_ITEMS.map((item) => (
          <Tooltip key={item.id} content={NAV_TOOLTIPS[item.id]} placement="right">
            <NavButton
              icon={item.icon}
              label={item.label}
              view={item.id}
              isActive={currentView === item.id}
              onClick={() => navigate(item.id)}
            />
          </Tooltip>
        ))}
        {/* Help — tours and guides */}
        <HelpButton />
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
