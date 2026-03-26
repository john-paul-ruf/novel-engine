import React, { useEffect, useRef, useMemo, useState } from 'react';
import { useCliActivityStore } from '../../stores/cliActivityStore';
import { useResizeHandle } from '../../hooks/useResizeHandle';
import { useVerticalResize } from '../../hooks/useVerticalResize';
import { ResizeHandle } from '../Layout/ResizeHandle';
import type { CliCall } from '../../stores/cliActivityStore';
import type { AgentName } from '@domain/types';
import { AGENT_REGISTRY } from '@domain/constants';
import { KIND_ICONS, KIND_COLORS, formatTime } from './constants';

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

const CHARS_PER_TOKEN = 4;

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

/** Thin horizontal drag handle for vertical resizing between sections */
function VerticalDragHandle({ isDragging, onMouseDown, onDoubleClick }: {
  isDragging: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick?: () => void;
}): React.ReactElement {
  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      className="group relative z-10 flex h-[5px] shrink-0 cursor-row-resize items-center justify-center"
      title="Drag to resize · Double-click to reset"
    >
      <div
        className={`h-px w-full transition-colors duration-150 ${
          isDragging
            ? 'bg-blue-500'
            : 'bg-transparent group-hover:bg-blue-400/60'
        }`}
      />
    </div>
  );
}

