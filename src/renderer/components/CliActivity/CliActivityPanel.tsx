import { useEffect, useRef } from 'react';
import { useCliActivityStore } from '../../stores/cliActivityStore';

/**
 * Hook component that keeps the CLI activity listener alive regardless of
 * whether the panel is visible. Mount this once in AppLayout.
 */
export function CliActivityListener(): null {
  const initListener = useCliActivityStore((s) => s.initListener);
  const destroyListener = useCliActivityStore((s) => s.destroyListener);
  const recoverActiveStream = useCliActivityStore((s) => s.recoverActiveStream);

  useEffect(() => {
    initListener();
    recoverActiveStream();
    return () => destroyListener();
  }, [initListener, destroyListener, recoverActiveStream]);

  return null;
}

const KIND_ICONS: Record<string, string> = {
  spawn: '🚀',
  status: '📡',
  'thinking-start': '🧠',
  'thinking-end': '🧠',
  'text-start': '📝',
  'text-end': '📝',
  'tool-start': '🔧',
  'tool-complete': '✅',
  'tool-error': '❌',
  'files-changed': '💾',
  done: '🏁',
  error: '🔴',
  'context-loaded': '📊',
};

const KIND_COLORS: Record<string, string> = {
  spawn: 'text-blue-600 dark:text-blue-400',
  status: 'text-zinc-500 dark:text-zinc-400',
  'thinking-start': 'text-amber-600 dark:text-amber-400',
  'thinking-end': 'text-amber-600 dark:text-amber-400',
  'text-start': 'text-zinc-700 dark:text-zinc-300',
  'text-end': 'text-zinc-700 dark:text-zinc-300',
  'tool-start': 'text-purple-600 dark:text-purple-400',
  'tool-complete': 'text-green-600 dark:text-green-400',
  'tool-error': 'text-red-600 dark:text-red-400',
  'files-changed': 'text-cyan-600 dark:text-cyan-400',
  done: 'text-green-600 dark:text-green-400',
  error: 'text-red-600 dark:text-red-400',
  'context-loaded': 'text-blue-300',
};

const CHARS_PER_TOKEN = 4;

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
}

function formatRelativeTime(entryTs: number, callStartTs: number): string {
  const delta = entryTs - callStartTs;
  if (delta < 0) return formatTime(entryTs);
  if (delta < 1000) return `+${delta}ms`;
  return `+${(delta / 1000).toFixed(1)}s`;
}

