# SESSION-06 — QueryManagerView Component + IconRail Entry

> **Program:** Novel Engine
> **Feature:** query-manager
> **Modules:** M10 (renderer)
> **Depends on:** SESSION-05
> **Estimated effort:** 30 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M10 | renderer/stores | `src/renderer/stores/queryStore.ts` (from SESSION-05), `src/renderer/stores/bookStore.ts` (active slug), `src/renderer/stores/viewStore.ts` (view routing) | Store API, book slug, view registration |
| M10 | renderer/components | `src/renderer/components/Rail/IconRail.tsx` (rail items), `src/renderer/components/Layout/AppLayout.tsx` (view content), `src/renderer/components/common/Icon.tsx` (icon set) | Rail entry pattern, view rendering, icon names |
| M10 | renderer/components | `src/renderer/components/Exports/ExportsView.tsx` (view pattern for a full standalone view) | Pattern for a standalone book-scoped view |

## Context

With the store ready (SESSION-05), we build the UI:
1. A new `QueryManagerView` component with target list, add-target form, status updates, and letter generation/preview
2. IconRail entry: a new `query-manager` view that requires a book
3. ViewStore update: add `'query-manager'` to the `ViewId` union
4. AppLayout update: render `QueryManagerView` in the `ViewContent` switch

The view is book-scoped (like ExportsView) — it loads the tracker when a book is active and clears when switching. It shows:
- Stats summary (total targets, by status)
- A list of query targets with status badges
- Add target form
- Per-target actions: generate letter, view letter, update status, remove

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/components/QueryManager/QueryManagerView.tsx` | Create | Main view component |
| `src/renderer/components/QueryManager/TargetCard.tsx` | Create | Single target card with status badge and actions |
| `src/renderer/components/QueryManager/AddTargetForm.tsx` | Create | Form for adding a new submission target |
| `src/renderer/components/QueryManager/LetterPreview.tsx` | Create | Modal/inline preview of a query letter |
| `src/renderer/stores/viewStore.ts` | Modify | Add `'query-manager'` to `ViewId` union |
| `src/renderer/components/Rail/IconRail.tsx` | Modify | Add query-manager rail item |
| `src/renderer/components/common/Icon.tsx` | Modify | Add `'mail'` icon |
| `src/renderer/components/Layout/AppLayout.tsx` | Modify | Render QueryManagerView in ViewContent |

## Implementation

### 1. Read existing component patterns

Read `src/renderer/components/Exports/ExportsView.tsx` to study how a book-scoped standalone view is structured.
Read `src/renderer/components/common/Icon.tsx` to understand the icon pattern (lines 6-10 for `IconName` type, lines 12+ for `ICON_PATHS`).

### 2. Add `'mail'` icon to Icon.tsx

In `src/renderer/components/common/Icon.tsx`, add `'mail'` to the `IconName` union type (line 6) and add an icon path in `ICON_PATHS`:

```typescript
// In IconName type:
  | 'play' | 'eye' | 'pencil' | 'download' | 'x' | 'history' | 'sparkles' | 'mail';

// In ICON_PATHS:
  mail: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </>
  ),
```

### 3. Update `src/renderer/stores/viewStore.ts`

Add `'query-manager'` to the `ViewId` union (line 4-6):

```typescript
type ViewId =
  | 'library' | 'workspace' | 'manuscript' | 'exports' | 'query-manager'   // primary
  | 'settings' | 'statistics' | 'pitch-room' | 'onboarding';                 // secondary
```

### 4. Update `src/renderer/components/Rail/IconRail.tsx`

Add `'query-manager'` to the `RailView` type and add a rail item. In the `RailView` type (line 7):

```typescript
type RailView = 'library' | 'workspace' | 'manuscript' | 'exports' | 'query-manager' | 'statistics' | 'settings';
```

Add to `TOP_ITEMS` array, after `exports`:

```typescript
  { view: 'query-manager', icon: 'mail', label: 'Query Manager — agents & submissions', needsBook: true },
```

### 5. Create `src/renderer/components/QueryManager/QueryManagerView.tsx`

```tsx
import { useEffect, useState } from 'react';
import { useBookStore } from '../../stores/bookStore';
import { useQueryStore } from '../../stores/queryStore';
import { TargetCard } from './TargetCard';
import { AddTargetForm } from './AddTargetForm';
import { LetterPreview } from './LetterPreview';
import type { QueryTarget } from '@domain/types';

