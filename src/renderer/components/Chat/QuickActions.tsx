import { useCallback, useEffect, useRef, useState } from 'react';
import { AGENT_QUICK_ACTIONS } from '@domain/constants';
import type { CreativeAgentName } from '@domain/types';

type QuickActionsProps = {
  agentName: CreativeAgentName;
  onSelect: (prompt: string) => void;
  disabled: boolean;
};

export function QuickActions({ agentName, onSelect, disabled }: QuickActionsProps): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const actions = AGENT_QUICK_ACTIONS[agentName];
  if (!actions || actions.length === 0) return null;

  // Close menu on outside click
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const handleSelect = useCallback(
    (prompt: string) => {
      onSelect(prompt);
      setOpen(false);
    },
    [onSelect]
  );

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
        title="Quick actions"
        className="flex items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-3 py-3 text-sm text-zinc-500 dark:text-zinc-400 transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-5 w-5"
        >
          <path
            fillRule="evenodd"
            d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute bottom-full left-0 mb-2 min-w-[10rem] rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-lg z-50 py-1"
        >
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={() => handleSelect(action.prompt)}
              className="w-full text-left px-3 py-1.5 text-[13px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors whitespace-nowrap"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
