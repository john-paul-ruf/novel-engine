import { useMemo } from 'react';
import { marked } from 'marked';
import { useChatStore } from '../../stores/chatStore';
import { ThinkingBlock } from './ThinkingBlock';

marked.setOptions({ breaks: true, gfm: true });

export function StreamingMessage(): React.ReactElement | null {
  // Granular selectors — only re-render when these specific fields change,
  // not on unrelated state updates (conversations, toolActivity, etc.)
  const isStreaming = useChatStore((s) => s.isStreaming);
  const isThinking = useChatStore((s) => s.isThinking);
  const thinkingBuffer = useChatStore((s) => s.thinkingBuffer);
  const streamBuffer = useChatStore((s) => s.streamBuffer);
  const statusMessage = useChatStore((s) => s.statusMessage);

  const renderedHtml = useMemo(() => {
    if (!streamBuffer) return '';
    return String(marked.parse(streamBuffer));
  }, [streamBuffer]);

  if (!isStreaming) return null;

  const showThinking = thinkingBuffer.length > 0 || isThinking;
  const showResponse = streamBuffer.length > 0;
  const showStatus = statusMessage && !showThinking && !showResponse;

  return (
    <div className="px-6 py-2">
      <div className="max-w-3xl">
        {showStatus && (
          <div className="flex items-center gap-2 py-2 text-sm text-zinc-500 dark:text-zinc-400">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            {statusMessage}
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
