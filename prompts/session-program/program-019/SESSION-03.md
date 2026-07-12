# SESSION-03 — IPC Handlers + Preload Bridge for Query Namespace

> **Program:** Novel Engine
> **Feature:** query-manager
> **Modules:** M09 (main/ipc/preload), M01 (domain types)
> **Depends on:** SESSION-02
> **Estimated effort:** 25 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M09 | main/ipc | `src/main/ipc/handlers.ts` (service injection, pattern for handlers), `src/preload/index.ts` (bridge pattern) | IPC handler registration and preload bridge shape |
| M01 | domain | `src/domain/interfaces.ts` (IQueryService), `src/domain/types.ts` (query types as needed for imports) | Interface and types for the bridge |

## Context

With `QueryService` implemented (SESSION-02), we need to wire it into the IPC layer so the renderer can call it. This session adds:
- `IQueryService` to the handler services object
- New IPC handlers under the `query:*` namespace in `handlers.ts`
- New `query` namespace on the preload bridge in `preload/index.ts`

No business logic goes in the handlers — they just delegate to `services.query.*`.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/main/ipc/handlers.ts` | Modify | Add `IQueryService` import, add `query` to services param, add IPC handlers |
| `src/preload/index.ts` | Modify | Add `query` namespace with bridge methods, import query types |

## Implementation

### 1. Read files before modifying

Read `src/main/ipc/handlers.ts` — focus on:
- The import block (lines 1-56) to see how interfaces are imported
- The `registerIpcHandlers` function signature (line 58-86) for the services object
- The Pipeline handlers section (lines 514-538) to follow the same pattern

Read `src/preload/index.ts` — focus on:
- The import block (lines 1-56) for type imports
- The pipeline namespace (lines 220-243) for the bridge pattern

### 2. Update `src/main/ipc/handlers.ts`

**2a. Add `IQueryService` to the imports.** In the existing import block at top:

```typescript
import type {
  // ... existing imports ...
  IQueryService,
  // ...
} from '@domain/interfaces';
```

**2b. Add query types to the type imports** if not already present. These go in the `@domain/types` import block:

```typescript
import type {
  // ... existing imports ...
  QueryTarget,
  QueryStatus,
  QueryLetter,
  QueryTracker,
  // ...
} from '@domain/types';
```

**2c. Add `query` to the services parameter.** In the `registerIpcHandlers` function arguments (line ~58-80), add:

```typescript
  query: IQueryService;
```

Add it after the existing service entries (e.g. after `statistics: IStatisticsService;`).

**2d. Add IPC handlers.** After the existing Pipeline handlers section (after line 538), add:

```typescript
  // === Query Manager ===

  ipcMain.handle('query:loadTracker', (_, bookSlug: string) =>
    services.query.loadTracker(bookSlug),
  );

  ipcMain.handle('query:saveTracker', (_, bookSlug: string, tracker: QueryTracker) =>
    services.query.saveTracker(bookSlug, tracker),
  );

  ipcMain.handle('query:addTarget', async (_, bookSlug: string, target: Omit<QueryTarget, 'id' | 'queryLetterPath' | 'submittedDate' | 'responseDate'>) =>
    services.query.addTarget(bookSlug, target),
  );

  ipcMain.handle('query:updateTargetStatus', (_, bookSlug: string, targetId: string, status: QueryStatus, responseDate?: string) =>
    services.query.updateTargetStatus(bookSlug, targetId, status, responseDate),
  );

  ipcMain.handle('query:removeTarget', (_, bookSlug: string, targetId: string) =>
    services.query.removeTarget(bookSlug, targetId),
  );

  // Letter generation streams through the existing chat stream infrastructure.
  // The handler forwards events to the renderer via push events.
  ipcMain.handle('query:generateLetter', async (event, bookSlug: string, targetId: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await services.query.generateQueryLetter(bookSlug, targetId, (streamEvent) => {
      win?.webContents.send('query:onStream', streamEvent);
    });

    // Snapshot any changed files
    if (result && result.filePath) {
      snapshotChangedFiles(bookSlug, [result.filePath], 'agent');
    }
    return result;
  });

  ipcMain.handle('query:listLetters', (_, bookSlug: string) =>
    services.query.listQueryLetters(bookSlug),
  );

  ipcMain.handle('query:readLetter', (_, bookSlug: string, targetSlug: string) =>
    services.query.readQueryLetter(bookSlug, targetSlug),
  );

  ipcMain.handle('query:saveLetter', (_, bookSlug: string, targetSlug: string, content: string) =>
    services.query.saveQueryLetter(bookSlug, targetSlug, content),
  );