/** Compact collapsible wrapper for CLI panel sections with optional vertical resize */
function CollapsiblePanel({ title, defaultExpanded = true, isActive, badge, resizable, children }: {
  title: string;
  defaultExpanded?: boolean;
  isActive?: boolean;
  badge?: React.ReactNode;
  /** When provided, the section becomes vertically resizable */
  resizable?: {
    storageKey: string;
    initialHeight: number;
    minHeight: number;
    maxHeight: number;
  };
  children: React.ReactNode;
}): React.ReactElement {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const { height, isDragging, onMouseDown, resetHeight } = useVerticalResize({
    initialHeight: resizable?.initialHeight ?? 120,
    minHeight: resizable?.minHeight ?? 40,
    maxHeight: resizable?.maxHeight ?? 500,
    storageKey: resizable?.storageKey,
  });

  useEffect(() => {
    if (isActive === false) setExpanded(false);
  }, [isActive]);

  return (
    <div className="shrink-0 border-b border-zinc-300 dark:border-zinc-700/50">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className={`h-2.5 w-2.5 shrink-0 text-zinc-400 dark:text-zinc-600 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
        >
          <path d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" />
        </svg>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
          {title}
        </span>
        {badge && <span className="ml-auto">{badge}</span>}
      </button>
      {expanded && (
        <>
          {resizable ? (
            <div className="overflow-y-auto" style={{ height }}>
              {children}
            </div>
          ) : (
            children
          )}
          {resizable && (
            <VerticalDragHandle
              isDragging={isDragging}
              onMouseDown={onMouseDown}
              onDoubleClick={resetHeight}
            />
          )}
        </>
      )}
    </div>
  );
}

// === Call List (tab bar showing all tracked calls) ===

function CallListItem({ call, isSelected, onSelect, onClear }: {
  call: CliCall;
  isSelected: boolean;
  onSelect: () => void;
  onClear: () => void;
}): React.ReactElement {
  const meta = call.callMeta;

  return (
    <button
      onClick={onSelect}
      className={`group flex items-center gap-1.5 rounded px-2 py-1 text-left transition-colors ${
        isSelected
          ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
          : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
      }`}
    >
      {/* Activity dot */}
      <span className="relative flex h-2 w-2 shrink-0">
        {call.isActive ? (
          <>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: meta.agentColor }} />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: meta.agentColor }} />
          </>
        ) : (
          <span className="inline-flex h-2 w-2 rounded-full opacity-50" style={{ backgroundColor: meta.agentColor }} />
        )}
      </span>

      {/* Agent name */}
      <span className="truncate text-[11px] font-medium">{meta.agentName}</span>

      {/* Book slug (abbreviated) */}
      <span className="hidden truncate text-[10px] opacity-50 sm:inline">
        {meta.bookSlug.length > 12 ? meta.bookSlug.slice(0, 12) + '\u2026' : meta.bookSlug}
      </span>

      {/* Duration or "active" */}
      {call.isActive ? (
        <span className="ml-auto shrink-0 text-[10px] text-blue-500">
          {formatDuration(call.callElapsedMs)}
        </span>
      ) : (
        <span className="ml-auto shrink-0 text-[10px] opacity-40">
          {formatDuration(call.callElapsedMs)}
        </span>
      )}

      {/* Close button */}
      {!call.isActive && (
        <span
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          className="ml-0.5 hidden shrink-0 items-center justify-center rounded h-4 w-4 text-zinc-400 hover:bg-zinc-300 dark:hover:bg-zinc-700 hover:text-zinc-600 dark:hover:text-zinc-300 group-hover:inline-flex transition-colors"
          title="Remove from list"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </span>
      )}
    </button>
  );
}

/** Filter dropdown styled as a minimal select */
function FilterSelect<T extends string>({ value, onChange, options, placeholder, renderOption }: {
  value: T | null;
  onChange: (val: T | null) => void;
  options: T[];
  placeholder: string;
  renderOption?: (opt: T) => string;
}): React.ReactElement {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange((e.target.value || null) as T | null)}
      className="h-6 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/80 px-1.5 text-[10px] text-zinc-600 dark:text-zinc-300 outline-none hover:border-zinc-400 dark:hover:border-zinc-600 focus:border-blue-500 transition-colors appearance-none cursor-pointer min-w-0"
      style={{ backgroundImage: 'none', paddingRight: '0.5rem' }}
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {renderOption ? renderOption(opt) : opt}
        </option>
      ))}
    </select>
  );
}

function FilterBar(): React.ReactElement | null {
  const calls = useCliActivityStore((s) => s.calls);
  const callOrder = useCliActivityStore((s) => s.callOrder);
  const filterAgent = useCliActivityStore((s) => s.filterAgent);
  const filterBook = useCliActivityStore((s) => s.filterBook);
  const setFilterAgent = useCliActivityStore((s) => s.setFilterAgent);
  const setFilterBook = useCliActivityStore((s) => s.setFilterBook);
  const getFilteredCallOrder = useCliActivityStore((s) => s.getFilteredCallOrder);

  const agentNames = useMemo(() => {
    const names = new Set<AgentName>();
    for (const id of callOrder) {
      const call = calls[id];
      if (call) names.add(call.callMeta.agentName);
    }
    return [...names].sort();
  }, [calls, callOrder]);

  const bookSlugs = useMemo(() => {
    const slugs = new Set<string>();
    for (const id of callOrder) {
      const call = calls[id];
      if (call?.callMeta.bookSlug) slugs.add(call.callMeta.bookSlug);
    }
    return [...slugs].sort();
  }, [calls, callOrder]);

  // Only show filter bar when there's something worth filtering
  if (callOrder.length < 2 && !filterAgent && !filterBook) return null;

  const hasFilters = filterAgent !== null || filterBook !== null;
  const filteredCount = getFilteredCallOrder().length;
  const totalCount = callOrder.length;

  return (
    <div className="shrink-0 border-b border-zinc-300 dark:border-zinc-700/50 px-3 py-1.5">
      <div className="flex items-center gap-1.5">
        {/* Filter icon */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0 text-zinc-400 dark:text-zinc-600">
          <path d="M14 2H2l5 5.6V12l2 1V7.6L14 2Z" />
        </svg>

        {agentNames.length > 1 && (
          <FilterSelect<AgentName>
            value={filterAgent}
            onChange={setFilterAgent}
            options={agentNames}
            placeholder="All agents"
            renderOption={(name) => {
              const info = AGENT_REGISTRY[name];
              return info ? `${name} — ${info.role}` : name;
            }}
          />
        )}

        {bookSlugs.length > 1 && (
          <FilterSelect<string>
            value={filterBook}
            onChange={setFilterBook}
            options={bookSlugs}
            placeholder="All books"
            renderOption={(slug) => slug.length > 20 ? slug.slice(0, 20) + '…' : slug}
          />
        )}

        {hasFilters && (
          <>
            <span className="text-[10px] text-zinc-500 dark:text-zinc-500 tabular-nums">
              {filteredCount}/{totalCount}
            </span>
            <button
              onClick={() => { setFilterAgent(null); setFilterBook(null); }}
              className="ml-auto rounded px-1 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
              title="Clear filters"
            >
              Reset
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function CallList(): React.ReactElement | null {
  const calls = useCliActivityStore((s) => s.calls);
  const callOrder = useCliActivityStore((s) => s.callOrder);
  const selectedCallId = useCliActivityStore((s) => s.selectedCallId);
  const selectCall = useCliActivityStore((s) => s.selectCall);
  const clearCall = useCliActivityStore((s) => s.clearCall);
  const filteredOrder = useCliActivityStore((s) => s.getFilteredCallOrder)();

  if (callOrder.length <= 1 && filteredOrder.length <= 1) return null;

  return (
    <div className="shrink-0 border-b border-zinc-300 dark:border-zinc-700/50 px-2 py-1.5">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
        CLI Calls ({filteredOrder.length}{filteredOrder.length !== callOrder.length ? `/${callOrder.length}` : ''})
      </div>
      <div className="flex max-h-28 flex-col gap-0.5 overflow-y-auto">
        {filteredOrder.map((id) => {
          const call = calls[id];
          if (!call) return null;
          return (
            <CallListItem
              key={id}
              call={call}
              isSelected={id === selectedCallId}
              onSelect={() => selectCall(id)}
              onClear={() => clearCall(id)}
            />
          );
        })}
      </div>
    </div>
  );
}

// === Call Detail (header, phases, tools, entries for the selected call) ===

function CallHeader({ call }: { call: CliCall }): React.ReactElement {
  const updateElapsed = useCliActivityStore((s) => s.updateElapsed);
  const { callMeta: meta, isActive, callElapsedMs } = call;

  // Tick the elapsed time every 100ms while active
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(updateElapsed, 100);
    return () => clearInterval(interval);
  }, [isActive, updateElapsed]);

  const thinkingTokensEst = Math.round(call.streamingThinkingChars / CHARS_PER_TOKEN);
  const textTokensEst = Math.round(call.streamingTextChars / CHARS_PER_TOKEN);
  const isDone = !isActive && callElapsedMs > 0;

  const durationBadge = (
    <span className={`font-mono text-[10px] tabular-nums ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-500'}`}>
      {formatDuration(callElapsedMs)}
    </span>
  );

  return (
    <CollapsiblePanel
      title={`${meta.agentName} — ${meta.agentRole}`}
      defaultExpanded={true}
      isActive={isActive}
      badge={durationBadge}
      resizable={{ storageKey: 'novel-engine:cli-header-height', initialHeight: 100, minHeight: 50, maxHeight: 300 }}
    >
      <div className="bg-zinc-50 dark:bg-zinc-900/80 px-3 pb-2">
        {/* Agent + Model row */}
        <div className="flex items-center gap-2">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: meta.agentColor }}
          />
          <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{meta.agentName}</span>
          <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
            {meta.modelLabel}
          </span>
          {meta.bookSlug && (
            <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
              {meta.bookSlug}
            </span>
          )}
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
          {isActive && call.currentToolName && (
            <span className="inline-flex items-center gap-1 rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] text-purple-300">
              <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-purple-400" />
              {call.currentToolName}
            </span>
          )}
          {call.toolUseCount > 0 && (
            <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
              {call.toolUseCount} tool{call.toolUseCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Final token summary (shown after done) */}
        {isDone && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <TokenBadge label="IN" value={call.sessionInputTokens} color="bg-blue-500/10 text-blue-300" />
            <TokenBadge label="OUT" value={call.sessionOutputTokens} color="bg-green-500/10 text-green-300" />
            {call.sessionThinkingTokens > 0 && (
              <TokenBadge label="THINK" value={call.sessionThinkingTokens} color="bg-amber-500/10 text-amber-300" />
            )}
          </div>
        )}
      </div>
    </CollapsiblePanel>
  );
}

