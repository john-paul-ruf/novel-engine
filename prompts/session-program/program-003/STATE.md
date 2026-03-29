# State Tracker — Novel Engine / Sidebar Bookshelf + FilesView Tabs

> Generated 2026-03-29.
> Updated by the executing agent after each session.

---

## Program

**Name:** Novel Engine
**Root:** /Users/the.phoenix/WebstormProjects/novel-engine/
**Stack:** Electron 33+ / React 18 / TypeScript 5 / Tailwind v4 / Zustand

## Feature

**Name:** sidebar-bookshelf-files-tabs
**Intent:** Move the sidebar file tree into the FilesView as category tabs, and replace the sidebar's BookSelector dropdown + FileTree with a permanently visible, scrollable Book Panel (bookshelf).
**Source documents:** `input-files/p0.md`, `input-files/menu-ref.png`
**Sessions:** 2

---

## Status Key

- `pending` — Not started
- `in-progress` — Started, not verified
- `done` — Completed and verified
- `blocked` — Cannot proceed (see notes)
- `skipped` — Intentionally skipped (see notes)

---

## Session Status

| # | Session | Status | Completed | Notes |
|---|---------|--------|-----------|-------|
| 1 | SESSION-01 — FilesView tab restructure | done | 2026-03-29 | FileBrowser already handles empty currentPath; no changes needed there. |
| 2 | SESSION-02 — Sidebar Book Panel | done | 2026-03-29 | Tour definitions updated to target sidebar-nav instead of deleted file-tree element. |

---

## Dependency Graph

```
SESSION-01  (FilesView tabs — independent)
SESSION-02  (Sidebar Book Panel — depends on SESSION-01 removing FileTree from sidebar)
```

SESSION-01 must run first because it restructures FilesView to absorb the file tree functionality. SESSION-02 then removes the FileTree from the sidebar and replaces BookSelector with the new BookPanel.

---

## Architecture Reference

This feature touches only the Renderer layer (M06). No domain, infrastructure, application, or IPC changes are needed. All components already exist — this is a UI restructuring.

---

## Scope Summary

| Layer | Impact | Sessions |
|-------|--------|----------|
| Renderer — `components/Files/` | Replace 2-tab structure with 5 tabs (Source, Chapters, Agents, Explorer, Motif Ledger). Remove StructuredBrowser. | SESSION-01 |
| Renderer — `components/Sidebar/` | Create BookPanel.tsx. Remove FileTree from Sidebar. Replace BookSelector with BookPanel. | SESSION-02 |
| Renderer — `components/Layout/` | Update Sidebar.tsx layout to use BookPanel instead of BookSelector + FileTree | SESSION-02 |

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| 5 tabs: Source, Chapters, Agents, Explorer, Motif Ledger | Maps to the user's request for "agent tab, chapters tab, source tab, file explorer tab" plus keeping the existing Motif Ledger tab |
| Explorer tab shows FileBrowser at root (not StructuredBrowser) | StructuredBrowser is decomposed into the other tabs — Explorer shows the raw directory tree |
| BookPanel is always visible, not a dropdown | User said "book panel that docks and is scrollable — like a bookshelf" — persistent, not click-to-open |
| Import icon triggers a choice modal | User specified "pops a modal that lets you pick between a single book or a wizard" |
| Keep PitchHistory in sidebar for pitch-room view | PitchHistory is pitch-room-specific context, not related to the file tree move |
| Reader/editor mode overlays tab content | When a file is selected, the file viewer replaces tab content but tabs remain navigable |

---

## Handoff Notes

> Agents write here after each session to communicate context to the next run.

### Last completed session: SESSION-02

### Observations:
- SESSION-01: FilesView now has 5 tabs: Source, Chapters, Agents, Explorer, Motif Ledger. StructuredBrowser.tsx and CollapsibleSection.tsx deleted.
- SESSION-02: BookPanel.tsx created with icon toolbar + scrollable bookshelf. ImportChoiceModal.tsx created. BookSelector.tsx and FileTree.tsx deleted. Sidebar.tsx updated. Tour definitions updated to target sidebar-nav for the file-tree step.
- Both sessions verified with `npx tsc --noEmit` — zero errors, zero dangling imports.

### Warnings:
