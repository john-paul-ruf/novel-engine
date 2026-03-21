import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { useRevisionQueueStore } from '../../stores/revisionQueueStore';
import { useViewStore } from '../../stores/viewStore';
import { MessageBubble } from '../Chat/MessageBubble';
import { ThinkingBlock } from '../Chat/ThinkingBlock';
import type { RevisionSession } from '@domain/types';

marked.setOptions({ breaks: true, gfm: true });

function PanelHeader({ session }: { session: RevisionSession }) {
  const { setViewingSession } = useRevisionQueueStore();
  const { navigate } = useViewStore();

  return (
    <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-700 px-4 py-3 shrink-0">
      <button
        onClick={() => setViewingSession(null)}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
      >
        &#8592;
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
            Session {session.index}: {session.title}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            session.model === 'sonnet'
              ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300'
              : 'bg-purple-500/20 text-purple-700 dark:text-purple-300'
          }`}>
            {session.model === 'sonnet' ? 'Sonnet' : 'Opus'}
          </span>
          <StatusPill status={session.status} />
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5">
          <span>Tasks: {session.taskNumbers.join(', ')}</span>
          {session.chapters.length > 0 && (
            <span>Chapters: {session.chapters.join(', ')}</span>
          )}
        </div>
      </div>
      {session.conversationId && (
        <button
          onClick={() => navigate('chat', { conversationId: session.conversationId! })}
          className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-400 transition-colors shrink-0"
        >
          Open in Chat
        </button>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string }> = {
    running: { bg: 'bg-blue-500/20', text: 'text-blue-500' },
    'awaiting-approval': { bg: 'bg-amber-500/20', text: 'text-amber-500' },
    approved: { bg: 'bg-green-500/20', text: 'text-green-500' },
    rejected: { bg: 'bg-red-500/20', text: 'text-red-500' },
    skipped: { bg: 'bg-zinc-500/20', text: 'text-zinc-500' },
  };
  const c = config[status];
  if (!c) return null;
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${c.bg} ${c.text}`}>
      {status.replace('-', ' ')}
    </span>
  );
}

function StreamingBubble() {
  const streamingResponse = useRevisionQueueStore(s => s.streamingResponse);
  const streamingThinking = useRevisionQueueStore(s => s.streamingThinking);

  const renderedHtml = useMemo(() => {
    if (!streamingResponse) return '';
    return String(marked.parse(streamingResponse));
  }, [streamingResponse]);

  const hasThinking = streamingThinking.length > 0;
  const hasResponse = streamingResponse.length > 0;
  const showSpinner = !hasThinking && !hasResponse;

  return (
    <div className="px-6 py-2">
      <div className="max-w-3xl">
        {showSpinner && (
          <div className="flex items-center gap-2 py-2 text-sm text-zinc-500 dark:text-zinc-400">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            Verity is working...
          </div>
        )}

        {hasThinking && (
          <ThinkingBlock content={streamingThinking} isStreaming={true} />
        )}

        {hasResponse && (
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

function ChatInput({ sessionId }: { sessionId: string }) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { gateSessionId, respondToGate, sendGateMessage, runSession, isRunning } = useRevisionQueueStore();

  const isAtGate = gateSessionId === sessionId;
  const session = useRevisionQueueStore(s => s.plan?.sessions.find(ss => ss.id === sessionId));
  const canRun = session?.status === 'pending' || session?.status === 'rejected';

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || !isAtGate) return;
    sendGateMessage(trimmed);
    setInput('');
  }, [input, isAtGate, sendGateMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  useEffect(() => {
    if (isAtGate && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isAtGate]);

  return (
    <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-700">
      {isAtGate && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/5 border-b border-amber-500/20">
          <span className="text-amber-500 text-sm">&#9888;</span>
          <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Verity is waiting for your approval</span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => respondToGate('approve')}
              className="bg-green-600 hover:bg-green-700 text-white rounded px-3 py-1 text-xs font-medium transition-colors"
            >
              Approve
            </button>
            <button
              onClick={() => respondToGate('approve-all')}
              className="bg-green-600/80 hover:bg-green-700 text-white rounded px-3 py-1 text-xs font-medium transition-colors"
            >
              Approve All
            </button>
            <button
              onClick={() => respondToGate('skip')}
              className="bg-zinc-500 hover:bg-zinc-600 text-white rounded px-3 py-1 text-xs font-medium transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      <div className="p-3">
        {isAtGate ? (
          <div className="flex gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Send feedback to Verity..."
              rows={1}
              className="flex-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white disabled:text-zinc-500 rounded-lg px-4 py-2 text-sm font-medium transition-colors shrink-0"
            >
              Send
            </button>
          </div>
        ) : canRun && !isRunning ? (
          <button
            onClick={() => runSession(sessionId)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            {session?.status === 'rejected' ? 'Re-run Session' : 'Run Session'}
          </button>
        ) : isRunning && session?.id === useRevisionQueueStore.getState().activeSessionId ? (
          <div className="text-center text-xs text-zinc-500 py-2">
            Verity is working — you can respond when she asks a question
          </div>
        ) : session?.status === 'approved' ? (
          <div className="text-center text-xs text-green-600 dark:text-green-400 py-2">
            Session complete — all tasks marked done
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PromptCollapsible({ prompt }: { prompt: string }) {
  return (
    <details className="mx-6 my-2">
      <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300">
        View session prompt
      </summary>
      <pre className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3 whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto border border-zinc-200 dark:border-zinc-800">
        {prompt}
      </pre>
    </details>
  );
}

export function RevisionSessionPanel() {
  const viewingSessionId = useRevisionQueueStore(s => s.viewingSessionId);
  const activeSessionId = useRevisionQueueStore(s => s.activeSessionId);
  const plan = useRevisionQueueStore(s => s.plan);
  const panelMessages = useRevisionQueueStore(s => s.panelMessages);
  const streamingResponse = useRevisionQueueStore(s => s.streamingResponse);
  const streamingThinking = useRevisionQueueStore(s => s.streamingThinking);

  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const session = plan?.sessions.find(s => s.id === viewingSessionId);

  useEffect(() => {
    const sentinel = bottomRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => { isAtBottomRef.current = entry.isIntersecting; },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isAtBottomRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [panelMessages]);

  const isActive = session?.id === activeSessionId;
  const isStreaming = isActive && (streamingResponse.length > 0 || streamingThinking.length > 0);

  useEffect(() => {
    if (!isStreaming || !containerRef.current) return;
    const container = containerRef.current;
    const observer = new MutationObserver(() => {
      if (isAtBottomRef.current && bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    });
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [isStreaming]);

  if (!session) return null;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950">
      <PanelHeader session={session} />

      <div ref={containerRef} className="flex-1 overflow-y-auto py-4">
        <PromptCollapsible prompt={session.prompt} />

        {panelMessages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isActive && <StreamingBubble />}

        {!isActive && panelMessages.length === 0 && !session.conversationId && session.status === 'pending' && (
          <div className="flex items-center justify-center h-full text-sm text-zinc-500">
            Click "Run Session" to start
          </div>
        )}

        <div ref={bottomRef} className="h-1" />
      </div>

      <ChatInput sessionId={session.id} />
    </div>
  );
}
