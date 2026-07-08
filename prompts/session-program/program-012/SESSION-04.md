# SESSION-04 — History in Manuscript Reader Mode + Final Audit

> **Program:** Novel Engine · **Feature:** version-history-everywhere
> **Modules:** M10 (renderer) · **Depends on:** SESSION-02 (SESSION-03 for audit parity) · **Estimated effort:** 25 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M10 | renderer | `src/renderer/components/Manuscript/ManuscriptView.tsx` | Host — reader/editor mode header (~lines 340–420); `draftPath`, `scope`, `mode` state |
| M10 | renderer | `src/renderer/components/common/VersionHistoryModal.tsx` | Component being wired |
| M10 | renderer | `src/renderer/components/Manuscript/ChapterRail.tsx` | EDITED-badge refresh mechanism (program-011) — verify revert interplay |

## Context

Final surface: the Manuscript view's **Reader** mode. Readers reviewing a chapter should
inspect history and revert without switching to Editor. Editor mode already has the
in-editor History split pane (`FileEditor`) — leave it as is.

**Tracked-edit interplay (program-011):** reverting a chapter draft writes the file with
version source `'revert'`. `getUserEditsSinceAgentBaseline` treats the latest **agent**
snapshot as baseline, so a revert will surface in "my changes"/EDITED badges as a user
change relative to the agent baseline. That is acceptable, truthful behavior — but must
be verified, not assumed (manual check below).

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/renderer/components/Manuscript/ManuscriptView.tsx` | Modify | History button in reader header (chapter scope); modal state + render |

## Implementation

### 1. Add modal state + header button in `ManuscriptView`

Read the header region first (`mode === 'reader'` toolbar, ~line 340+). Add:

```tsx
const [showHistoryModal, setShowHistoryModal] = useState(false);
```

- Render a **History** button in the reader toolbar **only when**
  `mode === 'reader' && scope === 'chapter' && draftPath` (full-book scope is an
  assembled artifact with no single file — no button there).
- Style: match the existing toolbar affordances in that header (Segmented controls /
  chip buttons) — `border border-ne-line bg-ne-bg2 text-ne-ink-dim hover:border-ne-brass/50 hover:text-ne-ink`,
  with the `clock` icon from SESSION-03.
- Reset `showHistoryModal` on chapter change and on `activeSlug` change (add to the
  existing effects that already reset reader state).

### 2. Render the modal

```tsx
{showHistoryModal && activeSlug && draftPath && (
  <VersionHistoryModal
    bookSlug={activeSlug}
    filePath={draftPath}
    onClose={() => setShowHistoryModal(false)}
  />
)}
```

Reader content flows through `useBookFile` → auto-refreshes after revert; no
`onReverted` needed. Confirm the reader's chapter content variable actually comes from
`useBookFile` (ManuscriptView.tsx ~line 165) before relying on this.

### 3. Final feature audit

- `grep -rn "zinc\|dark:" src/renderer/components/Files/ src/renderer/components/common/VersionHistoryModal.tsx` — zero matches (Files components in scope: `DiffViewer`, `VersionHistoryPanel`, `FileEditor`; `FileBrowser`/`FindReplaceModal`/`AboutJsonViewer`/`DeleteConfirmModal` are out of scope — if they still carry zinc, note it in Handoff Notes as follow-up, do not fix here).
- Confirm every host from SESSION-03 + this session compiles and opens the modal.

## Verification

1. `npx tsc --noEmit` — clean.
2. `npm start` manual pass:
   - Manuscript → Reader (chapter scope) → History → select version → diff renders → revert → reader refreshes with the reverted text.
   - Full-book reader scope: no History button.
   - **Tracked-edit interplay:** revert a Verity draft from Reader, then check the chapter rail EDITED badge and "View my changes" — confirm the revert appears as a user-attributed change and nothing crashes.
   - Editor mode's split-pane History still works (regression check).
3. Architecture compliance: renderer-only, no new IPC channels.

## State Update

Update `prompts/session-program/program-012/STATE.md`: SESSION-04 → done, date, notes
(tracked-edit interplay observations), Handoff Notes (any out-of-scope zinc files found).
Then write the Final Report per MASTER.md.
