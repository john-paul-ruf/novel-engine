# Session 29 — Shelved Pitches: UI — Zustand Store, Shelf Panel, and Book Selector Integration

## Context

Novel Engine Electron app. Session 28 added the backend plumbing for shelved pitches: domain types (`ShelvedPitchMeta`, `ShelvedPitch`), five `IFileSystemService` methods, IPC handlers (`pitches:*`), and preload bridge (`window.novelEngine.pitches`).

This session builds the **renderer layer**: a Zustand store for pitch state, a `ShelvedPitchesPanel` component accessible from the book selector dropdown, and pitch preview/restore/delete interactions.

---

## Design

### Where Shelved Pitches Live in the UI

The shelved pitches panel is accessed from the **BookSelector dropdown** — the same dropdown where the author picks their active book. This is the natural location because shelved pitches are proto-books: ideas that haven't become full projects yet.

```
┌─────────────────────────────────────┐
│  📖 The Recursive Archivist     ▼   │  ← Active book header
├─────────────────────────────────────┤
│  The Recursive Archivist    ✓ active│  ← Book list
│  Ghost Runners              42,100w │
│  The Last Compiler          18,300w │
├─────────────────────────────────────┤
│  📋 Shelved Pitches (3)            │  ← NEW: pitch shelf link
├─────────────────────────────────────┤
│  + New Book                         │
└─────────────────────────────────────┘
```

Clicking "Shelved Pitches" toggles the dropdown into a **pitch list view**:

```
┌─────────────────────────────────────┐
│  ← Back to Books                    │
├─────────────────────────────────────┤
│  📋 Shelved Pitches                 │
│                                     │
│  ┌─────────────────────────────────┐│
│  │ The Last Garden                 ││
│  │ A botanist discovers her grand- ││
│  │ mother's garden grows memories  ││
│  │ Shelved Mar 15 from ghost-run.. ││
│  │         [Preview] [Restore] [×] ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌─────────────────────────────────┐│
│  │ Iron Coast                      ││
│  │ A lighthouse keeper receives    ││
│  │ letters from the future         ││
│  │ Shelved Feb 28                  ││
│  │         [Preview] [Restore] [×] ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌───────────────────────────────┐  │
│  │ 📦 Shelve Current Pitch      │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

### Pitch Preview Modal

Clicking "Preview" opens a modal with the full pitch content rendered as markdown:

```
┌──────────────────────────────────────────┐
│  The Last Garden                    [×]  │
├──────────────────────────────────────────┤
│                                          │
│  # The Last Garden                       │
│                                          │
│  [Rendered markdown of the full pitch    │
│   card as Spark originally wrote it]     │
│                                          │
│                                          │
├──────────────────────────────────────────┤
│         [Restore as Book]  [Close]       │
└──────────────────────────────────────────┘
```

### Interactions

| Action | What Happens |
|--------|-------------|
| **Preview** | Opens modal with rendered pitch markdown |
| **Restore** | Confirmation prompt → creates new book from pitch → switches to it → removes from shelf |
| **Delete (×)** | Confirmation prompt → permanently deletes the pitch file |
| **Shelve Current** | Takes the active book's `source/pitch.md`, saves to `_pitches/`, shows success toast |

---

## Task 1: Create Zustand Store

### Create `src/renderer/stores/pitchShelfStore.ts`

```typescript
import { create } from 'zustand';
import type { ShelvedPitchMeta, ShelvedPitch } from '@domain/types';

type PitchShelfState = {
  pitches: ShelvedPitchMeta[];
  loading: boolean;
  error: string | null;

  // Preview state
  previewPitch: ShelvedPitch | null;
  previewLoading: boolean;

  // Actions
  loadPitches: () => Promise<void>;
  previewPitchBySlug: (slug: string) => Promise<void>;
  closePreview: () => void;
  restorePitch: (slug: string) => Promise<string>;  // returns new book slug
  deletePitch: (slug: string) => Promise<void>;
  shelveCurrentPitch: (bookSlug: string, logline?: string) => Promise<void>;
};

