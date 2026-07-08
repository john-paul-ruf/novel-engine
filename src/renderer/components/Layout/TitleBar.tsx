import { useEffect, useState } from 'react';
import { Tooltip } from '../common/Tooltip';
import { Icon } from '../common/Icon';
import { useViewStore } from '../../stores/viewStore';
import { useBookStore } from '../../stores/bookStore';
import { usePaletteStore } from '../../stores/paletteStore';

const isMac = navigator.userAgent.includes('Macintosh');

const VIEW_LABELS: Record<string, string> = {
  library: 'Library',
  workspace: 'Workspace',
  manuscript: 'Manuscript',
  exports: 'Exports',
  settings: 'Settings',
  statistics: 'Statistics',
  'pitch-room': 'Pitch Room',
  onboarding: 'Welcome',
  dashboard: 'Dashboard',
  chat: 'Chat',
  files: 'Files',
  build: 'Build',
  reading: 'Reading',
};

/** `{book title} / {view}` — book title omitted in the Library and when no book is active. */
function Breadcrumb(): React.ReactElement {
  const currentView = useViewStore((s) => s.currentView);
  const bookTitle = useBookStore((s) => s.books.find((b) => b.slug === s.activeSlug)?.title);
  const label = VIEW_LABELS[currentView] ?? '';

  if (currentView === 'library' || !bookTitle) {
    return <span className="text-xs font-semibold text-ne-ink">{label}</span>;
  }
  return (
    <span className="text-xs text-ne-ink-dim">
      <span className="font-semibold text-ne-ink">{bookTitle}</span>
      <span className="mx-1.5 text-ne-ink-faint">/</span>
      {label}
    </span>
  );
}

/** Live word count for the active book — hidden in the Library. */
function WordCount(): React.ReactElement | null {
  const totalWordCount = useBookStore((s) => s.totalWordCount);
  const hasBook = useBookStore((s) => s.activeSlug !== '');
  const currentView = useViewStore((s) => s.currentView);

  if (!hasBook || currentView === 'library') return null;
  return (
    <span className="text-[11px] tabular-nums text-ne-ink-faint">
      {totalWordCount.toLocaleString()} words
    </span>
  );
}

/** ⌘K pill — opens the command palette. */
function CommandPill(): React.ReactElement {
  return (
    <button
      onClick={() => usePaletteStore.getState().open()}
      className="no-drag flex items-center gap-1.5 rounded-md border border-ne-line bg-ne-bg2 px-2 py-[3px] text-[11px] text-ne-ink-dim transition-colors hover:border-ne-brass hover:text-ne-ink"
    >
      <Icon name="search" size={12} strokeWidth={2} />
      Search
      <kbd className="rounded border border-ne-line bg-ne-bg0 px-1 font-ne-mono text-[10px] text-ne-ink-faint">
        ⌘K
      </kbd>
    </button>
  );
}

function WindowControls(): React.ReactElement {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    window.novelEngine.window.isMaximized().then(setIsMaximized);
    const cleanup = window.novelEngine.window.onMaximizeChange(setIsMaximized);
    return cleanup;
  }, []);

  return (
    <div className="no-drag flex items-center">
      {/* Minimize */}
      <Tooltip content="Minimize window" placement="bottom">
      <button
        onClick={() => window.novelEngine.window.minimize()}
        className="flex h-8 w-11 items-center justify-center text-zinc-500 dark:text-zinc-400 transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-zinc-100"
        aria-label="Minimize"
      >
        <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
          <rect width="10" height="1" />
        </svg>
      </button>
      </Tooltip>

      {/* Maximize / Restore */}
      <Tooltip content={isMaximized ? 'Restore window' : 'Maximize window'} placement="bottom">
      <button
        onClick={() => window.novelEngine.window.maximize()}
        className="flex h-8 w-11 items-center justify-center text-zinc-500 dark:text-zinc-400 transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-zinc-100"
        aria-label={isMaximized ? 'Restore' : 'Maximize'}
      >
        {isMaximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="2" y="0" width="8" height="8" rx="0.5" />
            <rect x="0" y="2" width="8" height="8" rx="0.5" className="fill-zinc-50 dark:fill-zinc-900" />
            <rect x="0" y="2" width="8" height="8" rx="0.5" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" />
          </svg>
        )}
      </button>
      </Tooltip>

      {/* Close */}
      <Tooltip content="Close window" placement="bottom">
      <button
        onClick={() => window.novelEngine.window.close()}
        className="flex h-8 w-11 items-center justify-center text-zinc-500 dark:text-zinc-400 transition-colors hover:bg-red-600 hover:text-white"
        aria-label="Close"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
          <line x1="1" y1="1" x2="9" y2="9" />
          <line x1="9" y1="1" x2="1" y2="9" />
        </svg>
      </button>
      </Tooltip>
    </div>
  );
}

export function TitleBar(): React.ReactElement {
  return (
    <div className="drag-region flex h-8 w-full shrink-0 items-center justify-between bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
      {/* Left spacer — accounts for macOS traffic lights */}
      {isMac ? (
        <div className="w-[78px] shrink-0" />
      ) : (
        <div className="shrink-0 px-3">
          <span className="text-xs font-medium text-zinc-500">Novel Engine</span>
        </div>
      )}

      {/* Center — book / view breadcrumb */}
      <div className="min-w-0 flex-1 truncate text-center">
        <Breadcrumb />
      </div>

      {/* Right — word count + ⌘K pill, then window controls on Windows/Linux */}
      <div className="flex shrink-0 items-center gap-2.5 pr-2">
        <WordCount />
        <CommandPill />
        {!isMac && <WindowControls />}
      </div>
    </div>
  );
}