function TokenBadge({ label, value, color }: { label: string; value: number; color: string }): React.ReactElement {
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${color}`}>
      <span className="opacity-60">{label}</span>
      {formatTokens(value)}
    </span>
  );
}

/** The "Current Call" header showing agent, model, elapsed time, live token estimates */
function CallHeader(): React.ReactElement | null {
  const callMeta = useCliActivityStore((s) => s.callMeta);
  const isActive = useCliActivityStore((s) => s.isActive);
  const callElapsedMs = useCliActivityStore((s) => s.callElapsedMs);
  const streamingThinkingChars = useCliActivityStore((s) => s.streamingThinkingChars);
  const streamingTextChars = useCliActivityStore((s) => s.streamingTextChars);
  const currentToolName = useCliActivityStore((s) => s.currentToolName);
  const toolUseCount = useCliActivityStore((s) => s.toolUseCount);
  const estimatedCost = useCliActivityStore((s) => s.estimatedCost);
  const sessionInputTokens = useCliActivityStore((s) => s.sessionInputTokens);
  const sessionOutputTokens = useCliActivityStore((s) => s.sessionOutputTokens);
  const sessionThinkingTokens = useCliActivityStore((s) => s.sessionThinkingTokens);

  // Tick the elapsed time every 100ms while active
  const updateElapsed = useCliActivityStore((s) => s.updateElapsed);
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(updateElapsed, 100);
    return () => clearInterval(interval);
  }, [isActive, updateElapsed]);

  if (!callMeta) return null;

  const thinkingTokensEst = Math.round(streamingThinkingChars / CHARS_PER_TOKEN);
  const textTokensEst = Math.round(streamingTextChars / CHARS_PER_TOKEN);
  const isDone = !isActive && callElapsedMs > 0;

  return (
    <div className="shrink-0 border-b border-zinc-300 dark:border-zinc-700/50 bg-zinc-50 dark:bg-zinc-900/80 px-3 py-2">
      {/* Agent + Model row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: callMeta.agentColor }}
          />
          <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{callMeta.agentName}</span>
          <span className="text-[10px] text-zinc-500">{callMeta.agentRole}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
            {callMeta.modelLabel}
          </span>
          <span className={`font-mono text-xs tabular-nums ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-500'}`}>
            {formatDuration(callElapsedMs)}
          </span>
        </div>
      </div>

      {/* Live streaming stats */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {isActive && thinkingTokensEst > 0 && (
          <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
            <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-amber-400" />
            Think ~{formatTokens(thinkingTokensEst)}
          </span>
        )}
        {isActive && textTokensEst > 0 && (
          <span className="inline-flex items-center gap-1 rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-300">
            <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-green-400" />
            Text ~{formatTokens(textTokensEst)}
          </span>
        )}
        {isActive && currentToolName && (
          <span className="inline-flex items-center gap-1 rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] text-purple-300">
            <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-purple-400" />
            {currentToolName}
          </span>
        )}
        {toolUseCount > 0 && (
          <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
            {toolUseCount} tool{toolUseCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Final token summary + cost (shown after done) */}
      {isDone && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <TokenBadge label="IN" value={sessionInputTokens} color="bg-blue-500/10 text-blue-300" />
          <TokenBadge label="OUT" value={sessionOutputTokens} color="bg-green-500/10 text-green-300" />
          {sessionThinkingTokens > 0 && (
            <TokenBadge label="THINK" value={sessionThinkingTokens} color="bg-amber-500/10 text-amber-300" />
          )}
          {estimatedCost !== null && estimatedCost > 0 && (
            <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
              ${estimatedCost.toFixed(4)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Shows phase durations as a mini timeline */
function PhaseTimeline(): React.ReactElement | null {
  const phases = useCliActivityStore((s) => s.phases);
  const isActive = useCliActivityStore((s) => s.isActive);

  if (phases.length === 0) return null;

  // Only show completed phases (or active one at end)
  const completedPhases = phases.filter((p) => p.durationMs !== null);
  const activePhase = phases.find((p) => p.durationMs === null);

  if (completedPhases.length === 0 && !activePhase) return null;

  return (
    <div className="shrink-0 border-b border-zinc-300 dark:border-zinc-700/50 px-3 py-1.5">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
        Phases
      </div>
      <div className="flex flex-wrap gap-1">
        {completedPhases.map((phase, i) => {
          const isThinking = phase.label === 'Thinking';
          const isTool = phase.label.startsWith('Tool:');
          const bgColor = isThinking
            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            : isTool
              ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
              : 'bg-green-500/10 text-green-600 dark:text-green-400';

          return (
            <span key={i} className={`rounded px-1.5 py-0.5 text-[10px] ${bgColor}`}>
              {phase.label} {formatDuration(phase.durationMs!)}
            </span>
          );
        })}
        {activePhase && isActive && (
          <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-600 dark:text-blue-400">
            <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-blue-400" />
            {activePhase.label}
          </span>
        )}
      </div>
    </div>
  );
}

/** Tool use breakdown bar */
function ToolBreakdown(): React.ReactElement | null {
  const toolUseBreakdown = useCliActivityStore((s) => s.toolUseBreakdown);
  const toolUseCount = useCliActivityStore((s) => s.toolUseCount);

  if (toolUseCount === 0) return null;

  const entries = Object.entries(toolUseBreakdown).sort((a, b) => b[1] - a[1]);

  return (
    <div className="shrink-0 border-b border-zinc-300 dark:border-zinc-700/50 px-3 py-1.5">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
        Tool Usage
      </div>
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([name, count]) => (
          <span key={name} className="inline-flex items-center gap-1 rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] text-purple-300">
            {name}
            <span className="font-mono text-purple-600 dark:text-purple-400/70">{count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function DiagnosticsSection(): React.ReactElement | null {
  const diagnostics = useCliActivityStore((s) => s.diagnostics);
  if (!diagnostics) return null;

  return (
    <div className="border-b border-zinc-300 dark:border-zinc-700/50 px-3 py-2">
      <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Context Diagnostics
      </h4>
      <div className="space-y-1 text-xs">
        <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
          <span>Files available</span>
          <span className="font-mono text-zinc-700 dark:text-zinc-300">{diagnostics.filesAvailable.length}</span>
        </div>
        <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
          <span>Conversation turns sent</span>
          <span className="font-mono text-zinc-700 dark:text-zinc-300">{diagnostics.conversationTurnsSent}</span>
        </div>
        {diagnostics.conversationTurnsDropped > 0 && (
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
            <span>Turns dropped</span>
            <span className="font-mono text-amber-600 dark:text-amber-400">{diagnostics.conversationTurnsDropped}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
          <span>Manifest tokens</span>
          <span className="font-mono text-zinc-700 dark:text-zinc-300">~{diagnostics.manifestTokenEstimate.toLocaleString()}</span>
        </div>
        {diagnostics.filesAvailable.length > 0 && (
          <details className="mt-1">
            <summary className="cursor-pointer text-[10px] text-zinc-500 hover:text-zinc-500 dark:hover:text-zinc-400">
              Show files
            </summary>
            <div className="mt-1 max-h-24 overflow-y-auto rounded bg-zinc-50 dark:bg-zinc-900 p-1.5">
              {diagnostics.filesAvailable.map((f) => (
                <div key={f} className="truncate font-mono text-[10px] text-zinc-500">{f}</div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

export function CliActivityPanel(): React.ReactElement {
  const entries = useCliActivityStore((s) => s.entries);
  const isActive = useCliActivityStore((s) => s.isActive);
  const callMeta = useCliActivityStore((s) => s.callMeta);
  const close = useCliActivityStore((s) => s.close);
  const clear = useCliActivityStore((s) => s.clear);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length]);

  return (
    <div className="flex h-full w-[380px] shrink-0 flex-col border-l border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-300 dark:border-zinc-700 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">CLI Activity</span>
          {isActive && (
            <span className="flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-600 dark:text-blue-400">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
              Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clear}
            className="rounded p-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300"
            title="Clear log"
          >
            Clear
          </button>
          <button
            onClick={close}
            className="rounded p-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300"
            title="Close panel"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Call metadata header */}
      <CallHeader />

      {/* Phase timeline */}
      <PhaseTimeline />

      {/* Tool breakdown */}
      <ToolBreakdown />

      {/* Diagnostics section */}
      <DiagnosticsSection />

      {/* Log entries */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-1 py-1">
        {entries.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-zinc-500">No CLI activity yet</p>
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-600">
                Send a message to an agent to see what happens under the hood
              </p>
            </div>
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-start gap-2 rounded px-2 py-1 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50"
            >
              <span className="mt-px shrink-0 text-xs">{KIND_ICONS[entry.kind] ?? '•'}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className={`text-xs leading-tight ${KIND_COLORS[entry.kind] ?? 'text-zinc-500 dark:text-zinc-400'}`}>
                    {entry.message}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-zinc-400 dark:text-zinc-600">
                    {callMeta
                      ? formatRelativeTime(entry.timestamp, callMeta.startedAt)
                      : formatTime(entry.timestamp)}
                  </span>
                </div>
                {entry.tokens && (
                  <div className="mt-0.5 flex gap-1.5">
                    <span className="text-[10px] text-blue-600 dark:text-blue-400/70">
                      {formatTokens(entry.tokens.input)} in
                    </span>
                    <span className="text-[10px] text-green-600 dark:text-green-400/70">
                      {formatTokens(entry.tokens.output)} out
                    </span>
                    {entry.tokens.thinking > 0 && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400/70">
                        {formatTokens(entry.tokens.thinking)} think
                      </span>
                    )}
                  </div>
                )}
                {entry.detail && (
                  <pre className="mt-0.5 max-h-16 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-zinc-400 dark:text-zinc-600">
                    {entry.detail}
                  </pre>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
