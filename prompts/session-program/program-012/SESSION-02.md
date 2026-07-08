# SESSION-02 — Reusable `VersionHistoryModal`

> **Program:** Novel Engine · **Feature:** version-history-everywhere
> **Modules:** M10 (renderer) · **Depends on:** SESSION-01 · **Estimated effort:** 25 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M10 | renderer | `src/renderer/components/Files/VersionHistoryPanel.tsx` | The component being wrapped — props contract (`bookSlug`, `filePath`, `onClose`, `onReverted?`) |
| M10 | renderer | `src/renderer/components/Manuscript/UserEditsDiffModal.tsx` | The house modal idiom: backdrop, escape handling, shell styling |
| M10 | renderer | `src/renderer/stores/versionStore.ts` | Confirm `loadHistory`/`reset` lifecycle works for a mount/unmount modal (it does — panel already loads on mount, resets on unmount) |

## Context

SESSION-01 rethemed `VersionHistoryPanel`, but it is still only mounted inside
`FileEditor` as a split pane. To surface history from read-only viewers (Sources,
Explorer, Chapter, Reports tabs; Manuscript reader), we need a standalone modal wrapper
any component can open with just a `bookSlug` + `filePath`.

Key facts:

- Revert flows through `versions:revert` IPC → `VersionService.revertToVersion` →
  writes the file → `BookWatcher` fires → `fileChangeStore.revision` bumps →
  `useBookFile` (in `ProseViewer.tsx:66-106`) re-reads automatically. So read-only
  hosts need **no manual refresh**; `onReverted` stays optional for hosts that hold
  editable state (like `FileEditor`).
- `versionStore` is a singleton Zustand store; only one history surface should be
  open at a time (modal is exclusive by nature — fine).

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/renderer/components/common/VersionHistoryModal.tsx` | Create | Modal wrapper around `VersionHistoryPanel` |

## Implementation

### 1. Create `VersionHistoryModal.tsx`

```tsx
import { useEffect } from 'react';
import { VersionHistoryPanel } from '../Files/VersionHistoryPanel';

type VersionHistoryModalProps = {
  bookSlug: string;
  filePath: string;
  onClose: () => void;
  /** Optional: hosts with editable local state reload after a revert. */
  onReverted?: () => void;
};

export function VersionHistoryModal({
  bookSlug,
  filePath,
  onClose,
  onReverted,
}: VersionHistoryModalProps): React.ReactElement {
  // Escape closes (match UserEditsDiffModal's handling)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={onClose}
    >
      <div
        className="flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-ne-line bg-ne-bg1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <VersionHistoryPanel
          bookSlug={bookSlug}
          filePath={filePath}
          onClose={onClose}
          onReverted={onReverted}
        />
      </div>
    </div>
  );
}
```

Adjust the exact backdrop/z-index/shell classes to match `UserEditsDiffModal` (read it
first — reuse its idiom verbatim where possible). If `VersionHistoryPanel`'s root still
carries `border-l` (side-panel styling from its FileEditor life), pass-through styling
must not double up: if needed, add an optional `frameless?: boolean` prop to
`VersionHistoryPanel` that drops the `border-l` when rendered inside the modal — keep
the change minimal and default to current behavior.

### 2. Do not wire any hosts yet

Hosts land in SESSION-03/04. This session only delivers the component (it will be
briefly unreferenced — acceptable as the compile target of a one-program build chain,
and it removes merge friction between the two wiring sessions).

## Verification

1. `npx tsc --noEmit` — clean.
2. `grep -n "zinc\|dark:" src/renderer/components/common/VersionHistoryModal.tsx` — zero matches.
3. Architecture compliance: renderer-only; no direct IPC (all backend access flows through the existing `versionStore`).

## State Update

Update `prompts/session-program/program-012/STATE.md`: SESSION-02 → done, date, notes
(whether `frameless` prop was needed), handoff for SESSION-03 (exact import path + props).
