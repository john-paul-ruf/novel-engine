import { useViewStore } from '../../stores/viewStore';
import { useResizeHandle } from '../../hooks/useResizeHandle';
import { ResizeHandle } from './ResizeHandle';
import { BookPanel } from '../Sidebar/BookPanel';
import { PitchHistory } from '../Sidebar/PitchHistory';

const SIDEBAR_DEFAULT = 260;
const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 440;

export function Sidebar(): React.ReactElement {
  const { currentView } = useViewStore();

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
