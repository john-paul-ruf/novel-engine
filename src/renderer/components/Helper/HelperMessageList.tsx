import { useRef, useEffect } from 'react';
import type { Message } from '@domain/types';

export function HelperMessageList(props: {
  messages: Message[];
  isStreaming: boolean;
  isThinking: boolean;
  streamBuffer: string;
  thinkingBuffer: string;
  statusMessage: string;
}): React.ReactElement {
  const { messages, isStreaming, isThinking, streamBuffer, statusMessage } = props;
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamBuffer, isStreaming]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="rounded-full bg-blue-100 p-3 dark:bg-blue-900/30">
          <svg className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M12 18h.01" />
          </svg>
        </div>
        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
          Hi! I&apos;m your Novel Engine assistant.
        </p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Ask me anything about using the app — features, workflows, agents, troubleshooting, and more.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
              msg.role === 'user'
                ? 'bg-blue-500 text-white'
                : 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
            }`}
          >
            <div className="whitespace-pre-wrap break-words">{msg.content}</div>
          </div>
        </div>
      ))}

      {isStreaming && (
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-2xl bg-zinc-100 px-4 py-2 text-sm text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
            {isThinking && (
              <div className="mb-1 text-xs text-amber-500 dark:text-amber-400">Thinking...</div>
            )}
            {streamBuffer ? (
              <div className="whitespace-pre-wrap break-words">
                {streamBuffer}
                <span className="animate-pulse">|</span>
              </div>
            ) : statusMessage ? (
              <div className="text-xs text-zinc-400 dark:text-zinc-500">{statusMessage}</div>
            ) : (
              <div className="flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: '0ms' }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: '150ms' }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: '300ms' }} />
              </div>
            )}
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
