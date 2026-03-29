# SESSION-02 — Sidebar Book Panel

> **Program:** Novel Engine
> **Feature:** sidebar-bookshelf-files-tabs
> **Depends on:** SESSION-01
> **Estimated effort:** 30 min

---

## Context

After SESSION-01, the FilesView has 5 category tabs (Source, Chapters, Agents, Explorer, Motif Ledger). The sidebar still has the old `BookSelector` dropdown and `FileTree`. The FileTree is now redundant — the Explorer tab in FilesView serves the same purpose with a richer UI.

This session replaces the entire sidebar content area (BookSelector + FileTree) with a **BookPanel** — a permanently visible, scrollable bookshelf that shows all books at a glance. The BookPanel has:

1. **Pinned icon toolbar** at the top — New Book, Shelved Pitches, Archived Books, Manage Series, Import
2. **Scrollable book list** below — individual book cards with cover image, title/subtitle/series info, pipeline stage, word count, and archive button
3. **Series grouping** — thin headers that group books within a series

The `BookSelector` component (773 lines) contains significant logic for book management, series grouping, modals, etc. Most of this logic migrates into the new `BookPanel`. Sub-panels (ShelvedPitchesPanel, ArchivedBooksPanel, LibraryPanel) and modals (NewBookModal, ArchiveConfirmModal) are preserved.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/components/Sidebar/BookPanel.tsx` | Create | New component — scrollable bookshelf with icon toolbar, book cards, series groups. Replaces BookSelector. |
| `src/renderer/components/Sidebar/ImportChoiceModal.tsx` | Create | Modal that lets user choose between single book import or series wizard import. |
| `src/renderer/components/Layout/Sidebar.tsx` | Modify | Remove FileTree. Replace BookSelector with BookPanel. Adjust layout so BookPanel fills the space above the bottom nav. |
| `src/renderer/components/Sidebar/FileTree.tsx` | Delete | No longer used — Explorer tab in FilesView replaces it. |
| `src/renderer/components/Sidebar/BookSelector.tsx` | Delete | Replaced by BookPanel. All functionality migrates. |

---

## Implementation

### 1. Create ImportChoiceModal.tsx

Create `src/renderer/components/Sidebar/ImportChoiceModal.tsx`.

A simple modal with two choices: "Import Book" and "Import Series". When the user clicks Import in the toolbar, this modal appears.

```tsx
type ImportChoiceModalProps = {
  onClose: () => void;
  onImportBook: () => void;
  onImportSeries: () => void;
};
```

Render a fixed overlay (`fixed inset-0 z-50 flex items-center justify-center bg-black/50`) with a card containing:
- Title: "Import"
- Two large clickable cards side by side:
  - **Single Book** — icon 📘, subtitle "Import a manuscript from a folder"
  - **Series** — icon 📚, subtitle "Import multiple books as a series"
- Cancel button at the bottom

Each card calls the appropriate callback and closes the modal. Use the same modal styling as `NewBookModal` in the existing codebase (rounded-lg, border, bg-zinc-50 dark:bg-zinc-900, shadow-xl).

### 2. Create BookPanel.tsx

Create `src/renderer/components/Sidebar/BookPanel.tsx`.

This is the main component — a persistent, always-visible bookshelf that replaces both BookSelector and the sidebar's file tree area.

**Imports needed:**
```typescript
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BookStatus, BookSummary } from '@domain/types';
import { useBookStore } from '../../stores/bookStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useChatStore } from '../../stores/chatStore';
import { useViewStore } from '../../stores/viewStore';
import { useFileChangeStore } from '../../stores/fileChangeStore';
import { useSeriesStore } from '../../stores/seriesStore';
import { usePitchShelfStore } from '../../stores/pitchShelfStore';
import { useImportStore } from '../../stores/importStore';
import { useSeriesImportStore } from '../../stores/seriesImportStore';
import { ShelvedPitchesPanel } from './ShelvedPitchesPanel';
import { PitchPreviewModal } from './PitchPreviewModal';
import { ImportWizard } from '../Import/ImportWizard';
import { ImportSeriesWizard } from '../Import/ImportSeriesWizard';
import { SeriesModal } from '../Series/SeriesModal';
import { SeriesGroup } from './SeriesGroup';
import { ImportChoiceModal } from './ImportChoiceModal';
import { Tooltip } from '../common/Tooltip';
```

**Migrate from BookSelector:**

The following should be moved or adapted from `BookSelector.tsx`:

- `STATUS_COLORS`, `FALLBACK_COLORS`, `StatusBadge` — used by book cards
- `CoverThumbnail` — used by book cards
- `formatWordCount` — helper
- `NewBookModal` — triggered by toolbar icon
- `ArchiveConfirmModal` — triggered by book card archive button
- `ArchivedBooksPanel` — triggered by toolbar icon (shows as a slide-in panel replacing the book list)
- All the data loading logic from `BookSelector` — `useEffect` hooks for `loadBooks`, `loadArchivedBooks`, `loadSeries`, `subscribeToDirectoryChanges`, `refreshWordCount`, etc.
- Series grouping logic (`bookToSeries`, `seriesGroups`, `standaloneBooks` memos)
- Book selection handler (`handleSelectBook`)
- Book creation handler (`handleCreateBook`)
- Cover upload handler (`handleCoverClick`)
- Archive handler (`handleArchiveConfirm`)

**BookPanel structure:**

```
┌──────────────────────────────┐
│ [+] [📋] [📦] [📚] [⬆️]   │  ← Pinned icon toolbar
├──────────────────────────────┤
│                              │
│  📚 The Stormlight Archive   │  ← Series header (thin)
│  ┌────┐ Way of Kings         │
│  │cover│ outlining · 45,000w │  ← Book card
│  └────┘              [📦]   │
│  ┌────┐ Words of Radiance    │
│  │cover│ first-draft · 0w    │
│  └────┘              [📦]   │
│                              │
│  ┌────┐ The Best Burger      │  ← Standalone book
│  │cover│ scaffolded · 0w     │
│  └────┘              [📦]   │
│                              │
└──────────────────────────────┘
```

**A. Icon Toolbar (pinned at top, never scrolls)**

A horizontal row of icon buttons with tooltips. Each icon is a small button (no text label — just the icon). Tooltips explain on hover.

```tsx
const TOOLBAR_ACTIONS = [
  { id: 'new-book', icon: '+', tooltip: 'New Book' },
  { id: 'shelved', icon: '📋', tooltip: 'Shelved Pitches' },
  { id: 'archived', icon: '📦', tooltip: 'Archived Books' },
  { id: 'series', icon: '📚', tooltip: 'Manage Series' },
  { id: 'import', icon: '⬆️', tooltip: 'Import' },
];
```

Render as:
```tsx
<div className="shrink-0 flex items-center justify-center gap-1 border-b border-zinc-200 dark:border-zinc-800 px-2 py-2">
  {TOOLBAR_ACTIONS.map((action) => (
    <Tooltip key={action.id} content={action.tooltip} placement="bottom">
      <button
        onClick={() => handleToolbarAction(action.id)}
        className="rounded-md p-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
      >
        {action.icon}
      </button>
    </Tooltip>
  ))}
