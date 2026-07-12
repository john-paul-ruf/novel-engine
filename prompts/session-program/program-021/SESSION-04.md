# SESSION-04 — IPC Handlers + Preload Bridge for Research & Field Fill

> **Program:** Novel Engine
> **Feature:** query-auto-populate
> **Modules:** M-IPC (handlers), M-PRELOAD (preload)
> **Depends on:** SESSION-03 (QueryService methods)
> **Estimated effort:** 15–20 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M-IPC | `src/main/ipc/handlers.ts` | Lines 1147–1191 (Query Manager section) | Add two new handlers after existing query handlers |
| M-PRELOAD | `src/preload/index.ts` | Lines 504–528 (query namespace) | Add two new bridge methods |
| M-APP | `src/application/QueryService.ts` | New methods from SESSION-03 | Reference for handler delegation |

## Context

The existing `query:generateLetter` handler (line 1169) shows the pattern for streaming: it gets the `BrowserWindow` from the event sender, calls the service method with an `onEvent` callback that sends `query:onStream` to the renderer, then snapshots changed files. We replicate this for `query:researchTargets` and `query:fillTargetField`.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/main/ipc/handlers.ts` | Modify | Add `query:researchTargets` and `query:fillTargetField` handlers |
| `src/preload/index.ts` | Modify | Add `researchTargets` and `fillTargetField` to query namespace |

## Implementation

### 1. Add IPC Handlers

Read `src/main/ipc/handlers.ts` around line 1190 (after the `query:saveLetter` handler, before the closing `}` of the function). Add:

```typescript
ipcMain.handle('query:researchTargets', async (event, bookSlug: string) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await services.query.researchTargets(bookSlug, (streamEvent) => {
    win?.webContents.send('query:onStream', streamEvent);
  });
  return result;
});

ipcMain.handle('query:fillTargetField', async (event, bookSlug: string, targetId: string, field: QueryFillableField) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await services.query.fillTargetField(bookSlug, targetId, field, (streamEvent) => {
    win?.webContents.send('query:onStream', streamEvent);
  });
  return result;
});
```

Add `QueryFillableField` to the import from `@domain/types` at the top of `handlers.ts` (check existing imports — `QueryStatus`, `QueryTarget`, `QueryTracker` are already imported; add `QueryFillableField` alongside them).

### 2. Add Preload Bridge Methods

Read `src/preload/index.ts` around line 528 (the `onStream` method, last in the `query` namespace). Add before the closing `}` of the `query` object:

```typescript
researchTargets: (bookSlug: string): Promise<QueryResearchResult> =>
  ipcRenderer.invoke('query:researchTargets', bookSlug),
fillTargetField: (bookSlug: string, targetId: string, field: QueryFillableField): Promise<QueryFieldFillResult> =>
  ipcRenderer.invoke('query:fillTargetField', bookSlug, targetId, field),
```

Add `QueryResearchResult`, `QueryFieldFillResult`, and `QueryFillableField` to the import from `@domain/types` at the top of `src/preload/index.ts` (after the existing `QueryLetter` import).

## Verification

1. `npx tsc --noEmit` — type check passes
2. Grep for `query:researchTargets` in `src/main/ipc/handlers.ts` — handler exists
3. Grep for `query:fillTargetField` in `src/main/ipc/handlers.ts` — handler exists
4. Grep for `researchTargets` in `src/preload/index.ts` — bridge method exists
5. Grep for `fillTargetField` in `src/preload/index.ts` — bridge method exists

## State Update

Update `prompts/session-program/program-021/STATE.md`:
- Set SESSION-04 status to `done`
- Add completion date
- Handoff: IPC channels and preload bridge wired. SESSION-05 can implement store actions.