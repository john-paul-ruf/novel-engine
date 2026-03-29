# SESSION-08 — Saved Prompt Library

> **Feature:** small-queue-intake
> **Layer(s):** M01 (domain types), M10 (renderer)
> **Depends on:** SESSION-07 (done)
> **Estimated effort:** 30 min

---

## Context

Authors discover prompts that work well and want to save them. Currently there is no way to do this inside the app. The saved prompt library lives as a new `savedPrompts` field in `AppSettings` (persisted via the existing settings service). The UI adds a "Saved" tab to the Quick Actions dropdown.

---

## Files to Read First

- `src/domain/types.ts` — AppSettings type
- `src/domain/constants.ts` — DEFAULT_SETTINGS
- `src/renderer/components/Chat/QuickActions.tsx` — current Quick Actions component
- `src/renderer/stores/settingsStore.ts` — settings state and update action

---

## Step 1: Domain — Add SavedPrompt type

In `src/domain/types.ts`, add a new section `// === Saved Prompts ===` before `// === Settings ===`:

```ts
// === Saved Prompts ===

export type SavedPrompt = {
  id: string;              // nanoid-generated
  name: string;            // display label shown in the dropdown
  prompt: string;          // full text inserted into chat input
  agentName: AgentName | null;  // null = works with any agent
  createdAt: string;       // ISO date
};
```

In `AppSettings`, add:
```ts
savedPrompts: SavedPrompt[];  // user-saved prompt entries
```

---

## Step 2: Domain — Update DEFAULT_SETTINGS

In `src/domain/constants.ts`, add to `DEFAULT_SETTINGS`:
```ts
savedPrompts: [],
```

---

## Step 3: Renderer — Update QuickActions.tsx

Read `QuickActions.tsx` fully. The current component shows built-in quick actions for the active agent.

Restructure the dropdown to have two tabs: **Built-in** (current behavior) and **Saved** (new).

### Tab state

Add inside `QuickActions`:
```tsx
const [tab, setTab] = useState<'builtin' | 'saved'>('builtin');
```

### Tab bar inside the dropdown menu

At the top of the dropdown, above the action list:
```tsx
<div className="flex border-b border-zinc-200 dark:border-zinc-700 mb-1">
  <button onClick={() => setTab('builtin')} className={tabClass(tab === 'builtin')}>Built-in</button>
  <button onClick={() => setTab('saved')} className={tabClass(tab === 'saved')}>Saved</button>
</div>
```

### Built-in tab

Identical to current behavior — shows `AGENT_QUICK_ACTIONS[agentName]`.

### Saved tab

Read `savedPrompts` from settingsStore. Filter by `agentName === null || agentName === props.agentName`.

If no saved prompts: show "No saved prompts. Paste a prompt below and click Save." (empty state).

For each saved prompt: render a row with:
- Left: prompt name + agent badge (if agentName is set)
- Right: use button (arrow icon) + delete button (x icon)

**Add a new prompt form** at the bottom of the Saved tab (always visible):
```tsx
<div className="border-t border-zinc-200 dark:border-zinc-700 pt-2 space-y-1.5">
  <input
    placeholder="Name (e.g. Deep Character Revision)"
    className="w-full text-xs rounded border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 px-2 py-1 focus:outline-none focus:border-blue-500"
  />
  <textarea
    placeholder="Paste prompt text..."
    rows={3}
    className="w-full text-xs rounded border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 px-2 py-1 focus:outline-none focus:border-blue-500 resize-none"
  />
  <div className="flex justify-between items-center">
    <label className="flex items-center gap-1.5 text-xs text-zinc-500">
      <input type="checkbox" checked={pinToAgent} onChange={...} />
      Pin to {agentName}
    </label>
    <button onClick={handleSave} className="text-xs rounded bg-blue-600 px-2.5 py-1 text-white hover:bg-blue-500 disabled:opacity-50">
      Save
    </button>
  </div>
</div>
```

**Save action:** generates a nanoid, creates a `SavedPrompt`, calls `useSettingsStore.getState().update({ savedPrompts: [...current, newPrompt] })`.

**Delete action:** filters the prompt out and calls `update({ savedPrompts: filtered })`.

**Use action:** calls `onSelect(prompt.prompt)` and closes the dropdown.

---

## Architecture Compliance

- [x] Domain: `SavedPrompt` type added to types.ts; `savedPrompts` added to AppSettings and DEFAULT_SETTINGS
- [x] No new IPC channels — uses existing `settings.update()` bridge
- [x] Renderer only for UI — settingsStore update persists via existing service
- [x] nanoid: use `nanoid()` from `nanoid` — already a project dependency (pinned to v3 CJS)

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Quick Actions dropdown has "Built-in" and "Saved" tabs
3. Built-in tab shows existing quick actions unchanged
4. Saved tab: empty state shown when no prompts; add form present
5. Saving a prompt persists it (visible after closing and reopening the dropdown)
6. Deleting a prompt removes it from the list
7. Using a prompt fills the chat input and closes the dropdown

---

## State Update

Set SESSION-08 to `done` in STATE.md.
