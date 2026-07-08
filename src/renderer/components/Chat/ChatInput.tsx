import { useCallback, useEffect, useRef, useState } from 'react';
import type { CreativeAgentName } from '@domain/types';
import { QuickActions } from './QuickActions';
import { ThinkingBudgetSlider } from './ThinkingBudgetSlider';
import { Tooltip } from '../common/Tooltip';

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
  /**
   * Workbench mode: the full-width slider row becomes a "Thinking: …" chip
   * with a popover, and quick actions render as a chip menu. Default false —
   * the legacy chat view is unaffected.
   */
  compact?: boolean;
};

/** Chip that opens a popover hosting the existing ThinkingBudgetSlider. */
function ThinkingChip({
  value,
  defaultValue,
  onChange,
  disabled,
}: {
  value: number;
  defaultValue: number;
  onChange: (value: number) => void;
  disabled: boolean;
}): React.ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
        className="rounded-full border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-0.5 text-[11px] text-zinc-500 dark:text-zinc-400 transition-colors hover:text-zinc-800 dark:hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
        title="Adjust how much the agent reasons before responding"
      >
        {value === 0 ? 'Thinking: Off' : `Thinking: ${value / 1000}K`} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 shadow-lg">
            <ThinkingBudgetSlider
              value={value}
              defaultValue={defaultValue}
              onChange={onChange}
              disabled={disabled}
            />
          </div>
        </>
      )}
    </div>
  );
}

export function ChatInput({ onSend, disabled, lockedAgentName, agentName, readOnly = false, thinkingBudget, defaultThinkingBudget, onThinkingBudgetChange, compact = false }: ChatInputProps): React.ReactElement {
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
    <div
      data-tour="chat-input"
      className={`border-t border-zinc-200 dark:border-zinc-800 ${compact ? 'px-4 py-3' : 'px-6 py-4'}`}
    >
      {!readOnly && compact && (
        <div className="mb-2 flex items-center gap-1.5">
          <ThinkingChip
            value={thinkingBudget}
            defaultValue={defaultThinkingBudget}
            onChange={onThinkingBudgetChange}
            disabled={disabled}
          />
          {showQuickActions && (
            <QuickActions
              agentName={agentName}
              onSelect={handleQuickAction}
              disabled={disabled}
              compact
            />
          )}
        </div>
      )}
      {!readOnly && !compact && (
        <ThinkingBudgetSlider
          value={thinkingBudget}
          defaultValue={defaultThinkingBudget}
          onChange={onThinkingBudgetChange}
          disabled={disabled}
        />
      )}
      <div className="flex items-end gap-3">
        {!compact && showQuickActions && (
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
        <Tooltip content="Send message (Enter)" placement="top">
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="shrink-0 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
        </Tooltip>
      </div>
    </div>
  );
}