```

Note: `snapshotChangedFiles` is already defined as a local function in `handlers.ts` (line ~93). It's used after chat:send and other agent operations. We reuse it here.

### 3. Update `src/preload/index.ts`

**3a. Add query type imports.** In the import block at top (lines 1-56), add:

```typescript
import type {
  // ... existing imports ...
  QueryTarget,
  QueryStatus,
  QueryLetter,
  QueryTracker,
} from '@domain/types';
```

**3b. Add the `query` namespace.** Find a good place — after the Pipeline namespace (around line 243) or after another namespace. Add:

```typescript
  // Query Manager
  query: {
    loadTracker: (bookSlug: string): Promise<QueryTracker> =>
      ipcRenderer.invoke('query:loadTracker', bookSlug),
    saveTracker: (bookSlug: string, tracker: QueryTracker): Promise<void> =>
      ipcRenderer.invoke('query:saveTracker', bookSlug, tracker),
    addTarget: (bookSlug: string, target: Omit<QueryTarget, 'id' | 'queryLetterPath' | 'submittedDate' | 'responseDate'>): Promise<QueryTarget> =>
      ipcRenderer.invoke('query:addTarget', bookSlug, target),
    updateTargetStatus: (bookSlug: string, targetId: string, status: QueryStatus, responseDate?: string): Promise<void> =>
      ipcRenderer.invoke('query:updateTargetStatus', bookSlug, targetId, status, responseDate),
    removeTarget: (bookSlug: string, targetId: string): Promise<void> =>
      ipcRenderer.invoke('query:removeTarget', bookSlug, targetId),
    generateLetter: (bookSlug: string, targetId: string): Promise<QueryLetter> =>
      ipcRenderer.invoke('query:generateLetter', bookSlug, targetId),
    listLetters: (bookSlug: string): Promise<QueryLetter[]> =>
      ipcRenderer.invoke('query:listLetters', bookSlug),
    readLetter: (bookSlug: string, targetSlug: string): Promise<string> =>
      ipcRenderer.invoke('query:readLetter', bookSlug, targetSlug),
    saveLetter: (bookSlug: string, targetSlug: string, content: string): Promise<void> =>
      ipcRenderer.invoke('query:saveLetter', bookSlug, targetSlug, content),
    onStream: (callback: (event: StreamEvent) => void) => {
      const handler = (_: Electron.IpcRendererEvent, event: StreamEvent) => callback(event);
      ipcRenderer.on('query:onStream', handler);
      return () => ipcRenderer.removeListener('query:onStream', handler);
    },
  },
```

## Verification

1. Run `npx tsc --noEmit` — must pass with zero errors
2. Verify `query:*` handlers are registered (grep `'query:'` in handlers.ts — should see 8 results)
3. Verify `query` namespace exists in preload bridge (grep `query:` in preload — should see 8 invoke + 1 onStream)
4. Verify `StreamEvent` is already imported in `preload/index.ts` (it is — line 33)
5. The handle shape `window.novelEngine.query` should have all 9 methods (8 ipcRenderer.invoke + 1 onStream listener)
6. Note: the handlers won't be callable yet until SESSION-04 wires QueryService into the composition root

## State Update

Update `prompts/session-program/program-019/STATE.md`:
- Set SESSION-03 status to `done`
- Add completion date
- Add handoff notes: IPC + preload bridge ready. Composition root wiring needed in SESSION-04.