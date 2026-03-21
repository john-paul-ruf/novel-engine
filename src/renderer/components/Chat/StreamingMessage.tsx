import { useMemo } from 'react';
import { marked } from 'marked';
import { useChatStore } from '../../stores/chatStore';
import { ThinkingBlock } from './ThinkingBlock';
import { useRotatingStatus } from '../../hooks/useRotatingStatus';

marked.setOptions({ breaks: true, gfm: true });

export function StreamingMessage(): React.ReactElement | null {
  // Granular selectors — only re-render when these specific fields change,
  // not on unrelated state updates (conversations, toolActivity, etc.)
  const isStreaming = useChatStore((s) => s.isStreaming);
  const isThinking = useChatStore((s) => s.isThinking);
  const thinkingBuffer = useChatStore((s) => s.thinkingBuffer);
  const streamBuffer = useChatStore((s) => s.streamBuffer);

  const renderedHtml = useMemo(() => {
    if (!streamBuffer) return '';
    return String(marked.parse(streamBuffer));
  }, [streamBuffer]);

  const showThinking = thinkingBuffer.length > 0 || isThinking;
  const showResponse = streamBuffer.length > 0;
  const showStatus = isStreaming && !showThinking && !showResponse;

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
            {/* key forces re-mount so the fade-in fires on every new phrase.
                Each character gets its own wave delay, creating a ripple effect. */}
            <span key={rotatingStatus} className="status-fade-in inline-flex flex-wrap">
              {rotatingStatus.split('').map((char, i) => (
                <span
                  key={i}
                  className="wave-char"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  {char === ' ' ? '\u00A0' : char}
                </span>
              ))}
            </span>
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
