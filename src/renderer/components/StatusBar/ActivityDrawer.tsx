import { useCliActivityStore } from '../../stores/cliActivityStore';
import { useVerticalResize } from '../../hooks/useVerticalResize';
import { CliActivityContent } from '../CliActivity/CliActivityPanel';

const DRAWER_DEFAULT = 208;
const DRAWER_MIN = 120;
const DRAWER_MAX = 480;

/**
 * Expandable bottom activity drawer (VS Code terminal pattern) hosting the
 * relocated CLI activity panel. Sits between the body row and the status bar.
 */
export function ActivityDrawer(): React.ReactElement {
  const drawerOpen = useCliActivityStore((s) => s.drawerOpen);

  const { height, isDragging, onMouseDown, resetHeight } = useVerticalResize({
    initialHeight: DRAWER_DEFAULT,
    minHeight: DRAWER_MIN,
    maxHeight: DRAWER_MAX,
    storageKey: 'novel-engine:activity-drawer-height',
    direction: 'up',
  });

  return (
    <div
      className={`shrink-0 overflow-hidden border-ne-line bg-ne-bg1 ${
        drawerOpen ? 'border-t' : ''
      } ${isDragging ? '' : 'transition-[height] duration-150'}`}
      style={{ height: drawerOpen ? height : 0 }}
    >
      <div className="relative flex h-full min-h-0 flex-col">
        {/* Top-edge drag handle */}
        <div
          onMouseDown={onMouseDown}
          onDoubleClick={resetHeight}
          className={`absolute inset-x-0 top-0 z-10 h-1.5 cursor-row-resize ${
            isDragging ? 'bg-ne-brass/40' : 'hover:bg-ne-brass/20'
          }`}
          title="Drag to resize · Double-click to reset"
        />
        <CliActivityContent />
      </div>
    </div>
  );
}
