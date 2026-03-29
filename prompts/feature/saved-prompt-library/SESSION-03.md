# SESSION-03 — Renderer: Store + QuickActions Refactor + Prompt Editor

> **Feature:** saved-prompt-library
> **Layer(s):** Renderer
> **Depends on:** SESSION-02
> **Estimated effort:** 30 min

---

## Context

SESSION-01 and SESSION-02 built the full backend: `SavedPrompt` type, `ISavedPromptService`, `SavedPromptService`, IPC handlers, and preload bridge. `window.novelEngine.savedPrompts.*` is now available in the renderer.

This session completes the feature with three renderer additions:

1. **`savedPromptsStore`** — Zustand store that loads and mutates saved prompts via the bridge.
2. **`SavedPromptEditor`** — Modal component for creating and editing a single saved prompt.
3. **`QuickActions` refactor** — Add a two-tab layout ("Actions" / "Saved") to the existing dropdown. The "Saved" tab shows user prompts filtered to the active agent, with per-row edit/delete/duplicate controls and a "+ New Prompt" button.

The `duplicate` operation is handled entirely client-side: the store calls `create` with the existing prompt's data (name + " (copy)", same text, same agentName). No new IPC channel is needed.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/stores/savedPromptsStore.ts` | Create | Zustand store: load, create, update, delete, duplicate |
| `src/renderer/components/Chat/SavedPromptEditor.tsx` | Create | Fixed-position modal for create / edit |
| `src/renderer/components/Chat/QuickActions.tsx` | Modify | Add tabs, wire to savedPromptsStore, open SavedPromptEditor |

---

## Implementation

### 1. Create `src/renderer/stores/savedPromptsStore.ts`

Read the existing stores (e.g., `src/renderer/stores/settingsStore.ts`) for pattern reference before writing this file.

```typescript
import { create } from 'zustand';
import type { AgentName, SavedPrompt } from '@domain/types';

type SavedPromptsState = {
  prompts: SavedPrompt[];
  isLoaded: boolean;

  /** Load all saved prompts from the backend. Idempotent — safe to call on every mount. */
  load: () => Promise<void>;

  /** Create a new saved prompt. */
  create: (params: { name: string; prompt: string; agentName: AgentName | null }) => Promise<SavedPrompt>;

  /** Update an existing prompt's fields. */
  update: (id: string, partial: Partial<Pick<SavedPrompt, 'name' | 'prompt' | 'agentName'>>) => Promise<SavedPrompt>;

  /** Delete a prompt by id. */
  delete: (id: string) => Promise<void>;

  /**
   * Duplicate a prompt: create a copy with name appended " (copy)".
   * Handled client-side — no extra IPC channel needed.
   */
  duplicate: (id: string) => Promise<void>;
};

export const useSavedPromptsStore = create<SavedPromptsState>((set, get) => ({
  prompts: [],
  isLoaded: false,

  load: async () => {
    try {
      const prompts = await window.novelEngine.savedPrompts.list();
      set({ prompts, isLoaded: true });
    } catch (err) {
      console.error('[savedPrompts] load failed:', err);
      set({ isLoaded: true });
    }
  },

  create: async (params) => {
    const created = await window.novelEngine.savedPrompts.create(params);
    set((s) => ({ prompts: [...s.prompts, created] }));
    return created;
  },

  update: async (id, partial) => {
    const updated = await window.novelEngine.savedPrompts.update(id, partial);
    set((s) => ({
      prompts: s.prompts.map((p) => (p.id === id ? updated : p)),
    }));
    return updated;
  },

  delete: async (id) => {
    await window.novelEngine.savedPrompts.delete(id);
    set((s) => ({ prompts: s.prompts.filter((p) => p.id !== id) }));
  },

  duplicate: async (id) => {
    const source = get().prompts.find((p) => p.id === id);
    if (!source) return;
    const created = await window.novelEngine.savedPrompts.create({
      name: `${source.name} (copy)`,
      prompt: source.prompt,
      agentName: source.agentName,
    });
    set((s) => ({ prompts: [...s.prompts, created] }));
  },
}));
```

---

### 2. Create `src/renderer/components/Chat/SavedPromptEditor.tsx`

This is a modal for creating or editing a saved prompt. It renders as a fixed-position overlay so it escapes any overflow constraints from the QuickActions dropdown.

