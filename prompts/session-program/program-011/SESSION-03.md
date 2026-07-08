# SESSION-03 — Unlock the Chapter Editor with Tracked-Edit Mode

> **Program:** Novel Engine · **Feature:** tracked-chapter-editing
> **Modules:** M10 (renderer)
> **Depends on:** SESSION-02 · **Estimated effort:** 30 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M10 | renderer | `src/renderer/components/Manuscript/ManuscriptView.tsx` (full, 407 lines) | The read-only gate to replace |
| M10 | renderer | `src/renderer/components/Files/FileEditor.tsx` (props, lines 1–60) | Editor reused as-is |
| M10 | renderer | `src/renderer/components/Files/DiffViewer.tsx` (lines 1–90) | `DiffViewer({ diff })` reused in the changes modal |

## Context

`ManuscriptView.tsx` currently blocks editing of Verity drafts: `isVerityDraft()` (line 14) →
`editorReadOnly` (line 232) → banner + `ReadOnlyDraft` (lines 362–373). Tracking is already
automatic (`files:write` snapshots as `'user'`). This session removes the lock and replaces it
with an informational tracked-edit banner plus a "View my changes" diff modal.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/components/Manuscript/ManuscriptView.tsx` | modify | Remove read-only gating; add tracked banner + modal trigger |
| `src/renderer/components/Manuscript/UserEditsDiffModal.tsx` | create | Modal showing the baseline diff via `DiffViewer` |

## Implementation

### 1. Repurpose the gate (`ManuscriptView.tsx`)

- Keep `isVerityDraft()` but rename the derived flag: `editorReadOnly` → `isTrackedDraft`
  (line 232). It now means "show tracked-edit UI", not "block editing".
- In the editor-content `useEffect` (lines 234–252): remove `editorReadOnly` from the guard
  and from the dependency array so tracked drafts load into the editor like any other file.
- Delete the `ReadOnlyDraft` component (lines 401–407) and its render branch (lines 362–373).

### 2. Tracked-edit banner

In the `mode === 'editor'` branch, render **above** `FileEditor` when `isTrackedDraft`
(reuse the existing banner's classes — `border-ne-spark/30 bg-ne-spark/10` etc.):

```tsx
{isTrackedDraft && editorPath && (
  <div className="flex shrink-0 items-center gap-2 border-b border-ne-spark/30 bg-ne-spark/10 px-6 py-2">
    <p className="min-w-0 flex-1 text-xs text-ne-ink-dim">
      <strong className="text-ne-ink">You're editing Verity's draft.</strong>{' '}
      Every change is tracked and shared with Verity on her next revision.
    </p>
    <button onClick={() => setShowUserEdits(true)} className="...">View my changes</button>
  </div>
)}
```

`FileEditor` renders unchanged below it (existing props: `filePath`, `initialContent`,
`onSave`, `onClose` — the `onSave` already writes via `window.novelEngine.files.write`,
which auto-snapshots as `'user'`).

Add local state: `const [showUserEdits, setShowUserEdits] = useState(false);` — reset it in
the book-switch effect (line ~120).

### 3. Create `UserEditsDiffModal.tsx`

New file in `src/renderer/components/Manuscript/`. Props:

```typescript
type UserEditsDiffModalProps = {
  bookSlug: string;
  filePath: string;      // chapters/NN-slug/draft.md
  chapterTitle: string;
  onClose: () => void;
};
```

Behavior:

1. On mount, call `window.novelEngine.versions.getUserEdits(bookSlug, filePath)`
   (try/catch → error state).
2. Render a centered modal (follow `FindReplaceModal.tsx` for overlay/panel classes):
   - Header: "My changes — {chapterTitle}", close button (`Icon name="x"`).
   - Body: loading → spinner text; `null` result → "No edits since Verity's last draft."
     (also covers the no-baseline case); otherwise `<DiffViewer diff={diff} />` in a
     scrollable container.
3. Escape key + overlay click close (mirror `FindReplaceModal` behavior).

Render it from `ManuscriptView` next to `FindReplaceModal` (line ~396), guarded on
`showUserEdits && isTrackedDraft && editorPath`.

### 4. Editor autoload note

`FileEditor` reloads on `filePath` change via its `key={editorPath}` — unchanged. Verify the
missing-file fallback (`.catch → ''`) still applies only to non-tracked files like `notes.md`;
for a tracked draft the file always exists (it has a DRAFT badge) — no special casing needed.

## Verification

1. `npx tsc --noEmit` — clean.
2. `npm start`:
   - Open a Verity-authored chapter → Editor tab: content is editable, tracked banner shows.
   - Type a change, save (Cmd+S) → "View my changes" shows the diff with correct +/- counts.
   - Front/back-matter files and `notes.md` behave exactly as before (no banner).
   - Reader mode unchanged.
3. Architecture compliance: backend access only via `window.novelEngine`; no domain value
   imports beyond permitted constants.

## State Update

Mark SESSION-03 done in STATE.md. Handoff: note the `isTrackedDraft` flag name and modal file
path — SESSION-04 adds the discard flow, SESSION-06 layers the concurrency guard on the same
banner slot.