export const usePitchShelfStore = create<PitchShelfState>((set, get) => ({
  pitches: [],
  loading: false,
  error: null,
  previewPitch: null,
  previewLoading: false,

  loadPitches: async () => {
    set({ loading: true, error: null });
    try {
      const pitches = await window.novelEngine.pitches.list();
      set({ pitches, loading: false });
    } catch (err) {
      console.error('Failed to load shelved pitches:', err);
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load pitches',
      });
    }
  },

  previewPitchBySlug: async (slug: string) => {
    set({ previewLoading: true });
    try {
      const pitch = await window.novelEngine.pitches.read(slug);
      set({ previewPitch: pitch, previewLoading: false });
    } catch (err) {
      console.error('Failed to load pitch preview:', err);
      set({ previewLoading: false });
    }
  },

  closePreview: () => {
    set({ previewPitch: null });
  },

  restorePitch: async (slug: string) => {
    const meta = await window.novelEngine.pitches.restore(slug);
    // Remove from local state immediately
    set((state) => ({
      pitches: state.pitches.filter((p) => p.slug !== slug),
      previewPitch: null,
    }));
    return meta.slug;
  },

  deletePitch: async (slug: string) => {
    await window.novelEngine.pitches.delete(slug);
    set((state) => ({
      pitches: state.pitches.filter((p) => p.slug !== slug),
    }));
  },

  shelveCurrentPitch: async (bookSlug: string, logline?: string) => {
    const newPitch = await window.novelEngine.pitches.shelve(bookSlug, logline);
    set((state) => ({
      pitches: [newPitch, ...state.pitches],
    }));
  },
}));
```

---

## Task 2: Create ShelvedPitchesPanel Component

### Create `src/renderer/components/Sidebar/ShelvedPitchesPanel.tsx`

This component replaces the book list inside the BookSelector dropdown when the author clicks "Shelved Pitches". It receives callbacks from BookSelector to navigate back and to handle book switching after restore.

```typescript
import { useEffect, useState } from 'react';
import { usePitchShelfStore } from '../../stores/pitchShelfStore';
import { useBookStore } from '../../stores/bookStore';
import type { ShelvedPitchMeta } from '@domain/types';

type Props = {
  onBack: () => void;
  onBookRestored: (slug: string) => void;
};

