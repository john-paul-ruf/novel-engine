# SESSION-03 — Book Dropdown Redesign

> **Feature:** small-queue-intake
> **Layer(s):** M10 (renderer only)
> **Depends on:** SESSION-01 (done)
> **Estimated effort:** 30 min

---

## Context

The BookSelector dropdown is doing too many jobs: book switching, series management, archived books, shelved pitches, import, import series. This makes it cluttered and confusing, especially when the sidebar is narrow.

**Design decision:** Split the dropdown into two concerns:
1. **The dropdown** — only for switching between active books. New Book button.
2. **A new Library panel** — triggered by a single icon button inside the dropdown footer. Houses: Archived Books, Shelved Pitches, Manage Series, Import, Import Series.

Series groups (books belonging to a series) remain in the dropdown — they are active books, not management. Series info (groups) should be hidden when all books in that series are archived (i.e., when `standaloneBooks` and the series group both have zero active members, which the existing `books` array already reflects since archived books are excluded from `books`).

---

## Files to Read First

- `src/renderer/components/Sidebar/BookSelector.tsx` — full file
- `src/renderer/stores/bookStore.ts` — to understand available actions
- `src/renderer/stores/seriesStore.ts` — series state
- `src/renderer/stores/importStore.ts` — import trigger
- `src/renderer/stores/pitchShelfStore.ts` — pitch shelf state

---

## Implementation

### Step 1: Simplify the dropdown

In the main dropdown panel (below the `showPitchShelf` / `showArchived` conditional), remove the following sections from the main book list view:
- Shelved Pitches link button (the 📋 section)
- Archived Books link button (the 📦 section)
- Manage Series button (the 📚 section)
- Import and Import Series buttons (the bottom p-2 flex gap-1 section)

Replace all removed sections with a single footer row:

```tsx
<div className="border-t border-zinc-200 dark:border-zinc-800 p-2 flex items-center gap-1">
  <button
    onClick={() => { setIsOpen(false); setShowNewBookModal(true); }}
    className="no-drag flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
  >
    <span>+</span>
    <span>New Book</span>
  </button>
  <button
    onClick={() => setShowLibrary(true)}
    title="Library: archived books, shelved pitches, series, import"
    className="no-drag rounded-md px-2.5 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300"
  >
    ···
  </button>
</div>
```

Add `showLibrary` state: `const [showLibrary, setShowLibrary] = useState(false);`

### Step 2: Create the Library sub-panel

Add a `LibraryPanel` component (co-located in `BookSelector.tsx`) that renders when `showLibrary` is true, replacing the main book list in the dropdown:

```tsx
function LibraryPanel({
  onBack,
  onBookRestored,
}: {
  onBack: () => void;
  onBookRestored: (slug: string) => Promise<void>;
}): React.ReactElement
```

The LibraryPanel contains:
1. A "← Back" header row
2. Four action items (styled like the current shelved/archived buttons):
   - **Shelved Pitches** (📋) — sets showPitchShelf = true OR calls a passed callback to show the pitch shelf panel. Keep the existing ShelvedPitchesPanel rendering logic.
   - **Archived Books** (📦) — sets showArchived = true. Keep the existing ArchivedBooksPanel.
   - **Manage Series** (📚) — closes dropdown and opens series modal
   - **Import** (upload icon) — closes dropdown and starts import
   - **Import Series** — closes dropdown and starts series import

The `showLibrary` state gates the LibraryPanel the same way `showPitchShelf` and `showArchived` currently gate their panels.

Update the dropdown conditional from:
```tsx
{showPitchShelf ? ... : showArchived ? ... : <main content>}
```
to:
```tsx
{showLibrary ? (
  <LibraryPanel onBack={() => setShowLibrary(false)} onBookRestored={...} />
) : showPitchShelf ? ... : showArchived ? ... : <main content>}
```

### Step 3: Series info — hide when all books are archived

The existing `seriesGroups` already filters to only active books (the `books` array from `useBookStore` does not include archived books). So series groups with all books archived will naturally have empty `volumes`. Add a filter:

```ts
const { seriesGroups, standaloneBooks } = useMemo(() => {
  // ... existing logic ...
  // After computing groups, filter out groups with no active volumes
  return {
    seriesGroups: Array.from(groups.values()).filter(g => g.volumes.length > 0),
    standaloneBooks: standalone,
  };
}, [books, bookToSeries]);
```

This is likely already implicitly correct — but make it explicit and add the filter to be safe.

---

## Architecture Compliance

- [x] Renderer only — no domain, infra, application, or IPC changes
- [x] No new Zustand stores
- [x] All existing functionality preserved — just reorganized
- [x] `LibraryPanel` is a co-located function component in BookSelector.tsx

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Dropdown opens showing: series groups (if any), standalone books, New Book, ··· button
3. Clicking ··· opens the Library panel showing all management options
4. Each Library option works (shelved pitches panel, archived panel, series modal, import wizards)
5. A book series where all volumes are archived does not appear as a group in the dropdown

---

## State Update

Set SESSION-03 to `done` in STATE.md.