export function QueryManagerView(): React.ReactElement {
  const activeSlug = useBookStore((s) => s.activeSlug);
  const { tracker, letters, loading, error, load, clear, initStreamListener } = useQueryStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);

  useEffect(() => {
    initStreamListener();
  }, [initStreamListener]);

  useEffect(() => {
    if (activeSlug) {
      void load(activeSlug);
    } else {
      clear();
    }
  }, [activeSlug, load, clear]);

  if (!activeSlug) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ne-ink-faint">
        Select a book in the Library to manage queries
      </div>
    );
  }

  if (loading && !tracker) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ne-ink-faint">
        Loading query tracker…
      </div>
    );
  }

  const targets = tracker?.targets ?? [];
  const statusCounts = targets.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="h-full overflow-y-auto bg-ne-bg0 p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-ne-serif text-xl text-ne-ink">Query Manager</h1>
            <p className="mt-1 text-xs text-ne-ink-dim">
              {targets.length} target{targets.length !== 1 ? 's' : ''} ·
              {' '}{statusCounts['queried'] ?? 0} queried ·
              {' '}{statusCounts['full-request'] ?? 0} full ·
              {' '}{statusCounts['offer'] ?? 0} offers ·
              {' '}{statusCounts['rejected'] ?? 0} rejected
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            className="rounded-lg bg-ne-brass px-4 py-2 text-sm font-medium text-ne-bg0 transition-colors hover:bg-ne-brass-hi"
          >
            + Add Target
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {showAddForm && (
          <AddTargetForm
            bookSlug={activeSlug}
            onDone={() => setShowAddForm(false)}
          />
        )}

        {targets.length === 0 && !showAddForm ? (
          <div className="rounded-[13px] border border-ne-line bg-ne-bg1 p-8 text-center">
            <p className="text-sm text-ne-ink-dim">
              No submission targets yet. Click "Add Target" to start tracking your queries.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {targets.map((target) => (
              <TargetCard
                key={target.id}
                target={target}
                bookSlug={activeSlug}
                letter={letters.find((l) => l.targetSlug === slugify(target.name)) ?? null}
                onPreviewLetter={(slug) => setPreviewSlug(slug)}
              />
            ))}
          </div>
        )}

        {previewSlug && (
          <LetterPreview
            bookSlug={activeSlug}
            targetSlug={previewSlug}
            onClose={() => setPreviewSlug(null)}
          />
        )}
      </div>
    </div>
  );
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
}
```

### 6. Create `src/renderer/components/QueryManager/TargetCard.tsx`

```tsx
import { useQueryStore } from '../../stores/queryStore';
import type { QueryTarget, QueryStatus, QueryLetter } from '@domain/types';

const STATUS_COLORS: Record<QueryStatus, string> = {
  'drafting': 'bg-zinc-500/15 text-zinc-400',
  'queried': 'bg-blue-500/15 text-blue-400',
  'partial-request': 'bg-amber-500/15 text-amber-400',
  'full-request': 'bg-purple-500/15 text-purple-400',
  'offer': 'bg-green-500/15 text-green-400',
  'rejected': 'bg-red-500/15 text-red-400',
  'withdrawn': 'bg-zinc-500/10 text-zinc-500',
};

const STATUS_LABELS: Record<QueryStatus, string> = {
  'drafting': 'Drafting',
  'queried': 'Queried',
  'partial-request': 'Partial Request',
  'full-request': 'Full Request',
  'offer': 'Offer',
  'rejected': 'Rejected',
  'withdrawn': 'Withdrawn',
};

const ALL_STATUSES: QueryStatus[] = ['drafting', 'queried', 'partial-request', 'full-request', 'offer', 'rejected', 'withdrawn'];

