import { useEffect, useState } from 'react';

const isMac = navigator.userAgent.includes('Macintosh');

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
      <button
        onClick={() => window.novelEngine.window.minimize()}
        className="flex h-8 w-11 items-center justify-center text-zinc-500 dark:text-zinc-400 transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-200 dark:bg-zinc-700 hover:text-zinc-900 dark:text-zinc-100"
        aria-label="Minimize"
      >
        <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
          <rect width="10" height="1" />
        </svg>
      </button>

      {/* Maximize / Restore */}
      <button
        onClick={() => window.novelEngine.window.maximize()}
        className="flex h-8 w-11 items-center justify-center text-zinc-500 dark:text-zinc-400 transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-200 dark:bg-zinc-700 hover:text-zinc-900 dark:text-zinc-100"
        aria-label={isMaximized ? 'Restore' : 'Maximize'}
      >
        {isMaximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="2" y="0" width="8" height="8" rx="0.5" />
            <rect x="0" y="2" width="8" height="8" rx="0.5" fill="#09090b" />
            <rect x="0" y="2" width="8" height="8" rx="0.5" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" />
          </svg>
        )}
      </button>

      {/* Close */}
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

      {/* Center — app title on macOS */}
      {isMac && (
        <span className="text-xs font-medium text-zinc-500">Novel Engine</span>
      )}

      {/* Right — window controls on Windows/Linux, empty on macOS */}
      {isMac ? (
        <div className="w-[78px] shrink-0" />
      ) : (
        <WindowControls />
      )}
    </div>
  );
}
