import { useEffect, useRef, useCallback, useMemo } from 'react';
import { marked } from 'marked';
import { useModalChatStore } from '../../stores/modalChatStore';
import { MessageBubble } from './MessageBubble';
import { ThinkingBlock } from './ThinkingBlock';
import { ChatInput } from './ChatInput';
import { AGENT_REGISTRY } from '@domain/constants';
import type { ConversationPurpose } from '@domain/types';

marked.setOptions({ breaks: true, gfm: true });

const PURPOSE_LABELS: Record<ConversationPurpose, { title: string; subtitle: string; badge: string }> = {
  'voice-setup': {
    title: 'Voice Profile Setup',
    subtitle: 'Chat with Verity to establish your voice profile',
    badge: 'Voice Setup',
  },
  'author-profile': {
    title: 'Author Profile Setup',
    subtitle: 'Chat with Verity to create your author profile',
    badge: 'Author Profile',
  },
  pipeline: {
    title: 'Pipeline Chat',
    subtitle: '',
    badge: 'Pipeline',
  },
};

function ModalHeader(): React.ReactElement {
  const purpose = useModalChatStore((s) => s.purpose);
  const isStreaming = useModalChatStore((s) => s.isStreaming);
  const close = useModalChatStore((s) => s.close);

  const labels = purpose ? PURPOSE_LABELS[purpose] : PURPOSE_LABELS.pipeline;

  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
      <div>
        <h3 className="text-base font-semibold text-zinc-100">{labels.title}</h3>
        {labels.subtitle && (
          <p className="mt-0.5 text-xs text-zinc-500">{labels.subtitle}</p>
        )}
      </div>
      <button
        onClick={close}
        disabled={isStreaming}
        className={`flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors ${
          isStreaming
            ? 'cursor-not-allowed opacity-30'
            : 'hover:bg-zinc-800 hover:text-zinc-200'
        }`}
      >
        ✕
      </button>
    </div>
  );
}

function ModalAgentBar(): React.ReactElement {
  const purpose = useModalChatStore((s) => s.purpose);
  const messages = useModalChatStore((s) => s.messages);

  const agentColor = AGENT_REGISTRY.Verity.color;
  const badge = purpose ? PURPOSE_LABELS[purpose].badge : 'Pipeline';

  return (
    <div className="flex items-center gap-3 px-5 py-2.5 border-b border-zinc-800">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: agentColor }}
      />
      <span className="text-sm font-medium text-zinc-200">Verity</span>
      <span className="text-xs text-zinc-500">Ghostwriter</span>
      <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-300">
        {badge}
      </span>
      <span className="ml-auto text-xs text-zinc-500">
        {messages.length} message{messages.length !== 1 ? 's' : ''}
      </span>
    </div>
  );
}

function ModalMessageList(): React.ReactElement {
  const messages = useModalChatStore((s) => s.messages);
  const conversation = useModalChatStore((s) => s.conversation);
  const isStreaming = useModalChatStore((s) => s.isStreaming);
  const isThinking = useModalChatStore((s) => s.isThinking);
  const streamBuffer = useModalChatStore((s) => s.streamBuffer);
  const thinkingBuffer = useModalChatStore((s) => s.thinkingBuffer);
  const statusMessage = useModalChatStore((s) => s.statusMessage);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const streamHtml = useMemo(() => {
    if (!streamBuffer) return '';
    return String(marked.parse(streamBuffer));
  }, [streamBuffer]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamBuffer, thinkingBuffer]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex flex-1 items-center justify-center overflow-y-auto">
        <p className="text-sm text-zinc-500">
          Start the conversation — Verity will guide you.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto py-4">
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          conversationOverride={conversation ?? undefined}
        />
      ))}

      {isStreaming && (
        <div className="px-6 py-2">
          {isThinking && thinkingBuffer && (
            <ThinkingBlock content={thinkingBuffer} isStreaming={true} />
          )}
          {streamHtml ? (
            <div className="max-w-3xl">
              <div className="rounded-2xl bg-zinc-800 px-4 py-3 text-zinc-100">
                <div
                  className="prose prose-invert prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: streamHtml }}
                />
              </div>
            </div>
          ) : (
            !isThinking && statusMessage && (
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-400 opacity-75" />
                  <span className="inline-flex h-2 w-2 rounded-full bg-purple-400" />
                </span>
                <span>{statusMessage}</span>
              </div>
            )
          )}
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}

export function ChatModal(): React.ReactElement {
  const close = useModalChatStore((s) => s.close);
  const isStreaming = useModalChatStore((s) => s.isStreaming);
  const sendMessage = useModalChatStore((s) => s.sendMessage);
  const initStreamListener = useModalChatStore((s) => s.initStreamListener);
  const destroyStreamListener = useModalChatStore((s) => s.destroyStreamListener);

  useEffect(() => {
    initStreamListener();
    return () => destroyStreamListener();
  }, [initStreamListener, destroyStreamListener]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isStreaming) {
        close();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [close, isStreaming]);

  const handleSend = useCallback(
    (content: string) => {
      sendMessage(content);
    },
    [sendMessage],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => {
        if (!isStreaming) close();
      }}
    >
      <div
        className="flex w-[700px] max-h-[85vh] flex-col rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalHeader />
        <ModalAgentBar />
        <ModalMessageList />
        <div className="shrink-0 border-t border-zinc-800">
          <ChatInput onSend={handleSend} disabled={isStreaming} lockedAgentName={null} />
        </div>
      </div>
    </div>
  );
}