export function TargetCard({
  target,
  bookSlug,
  letter,
  onPreviewLetter,
}: {
  target: QueryTarget;
  bookSlug: string;
  letter: QueryLetter | null;
  onPreviewLetter: (slug: string) => void;
}): React.ReactElement {
  const { updateTargetStatus, removeTarget, generateLetter, generatingFor } = useQueryStore();
  const targetSlug = slugify(target.name);
  const isGenerating = generatingFor === target.id;

  return (
    <div className="rounded-[13px] border border-ne-line bg-ne-bg1 p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-ne-serif text-base text-ne-ink">{target.name}</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[target.status]}`}>
              {STATUS_LABELS[target.status]}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ne-ink-dim">
            <span>{target.type}</span>
            {target.contact && <span>{target.contact}</span>}
            {target.submittedDate && <span>Sent: {target.submittedDate.split('T')[0]}</span>}
            {target.responseDate && <span>Response: {target.responseDate.split('T')[0]}</span>}
          </div>
          {target.personalizationNotes && (
            <p className="mt-1.5 text-xs text-ne-ink-faint">{target.personalizationNotes}</p>
          )}
          {target.notes && (
            <p className="mt-1 text-xs text-ne-ink-faint italic">{target.notes}</p>
          )}
        </div>
        <div className="ml-4 flex shrink-0 gap-1.5">
          {letter && (
            <button
              onClick={() => onPreviewLetter(targetSlug)}
              className="rounded-lg border border-ne-line px-3 py-1.5 text-xs text-ne-ink-dim transition-colors hover:bg-ne-bg2"
            >
              View Letter
            </button>
          )}
          <button
            onClick={() => generateLetter(bookSlug, target.id)}
            disabled={isGenerating}
            className="rounded-lg border border-ne-line px-3 py-1.5 text-xs text-ne-ink-dim transition-colors hover:bg-ne-bg2 disabled:opacity-50"
          >
            {isGenerating ? 'Generating…' : letter ? 'Regenerate' : 'Generate Letter'}
          </button>
          <button
            onClick={() => removeTarget(bookSlug, target.id)}
            className="rounded-lg border border-ne-line px-3 py-1.5 text-xs text-red-400/70 transition-colors hover:bg-red-500/10"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-ne-ink-faint">Status:</span>
        <select
          value={target.status}
          onChange={(e) => updateTargetStatus(bookSlug, target.id, e.target.value as QueryStatus)}
          className="rounded-md border border-ne-line bg-ne-bg0 px-2 py-1 text-xs text-ne-ink-dim focus:outline-none focus:border-ne-brass"
        >
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        {target.link && (
          <a
            href={target.link}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-xs text-blue-400 hover:underline"
          >
            Profile →
          </a>
        )}
      </div>
    </div>
  );
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
}
```

### 7. Create `src/renderer/components/QueryManager/AddTargetForm.tsx`

```tsx
import { useState } from 'react';
import { useQueryStore } from '../../stores/queryStore';
import type { QueryTargetType, QuerySubmissionMethod } from '@domain/types';

export function AddTargetForm({
  bookSlug,
  onDone,
}: {
  bookSlug: string;
  onDone: () => void;
}): React.ReactElement {
  const { addTarget } = useQueryStore();
  const [name, setName] = useState('');
  const [type, setType] = useState<QueryTargetType>('agent');
  const [contact, setContact] = useState('');
  const [method, setMethod] = useState<QuerySubmissionMethod>('email');
  const [link, setLink] = useState('');
  const [personalization, setPersonalization] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!name.trim()) return;
    await addTarget(bookSlug, {
      name: name.trim(),
      type,
      contact: contact.trim(),
      method,
      status: 'drafting',
      link: link.trim(),
      personalizationNotes: personalization.trim(),
      notes: notes.trim(),
    });
    onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="mb-4 rounded-[13px] border border-ne-brass/30 bg-ne-bg1 p-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-ne-ink-faint">Name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Agent / Publisher name"
            className="mt-1 w-full rounded-md border border-ne-line bg-ne-bg0 px-3 py-2 text-sm text-ne-ink focus:outline-none focus:border-ne-brass"
            required
          />
        </div>
        <div>
          <label className="text-xs text-ne-ink-faint">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as QueryTargetType)}
            className="mt-1 w-full rounded-md border border-ne-line bg-ne-bg0 px-3 py-2 text-sm text-ne-ink focus:outline-none focus:border-ne-brass"
          >
            <option value="agent">Agent</option>
            <option value="publisher">Publisher</option>
            <option value="platform">Platform</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-ne-ink-faint">Contact</label>
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="email or URL"
            className="mt-1 w-full rounded-md border border-ne-line bg-ne-bg0 px-3 py-2 text-sm text-ne-ink focus:outline-none focus:border-ne-brass"
          />
        </div>
        <div>
          <label className="text-xs text-ne-ink-faint">Method</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as QuerySubmissionMethod)}
            className="mt-1 w-full rounded-md border border-ne-line bg-ne-bg0 px-3 py-2 text-sm text-ne-ink focus:outline-none focus:border-ne-brass"
          >
            <option value="email">Email</option>
            <option value="form">Form</option>
            <option value="query-manager">Query Manager</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="text-xs text-ne-ink-faint">Link (agent profile / publisher page)</label>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://..."
            className="mt-1 w-full rounded-md border border-ne-line bg-ne-bg0 px-3 py-2 text-sm text-ne-ink focus:outline-none focus:border-ne-brass"
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-ne-ink-faint">Personalization Notes</label>
          <textarea
            value={personalization}
            onChange={(e) => setPersonalization(e.target.value)}
            placeholder="What to emphasize for this target (MSWL, comp alignment, specific interests)"
            rows={2}
            className="mt-1 w-full rounded-md border border-ne-line bg-ne-bg0 px-3 py-2 text-sm text-ne-ink focus:outline-none focus:border-ne-brass"
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-ne-ink-faint">Notes</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Exclusivity, special instructions, etc."
            className="mt-1 w-full rounded-md border border-ne-line bg-ne-bg0 px-3 py-2 text-sm text-ne-ink focus:outline-none focus:border-ne-brass"
          />
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="submit" className="rounded-lg bg-ne-brass px-4 py-2 text-sm font-medium text-ne-bg0 transition-colors hover:bg-ne-brass-hi">
          Add Target
        </button>
        <button type="button" onClick={onDone} className="rounded-lg border border-ne-line px-4 py-2 text-sm text-ne-ink-dim transition-colors hover:bg-ne-bg2">
          Cancel
        </button>
      </div>
    </form>
  );
}
```

### 8. Create `src/renderer/components/QueryManager/LetterPreview.tsx`

```tsx
import { useEffect, useState } from 'react';
import { useQueryStore } from '../../stores/queryStore';

export function LetterPreview({
  bookSlug,
  targetSlug,
  onClose,
}: {
  bookSlug: string;
  targetSlug: string;
  onClose: () => void;
}): React.ReactElement {
  const { readLetter, saveLetter } = useQueryStore();
  const [content, setContent] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    readLetter(bookSlug, targetSlug)
      .then((text) => { setContent(text); setLoading(false); })
      .catch(() => setLoading(false));
  }, [bookSlug, targetSlug, readLetter]);

  const handleSave = async (): Promise<void> => {
    await saveLetter(bookSlug, targetSlug, content);
    setEditing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-[13px] border border-ne-line bg-ne-bg1"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ne-line px-5 py-3">
          <h2 className="font-ne-serif text-base text-ne-ink">Query Letter — {targetSlug}</h2>
          <div className="flex gap-2">
            {editing ? (
              <>
                <button onClick={handleSave} className="rounded-lg bg-ne-brass px-3 py-1.5 text-xs font-medium text-ne-bg0">
                  Save
                </button>
                <button onClick={() => setEditing(false)} className="rounded-lg border border-ne-line px-3 py-1.5 text-xs text-ne-ink-dim">
                  Cancel
                </button>
              </>
            ) : (
              <button onClick={() => setEditing(true)} className="rounded-lg border border-ne-line px-3 py-1.5 text-xs text-ne-ink-dim hover:bg-ne-bg2">
                Edit
              </button>
            )}
            <button onClick={onClose} className="rounded-lg border border-ne-line px-3 py-1.5 text-xs text-ne-ink-dim hover:bg-ne-bg2">
              Close
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <p className="text-sm text-ne-ink-faint">Loading…</p>
          ) : editing ? (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="h-full min-h-[300px] w-full resize-none rounded-md border border-ne-line bg-ne-bg0 px-4 py-3 font-mono text-sm text-ne-ink focus:outline-none focus:border-ne-brass"
            />
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-ne-ink-dim">
              {content}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

### 9. Update `src/renderer/components/Layout/AppLayout.tsx`

In the `ViewContent` function (lines 120-148), add the QueryManagerView import at the top:

```typescript
import { QueryManagerView } from '../QueryManager/QueryManagerView';
```

Add a new div in `ViewContent`:

```tsx
      <div className={`h-full ${currentView === 'query-manager' ? '' : 'hidden'}`}>
        <QueryManagerView />
      </div>
```

## Verification

1. Run `npx tsc --noEmit` — must pass with zero errors
2. Verify all four QueryManager components compile
3. Verify `'query-manager'` is in the `ViewId` union in viewStore.ts
4. Verify `'mail'` is in the `IconName` union and `ICON_PATHS` in Icon.tsx
5. Verify IconRail has the query-manager item
6. Verify `AppLayout.tsx` renders `QueryManagerView` in ViewContent
7. Desk check: the view should load the tracker when a book is active, show targets, and allow adding/updating/removing targets

## State Update

Update `prompts/session-program/program-019/STATE.md`:
- Set SESSION-06 status to `done`
- Add completion date
- Add handoff notes: All UI components created. PipelineSpine integration and docs needed in SESSION-07.