import { useCallback, useEffect, useRef, useState } from 'react';
import type { CreativeAgentName } from '@domain/types';
import { QuickActions } from './QuickActions';
import { ThinkingBudgetSlider } from './ThinkingBudgetSlider';

type ChatInputProps = {
  onSend: (message: string) => void;
  disabled: boolean;
  lockedAgentName?: string | null;
  /** The current agent for quick-action prompts. */
  agentName?: CreativeAgentName | null;
  /** When true, the conversation belongs to a completed phase — shown read-only. */
  readOnly?: boolean;
  /** Current thinking budget value (controlled by parent). */
  thinkingBudget: number;
  /** The agent's default thinking budget (for the reset button). */
  defaultThinkingBudget: number;
  /** Called when the user adjusts the thinking budget slider. */
  onThinkingBudgetChange: (value: number) => void;
};

export function ChatInput({ onSend, disabled, lockedAgentName, agentName, readOnly = false, thinkingBudget, defaultThinkingBudget, onThinkingBudgetChange }: ChatInputProps): React.ReactElement {
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

  // When a quick action is selected, populate the textarea and focus it
  const handleQuickAction = useCallback((prompt: string) => {
    setValue(prompt);
    // Focus the textarea so the user can edit or just hit Enter
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

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

  // Determine if quick actions should be shown (not read-only, not Wrangler)
  const showQuickActions = !readOnly && agentName;

  return (
    <div data-tour="chat-input" className="border-t border-zinc-200 dark:border-zinc-800 px-6 py-4">
      {!readOnly && (
        <ThinkingBudgetSlider
          value={thinkingBudget}
          defaultValue={defaultThinkingBudget}
          onChange={onThinkingBudgetChange}
          disabled={disabled}
        />
      )}
      <div className="flex items-end gap-3">
        {showQuickActions && (
          <QuickActions
            agentName={agentName}
            onSelect={handleQuickAction}
            disabled={disabled}
          />
        )}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            readOnly
              ? 'This phase is complete — conversation is read-only'
              : lockedAgentName
              ? `Message ${lockedAgentName}...`
              : 'Type a message...'
          }
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
