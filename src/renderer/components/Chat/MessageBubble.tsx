import { useMemo } from 'react';
import { marked } from 'marked';
import type { Conversation, Message } from '@domain/types';
import { ThinkingBlock } from './ThinkingBlock';
import { CHARS_PER_TOKEN } from '@domain/constants';

marked.setOptions({ breaks: true, gfm: true });

type MessageBubbleProps = {
  message: Message;
  toolActivity?: string[];  // file paths written during this message's generation
  conversationOverride?: Conversation;  // used by modal to bypass chatStore
};

export function MessageBubble({ message, toolActivity, conversationOverride }: MessageBubbleProps): React.ReactElement {
  const isUser = message.role === 'user';
  const hasThinking = message.thinking.length > 0;

  const renderedHtml = useMemo(() => {
    if (isUser) return '';
    return String(marked.parse(message.content));
  }, [message.content, isUser]);

  const thinkingTokenEstimate = hasThinking
    ? Math.round(message.thinking.length / CHARS_PER_TOKEN)
    : undefined;

  if (isUser) {
    return (
      <div className="flex justify-end px-6 py-2">
        <div className="max-w-2xl rounded-2xl bg-blue-600 px-4 py-3 text-white">
          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start px-6 py-2">
      <div className="max-w-3xl">
        {hasThinking && (
          <ThinkingBlock
            content={message.thinking}
            isStreaming={false}
            tokenEstimate={thinkingTokenEstimate}
          />
        )}
        <div className="rounded-2xl bg-zinc-800 px-4 py-3 text-zinc-100">
          <div
            className="prose prose-invert prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        </div>
        {toolActivity && toolActivity.length > 0 && (
          <div className="mt-2 rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <span>📁</span>
              <span>{toolActivity.length} file{toolActivity.length !== 1 ? 's' : ''} written</span>
            </div>
            <div className="mt-1 space-y-0.5">
              {toolActivity.map((filePath) => (
                <div key={filePath} className="text-xs text-zinc-600 font-mono">
                  {filePath}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
