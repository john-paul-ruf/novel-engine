import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { AGENT_REGISTRY, randomPitchRoomFlavor } from '@domain/constants';
import { usePitchRoomStore } from '../../stores/pitchRoomStore';
import { useBookStore } from '../../stores/bookStore';
import { useViewStore } from '../../stores/viewStore';
import { MessageBubble } from '../Chat/MessageBubble';
import { ThinkingBlock } from '../Chat/ThinkingBlock';
import { ChatInput } from '../Chat/ChatInput';
import { useRotatingStatus } from '../../hooks/useRotatingStatus';

marked.setOptions({ breaks: true, gfm: true });

/**
 * Streaming message for the Pitch Room — subscribes to pitchRoomStore.
 */
function PitchRoomStreamingMessage(): React.ReactElement | null {
  const isStreaming = usePitchRoomStore((s) => s.isStreaming);
  const isThinking = usePitchRoomStore((s) => s.isThinking);
  const thinkingBuffer = usePitchRoomStore((s) => s.thinkingBuffer);
  const streamBuffer = usePitchRoomStore((s) => s.streamBuffer);
  const statusMessage = usePitchRoomStore((s) => s.statusMessage);

  const rotatingStatus = useRotatingStatus(isStreaming && !isThinking && !streamBuffer);

  const renderedHtml = useMemo(() => {
    if (!streamBuffer) return '';
    return marked.parse(streamBuffer) as string;
  }, [streamBuffer]);

  if (!isStreaming) return null;

  const sparkMeta = AGENT_REGISTRY.Spark;

  return (
    <div className="px-6 py-3">
      <div className="flex items-start gap-3">
        <div
          className="mt-1 h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: sparkMeta.color }}
        />
        <div className="min-w-0 flex-1">
          {isThinking && thinkingBuffer && (
            <ThinkingBlock content={thinkingBuffer} isStreaming />
          )}

          {streamBuffer ? (
            <div
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          ) : (
            <div className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-0.5">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-bounce"
                  style={{ animationDelay: '0ms', animationDuration: '900ms' }}
                />
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 animate-bounce"
                  style={{ animationDelay: '150ms', animationDuration: '900ms' }}
                />
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full bg-amber-300 animate-bounce"
                  style={{ animationDelay: '300ms', animationDuration: '900ms' }}
                />
              </span>
              <span key={statusMessage || rotatingStatus} className="status-fade-in inline-flex flex-wrap">
                {(statusMessage || rotatingStatus).split('').map((char, i) => (
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
        </div>
      </div>
    </div>
  );
}

/**
 * Bouncy, rotating flavor text shown when the Pitch Room has no messages yet.
 * Cycles through playful prompts every 6–10 seconds with the wave-char animation.
 */
function PitchRoomEmptyState(): React.ReactElement {
  const [flavor, setFlavor] = useState(() => randomPitchRoomFlavor());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const scheduleNext = (): void => {
      const delay = 6_000 + Math.random() * 4_000; // 6–10s
      timer = setTimeout(() => {
        setFlavor(randomPitchRoomFlavor());
        scheduleNext();
      }, delay);
    };

    scheduleNext();
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className="flex items-center gap-1">
        <span
          className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-bounce"
          style={{ animationDelay: '0ms', animationDuration: '1200ms' }}
        />
        <span
          className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-bounce"
          style={{ animationDelay: '200ms', animationDuration: '1200ms' }}
        />
        <span
          className="inline-block h-2 w-2 rounded-full bg-amber-300 animate-bounce"
          style={{ animationDelay: '400ms', animationDuration: '1200ms' }}
        />
      </div>
      <span
        key={flavor}
        className="status-fade-in inline-flex max-w-md flex-wrap justify-center text-sm text-zinc-400 dark:text-zinc-500"
      >
        {flavor.split('').map((char, i) => (
          <span
            key={i}
            className="wave-char"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            {char === ' ' ? '\u00A0' : char}
          </span>
        ))}
      </span>
      <p className="mt-2 max-w-xs text-center text-xs text-zinc-400/60 dark:text-zinc-600">
        Brainstorm with Spark. Shelve ideas, or turn them into books.
      </p>
    </div>
  );
}

export function PitchRoomView(): React.ReactElement {
  const ensureConversation = usePitchRoomStore((s) => s.ensureConversation);
  const activeConversation = usePitchRoomStore((s) => s.activeConversation);
  const messages = usePitchRoomStore((s) => s.messages);
  const isStreaming = usePitchRoomStore((s) => s.isStreaming);
  const sendMessage = usePitchRoomStore((s) => s.sendMessage);
  const handleStreamEvent = usePitchRoomStore((s) => s._handleStreamEvent);
  const lastOutcome = usePitchRoomStore((s) => s.lastOutcome);
  const clearOutcome = usePitchRoomStore((s) => s.clearOutcome);

  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  // Auto-create or load the single pitch room conversation on mount
  useEffect(() => {
    ensureConversation();
  }, [ensureConversation]);

  // React to pitch outcomes from the agent
  useEffect(() => {
    if (!lastOutcome) return;

    const { action, bookSlug } = lastOutcome;

    if (action === 'make-book' && bookSlug) {
      // Switch to the new book and navigate to the chat view
      useBookStore.getState().setActiveBook(bookSlug);
      useViewStore.getState().navigate('chat');
    }

    // For all outcomes, clear state and re-create a fresh pitch room conversation
    clearOutcome();
    ensureConversation();
  }, [lastOutcome, clearOutcome, ensureConversation]);

  // Register stream event listener for the pitch room
  useEffect(() => {
    const cleanup = window.novelEngine.chat.onStreamEvent(handleStreamEvent);
    return () => { cleanup(); };
  }, [handleStreamEvent]);

  // Track if user is at bottom
  useEffect(() => {
    const sentinel = bottomRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        isAtBottomRef.current = entry.isIntersecting;
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (isAtBottomRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Auto-scroll during streaming
  useEffect(() => {
    if (!isStreaming || !containerRef.current) return;

    const container = containerRef.current;
    const observer = new MutationObserver(() => {
      if (isAtBottomRef.current) {
        container.scrollTop = container.scrollHeight;
      }
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, [isStreaming]);

  const sparkMeta = AGENT_REGISTRY.Spark;

  return (
    <div className="flex h-full flex-col">
      {/* Minimal header — just Spark's identity */}
      <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800 px-6 py-3">
        <div
          className="w-1 self-stretch rounded-full"
          style={{ backgroundColor: sparkMeta.color }}
        />
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            Spark
          </h2>
          <p className="text-xs text-zinc-500">
            {sparkMeta.role}
            <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-400">
              Pitch Room
            </span>
          </p>
        </div>
      </div>

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto py-4">
        {messages.length === 0 && !isStreaming && (
          <PitchRoomEmptyState />
        )}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        <PitchRoomStreamingMessage />
        <div ref={bottomRef} className="h-1" />
      </div>

      {/* Chat input */}
      <ChatInput
        onSend={sendMessage}
        disabled={isStreaming || !activeConversation}
        lockedAgentName="Spark"
      />
    </div>
  );
}
