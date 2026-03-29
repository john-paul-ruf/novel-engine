# SESSION-06 — Archive Series

> **Feature:** small-queue-intake
> **Layer(s):** M10 (renderer only)
> **Depends on:** Nothing
> **Estimated effort:** 15 min

---

## Context

There is no way to archive a series. "Archive a series" means: archive all books in the series at once via a single UI action. The existing `archiveBook` IPC method handles individual books. No new service methods or domain changes are needed — this is a UI convenience action in the Series management modal.

---

## Files to Read First

- `src/renderer/components/Series/SeriesModal.tsx` — full file
- `src/renderer/stores/seriesStore.ts` — series state and actions
- `src/renderer/stores/bookStore.ts` — archiveBook action

---

## Implementation

In `SeriesModal.tsx`, when a series is being viewed or edited (whichever mode shows series details and its volume list), add an "Archive Series" button.

**Placement:** In the series edit/detail view, add the button near the bottom, visually separated from save/cancel actions. Style it as a destructive-secondary action (zinc-colored, not red — archiving is reversible).

**Behavior:**
1. Show a confirmation step first: "Archive all [N] books in this series? Books can be restored from the archive." with Confirm/Cancel.
2. On confirm: call `archiveBook(bookSlug)` for each volume in the series (use `bookStore.archiveBook`).
3. After all archives complete: close the series modal and refresh the book list.

**Implementation pattern:**
```tsx
const [confirmingArchiveSeries, setConfirmingArchiveSeries] = useState(false);

const handleArchiveSeries = async () => {
  if (!selectedSeries) return;
  for (const vol of selectedSeries.volumes) {
    await bookStore.archiveBook(vol.bookSlug);
  }
  await bookStore.loadArchivedBooks();
  await bookStore.loadBooks();
  seriesStore.closeModal();
};
```

Use the existing `archiveBook` from `useBookStore`. After archiving all books, the series group disappears from the dropdown automatically (SESSION-03 ensures series groups with no active books are hidden).

---

## Architecture Compliance

- [x] Renderer only — uses existing `window.novelEngine.books.archive` via the bookStore
- [x] No new IPC channels, domain types, or services
- [x] Confirmation step prevents accidental archive

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Series modal shows "Archive Series" button when viewing a series with at least one book
3. Clicking it shows confirmation with book count
4. Confirming archives all books and closes the modal
5. The series group disappears from the book dropdown

---

## State Update

Set SESSION-06 to `done` in STATE.md.
