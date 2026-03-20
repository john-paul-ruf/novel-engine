import { useEffect, useRef } from 'react';
import { useCliActivityStore } from '../../stores/cliActivityStore';

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
  spawn: 'text-blue-400',
  status: 'text-zinc-400',
  'thinking-start': 'text-amber-400',
  'thinking-end': 'text-amber-400',
  'text-start': 'text-zinc-300',
  'text-end': 'text-zinc-300',
  'tool-start': 'text-purple-400',
  'tool-complete': 'text-green-400',
  'tool-error': 'text-red-400',
  'files-changed': 'text-cyan-400',
  done: 'text-green-400',
  error: 'text-red-400',
  'context-loaded': 'text-blue-300',
};

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
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function TokenBadge({ label, value, color }: { label: string; value: number; color: string }): React.ReactElement {
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${color}`}>
      <span className="opacity-60">{label}</span>
      {formatTokens(value)}
    </span>
  );
}

function DiagnosticsSection(): React.ReactElement | null {
  const diagnostics = useCliActivityStore((s) => s.diagnostics);
  if (!diagnostics) return null;

  return (
    <div className="border-t border-zinc-700/50 px-3 py-2">
      <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Context Diagnostics
      </h4>
      <div className="space-y-1 text-xs">
        <div className="flex items-center justify-between text-zinc-400">
          <span>Files available</span>
          <span className="font-mono text-zinc-300">{diagnostics.filesAvailable.length}</span>
        </div>
        <div className="flex items-center justify-between text-zinc-400">
          <span>Conversation turns sent</span>
          <span className="font-mono text-zinc-300">{diagnostics.conversationTurnsSent}</span>
        </div>
        {diagnostics.conversationTurnsDropped > 0 && (
          <div className="flex items-center justify-between text-zinc-400">
            <span>Turns dropped</span>
            <span className="font-mono text-amber-400">{diagnostics.conversationTurnsDropped}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-zinc-400">
          <span>Manifest tokens</span>
          <span className="font-mono text-zinc-300">~{diagnostics.manifestTokenEstimate.toLocaleString()}</span>
        </div>
        {diagnostics.filesAvailable.length > 0 && (
          <details className="mt-1">
            <summary className="cursor-pointer text-[10px] text-zinc-500 hover:text-zinc-400">
              Show files
            </summary>
            <div className="mt-1 max-h-24 overflow-y-auto rounded bg-zinc-900 p-1.5">
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

export function CliActivityPanel(): React.ReactElement | null {
  const {
    entries,
    isOpen,
    isActive,
    currentToolName,
    sessionInputTokens,
    sessionOutputTokens,
    sessionThinkingTokens,
    close,
    clear,
    initListener,
    destroyListener,
  } = useCliActivityStore();

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length]);

  // Initialize the CLI activity listener
  useEffect(() => {
    initListener();
    return () => destroyListener();
  }, [initListener, destroyListener]);

  if (!isOpen) return null;

  const hasTokens = sessionInputTokens > 0 || sessionOutputTokens > 0;

  return (
    <div className="fixed right-0 top-0 z-50 flex h-screen w-[380px] flex-col border-l border-zinc-700 bg-zinc-900 shadow-2xl">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-700 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-200">CLI Activity</span>
          {isActive && (
            <span className="flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-400">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
              Active
            </span>
          )}
          {currentToolName && (
            <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] text-purple-400">
              {currentToolName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clear}
            className="rounded p-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            title="Clear log"
          >
            🗑️
          </button>
          <button
            onClick={close}
            className="rounded p-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            title="Close panel"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Token summary bar */}
      {hasTokens && (
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-900/80 px-3 py-1.5">
          <TokenBadge label="IN" value={sessionInputTokens} color="bg-blue-500/10 text-blue-300" />
          <TokenBadge label="OUT" value={sessionOutputTokens} color="bg-green-500/10 text-green-300" />
          {sessionThinkingTokens > 0 && (
            <TokenBadge label="THINK" value={sessionThinkingTokens} color="bg-amber-500/10 text-amber-300" />
          )}
        </div>
      )}

      {/* Diagnostics section */}
      <DiagnosticsSection />

      {/* Log entries */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-1 py-1">
        {entries.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-zinc-500">No CLI activity yet</p>
              <p className="mt-1 text-xs text-zinc-600">
                Send a message to an agent to see what happens under the hood
              </p>
            </div>
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-start gap-2 rounded px-2 py-1 hover:bg-zinc-800/50"
            >
              <span className="mt-px shrink-0 text-xs">{KIND_ICONS[entry.kind] ?? '•'}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className={`text-xs leading-tight ${KIND_COLORS[entry.kind] ?? 'text-zinc-400'}`}>
                    {entry.message}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-zinc-600">
                    {formatTime(entry.timestamp)}
                  </span>
                </div>
                {entry.tokens && (
                  <div className="mt-0.5 flex gap-1.5">
                    <span className="text-[10px] text-blue-400/70">
                      {formatTokens(entry.tokens.input)} in
                    </span>
                    <span className="text-[10px] text-green-400/70">
                      {formatTokens(entry.tokens.output)} out
                    </span>
                    {entry.tokens.thinking > 0 && (
                      <span className="text-[10px] text-amber-400/70">
                        {formatTokens(entry.tokens.thinking)} think
                      </span>
                    )}
                  </div>
                )}
                {entry.detail && (
                  <pre className="mt-0.5 max-h-16 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-zinc-600">
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
