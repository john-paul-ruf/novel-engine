import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { MessageBubble } from './MessageBubble';
import { StreamingMessage } from './StreamingMessage';

export function MessageList(): React.ReactElement {
  const { messages, isStreaming, streamBuffer, thinkingBuffer, messageToolActivity } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Track if user is at the bottom using IntersectionObserver
  useEffect(() => {
    const sentinel = bottomRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsAtBottom(entry.isIntersecting);
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Auto-scroll when new content arrives, but only if user is at bottom
  const scrollToBottom = useCallback(() => {
    if (isAtBottom && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isAtBottom]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamBuffer, thinkingBuffer, scrollToBottom]);

  // Always scroll when streaming starts
  useEffect(() => {
    if (isStreaming && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isStreaming]);

  return (
    <div className="flex-1 overflow-y-auto py-4">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          toolActivity={messageToolActivity[message.id]}
        />
      ))}

      <StreamingMessage />

      {/* Bottom sentinel for auto-scroll detection */}
      <div ref={bottomRef} className="h-1" />
    </div>
  );
}
