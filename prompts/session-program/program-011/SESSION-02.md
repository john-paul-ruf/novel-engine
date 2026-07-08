# SESSION-02 — IPC Handlers + Preload Bridge for Edit-Status Queries

> **Program:** Novel Engine · **Feature:** tracked-chapter-editing
> **Modules:** M09 (main/ipc)
> **Depends on:** SESSION-01 · **Estimated effort:** 15 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M09 | main/ipc | `src/main/ipc/handlers.ts` (lines 360–396, the `=== Versions ===` block) | Pattern for version handlers |
| M09 | main/ipc | `src/preload/index.ts` (lines 156–172, the `versions:` block) | Pattern for bridge exposure |

## Context

SESSION-01 added `getUserEditsSinceAgentBaseline` and `getChapterEditStatuses` to
`IVersionService`. The renderer (SESSIONs 03/04/06) needs them via `window.novelEngine.versions`.
IPC handlers stay thin — zero business logic, direct delegation.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/main/ipc/handlers.ts` | modify | 2 new `versions:*` handlers |
| `src/preload/index.ts` | modify | 2 new methods on the `versions` API object |

## Implementation

### 1. IPC handlers (`src/main/ipc/handlers.ts`)

Append to the `=== Versions ===` block (after `versions:snapshot`, line ~395), following the
existing `'namespace:action'` convention:

```typescript
ipcMain.handle('versions:getUserEdits', (_, bookSlug: string, filePath: string) =>
  services.version.getUserEditsSinceAgentBaseline(bookSlug, filePath),
);

ipcMain.handle('versions:getChapterEditStatuses', (_, bookSlug: string) =>
  services.version.getChapterEditStatuses(bookSlug),
);
```

### 2. Preload bridge (`src/preload/index.ts`)

Append inside the `versions: { ... }` object (after `snapshot`, line ~170):

```typescript
getUserEdits: (bookSlug: string, filePath: string): Promise<FileDiff | null> =>
  ipcRenderer.invoke('versions:getUserEdits', bookSlug, filePath),
getChapterEditStatuses: (bookSlug: string): Promise<ChapterEditStatus[]> =>
  ipcRenderer.invoke('versions:getChapterEditStatuses', bookSlug),
```

Add `ChapterEditStatus` to the existing `@domain/types` type-import at the top of the file
(`FileDiff` is already imported — verify).

The `NovelEngineAPI` type is derived from the `api` object (`type NovelEngineAPI = typeof api`,
line ~497) — no separate declaration change needed.

## Verification

1. `npx tsc --noEmit` — clean.
2. Architecture compliance: handlers contain zero business logic (single delegation
   expression); preload uses `import type` from `@domain/*` only.
3. `npm start`, open DevTools console:
   - `await window.novelEngine.versions.getChapterEditStatuses('<active-book-slug>')`
     returns an array (empty edits OK).
   - `await window.novelEngine.versions.getUserEdits('<slug>', 'chapters/02-.../draft.md')`
     returns `null` (untouched) or a `FileDiff`.

## State Update

Mark SESSION-02 done in STATE.md. Handoff: confirm bridge method names
(`versions.getUserEdits`, `versions.getChapterEditStatuses`) for SESSIONs 03/04/06.
