# SESSION-04 — Chapter Rail EDITED Badges + Discard-My-Edits Flow

> **Program:** Novel Engine · **Feature:** tracked-chapter-editing
> **Modules:** M10 (renderer)
> **Depends on:** SESSION-02, SESSION-03 · **Estimated effort:** 30 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M10 | renderer | `src/renderer/components/Manuscript/ChapterRail.tsx` (full, 433 lines) | `useChapterList`, `ChapterRow` badges, context menu |
| M10 | renderer | `src/renderer/stores/fileChangeStore.ts` | `revision` counter that drives list refresh |
| M10 | renderer | `src/renderer/components/Manuscript/UserEditsDiffModal.tsx` (from SESSION-03) | Modal to extend with a footer action |

## Context

Users need to see *which* chapters carry pending hand edits and be able to discard them back
to Verity's baseline. The rail already refreshes on every file change
(`useFileChangeStore` → `revision` dependency in `useChapterList`, line 63/129).

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/components/Manuscript/ChapterRail.tsx` | modify | Fetch edit statuses; EDITED badge on rows |
| `src/renderer/components/Manuscript/UserEditsDiffModal.tsx` | modify | "Discard my edits" footer button with confirm |

## Implementation

### 1. Edit statuses in `useChapterList` (`ChapterRail.tsx`)

Extend `ChapterInfo` (line 10) with `hasUserEdits: boolean`.

Inside the existing fetch effect (after `wordCounts`, line ~90), load statuses once per refresh:

```typescript
let editStatuses: ChapterEditStatus[] = [];
try {
  editStatuses = await window.novelEngine.versions.getChapterEditStatuses(activeSlug);
} catch { /* badge is best-effort — ignore */ }
const editedSet = new Set(editStatuses.filter((s) => s.hasUserEdits).map((s) => s.chapterSlug));
```

Set `hasUserEdits: editedSet.has(dir.name)` when building each `ChapterInfo` (line ~105).
Import `ChapterEditStatus` as a type from `@domain/types`.

### 2. EDITED badge in `ChapterRow`

In the badge cluster (lines 194–206), when `chapter.hasDraft && chapter.hasUserEdits`, render
an `EDITED` chip **instead of** `DRAFT` (single badge keeps the row clean — mirror the chip
markup, brass accent):

```tsx
<span className="shrink-0 rounded border border-ne-brass/40 bg-ne-brass/15 px-1.5 py-0.5 text-[9px] font-bold tracking-[0.06em] text-ne-brass">
  EDITED
</span>
```

### 3. Discard flow (`UserEditsDiffModal.tsx`)

When a diff is shown, add a footer bar:

- **"Discard my edits"** button (danger styling, e.g. `text-ne-sable`), plus a two-step
  confirm (button flips to "Really discard? This restores Verity's last draft." with
  Confirm/Cancel — follow the inline-confirm pattern used elsewhere, or a plain
  `useState<boolean>` toggle).
- On confirm:

```typescript
const diffResult = diff; // FileDiff from getUserEdits — oldVersion is the agent baseline
if (diffResult?.oldVersion) {
  await window.novelEngine.versions.revert(bookSlug, filePath, diffResult.oldVersion.id);
  onClose();
}
```

`versions:revert` (existing handler) writes the baseline content to disk, records a
`'revert'` snapshot, and broadcasts `chat:filesChanged` — the rail badge and any open
editor refresh through existing plumbing. After revert, `ManuscriptView`'s editor still
holds stale text for the open file: call an `onReverted?: () => void` prop from the modal;
in `ManuscriptView`, handle it by forcing an editor reload (e.g. bump a `reloadKey` appended
to the `FileEditor` `key`, re-running the content-load effect via a state dependency).

### 4. Guard rails

- Never enable Discard when `diff === null` or `diff.oldVersion === null`.
- Disable the button while the revert promise is pending (`discarding` state).
- try/catch around revert → show inline error text in the footer.

## Verification

1. `npx tsc --noEmit` — clean.
2. `npm start`:
   - Hand-edit a Verity chapter → rail chip flips DRAFT → EDITED (after save).
   - "View my changes" → "Discard my edits" → confirm → editor + reader show Verity's
     baseline text, chip returns to DRAFT.
   - Version history for the file shows a `revert` entry.
3. Architecture compliance: renderer-only changes, bridge-only backend access.

## State Update

Mark SESSION-04 done in STATE.md. Handoff: note the `onReverted` prop and any styling
deviations for SESSION-06 (same modal/banner surfaces).