export function ShelvedPitchesPanel({ onBack, onBookRestored }: Props): React.ReactElement {
  const { pitches, loading, loadPitches, deletePitch, restorePitch, shelveCurrentPitch, previewPitchBySlug } = usePitchShelfStore();
  const { activeSlug } = useBookStore();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [shelving, setShelving] = useState(false);
  const [shelveSuccess, setShelveSuccess] = useState(false);

  useEffect(() => {
    loadPitches();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRestore = async (slug: string) => {
    try {
      const bookSlug = await restorePitch(slug);
      setConfirmRestore(null);
      onBookRestored(bookSlug);
    } catch (err) {
      console.error('Failed to restore pitch:', err);
    }
  };

  const handleDelete = async (slug: string) => {
    try {
      await deletePitch(slug);
      setConfirmDelete(null);
    } catch (err) {
      console.error('Failed to delete pitch:', err);
    }
  };

  const handleShelve = async () => {
    if (!activeSlug) return;
    setShelving(true);
    try {
      await shelveCurrentPitch(activeSlug);
      setShelveSuccess(true);
      setTimeout(() => setShelveSuccess(false), 2000);
    } catch (err) {
      console.error('Failed to shelve pitch:', err);
    } finally {
      setShelving(false);
    }
  };

  return (
    <div className="flex flex-col">
      {/* Header with back button */}
      <button
        onClick={onBack}
        className="no-drag flex items-center gap-2 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-800"
      >
        <span>←</span>
        <span>Back to Books</span>
      </button>

      <div className="px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Shelved Pitches
        </h3>
      </div>

      {/* Pitch list */}
      <div className="max-h-64 overflow-y-auto">
        {loading && (
          <div className="px-3 py-4 text-center text-xs text-zinc-500">Loading...</div>
        )}

        {!loading && pitches.length === 0 && (
          <div className="px-3 py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
            No shelved pitches yet. Shelve a pitch from Spark to save it for later.
          </div>
        )}

        {pitches.map((pitch) => (
          <PitchCard
            key={pitch.slug}
            pitch={pitch}
            isConfirmingDelete={confirmDelete === pitch.slug}
            isConfirmingRestore={confirmRestore === pitch.slug}
            onPreview={() => previewPitchBySlug(pitch.slug)}
            onRestore={() => {
              if (confirmRestore === pitch.slug) {
                handleRestore(pitch.slug);
              } else {
                setConfirmRestore(pitch.slug);
                setConfirmDelete(null);
              }
            }}
            onDelete={() => {
              if (confirmDelete === pitch.slug) {
                handleDelete(pitch.slug);
              } else {
                setConfirmDelete(pitch.slug);
                setConfirmRestore(null);
              }
            }}
            onCancelConfirm={() => {
              setConfirmDelete(null);
              setConfirmRestore(null);
            }}
          />
        ))}
      </div>

      {/* Shelve current pitch button */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 p-2">
        <button
          onClick={handleShelve}
          disabled={!activeSlug || shelving}
          className="no-drag flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {shelveSuccess ? (
            <span className="text-green-600 dark:text-green-400">✓ Pitch shelved</span>
          ) : shelving ? (
            <span>Shelving...</span>
          ) : (
            <>
              <span>📦</span>
              <span>Shelve Current Pitch</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function PitchCard({
  pitch,
  isConfirmingDelete,
  isConfirmingRestore,
  onPreview,
  onRestore,
  onDelete,
  onCancelConfirm,
}: {
  pitch: ShelvedPitchMeta;
  isConfirmingDelete: boolean;
  isConfirmingRestore: boolean;
  onPreview: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onCancelConfirm: () => void;
}): React.ReactElement {
  const shelvedDate = pitch.shelvedAt
    ? new Date(pitch.shelvedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : '';

  return (
    <div className="border-b border-zinc-100 dark:border-zinc-800 px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
      <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {pitch.title}
      </div>
      {pitch.logline && (
        <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
          {pitch.logline}
        </div>
      )}
      <div className="mt-1 text-[10px] text-zinc-400 dark:text-zinc-500">
        {shelvedDate && `Shelved ${shelvedDate}`}
        {shelvedDate && pitch.shelvedFrom && ' · '}
        {pitch.shelvedFrom && `from ${pitch.shelvedFrom}`}
      </div>

      {/* Confirmation bars */}
      {isConfirmingDelete && (
        <div className="mt-2 flex items-center gap-2 rounded bg-red-50 dark:bg-red-950/30 px-2 py-1.5">
          <span className="text-xs text-red-600 dark:text-red-400">Delete permanently?</span>
          <button
            onClick={onDelete}
            className="no-drag rounded bg-red-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-red-500"
          >
            Yes
          </button>
          <button
            onClick={onCancelConfirm}
            className="no-drag text-[10px] text-zinc-500 hover:text-zinc-300"
          >
            No
          </button>
        </div>
      )}

      {isConfirmingRestore && (
        <div className="mt-2 flex items-center gap-2 rounded bg-blue-50 dark:bg-blue-950/30 px-2 py-1.5">
          <span className="text-xs text-blue-600 dark:text-blue-400">Create book from pitch?</span>
          <button
            onClick={onRestore}
            className="no-drag rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-500"
          >
            Yes
          </button>
          <button
            onClick={onCancelConfirm}
            className="no-drag text-[10px] text-zinc-500 hover:text-zinc-300"
          >
            No
          </button>
        </div>
      )}

      {/* Action buttons (hidden during confirmation) */}
      {!isConfirmingDelete && !isConfirmingRestore && (
        <div className="mt-1.5 flex items-center gap-2">
          <button
            onClick={onPreview}
            className="no-drag text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
          >
            Preview
          </button>
          <button
            onClick={onRestore}
            className="no-drag text-[10px] text-green-600 dark:text-green-400 hover:underline"
          >
            Restore
          </button>
          <button
            onClick={onDelete}
            className="no-drag text-[10px] text-red-500 dark:text-red-400 hover:underline"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
```

---

## Task 3: Create PitchPreviewModal Component

### Create `src/renderer/components/Sidebar/PitchPreviewModal.tsx`

A modal that renders the full shelved pitch content as formatted markdown.

```typescript
import { useEffect, useRef } from 'react';
import { marked } from 'marked';
import { usePitchShelfStore } from '../../stores/pitchShelfStore';

export function PitchPreviewModal(): React.ReactElement | null {
  const { previewPitch, previewLoading, closePreview } = usePitchShelfStore();
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!previewPitch) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePreview();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [previewPitch, closePreview]);

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      closePreview();
    }
  };

  if (!previewPitch && !previewLoading) return null;

  const renderedHtml = previewPitch
    ? marked.parse(previewPitch.content, { async: false }) as string
    : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {previewPitch?.title || 'Loading...'}
          </h2>
          <button
            onClick={closePreview}
            className="text-zinc-400 hover:text-zinc-200 text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {previewLoading ? (
            <div className="text-center text-sm text-zinc-500">Loading pitch...</div>
          ) : (
            <div
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-zinc-200 dark:border-zinc-800 px-5 py-3">
          <button
            onClick={closePreview}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## Task 4: Integrate into BookSelector

### Update `src/renderer/components/Sidebar/BookSelector.tsx`

Add a state variable to toggle between book list and pitch shelf views inside the dropdown:

1. **Import** `ShelvedPitchesPanel` and `PitchPreviewModal`:

```typescript
import { ShelvedPitchesPanel } from './ShelvedPitchesPanel';
import { PitchPreviewModal } from './PitchPreviewModal';
import { usePitchShelfStore } from '../../stores/pitchShelfStore';
```

2. **Add state** in `BookSelector`:

```typescript
const [showPitchShelf, setShowPitchShelf] = useState(false);
const pitchCount = usePitchShelfStore((s) => s.pitches.length);
```

3. **Load pitch count on dropdown open** — when the dropdown opens, trigger a lightweight pitch list load so the count badge is accurate:

```typescript
// In the button onClick handler:
const handleToggleDropdown = () => {
  const opening = !isOpen;
  setIsOpen(opening);
  if (opening) {
    setShowPitchShelf(false); // Reset to book view
    usePitchShelfStore.getState().loadPitches(); // Refresh count
  }
};
```

4. **Inside the dropdown panel**, conditionally render either the book list or the pitch shelf:

```tsx
{/* Dropdown panel */}
{isOpen && (
  <div className="absolute left-0 right-0 top-full z-40 border-b border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 shadow-xl">
    {showPitchShelf ? (
      <ShelvedPitchesPanel
        onBack={() => setShowPitchShelf(false)}
        onBookRestored={async (slug) => {
          setIsOpen(false);
          setShowPitchShelf(false);
          await setActiveBook(slug);
        }}
      />
    ) : (
      <>
        <div className="max-h-64 overflow-y-auto">
          {books.map((book) => (
            <BookDropdownItem
              key={book.slug}
              book={book}
              isActive={book.slug === activeSlug}
              timestamp={coverTimestamp}
              onClick={() => handleSelectBook(book.slug)}
            />
          ))}
        </div>

        {/* Shelved Pitches link */}
        <div className="border-t border-zinc-200 dark:border-zinc-800 p-2">
          <button
            onClick={() => setShowPitchShelf(true)}
            className="no-drag flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <span>📋</span>
            <span>Shelved Pitches</span>
            {pitchCount > 0 && (
              <span className="ml-auto rounded-full bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:text-zinc-300">
                {pitchCount}
              </span>
            )}
          </button>
        </div>

        {/* New Book button */}
        <div className="border-t border-zinc-200 dark:border-zinc-800 p-2">
          <button
            onClick={() => {
              setIsOpen(false);
              setShowNewBookModal(true);
            }}
            className="no-drag flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <span>+</span>
            <span>New Book</span>
          </button>
        </div>
      </>
    )}
  </div>
)}
```

5. **Render the preview modal** at the component root level (outside the dropdown, so it floats over everything):

```tsx
return (
  <div ref={dropdownRef} className="relative border-b border-zinc-200 dark:border-zinc-800">
    {/* ... existing button and dropdown ... */}
    {showNewBookModal && <NewBookModal ... />}
    <PitchPreviewModal />
  </div>
);
```

---

## Task 5: Handle Prose Rendering Styles

### Verify `src/renderer/styles/globals.css`

The pitch preview modal uses Tailwind's `prose` classes for rendering markdown. Ensure that `@tailwindcss/typography` is configured. If it's already present (likely from the file viewer), no changes needed.

If `prose dark:prose-invert` isn't working, add these minimal styles to `globals.css`:

```css
/* Pitch preview prose — fallback if @tailwindcss/typography isn't available */
.pitch-prose h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; }
.pitch-prose h2 { font-size: 1.25rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.5rem; }
.pitch-prose p { margin-bottom: 0.75rem; line-height: 1.6; }
.pitch-prose ul { list-style: disc; padding-left: 1.5rem; margin-bottom: 0.75rem; }
.pitch-prose li { margin-bottom: 0.25rem; }
```

Only add these if the `prose` utility class doesn't work. Check the existing file viewer components — if they already use `prose`, this is already handled.

---

## Summary of Changes by File

| File | Change |
|------|--------|
| `src/renderer/stores/pitchShelfStore.ts` | **NEW** — Zustand store for shelved pitch state |
| `src/renderer/components/Sidebar/ShelvedPitchesPanel.tsx` | **NEW** — Pitch list with preview/restore/delete actions |
| `src/renderer/components/Sidebar/PitchPreviewModal.tsx` | **NEW** — Full pitch preview modal with rendered markdown |
| `src/renderer/components/Sidebar/BookSelector.tsx` | Add pitch shelf toggle, count badge, and modal rendering |
| `src/renderer/styles/globals.css` | (maybe) Add prose fallback styles if typography plugin isn't active |

## Architecture Notes

- **Layer boundaries preserved.** The renderer accesses pitches exclusively through `window.novelEngine.pitches`. The store imports only `type` from domain. No infrastructure or application imports.
- **Minimal UI footprint.** The pitch shelf is nested inside the existing BookSelector dropdown — no new sidebar sections, no new views, no new routes. It's a natural extension of the book management area.
- **Optimistic state updates.** After restore/delete, the local store is updated immediately. No round-trip needed to refresh the list.
- **Preview uses `marked`.** Already a project dependency (used by the file viewer). No new npm packages.

## Verification

1. **Pitch shelf visible:**
   - Click the book selector dropdown
   - Verify "📋 Shelved Pitches" link appears between the book list and "New Book"
   - If pitches exist, a count badge appears

2. **Shelf navigation:**
   - Click "Shelved Pitches" → view switches to pitch list with "← Back to Books"
   - Click "← Back to Books" → returns to normal book list

3. **Shelve a pitch:**
   - With an active book that has `source/pitch.md`
   - Click "📦 Shelve Current Pitch" in the pitch shelf view
   - Verify success message appears briefly
   - Verify the pitch appears in the list

4. **Preview a pitch:**
   - Click "Preview" on a shelved pitch card
   - Verify modal opens with rendered markdown
   - Verify Escape key and backdrop click close the modal

5. **Restore a pitch:**
   - Click "Restore" → confirmation bar appears: "Create book from pitch? [Yes] [No]"
   - Click "Yes" → new book is created, becomes active, dropdown closes
   - Verify pitch is removed from the shelf
   - Verify `source/pitch.md` exists in the new book

6. **Delete a pitch:**
   - Click "Delete" → confirmation bar appears: "Delete permanently? [Yes] [No]"
   - Click "Yes" → pitch removed from the list
   - Click "No" → confirmation dismissed

7. **Empty state:**
   - With no shelved pitches, verify the empty state message appears

8. **Compilation:**
   - `npx tsc --noEmit` passes with zero errors