Props:
- `mode: 'create' | 'edit'`
- `initial?: SavedPrompt` — pre-filled data when editing
- `defaultAgentName?: CreativeAgentName | null` — pre-selects agent for "create" mode
- `onSave: (data: { name: string; prompt: string; agentName: AgentName | null }) => Promise<void>` — called on submit
- `onClose: () => void`

```typescript
import { useState, useRef, useEffect } from 'react';
import { CREATIVE_AGENT_NAMES } from '@domain/constants';
import type { AgentName, CreativeAgentName, SavedPrompt } from '@domain/types';

type Props = {
  mode: 'create' | 'edit';
  initial?: SavedPrompt;
  /** Pre-selects the agent dropdown when creating from a specific agent context. */
  defaultAgentName?: CreativeAgentName | null;
  onSave: (data: { name: string; prompt: string; agentName: AgentName | null }) => Promise<void>;
  onClose: () => void;
};

export function SavedPromptEditor({ mode, initial, defaultAgentName, onSave, onClose }: Props): React.ReactElement {
  const [name, setName] = useState(initial?.name ?? '');
  const [prompt, setPrompt] = useState(initial?.prompt ?? '');
  const [agentName, setAgentName] = useState<AgentName | null>(
    initial?.agentName ?? defaultAgentName ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Focus name field on mount
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedPrompt = prompt.trim();
    if (!trimmedName) {
      setError('Name is required.');
      return;
    }
    if (!trimmedPrompt) {
      setError('Prompt text is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: trimmedName, prompt: trimmedPrompt, agentName });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
      setSaving(false);
    }
  };

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50"
      onMouseDown={(e) => {
        // Close when clicking the backdrop, not the dialog
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Dialog panel */}
      <div className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl p-6">
        <h2 className="mb-4 text-base font-semibold text-zinc-100">
          {mode === 'create' ? 'New Saved Prompt' : 'Edit Saved Prompt'}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Name */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-400" htmlFor="spe-name">
              Name
            </label>
            <input
              id="spe-name"
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pick up mid-moment"
              disabled={saving}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
            />
          </div>

          {/* Agent */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-400" htmlFor="spe-agent">
              Agent
            </label>
            <select
              id="spe-agent"
              value={agentName ?? ''}
              onChange={(e) => setAgentName((e.target.value as AgentName) || null)}
              disabled={saving}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none disabled:opacity-50"
            >
              <option value="">Any agent</option>
              {CREATIVE_AGENT_NAMES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          {/* Prompt text */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-400" htmlFor="spe-prompt">
              Prompt
            </label>
            <textarea
              id="spe-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="The full prompt text…"
              disabled={saving}
              rows={6}
              className="resize-none rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

---

### 3. Refactor `src/renderer/components/Chat/QuickActions.tsx`

Read `src/renderer/components/Chat/QuickActions.tsx` in full before modifying. The current component renders a single dropdown of built-in quick actions. Replace it with a tabbed version that adds a "Saved" tab.

**Behaviour of the new component:**

- **"Actions" tab** (default): identical to the current behaviour — shows `AGENT_QUICK_ACTIONS[agentName]`.
- **"Saved" tab**: shows saved prompts where `agentName === null || agentName === currentAgent`, sorted by `createdAt` ascending. Each row has:
  - Prompt name (clicking it selects the prompt, same as quick actions)
  - Three icon buttons visible on hover: **Edit** (pencil), **Duplicate** (copy), **Delete** (trash)
- **"+ New Prompt"** button at the bottom of the "Saved" tab — opens `SavedPromptEditor` in `'create'` mode.
- The store loads on first open (guarded by `isLoaded`).
- `SavedPromptEditor` is rendered as a sibling of the dropdown container so it escapes the dropdown's overflow; control it via a state flag in `QuickActions`.

Complete replacement for `src/renderer/components/Chat/QuickActions.tsx`:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import { AGENT_QUICK_ACTIONS } from '@domain/constants';
import type { AgentName, CreativeAgentName, SavedPrompt } from '@domain/types';
import { useSavedPromptsStore } from '../../stores/savedPromptsStore';
import { SavedPromptEditor } from './SavedPromptEditor';
import { Tooltip } from '../common/Tooltip';

type Tab = 'actions' | 'saved';

type QuickActionsProps = {
  agentName: CreativeAgentName;
  onSelect: (prompt: string) => void;
  disabled: boolean;
};

// ── Small icon components (inline SVG, no external dep) ─────────────

function PencilIcon(): React.ReactElement {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
    </svg>
  );
}

function CopyIcon(): React.ReactElement {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
      <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
    </svg>
  );
}

function TrashIcon(): React.ReactElement {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
    </svg>
  );
}

// ── Main component ──────────────────────────────────────────────────

export function QuickActions({ agentName, onSelect, disabled }: QuickActionsProps): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('actions');
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [editTarget, setEditTarget] = useState<SavedPrompt | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { prompts, isLoaded, load, create, update, delete: deleteFn, duplicate } = useSavedPromptsStore();

  const builtInActions = AGENT_QUICK_ACTIONS[agentName] ?? [];

  // Filter saved prompts to this agent or "any"
  const savedForAgent = prompts.filter(
    (p) => p.agentName === null || p.agentName === agentName,
  );

  // Load on first open
  useEffect(() => {
    if (open && !isLoaded) {
      load();
    }
  }, [open, isLoaded, load]);

  // Close menu on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close menu on Escape (but not when editor is open — editor handles its own Escape)
  useEffect(() => {
    if (!open || editorMode !== null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, editorMode]);

  const handleSelect = useCallback(
    (prompt: string) => {
      onSelect(prompt);
      setOpen(false);
    },
    [onSelect],
  );

  const handleDeletePrompt = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      await deleteFn(id);
    },
    [deleteFn],
  );

  const handleDuplicatePrompt = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      await duplicate(id);
    },
    [duplicate],
  );

  const handleEditPrompt = useCallback(
    (e: React.MouseEvent, prompt: SavedPrompt) => {
      e.stopPropagation();
      setEditTarget(prompt);
      setEditorMode('edit');
    },
    [],
  );

  const handleEditorSave = useCallback(
    async (data: { name: string; prompt: string; agentName: AgentName | null }) => {
      if (editorMode === 'create') {
        await create(data);
      } else if (editorMode === 'edit' && editTarget) {
        await update(editTarget.id, data);
      }
    },
    [editorMode, editTarget, create, update],
  );

  const handleEditorClose = useCallback(() => {
    setEditorMode(null);
    setEditTarget(null);
  }, []);

  // If no built-in actions AND no saved prompts possible, show nothing
  // (We still render when saved prompts might exist, even if builtIn is empty)
  if (builtInActions.length === 0 && !isLoaded && prompts.length === 0) {
    // Attempt load anyway on first render to know if there are saved prompts
    // The button is still rendered so users can open the "Saved" tab
  }

  return (
    <>
      <div data-tour="quick-actions" className="relative">
        <Tooltip content="Quick actions & saved prompts" placement="top">
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
            className="absolute bottom-full left-0 mb-2 w-64 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-lg z-50"
          >
            {/* Tab bar */}
            <div className="flex border-b border-zinc-200 dark:border-zinc-700">
              <button
                onClick={() => setTab('actions')}
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  tab === 'actions'
                    ? 'text-blue-500 border-b-2 border-blue-500'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                }`}
              >
                Actions
              </button>
              <button
                onClick={() => setTab('saved')}
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  tab === 'saved'
                    ? 'text-blue-500 border-b-2 border-blue-500'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                }`}
              >
                Saved
                {savedForAgent.length > 0 && (
                  <span className="ml-1 text-[10px] text-zinc-400">({savedForAgent.length})</span>
                )}
              </button>
            </div>

            {/* Tab content */}
            <div className="max-h-72 overflow-y-auto py-1">
              {tab === 'actions' && (
                <>
                  {builtInActions.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-zinc-400">No built-in actions for this agent.</p>
                  ) : (
                    builtInActions.map((action, i) => (
                      <button
                        key={i}
                        onClick={() => handleSelect(action.prompt)}
                        className="w-full text-left px-3 py-1.5 text-[13px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                      >
                        {action.label}
                      </button>
                    ))
                  )}
                </>
              )}

              {tab === 'saved' && (
                <>
                  {savedForAgent.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-zinc-400">
                      No saved prompts yet.{' '}
                      <button
                        onClick={() => setEditorMode('create')}
                        className="text-blue-400 hover:underline"
                      >
                        Create one.
                      </button>
                    </p>
                  ) : (
                    savedForAgent.map((p) => (
                      <div
                        key={p.id}
                        className="group flex items-center gap-1 px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                      >
                        <button
                          onClick={() => handleSelect(p.prompt)}
                          className="flex-1 text-left text-[13px] text-zinc-700 dark:text-zinc-300 truncate"
                          title={p.name}
                        >
                          {p.name}
                          {p.agentName === null && (
                            <span className="ml-1.5 text-[10px] text-zinc-400 font-normal">any</span>
                          )}
                        </button>
                        {/* Row actions — visible on group hover */}
                        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={(e) => handleEditPrompt(e, p)}
                            title="Edit"
                            className="rounded p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-600 transition-colors"
                          >
                            <PencilIcon />
                          </button>
                          <button
                            onClick={(e) => handleDuplicatePrompt(e, p.id)}
                            title="Duplicate"
                            className="rounded p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-600 transition-colors"
                          >
                            <CopyIcon />
                          </button>
                          <button
                            onClick={(e) => handleDeletePrompt(e, p.id)}
                            title="Delete"
                            className="rounded p-1 text-zinc-400 hover:text-red-400 hover:bg-zinc-600 transition-colors"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>

            {/* "New Prompt" button — always visible on Saved tab */}
            {tab === 'saved' && (
              <div className="border-t border-zinc-200 dark:border-zinc-700 px-3 py-2">
                <button
                  onClick={() => setEditorMode('create')}
                  className="w-full rounded-md border border-dashed border-zinc-600 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  + New Prompt
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SavedPromptEditor rendered outside the dropdown div to avoid overflow clipping */}
      {editorMode !== null && (
        <SavedPromptEditor
          mode={editorMode}
          initial={editTarget ?? undefined}
          defaultAgentName={agentName}
          onSave={handleEditorSave}
          onClose={handleEditorClose}
        />
      )}
    </>
  );
}
```

