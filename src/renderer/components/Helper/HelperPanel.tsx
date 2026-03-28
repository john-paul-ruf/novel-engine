import { useState, useRef, useEffect } from 'react';
import { useHelperStore } from '../../stores/helperStore';
import { HelperMessageList } from './HelperMessageList';

export function HelperPanel(): React.ReactElement | null {
  const isOpen = useHelperStore((s) => s.isOpen);
  const messages = useHelperStore((s) => s.messages);
  const isStreaming = useHelperStore((s) => s.isStreaming);
  const isThinking = useHelperStore((s) => s.isThinking);
  const streamBuffer = useHelperStore((s) => s.streamBuffer);
  const thinkingBuffer = useHelperStore((s) => s.thinkingBuffer);
  const statusMessage = useHelperStore((s) => s.statusMessage);
  const isLoading = useHelperStore((s) => s.isLoading);
  const sendMessage = useHelperStore((s) => s.sendMessage);
  const close = useHelperStore((s) => s.close);
  const resetConversation = useHelperStore((s) => s.resetConversation);
  const open = useHelperStore((s) => s.open);

  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && !isLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, isLoading]);

  if (!isOpen) return null;

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput('');
    sendMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReset = async () => {
    await resetConversation();
    await open();
  };

  return (
    <div className="fixed bottom-24 right-6 z-40 flex h-[32rem] w-96 max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 bg-blue-500 px-4 py-3 dark:border-zinc-700">
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M12 18h.01" />
          </svg>
          <span className="font-semibold text-white">Help & FAQ</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Reset button */}
          <button
            onClick={handleReset}
            className="rounded p-1 text-white/80 hover:bg-white/20 hover:text-white"
            title="Start fresh conversation"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
          </button>
          {/* Close button */}
          <button
            onClick={close}
            className="rounded p-1 text-white/80 hover:bg-white/20 hover:text-white"
            title="Close"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-400">Loading...</div>
        ) : (
          <HelperMessageList
            messages={messages}
            isStreaming={isStreaming}
            isThinking={isThinking}
            streamBuffer={streamBuffer}
            thinkingBuffer={thinkingBuffer}
            statusMessage={statusMessage}
          />
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-zinc-200 p-3 dark:border-zinc-700">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? 'Waiting for response...' : 'Ask anything about Novel Engine...'}
            disabled={isStreaming || isLoading}
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming || isLoading}
            className="rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
