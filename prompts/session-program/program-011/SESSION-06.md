# SESSION-06 — Write-Race Safety: Agent-Activity Guard + External-Change Reload

> **Program:** Novel Engine · **Feature:** tracked-chapter-editing
> **Modules:** M10 (renderer)
> **Depends on:** SESSION-03 · **Estimated effort:** 30 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M10 | renderer | `src/renderer/stores/cliActivityStore.ts` (full) | `CliCall.isActive` + `callMeta.bookSlug` — the busy signal |
| M10 | renderer | `src/renderer/stores/fileChangeStore.ts` (full) | `revision` counter / changed-path signal for reloads |
| M10 | renderer | `src/renderer/components/Manuscript/ManuscriptView.tsx` (editor branch, lines 230–260 and 360–395 post-SESSION-03) | Where the guard mounts |
| M10 | renderer | `src/renderer/components/Files/FileEditor.tsx` (full, note unmount autosave ~line 94) | Unsaved-changes behavior to respect |

## Context

With editing unlocked, two writers can now touch `draft.md`: the user (editor) and Verity
(CLI agent). Both sides snapshot, so nothing is ever lost — but silent last-write-wins is
confusing. This session adds two renderer-side guards:

1. **Agent-activity guard** — while any CLI call is active for the current book, tracked
   drafts fall back to read-only with a "Verity is working…" banner.
2. **External-change reload** — if the open editor file changes on disk (agent write,
   revert from another surface), prompt the user to reload.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/components/Manuscript/ManuscriptView.tsx` | modify | Guard + reload prompt around the editor branch |
| `src/renderer/components/Files/FileEditor.tsx` | modify | Optional `disabled` prop (textarea readOnly + save disabled) |

## Implementation

### 1. Agent-activity selector (`ManuscriptView.tsx`)

Derive the busy flag from `cliActivityStore` (check its exported hooks/selectors first — use
an existing "active calls" selector if one exists):

```typescript
const agentBusy = useCliActivityStore((s) =>
  Object.values(s.calls).some((c) => c.isActive && c.callMeta.bookSlug === activeSlug),
);
```

(Adapt to the store's actual state shape — `calls` may be a map or array; read the store
before writing.)

### 2. Guard the tracked editor

In the editor branch, when `isTrackedDraft && agentBusy`:

- Swap the SESSION-03 banner text for: **"Verity is working on this book — editing is
  paused."** (keep the same banner styling; add a subtle spinner or pulsing dot).
- Pass `disabled={agentBusy}` to `FileEditor` instead of unmounting it (unmounting triggers
  the autosave-on-unmount write at `FileEditor.tsx:94` and would race the agent).

Only tracked drafts get the guard — `notes.md` and back matter stay editable (Verity doesn't
write those mid-call as a rule; keep scope minimal).

### 3. `FileEditor` `disabled` prop

Extend `FileEditorProps` with `disabled?: boolean` (default `false`):

- `readOnly={disabled}` on the textarea.
- Save button + Cmd+S handler no-op while disabled.
- Skip the unmount autosave when disabled (content can't have changed while disabled, but
  guard anyway: only autosave if `hasUnsavedChanges && !disabled`).

### 4. External-change reload

Track staleness with `fileChangeStore`. On each `revision` bump while
`mode === 'editor' && editorPath`, re-read the file and compare against what the editor
loaded (`editorContent`):

```typescript
const revision = useFileChangeStore((s) => s.revision);
const [externalChange, setExternalChange] = useState(false);
useEffect(() => {
  if (mode !== 'editor' || !editorPath || editorContent === null) return;
  let cancelled = false;
  window.novelEngine.files.read(activeSlug, editorPath)
    .then((disk) => { if (!cancelled && disk !== editorContent) setExternalChange(true); })
    .catch(() => { /* deleted — FileEditor save will recreate; ignore */ });
  return () => { cancelled = true; };
}, [revision]); // deliberately revision-only — see comment in code
```

When `externalChange`, show a slim bar above the editor: *"This file changed outside the
editor."* with **Reload** (re-run the content load: clear `editorContent`, re-trigger the
load effect, clear the flag) and **Keep mine** (clear the flag; user's next save wins and is
snapshotted). Reset `externalChange` on `editorPath`/book change.

Nuance: the user's **own** save also bumps `revision`. Compare against the freshly saved
content — pass an `onSaved?: (content: string) => void` from `FileEditor` (or update
`editorContent` in the `onSave` wrapper in `ManuscriptView`, line ~379) so self-saves don't
trigger the bar.

## Verification

1. `npx tsc --noEmit` — clean.
2. `npm start`:
   - Start a Verity chat revision → open the chapter in Editor: banner flips to
     "Verity is working…", textarea read-only; returns to editable when the call ends.
   - While the editor is open, let Verity rewrite the file → reload bar appears; Reload
     shows the new draft; Keep-mine + save preserves the user's text (and snapshots it).
   - Normal save does NOT show the reload bar.
3. Architecture compliance: renderer-only; bridge-only backend access.

## State Update

Mark SESSION-06 done in STATE.md. Feature complete → write the Final Report per MASTER.md.
