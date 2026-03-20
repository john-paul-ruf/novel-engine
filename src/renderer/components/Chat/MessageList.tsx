import { useEffect, useRef } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { MessageBubble } from './MessageBubble';
import { StreamingMessage } from './StreamingMessage';

export function MessageList(): React.ReactElement {
  // Granular selectors — DO NOT subscribe to streamBuffer/thinkingBuffer here.
  // StreamingMessage handles its own subscriptions. Subscribing here would
  // re-render every MessageBubble on every streaming delta.
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const messageToolActivity = useChatStore((s) => s.messageToolActivity);

  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  // Track if user is at the bottom using IntersectionObserver.
  // Use a ref instead of state to avoid re-renders on scroll.
  useEffect(() => {
    const sentinel = bottomRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        isAtBottomRef.current = entry.isIntersecting;
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Scroll to bottom when messages change (new message added or conversation switched)
  useEffect(() => {
    if (isAtBottomRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Always scroll when streaming starts
  useEffect(() => {
    if (isStreaming && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isStreaming]);

  // During streaming, use a MutationObserver on the container to auto-scroll
  // as StreamingMessage appends content — without subscribing to store updates.
  useEffect(() => {
    if (!isStreaming || !containerRef.current) return;

    const container = containerRef.current;
    const observer = new MutationObserver(() => {
      if (isAtBottomRef.current && bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, [isStreaming]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto py-4">
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
