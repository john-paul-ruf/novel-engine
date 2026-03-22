import { useMemo } from 'react';
import { marked } from 'marked';
import type { ProgressStage, TimestampedToolUse } from '@domain/types';
import { useChatStore } from '../../stores/chatStore';
import { ThinkingBlock } from './ThinkingBlock';
import { useRotatingStatus } from '../../hooks/useRotatingStatus';

marked.setOptions({ breaks: true, gfm: true });

const STAGE_CONFIG: Record<ProgressStage, { label: string; icon: string; color: string }> = {
  idle: { label: 'Waiting', icon: '⏳', color: 'text-zinc-400' },
  reading: { label: 'Reading files', icon: '📖', color: 'text-cyan-400' },
  thinking: { label: 'Thinking deeply', icon: '🧠', color: 'text-amber-400' },
  drafting: { label: 'Writing', icon: '✍️', color: 'text-green-400' },
  editing: { label: 'Editing', icon: '✏️', color: 'text-violet-400' },
  reviewing: { label: 'Self-reviewing', icon: '🔍', color: 'text-blue-400' },
  complete: { label: 'Complete', icon: '✅', color: 'text-emerald-400' },
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function ProgressStageIndicator({ stage }: { stage: ProgressStage }): React.ReactElement | null {
  if (stage === 'idle' || stage === 'complete') return null;

  const config = STAGE_CONFIG[stage];

  return (
    <div className="flex items-center gap-2 py-1 text-xs">
      <span className="animate-pulse">{config.icon}</span>
      <span className={config.color}>{config.label}</span>
      <span className="h-1 w-1 rounded-full bg-zinc-600 animate-pulse" />
    </div>
  );
}

function ToolTimingsList({ timings }: { timings: TimestampedToolUse[] }): React.ReactElement | null {
  // Only show the last 5 tools to avoid clutter
  const recent = timings.slice(-5);
  if (recent.length === 0) return null;

  return (
    <div className="mt-1 space-y-0.5">
      {recent.map((tool, i) => (
        <div key={`${tool.toolId}-${i}`} className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-500 font-mono">
          <span className="text-zinc-600 dark:text-zinc-400">{tool.toolName}</span>
          {tool.filePath && (
            <span className="truncate max-w-xs text-zinc-400 dark:text-zinc-600">{tool.filePath.split('/').slice(-2).join('/')}</span>
          )}
          {tool.durationMs != null && (
            <span className="text-zinc-500 dark:text-zinc-600 ml-auto">{formatDuration(tool.durationMs)}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function StreamingMessage(): React.ReactElement | null {
  // Granular selectors — only re-render when these specific fields change,
  // not on unrelated state updates (conversations, toolActivity, etc.)
  const isStreaming = useChatStore((s) => s.isStreaming);
  const isThinking = useChatStore((s) => s.isThinking);
  const thinkingBuffer = useChatStore((s) => s.thinkingBuffer);
  const streamBuffer = useChatStore((s) => s.streamBuffer);
  const progressStage = useChatStore((s) => s.progressStage);
  const thinkingSummary = useChatStore((s) => s.thinkingSummary);
  const toolTimings = useChatStore((s) => s.toolTimings);

  const renderedHtml = useMemo(() => {
    if (!streamBuffer) return '';
    return String(marked.parse(streamBuffer));
  }, [streamBuffer]);

  const showThinking = thinkingBuffer.length > 0 || isThinking;
  const showResponse = streamBuffer.length > 0;
  const showStatus = isStreaming && !showThinking && !showResponse;
  const showActivityPanel = isStreaming && (progressStage !== 'idle' || toolTimings.length > 0);

  // Rotate through fun status phrases every 15–30 s while waiting
  const rotatingStatus = useRotatingStatus(showStatus);

  if (!isStreaming) return null;

  return (
    <div className="px-6 py-2">
      <div className="max-w-3xl">
        {showStatus && (
          <div className="flex items-center gap-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">
            {/* Three bouncing dots — staggered for a lively wave effect */}
            <span className="flex items-center gap-0.5">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce"
                style={{ animationDelay: '0ms', animationDuration: '900ms' }}
              />
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce"
                style={{ animationDelay: '150ms', animationDuration: '900ms' }}
              />
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-blue-300 animate-bounce"
                style={{ animationDelay: '300ms', animationDuration: '900ms' }}
              />
            </span>
            {/* key forces re-mount so the fade-in fires on every new phrase */}
            <span key={rotatingStatus} className="status-fade-in shimmer-text">
              {rotatingStatus}
            </span>
          </div>
        )}

        {/* Live activity panel — shows progress stage + recent tool activity */}
        {showActivityPanel && (
          <div className="mb-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-3 py-2">
            <ProgressStageIndicator stage={progressStage} />
            {thinkingSummary && progressStage !== 'thinking' && (
              <p className="text-xs text-zinc-400 dark:text-zinc-600 italic mt-1 line-clamp-2">
                💭 {thinkingSummary}
              </p>
            )}
            <ToolTimingsList timings={toolTimings} />
          </div>
        )}

        {showThinking && (
          <ThinkingBlock
            content={thinkingBuffer}
            isStreaming={isThinking}
          />
        )}

        {showResponse && (
          <div className="rounded-2xl bg-zinc-100 dark:bg-zinc-800 px-4 py-3 text-zinc-900 dark:text-zinc-100">
            <div
              className="prose dark:prose-invert prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-zinc-400" />
          </div>
        )}
      </div>
    </div>
  );
}
