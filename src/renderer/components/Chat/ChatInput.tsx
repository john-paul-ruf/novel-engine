import { useCallback, useEffect, useRef, useState } from 'react';

type ChatInputProps = {
  onSend: (message: string) => void;
  disabled: boolean;
  lockedAgentName?: string | null;
};

export function ChatInput({ onSend, disabled, lockedAgentName }: ChatInputProps): React.ReactElement {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = value.trim().length > 0 && !disabled;

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const lineHeight = 24;
    const minHeight = lineHeight * 3;
    const maxHeight = lineHeight * 10;
    const scrollHeight = Math.max(textarea.scrollHeight, minHeight);
    textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
  }, [value]);

  // Refocus after sending (when disabled transitions to false)
  const prevDisabledRef = useRef(disabled);
  useEffect(() => {
    if (prevDisabledRef.current && !disabled) {
      textareaRef.current?.focus();
    }
    prevDisabledRef.current = disabled;
  }, [disabled]);

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-800 px-6 py-4">
      <div className="flex items-end gap-3">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={lockedAgentName ? `Message ${lockedAgentName}...` : 'Type a message...'}
          disabled={disabled}
          rows={3}
          className="min-h-[72px] flex-1 resize-none rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-4 py-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="shrink-0 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