</div>
```

The `+` for New Book can use a literal `+` character styled bold, or a simple SVG plus icon. Use the `+` character in a slightly larger font for simplicity.

`handleToolbarAction` dispatches:
- `'new-book'` → `setShowNewBookModal(true)`
- `'shelved'` → `setShowShelvedPanel(true)` (replaces book list with ShelvedPitchesPanel)
- `'archived'` → `setShowArchivedPanel(true)` (replaces book list with ArchivedBooksPanel)
- `'series'` → `openModal('list')` from seriesStore (opens the full SeriesModal)
- `'import'` → `setShowImportChoice(true)` (opens ImportChoiceModal)

**B. Book List (scrollable)**

Below the toolbar, the remaining space is a scrollable list. This uses the same series grouping logic from BookSelector:

- Series groups use the existing `SeriesGroup` component (already handles expand/collapse, volume list, manage button).
- Standalone books render as individual cards.

**Book card format** — the user requested:
```
| cover image | Title - Subtitle - Series #                  |
|             | pipeline stage | word count | archive button |
```

Implement each standalone book card as:
```tsx
<div className={`group/book flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 ${isActive ? 'bg-blue-50 dark:bg-blue-950/20 border-l-2 border-blue-500' : ''}`}>
  <button onClick={handleCoverClick} className="group/cover relative shrink-0 ...">
    <CoverThumbnail slug={book.slug} width={36} height={50} timestamp={coverTimestamp} />
    <div className="absolute inset-0 ... opacity-0 group-hover/cover:opacity-100">📷</div>
  </button>
  <button onClick={() => handleSelectBook(book.slug)} className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
    <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{book.title}</span>
    <div className="flex items-center gap-2">
      <StatusBadge status={book.status} />
      <span className="text-xs text-zinc-500">{formatWordCount(book.wordCount)}w</span>
    </div>
  </button>
  <button onClick={() => setArchiveTarget(book)} title="Archive" className="shrink-0 rounded p-1 text-zinc-400 opacity-0 group-hover/book:opacity-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 ...">
    📦
  </button>
