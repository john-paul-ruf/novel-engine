# Feature Request — Version History Everywhere (+ Retheme)

**Source:** User conversation, 2026-07-08, with screenshot of the Manuscript editor's
Version History panel.

## The Ask

1. **"Fix the color scheme."** The version-history surfaces (editor toolbar, Version
   History panel, diff viewer) still use the legacy zinc/blue Tailwind palette from the
   pre-`streamlined-ui` era. The screenshot shows a dark zinc panel with blue accents
   clashing against the app's parchment/brass `ne-*` design-token theme.

2. **"Needs to be available for any generated document — story outline, bible, etc."**
   Version history + revert is currently only reachable by entering the Manuscript
   *editor* mode (FileEditor → History button). Read-only surfaces have no access:
   - Workbench companion **Sources** tab (pitch, scene outline, story bible, voice profile)
   - Workbench companion **Explorer** tab file preview (any book file)
   - Workbench companion **Chapter** tab (chapter drafts)
   - Workbench companion **Reports** tab (agent reports)
   - Manuscript **Reader** mode

## Background (verified during analysis)

- The backend is fully intact: `VersionService` (snapshot/getHistory/getDiff/
  revertToVersion/prune), auto-snapshot on every file write in `src/main/ipc/handlers.ts`,
  and IPC channels `versions:*` exposed through the preload bridge.
- `VersionHistoryPanel` + `DiffViewer` + `versionStore` are fully functional but only
  mounted inside `FileEditor`.
- The old dedicated Files view (which exposed history directly) was removed in
  `streamlined-ui` SESSION-14 ("Legacy removal"); its Explorer replacement previews
  files read-only with no history affordance.
- `useBookFile` (in `ProseViewer.tsx`) already re-reads on `fileChangeStore` revision
  bumps, so a revert (which writes the file → BookWatcher fires) auto-refreshes every
  read-only viewer.
