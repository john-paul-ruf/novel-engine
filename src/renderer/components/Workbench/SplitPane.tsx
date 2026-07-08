import { useEffect, useRef, useState } from 'react';
import { Icon } from '../common/Icon';

const RATIO_KEY = 'novel-engine:workbench-split';
const COLLAPSED_KEY = 'novel-engine:workbench-split-collapsed';
const DEFAULT_RATIO = 0.52;
const MIN_RATIO = 0.3;
const MAX_RATIO = 0.7;

function loadRatio(): number {
  try {
    const raw = localStorage.getItem(RATIO_KEY);
    if (raw !== null) {
      const parsed = parseFloat(raw);
      if (!isNaN(parsed) && parsed >= MIN_RATIO && parsed <= MAX_RATIO) return parsed;
    }
  } catch {
    // localStorage might be unavailable
  }
  return DEFAULT_RATIO;
}

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function persist(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

type SplitPaneProps = {
  left: React.ReactNode;
  right: React.ReactNode;
};

/**
 * Chat ‖ companion split with a draggable divider (ratio persisted),
 * double-click reset, and a chevron that collapses the companion pane.
 * The collapsed pane stays mounted (hidden) to preserve its state.
 */
export function SplitPane({ left, right }: SplitPaneProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(loadRatio);
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [isDragging, setIsDragging] = useState(false);
  const ratioRef = useRef(ratio);

  useEffect(() => {
    ratioRef.current = ratio;
  }, [ratio]);

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const next = (e.clientX - rect.left) / rect.width;
      setRatio(Math.max(MIN_RATIO, Math.min(MAX_RATIO, next)));
    };
    const onMouseUp = () => {
      setIsDragging(false);
      persist(RATIO_KEY, String(ratioRef.current));
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      persist(COLLAPSED_KEY, String(!prev));
      return !prev;
    });
  };

  const resetRatio = () => {
    setRatio(DEFAULT_RATIO);
    persist(RATIO_KEY, String(DEFAULT_RATIO));
  };

  return (
    <div ref={containerRef} className="flex h-full min-h-0 min-w-0">
      {/* Chat pane */}
      <div
        className="flex min-h-0 min-w-0 flex-col"
        style={{ width: collapsed ? '100%' : `${ratio * 100}%` }}
      >
        {left}
      </div>

      {/* Divider */}
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={collapsed ? undefined : (e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDoubleClick={collapsed ? undefined : resetRatio}
        title={collapsed ? undefined : 'Drag to resize · Double-click to reset'}
        className={`group relative flex w-[5px] shrink-0 items-center justify-center ${
          collapsed ? '' : 'cursor-col-resize'
        }`}
      >
        <div
          className={`h-full w-px transition-colors ${
            isDragging ? 'bg-ne-brass' : 'bg-ne-line group-hover:bg-ne-brass/60'
          }`}
        />
        {/* Collapse / expand chevron */}
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={toggleCollapsed}
          title={collapsed ? 'Show companion pane' : 'Hide companion pane'}
          className={`absolute top-1/2 z-10 flex h-9 w-4 -translate-y-1/2 items-center justify-center rounded border border-ne-line bg-ne-bg1 text-ne-ink-faint transition-colors hover:text-ne-brass-hi ${
            collapsed ? '-left-3' : '-left-2'
          }`}
        >
          <Icon
            name="chevronRight"
            size={11}
            strokeWidth={2}
            className={collapsed ? 'rotate-180' : ''}
          />
        </button>
      </div>

      {/* Companion pane — stays mounted when collapsed to preserve its state */}
      <div
        className={`min-h-0 min-w-0 flex-col border-l border-ne-line ${
          collapsed ? 'hidden' : 'flex flex-1'
        }`}
      >
        {right}
      </div>
    </div>
  );
}
