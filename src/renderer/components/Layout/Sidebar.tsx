import { useState, forwardRef } from 'react';
import { useViewStore } from '../../stores/viewStore';
import { useResizeHandle } from '../../hooks/useResizeHandle';
import { useRightPanelStore } from '../../stores/rightPanelStore';
import { useHelperStore } from '../../stores/helperStore';
import { ResizeHandle } from './ResizeHandle';
import { BookPanel } from '../Sidebar/BookPanel';
import { HotTakeButton } from '../Sidebar/HotTakeButton';
import { AdhocRevisionButton } from '../Sidebar/AdhocRevisionButton';
import { CliActivityButton } from '../Sidebar/CliActivityButton';
import { PitchHistory } from '../Sidebar/PitchHistory';
import { Tooltip } from '../common/Tooltip';

type ViewId = 'dashboard' | 'chat' | 'files' | 'build' | 'pitch-room' | 'reading' | 'settings';

const NAV_TOOLTIPS: Record<ViewId, string> = {
  dashboard: 'Project overview — pipeline status, word count, recent activity',
  chat: 'Talk to AI agents about your book',
  files: 'Browse and edit your manuscript files (includes Motif Ledger)',
  build: 'Export your manuscript to DOCX, EPUB, or PDF',
  'pitch-room': 'Free brainstorming space — pitch ideas without committing to a book',
  reading: 'Read the full manuscript from start to finish',
  settings: 'App preferences, model selection, and guided tours',
};

// 'chat' is rendered separately as ChatNavGroup (with Hot Take / Ad Hoc children)
const NAV_ITEMS: { id: ViewId; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'files', label: 'Files', icon: '📁' },
  { id: 'build', label: 'Build', icon: '📦' },
  { id: 'pitch-room', label: 'Pitch Room', icon: '💡' },
  { id: 'reading', label: 'Reading Mode', icon: '📖' },
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

/**
 * "Help" entry inside the Chat nav group's expanded section.
 * Replaces the old floating HelperButton FAB and the standalone HelpButton.
 */
function ChatHelpEntry(): React.ReactElement {
  const toggle = useHelperStore((s) => s.toggle);
  const isOpen = useHelperStore((s) => s.isOpen);
  return (
    <button
      onClick={toggle}
      className={`no-drag flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors ${
        isOpen
          ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
          : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-zinc-200'
      }`}
    >
      <span>❓</span>
      <span>Help</span>
    </button>
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
          <ChatHelpEntry />
        </div>
      )}
    </div>
  );
}

const SIDEBAR_DEFAULT = 260;
const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 440;

/**
 * Toggle button for showing/hiding the Pipeline right column.
 * Placed in the bottom nav just before the CLI Activity separator.
 */
function PipelineToggleButton(): React.ReactElement {
  const isOpen = useRightPanelStore((s) => s.pipelineOpen);
  const toggle = useRightPanelStore((s) => s.togglePipeline);
  return (
    <Tooltip content="Show/hide the pipeline tracker" placement="right">
      <button
        onClick={toggle}
        className={`no-drag mb-0.5 flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
          isOpen
            ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
            : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-zinc-200'
        }`}
      >
        <span className="text-base">🗂️</span>
        <span>Pipeline</span>
      </button>
    </Tooltip>
  );
}

export function Sidebar(): React.ReactElement {
  const { currentView, navigate } = useViewStore();
  const [chatExpanded, setChatExpanded] = useState(true);

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
      <div className="flex min-h-0 flex-1 flex-col">
        {currentView === 'pitch-room' ? (
          <div className="flex min-h-0 flex-col">
            <div className="flex shrink-0 items-center border-b border-zinc-200 dark:border-zinc-800 px-3 py-2">
              <span className="text-xs font-medium uppercase tracking-wider text-amber-500 dark:text-amber-400">
                Pitch Sessions
              </span>
            </div>
            <div className="min-h-0 max-h-48 overflow-y-auto">
              <PitchHistory />
            </div>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col">
          <BookPanel />
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
        {/* Pipeline toggle — shows/hides the Pipeline right column */}
        <PipelineToggleButton />
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