Key decisions:
- The component always renders (even if built-in actions are empty) so users can always access saved prompts from any agent.
- `SavedPromptEditor` is rendered as a sibling of the dropdown container (outside the `relative` wrapper's child tree) to avoid z-index / overflow stacking issues.
- Row-level action buttons (edit, duplicate, delete) use `group-hover:flex` so they don't clutter the list until hovered.
- The dropdown width is fixed at `w-64` (was `min-w-[10rem]`) because the two-tab layout benefits from a consistent width.

---

## Architecture Compliance

- [x] Domain files import from nothing
- [x] Infrastructure imports only from domain + external packages
- [x] Application imports only from domain interfaces — N/A this session
- [x] IPC handlers are one-liner delegations — N/A this session
- [x] Renderer accesses backend only through `window.novelEngine` (via store)
- [x] All new IPC channels are namespaced — N/A this session
- [x] All async operations have error handling
- [x] No `any` types
- [x] `import type` used for all domain type imports in renderer

---

## Verification

1. `npx tsc --noEmit` passes with zero errors.
2. Open the app, navigate to any agent chat view. Click the quick-actions button (⚡). The dropdown shows two tabs: "Actions" and "Saved".
3. "Actions" tab shows the same built-in prompts as before. Clicking one fills the input (no regression).
4. "Saved" tab is empty with a "No saved prompts yet. Create one." link.
5. Click "+ New Prompt" or "Create one." — the `SavedPromptEditor` modal opens.
6. Fill in a name, choose an agent or "Any agent", enter prompt text, click "Save" — the prompt appears in the "Saved" tab.
7. Hover a saved prompt row — Edit, Duplicate, and Delete buttons appear.
8. Edit: opens the modal pre-filled; saving updates the row.
9. Duplicate: appends " (copy)" to the name; appears immediately.
10. Delete: removes the row immediately.
11. Switch to a different agent — prompts scoped to that agent (or "any") appear; agent-specific prompts from other agents do not.

---

## State Update

After completing this session, update `prompts/feature/saved-prompt-library/STATE.md`:
- Set SESSION-03 status to `done`
- Set Completed date to today
- Add notes about any decisions or complications
- Update Handoff Notes: "Feature complete. All sessions done."
