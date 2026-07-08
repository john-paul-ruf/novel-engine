import { useEffect } from 'react';
import { useCliActivityStore, useActiveCallSummary } from '../../stores/cliActivityStore';
import { Icon } from '../common/Icon';

function formatElapsed(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  return `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(0)}s`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

/**
 * Persistent 28px bottom status bar — live task on the left, session
 * token total on the right, plus the activity drawer toggle.
 */
export function StatusBar(): React.ReactElement {
  const summary = useActiveCallSummary();
  const drawerOpen = useCliActivityStore((s) => s.drawerOpen);
  const toggleDrawer = useCliActivityStore((s) => s.toggleDrawer);
  const sessionTokens = useCliActivityStore((s) =>
    Object.values(s.calls).reduce(
      (sum, c) => sum + c.sessionInputTokens + c.sessionOutputTokens + c.sessionThinkingTokens,
      0,
    ),
  );

  // Tick elapsed time while a call is active
  const hasActive = summary !== null;
  useEffect(() => {
    if (!hasActive) return;
    const timer = setInterval(() => useCliActivityStore.getState().updateElapsed(), 1000);
    return () => clearInterval(timer);
  }, [hasActive]);

  return (
    <div className="flex h-7 shrink-0 items-center gap-3 border-t border-ne-line bg-ne-bg1 px-3 text-[11px] text-ne-ink-dim">
      {/* Left — live task */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {summary ? (
          <>
            <span className="relative flex h-2 w-2 shrink-0">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                style={{ backgroundColor: summary.agentColor }}
              />
              <span
                className="relative inline-flex h-2 w-2 rounded-full"
                style={{ backgroundColor: summary.agentColor }}
              />
            </span>
            <span className="truncate">
              <span className="font-medium text-ne-ink">{summary.agentName}</span>
              {summary.toolLabel && <span> · {summary.toolLabel}</span>}
              {summary.filePath && (
                <span className="font-ne-mono text-ne-ink-faint"> {summary.filePath}</span>
              )}
            </span>
            <span className="shrink-0 tabular-nums text-ne-ink-faint">
              {formatElapsed(summary.elapsedMs)}
            </span>
          </>
        ) : (
          <>
            <span className="h-2 w-2 shrink-0 rounded-full bg-ne-ink-faint opacity-40" />
            <span className="text-ne-ink-faint">Idle</span>
          </>
        )}
      </div>

      {/* Right — session tokens + drawer toggle */}
      <span className="shrink-0 tabular-nums text-ne-ink-faint">
        {formatTokens(sessionTokens)} tokens this session
      </span>
      <button
        onClick={toggleDrawer}
        className={`flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 transition-colors ${
          drawerOpen ? 'bg-ne-brass-dim text-ne-brass-hi' : 'hover:bg-ne-bg2 hover:text-ne-ink'
        }`}
        title={drawerOpen ? 'Hide activity drawer' : 'Show activity drawer'}
      >
        Activity
        <Icon name={drawerOpen ? 'chevronDown' : 'chevronUp'} size={11} strokeWidth={2} />
      </button>
    </div>
  );
}