/** Shows phase durations as a mini timeline */
function PhaseTimeline({ call }: { call: CliCall }): React.ReactElement | null {
  const { phases, isActive } = call;

  if (phases.length === 0) return null;

  const completedPhases = phases.filter((p) => p.durationMs !== null);
  const activePhase = phases.find((p) => p.durationMs === null);

  if (completedPhases.length === 0 && !activePhase) return null;

  const phaseBadge = (
    <span className="text-[10px] tabular-nums text-zinc-500">{phases.length}</span>
  );

  return (
    <CollapsiblePanel title="Phases" defaultExpanded={false} isActive={call.isActive} badge={phaseBadge} resizable={{ storageKey: 'novel-engine:cli-phases-height', initialHeight: 80, minHeight: 40, maxHeight: 300 }}>
      <div className="px-3 pb-1.5">
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
    </CollapsiblePanel>
  );
}

/** Tool use breakdown bar */
function ToolBreakdown({ call }: { call: CliCall }): React.ReactElement | null {
  if (call.toolUseCount === 0) return null;

  const entries = Object.entries(call.toolUseBreakdown).sort((a, b) => b[1] - a[1]);

  const toolBadge = (
    <span className="text-[10px] tabular-nums text-zinc-500">{call.toolUseCount}</span>
  );

  return (
    <CollapsiblePanel title="Tool Usage" defaultExpanded={false} isActive={call.isActive} badge={toolBadge} resizable={{ storageKey: 'novel-engine:cli-tools-height', initialHeight: 80, minHeight: 40, maxHeight: 300 }}>
      <div className="px-3 pb-1.5">
        <div className="flex flex-wrap gap-1.5">
          {entries.map(([name, count]) => (
            <span key={name} className="inline-flex items-center gap-1 rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] text-purple-300">
              {name}
              <span className="font-mono text-purple-600 dark:text-purple-400/70">{count}</span>
            </span>
          ))}
        </div>
      </div>
    </CollapsiblePanel>
  );
}

