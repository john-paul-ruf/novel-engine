import { useCallback, useEffect, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { AGENT_QUICK_ACTIONS } from '@domain/constants';
import type { CreativeAgentName, SavedPrompt } from '@domain/types';
import { useSettingsStore } from '../../stores/settingsStore';
import { Tooltip } from '../common/Tooltip';

type QuickActionsProps = {
  agentName: CreativeAgentName;
  onSelect: (prompt: string) => void;
  disabled: boolean;
};

function tabClass(active: boolean): string {
  return `px-3 py-1.5 text-xs font-medium transition-colors ${
    active
      ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
      : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
  }`;
}

export function QuickActions({ agentName, onSelect, disabled }: QuickActionsProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'builtin' | 'saved'>('builtin');
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Form state for adding a new saved prompt
  const [newName, setNewName] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [pinToAgent, setPinToAgent] = useState(false);

  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);

  const actions = AGENT_QUICK_ACTIONS[agentName] ?? [];
  const allSaved: SavedPrompt[] = settings?.savedPrompts ?? [];
  const filteredSaved = allSaved.filter(
    (p) => p.agentName === null || p.agentName === agentName,
  );

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
    [onSelect],
  );

  const handleSavePrompt = useCallback(async () => {
    const trimmedName = newName.trim();
    const trimmedPrompt = newPrompt.trim();
    if (!trimmedName || !trimmedPrompt) return;

    const newEntry: SavedPrompt = {
      id: nanoid(),
      name: trimmedName,
      prompt: trimmedPrompt,
      agentName: pinToAgent ? agentName : null,
      createdAt: new Date().toISOString(),
    };

    const current = useSettingsStore.getState().settings?.savedPrompts ?? [];
    await update({ savedPrompts: [...current, newEntry] });
    setNewName('');
    setNewPrompt('');
    setPinToAgent(false);
  }, [newName, newPrompt, pinToAgent, agentName, update]);

  const handleDeletePrompt = useCallback(
    async (id: string) => {
      const current = useSettingsStore.getState().settings?.savedPrompts ?? [];
      await update({ savedPrompts: current.filter((p) => p.id !== id) });
    },
    [update],
  );

  return (
    <div data-tour="quick-actions" className="relative">
      <Tooltip content="Quick actions and saved prompts" placement="top">
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
      </Tooltip>

      {open && (
        <div
          ref={menuRef}
          className="absolute bottom-full left-0 mb-2 w-72 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-lg z-50"
        >
          {/* Tab bar */}
          <div className="flex border-b border-zinc-200 dark:border-zinc-700">
            <button onClick={() => setTab('builtin')} className={tabClass(tab === 'builtin')}>
              Built-in
            </button>
            <button onClick={() => setTab('saved')} className={tabClass(tab === 'saved')}>
              Saved
              {filteredSaved.length > 0 && (
                <span className="ml-1 rounded-full bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:text-zinc-300">
                  {filteredSaved.length}
                </span>
              )}
            </button>
          </div>

          {/* Built-in tab */}
          {tab === 'builtin' && (
            <div className="py-1">
              {actions.length === 0 ? (
                <p className="px-3 py-3 text-xs text-zinc-400 dark:text-zinc-500">
                  No built-in prompts for this agent.
                </p>
              ) : (
                actions.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelect(action.prompt)}
                    className="w-full text-left px-3 py-1.5 text-[13px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                  >
                    {action.label}
                  </button>
                ))
              )}
            </div>
          )}

          {/* Saved tab */}
          {tab === 'saved' && (
            <div className="py-1">
              {/* Saved prompts list */}
              {filteredSaved.length === 0 ? (
                <p className="px-3 py-3 text-xs text-zinc-400 dark:text-zinc-500">
                  No saved prompts. Paste a prompt below and click Save.
                </p>
              ) : (
                <div className="max-h-36 overflow-y-auto">
                  {filteredSaved.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-1 px-2 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 group"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] text-zinc-700 dark:text-zinc-300">
                          {p.name}
                        </div>
                        {p.agentName && (
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                            {p.agentName}
                          </span>
                        )}
                      </div>
                      {/* Use button */}
                      <button
                        onClick={() => handleSelect(p.prompt)}
                        title="Use this prompt"
                        className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                          <path fillRule="evenodd" d="M2.22 2.22a.75.75 0 0 1 1.06 0L8 6.94l4.72-4.72a.75.75 0 1 1 1.06 1.06l-5.25 5.25a.75.75 0 0 1-1.06 0L2.22 3.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                          <path fillRule="evenodd" d="M2.22 9.22a.75.75 0 0 1 1.06 0L8 13.94l4.72-4.72a.75.75 0 1 1 1.06 1.06l-5.25 5.25a.75.75 0 0 1-1.06 0L2.22 10.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                        </svg>
                      </button>
                      {/* Delete button */}
                      <button
                        onClick={() => handleDeletePrompt(p.id)}
                        title="Delete"
                        className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                          <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new prompt form */}
              <div className="border-t border-zinc-200 dark:border-zinc-700 px-2 pt-2 pb-2 space-y-1.5">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Name (e.g. Deep Character Revision)"
                  className="w-full text-xs rounded border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 px-2 py-1 outline-none focus:border-blue-500 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-500"
                />
                <textarea
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  placeholder="Paste prompt text..."
                  rows={3}
                  className="w-full text-xs rounded border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 px-2 py-1 outline-none focus:border-blue-500 resize-none text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-500"
                />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pinToAgent}
                      onChange={(e) => setPinToAgent(e.target.checked)}
                      className="rounded"
                    />
                    Pin to {agentName}
                  </label>
                  <button
                    onClick={handleSavePrompt}
                    disabled={!newName.trim() || !newPrompt.trim()}
                    className="text-xs rounded bg-blue-600 px-2.5 py-1 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
