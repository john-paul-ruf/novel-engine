# SESSION-05 — Motif Ledger -> Files View

> **Feature:** small-queue-intake
> **Layer(s):** M10 (renderer only)
> **Depends on:** SESSION-04 (done)
> **Estimated effort:** 25 min

---

## Context

The Motif Ledger is currently a top-level nav item in the sidebar (ViewId: 'motif-ledger'). The request is to move it inside the Files view so that all book-content tools live in one place.

---

## Files to Read First

- `src/renderer/stores/viewStore.ts` — ViewId type, navigate, currentView
- `src/renderer/components/Layout/AppLayout.tsx` — ViewContent component, motif-ledger rendering
- `src/renderer/components/Layout/Sidebar.tsx` — NAV_ITEMS
- `src/renderer/components/Files/FilesView.tsx` — current structure, to add a tab
- `src/renderer/components/MotifLedger/MotifLedgerView.tsx` — what we are embedding

---

## Implementation

### Step 1: Remove 'motif-ledger' from ViewId

In `src/renderer/stores/viewStore.ts`:
- Remove `'motif-ledger'` from the `ViewId` union type
- The new type: `type ViewId = 'onboarding' | 'chat' | 'files' | 'build' | 'settings' | 'revision-queue' | 'pitch-room';`
- Update the `persist` partialize logic: if a persisted `currentView` of `'motif-ledger'` is loaded from localStorage, fall back to `'files'`. Add a migration in the `onRehydrateStorage` or by adding a check in the persist `partialize`/`merge` callback. The cleanest approach: add a migration in the zustand `persist` config:

```ts
migrate: (persistedState: unknown) => {
  const state = persistedState as Partial<ViewState>;
  if (state.currentView === 'motif-ledger') {
    return { ...state, currentView: 'files' };
  }
  return state;
},
version: 2,  // bump the version to trigger migration
```

### Step 2: Remove motif-ledger from AppLayout

In `AppLayout.tsx`:
- Remove the `<div className=... currentView === 'motif-ledger' ...><MotifLedgerView /></div>` block
- Remove the `import { MotifLedgerView }` import if it is no longer used elsewhere in AppLayout

### Step 3: Remove motif-ledger from Sidebar NAV_ITEMS

In `Sidebar.tsx`:
- Remove `{ id: 'motif-ledger', label: 'Motif Ledger', icon: '🧬' }` from `NAV_ITEMS`
- Remove `'motif-ledger'` from `NAV_TOOLTIPS`
- Remove the `ViewId` type alias line `type ViewId = ...` in Sidebar.tsx if it re-declares it locally — use the imported type from viewStore instead
- Update `NAV_TOOLTIPS` type annotation if needed

### Step 4: Add Motif Ledger tab to FilesView

In `src/renderer/components/Files/FilesView.tsx`:

Add a `activeTab` state: `const [activeTab, setActiveTab] = useState<'files' | 'ledger'>('files');`

When the view is navigated to with a `ledger` payload (see Step 5), initialize the tab to 'ledger'.

Add a tab bar at the top of FilesView's content area (above the current header):
```tsx
<div className="flex shrink-0 border-b border-zinc-200 dark:border-zinc-800">
  <button
    onClick={() => setActiveTab('files')}
    className={`px-4 py-2 text-sm font-medium transition-colors ${
      activeTab === 'files'
        ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
        : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
    }`}
  >
    Files
  </button>
  <button
    onClick={() => setActiveTab('ledger')}
    className={`px-4 py-2 text-sm font-medium transition-colors ${
      activeTab === 'ledger'
        ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
        : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
    }`}
  >
    🧬 Motif Ledger
  </button>
</div>
```

Wrap existing FilesView content in `{activeTab === 'files' && <existing content>}`.

Add: `{activeTab === 'ledger' && <MotifLedgerView />}`

Import `MotifLedgerView` in FilesView.tsx.

### Step 5: Update navigate calls that target 'motif-ledger'

Search for any `navigate('motif-ledger')` calls in the renderer. Replace them with `navigate('files', { fileViewMode: 'browser' })` — the tab state in FilesView is local, so callers cannot directly set 'ledger'. If there is a need to open directly to the ledger tab, add `ledger?: boolean` to `ViewPayload` and read it in FilesView. This is optional — only add it if you find existing calls that need to open the ledger tab directly.

---

## Architecture Compliance

- [x] Renderer only — no domain, infra, application, or IPC changes
- [x] `motif-ledger` ViewId removed — migration in persist config prevents stale state
- [x] MotifLedgerView is only moved, not rewritten

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. "Motif Ledger" nav item no longer appears in sidebar
3. Files view has a "Files | 🧬 Motif Ledger" tab bar at the top
4. Clicking the Motif Ledger tab renders the full MotifLedgerView with all its tabs intact
5. App restart with persisted 'motif-ledger' view does not crash — falls back to 'files'

---

## State Update

Set SESSION-05 to `done` in STATE.md.