</div>
```

The active book gets a subtle highlight (blue left border + light blue background tint).

**C. Sub-panels (Shelved Pitches, Archived Books)**

When the user clicks the Shelved Pitches or Archived Books toolbar icon, the book list is replaced by the respective panel. These panels already exist (`ShelvedPitchesPanel`, `ArchivedBooksPanel`) and have a "← Back" button that returns to the book list. Reuse them directly.

State management:
```tsx
const [showShelvedPanel, setShowShelvedPanel] = useState(false);
const [showArchivedPanel, setShowArchivedPanel] = useState(false);
```

Render:
```tsx
{showShelvedPanel ? (
  <ShelvedPitchesPanel onBack={() => setShowShelvedPanel(false)} onBookRestored={...} />
) : showArchivedPanel ? (
  <ArchivedBooksPanel onBack={() => setShowArchivedPanel(false)} onBookRestored={...} />
) : (
  /* Normal book list */
  <div className="flex-1 min-h-0 overflow-y-auto">
    {seriesGroups.map(...)}
    {seriesGroups.length > 0 && standaloneBooks.length > 0 && <div className="border-t ..." />}
    {standaloneBooks.map(...)}
    {books.length === 0 && <div className="px-3 py-6 text-center text-xs text-zinc-500">No books yet</div>}
  </div>
)}
```

**D. Modals**

The following modals render at the bottom of BookPanel (same pattern as BookSelector):
- `NewBookModal` — shown when `showNewBookModal` is true
- `ArchiveConfirmModal` — shown when `archiveTarget` is non-null
- `PitchPreviewModal` — always rendered (manages its own visibility via store)
- `ImportWizard` — shown when `importStep !== 'idle'`
- `ImportSeriesWizard` — shown when `seriesImportStep !== 'idle'`
- `SeriesModal` — shown when `isModalOpen`
- `ImportChoiceModal` — shown when `showImportChoice` is true

The `ImportChoiceModal`'s `onImportBook` calls `startImport()` and `onImportSeries` calls `startSeriesImport()`.

**E. Data loading**

Migrate all `useEffect` hooks from BookSelector:
- Load books on mount
- Load archived books on mount
- Load series on mount
- Subscribe to directory changes
- Refresh word count on active book change
- Refresh word count on file changes (revision counter)
- Load pipeline + conversations on active book change

### 3. Modify Sidebar.tsx

Read `src/renderer/components/Layout/Sidebar.tsx`.

**Remove imports:**
- Remove `import { BookSelector } from '../Sidebar/BookSelector';`
- Remove `import { FileTree } from '../Sidebar/FileTree';`

**Add import:**
- `import { BookPanel } from '../Sidebar/BookPanel';`

**Replace the sidebar content area.** Currently the `Sidebar` component has:

```tsx
{/* Book selector */}
<div className="flex-1 min-w-0">
  <BookSelector />
</div>

