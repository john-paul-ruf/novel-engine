import { useEffect, useMemo, useRef } from 'react';
import { marked } from 'marked';
import { AGENT_REGISTRY } from '@domain/constants';
import { usePitchRoomStore } from '../../stores/pitchRoomStore';
import { MessageBubble } from '../Chat/MessageBubble';
import { ThinkingBlock } from '../Chat/ThinkingBlock';
import { ChatInput } from '../Chat/ChatInput';
import { useRotatingStatus } from '../../hooks/useRotatingStatus';
import { PitchRoomHeader } from './PitchRoomHeader';
import { PitchDraftSidebar } from './PitchDraftSidebar';
import { PitchOutcomeBar } from './PitchOutcomeBar';

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
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" />
              {statusMessage || rotatingStatus}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Agent header for the Pitch Room — shows Spark's info.
 */
function PitchRoomAgentHeader(): React.ReactElement | null {
  const activeConversation = usePitchRoomStore((s) => s.activeConversation);

  if (!activeConversation) return null;

  const sparkMeta = AGENT_REGISTRY.Spark;

  return (
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
  );
}

export function PitchRoomView(): React.ReactElement {
  const loadDrafts = usePitchRoomStore((s) => s.loadDrafts);
  const activeConversation = usePitchRoomStore((s) => s.activeConversation);
  const messages = usePitchRoomStore((s) => s.messages);
  const isStreaming = usePitchRoomStore((s) => s.isStreaming);
  const sendMessage = usePitchRoomStore((s) => s.sendMessage);
  const handleStreamEvent = usePitchRoomStore((s) => s._handleStreamEvent);

  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  // Load drafts on mount
  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

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

  return (
    <div className="flex h-full flex-col">
      <PitchRoomHeader />
      <div className="flex flex-1 overflow-hidden">
        <PitchDraftSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          {activeConversation ? (
            <>
              <PitchRoomAgentHeader />
              <div ref={containerRef} className="flex-1 overflow-y-auto py-4">
                {messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
                <PitchRoomStreamingMessage />
                <div ref={bottomRef} className="h-1" />
              </div>
              <ChatInput
                onSend={sendMessage}
                disabled={isStreaming}
                lockedAgentName="Spark"
              />
              <PitchOutcomeBar />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <div className="mb-4 text-5xl">💡</div>
                <h2 className="mb-2 text-xl font-bold text-zinc-900 dark:text-zinc-100">
                  Welcome to the Pitch Room
                </h2>
                <p className="max-w-sm text-sm text-zinc-500">
                  Brainstorm story ideas with Spark without creating a book first.
                  When you find a concept you love, make it a book or shelve it for later.
                </p>
                <button
                  onClick={() => usePitchRoomStore.getState().startNewPitch()}
                  className="mt-6 rounded-lg bg-amber-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-700"
                >
                  Start Brainstorming
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