function DiagnosticsSection({ call }: { call: CliCall }): React.ReactElement | null {
  const diagnostics = call.diagnostics;
  if (!diagnostics) return null;

  const diagBadge = (
    <span className="text-[10px] tabular-nums text-zinc-500">{diagnostics.filesAvailable.length} files</span>
  );

  return (
    <CollapsiblePanel title="Context Diagnostics" defaultExpanded={false} badge={diagBadge} resizable={{ storageKey: 'novel-engine:cli-diag-height', initialHeight: 100, minHeight: 40, maxHeight: 300 }}>
      <div className="px-3 pb-2">
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
    </CollapsiblePanel>
  );
}

function EntryList({ call }: { call: CliCall }): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [call.entries.length]);

  const entryBadge = (
    <span className="text-[10px] tabular-nums text-zinc-500">{call.entries.length}</span>
  );

  if (call.entries.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-zinc-500">No activity recorded</p>
        </div>
      </div>
    );
  }

  return (
    <CollapsiblePanel
      title="Activity Log"
      defaultExpanded={false}
      isActive={call.isActive}
      badge={entryBadge}
      resizable={{ storageKey: 'novel-engine:cli-activity-height', initialHeight: 200, minHeight: 60, maxHeight: 600 }}
    >
      <div ref={scrollRef} className="h-full overflow-y-auto px-1 py-1">
        {call.entries.map((entry) => (
          <div
            key={entry.id}
            className="flex items-start gap-2 rounded px-2 py-1 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50"
          >
            <span className="mt-px shrink-0 text-xs">{KIND_ICONS[entry.kind] ?? '\u2022'}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className={`text-xs leading-tight ${KIND_COLORS[entry.kind] ?? 'text-zinc-500 dark:text-zinc-400'}`}>
                  {entry.message}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-zinc-400 dark:text-zinc-600">
                  {formatRelativeTime(entry.timestamp, call.callMeta.startedAt)}
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
        ))}
      </div>
    </CollapsiblePanel>
  );
}

// === Main Panel ===

const CLI_PANEL_DEFAULT = 380;
const CLI_PANEL_MIN = 280;
const CLI_PANEL_MAX = 700;

export function CliActivityPanel(): React.ReactElement {
  const calls = useCliActivityStore((s) => s.calls);
  const callOrder = useCliActivityStore((s) => s.callOrder);
  const selectedCallId = useCliActivityStore((s) => s.selectedCallId);
  const filterAgent = useCliActivityStore((s) => s.filterAgent);
  const filterBook = useCliActivityStore((s) => s.filterBook);
  const close = useCliActivityStore((s) => s.close);
  const clear = useCliActivityStore((s) => s.clear);

  const { width, isDragging, onMouseDown, resetWidth } = useResizeHandle({
    direction: 'right',
    initialWidth: CLI_PANEL_DEFAULT,
    minWidth: CLI_PANEL_MIN,
    maxWidth: CLI_PANEL_MAX,
    storageKey: 'novel-engine:cli-panel-width',
  });

  const activeCount = Object.values(calls).filter((c) => c.isActive).length;
  const selectedCall = selectedCallId ? calls[selectedCallId] : null;
  const hasFilters = filterAgent !== null || filterBook !== null;
  const filteredOrder = useCliActivityStore((s) => s.getFilteredCallOrder)();

  return (
    <div
      className="relative flex h-full shrink-0 flex-col border-l border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900"
      style={{ width }}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-300 dark:border-zinc-700 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">CLI Activity</span>
          {activeCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-600 dark:text-blue-400">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
              {activeCount} Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clear}
            className="rounded p-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300"
            title="Clear all"
          >
            Clear
          </button>
          <button
            onClick={close}
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
            title="Close panel"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Filter bar (shown when there are multiple calls to filter) */}
      <FilterBar />

      {/* Call list (only shown when multiple calls exist) */}
      <CallList />

      {/* Selected call detail — scrollable container for resizable sections */}
      {selectedCall ? (
        <div key={selectedCallId} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <CallHeader call={selectedCall} />
          <PhaseTimeline call={selectedCall} />
          <ToolBreakdown call={selectedCall} />
          <DiagnosticsSection call={selectedCall} />
          <EntryList call={selectedCall} />
        </div>
      ) : callOrder.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-zinc-500">No CLI activity yet</p>
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-600">
              Send a message to an agent to see what happens under the hood
            </p>
          </div>
        </div>
      ) : hasFilters && filteredOrder.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-zinc-500">No calls match filters</p>
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-600">
              Try adjusting the agent or book filter above
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-zinc-500">Select a call to view details</p>
        </div>
      )}

      {/* Resize handle on left edge */}
      <ResizeHandle
        side="left"
        isDragging={isDragging}
        onMouseDown={onMouseDown}
        onDoubleClick={resetWidth}
      />
    </div>
  );
}
