import { useMemo } from 'react';
import { marked } from 'marked';
import { useChatStore } from '../../stores/chatStore';
import { ThinkingBlock } from './ThinkingBlock';

marked.setOptions({ breaks: true, gfm: true });

export function StreamingMessage(): React.ReactElement | null {
  const { isStreaming, isThinking, thinkingBuffer, streamBuffer } = useChatStore();

  const renderedHtml = useMemo(() => {
    if (!streamBuffer) return '';
    return String(marked.parse(streamBuffer));
  }, [streamBuffer]);

  if (!isStreaming) return null;

  const showThinking = thinkingBuffer.length > 0 || isThinking;
  const showResponse = streamBuffer.length > 0;

  return (
    <div className="px-6 py-2">
      <div className="max-w-3xl">
        {showThinking && (
          <ThinkingBlock
            content={thinkingBuffer}
            isStreaming={isThinking}
          />
        )}

        {showResponse && (
          <div className="rounded-2xl bg-zinc-800 px-4 py-3 text-zinc-100">
            <div
              className="prose prose-invert prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-zinc-400" />
          </div>
        )}
      </div>
    </div>
  );
}