{/* Middle sections — Pitch history + Files */}
<div className="flex min-h-0 flex-1 flex-col">
  {/* Pitch session history */}
  {currentView === 'pitch-room' ? (...PitchHistory...) : null}

  {/* Files — always visible */}
  <div className="flex min-h-0 flex-1 flex-col border-t ...">
    <div className="flex shrink-0 items-center px-3 py-2">
      <span className="...">Files</span>
    </div>
    <div data-tour="file-tree" className="min-h-0 flex-1 overflow-y-auto">
      <FileTree />
    </div>
  </div>
</div>
```

Replace with:

```tsx
{/* Book Panel — always visible, fills available space above nav */}
<div className="flex min-h-0 flex-1 flex-col">
  {/* Pitch session history — shown only when in the Pitch Room view */}
  {currentView === 'pitch-room' ? (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 items-center border-b border-zinc-200 dark:border-zinc-800 px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-amber-500 dark:text-amber-400">
          Pitch Sessions
        </span>
      </div>
      <div className="min-h-0 max-h-48 overflow-y-auto">
        <PitchHistory />
      </div>
    </div>
  ) : null}

  {/* Book Panel — scrollable bookshelf */}
  <div className="flex min-h-0 flex-1 flex-col">
    <BookPanel />
  </div>
</div>
```

Key changes:
- `BookSelector` is gone — no more dropdown at the top.
- `FileTree` and its "FILES" header are gone.
- `BookPanel` takes all the space between PitchHistory (if visible) and the bottom nav.
- PitchHistory gets a `max-h-48` to ensure it doesn't eat the entire sidebar when there are many sessions — the BookPanel always has room.

### 4. Delete FileTree.tsx and BookSelector.tsx

Delete:
- `src/renderer/components/Sidebar/FileTree.tsx`
- `src/renderer/components/Sidebar/BookSelector.tsx`

Before deleting, search the codebase for any other imports of these components:
- `FileTree` — should only be imported in `Sidebar.tsx` (which we just changed)
- `BookSelector` — should only be imported in `Sidebar.tsx`

If either is imported elsewhere, update those imports too.

### 5. Verify the `data-tour` attribute migration

The old sidebar had `data-tour="file-tree"` on the FileTree container and `data-tour="book-selector"` on the BookSelector root. These may be referenced by guided tours.

Search for `data-tour="file-tree"` and `data-tour="book-selector"` in the tour definitions.

- If `data-tour="file-tree"` is referenced in tours: add `data-tour="file-tree"` to the Explorer tab's content area in FilesView, or update the tour step to target the new location.
- If `data-tour="book-selector"` is referenced: add `data-tour="book-selector"` to the BookPanel root element.

Read `src/renderer/tours/` to find tour definitions and update any affected steps.

---

## Verification

1. Run `npx tsc --noEmit` — no type errors.
2. Run the app. The sidebar shows:
   - **Icon toolbar** at the top with 5 icons (New Book, Shelved Pitches, Archived Books, Manage Series, Import).
   - **Scrollable book list** below the toolbar with all books.
   - **Bottom nav** unchanged (Chat, Files, Build, Pitch Room, Reading Mode, Settings, Pipeline, CLI Activity).
3. **No file tree in the sidebar.** The old FILES section is gone.
4. **Book cards** show cover image, title, pipeline status badge, word count, and archive button (visible on hover).
5. **Active book** is highlighted (blue left border).
6. **Clicking a book** selects it — pipeline, conversations, and word count update.
7. **Cover click** triggers file picker for cover image upload.
8. **Series** books are grouped under thin series headers (using existing SeriesGroup component).
9. **New Book** icon opens the creation modal.
10. **Shelved Pitches** icon replaces the book list with the shelved pitches panel (← Back returns to book list).
11. **Archived Books** icon replaces the book list with the archived books panel.
12. **Manage Series** icon opens the full series modal.
13. **Import** icon opens the ImportChoiceModal with two options: Single Book and Series.
14. **Pitch Room view** still shows PitchHistory above the BookPanel in the sidebar.
15. No dangling imports — `FileTree` and `BookSelector` are not referenced anywhere.
16. Layer boundaries intact — no cross-layer imports.

---

## State Update

After completing this session, update `prompts/session-program/program-003/STATE.md`:
- Set SESSION-02 status to `done`
- Set Completed date
- Add notes about decisions or complications
- Update Handoff Notes
