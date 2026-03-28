# SESSION-03 — IPC Wiring, Preload Bridge, and Composition Root

> **Feature:** import-series
> **Layer(s):** IPC / Main
> **Depends on:** SESSION-02
> **Estimated effort:** 20 min

---

## Context

SESSION-01 added domain types and the `ISeriesImportService` interface. SESSION-02 implemented `SeriesImportService` in the application layer. This session wires everything together: composition root instantiation, IPC handlers, and preload bridge methods so the renderer can call the series import service.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/main/index.ts` | Modify | Instantiate `SeriesImportService`, pass to handler registration |
| `src/main/ipc/handlers.ts` | Modify | Add `import:selectFiles`, `import:seriesPreview`, `import:seriesCommit` handlers |
| `src/preload/index.ts` | Modify | Add `seriesImport` namespace with bridge methods |

---

## Implementation

### 1. Update Composition Root (`src/main/index.ts`)

Read `src/main/index.ts`. Find where `ManuscriptImportService` is instantiated. Add `SeriesImportService` nearby:

```typescript
import { SeriesImportService } from '../application/SeriesImportService';

// After existing ManuscriptImportService instantiation:
const seriesImportService = new SeriesImportService(manuscriptImportService, seriesService);
```

Find where the services object is passed to `registerIpcHandlers`. Add `seriesImport: seriesImportService` to the services object:

```typescript
seriesImport: seriesImportService,
```

### 2. Update IPC Handlers (`src/main/ipc/handlers.ts`)

Read `src/main/ipc/handlers.ts`. Add `ISeriesImportService` to the services type and the imports:

```typescript
import type { ISeriesImportService } from '@domain/interfaces';
import type { SeriesImportCommitConfig } from '@domain/types';
```

Add to the services parameter type:

```typescript
seriesImport: ISeriesImportService;
```

Add three new handlers after the existing `import:*` handlers:

```typescript
// ── Series Import ──────────────────────────────────────────────────

ipcMain.handle('import:selectFiles', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) throw new Error('No window found');

  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Import Series — Select Manuscripts',
    filters: [
      { name: 'Manuscripts', extensions: ['md', 'markdown', 'docx'] },
      { name: 'Markdown', extensions: ['md', 'markdown'] },
      { name: 'Word Document', extensions: ['docx'] },
    ],
    properties: ['openFile', 'multiSelections'],
  });

  if (canceled || filePaths.length === 0) return null;
  return filePaths;
});

ipcMain.handle('import:seriesPreview', (_, filePaths: string[]) =>
  services.seriesImport.preview(filePaths),
);

ipcMain.handle('import:seriesCommit', async (_, config: SeriesImportCommitConfig) => {
  const result = await services.seriesImport.commit(config);

  // Set the first book as active so the user lands somewhere useful
  if (result.volumeResults.length > 0) {
    hooks?.onActiveBookChanged?.(result.volumeResults[0].bookSlug);
  }

  return result;
});
```

### 3. Update Preload Bridge (`src/preload/index.ts`)

Read `src/preload/index.ts`. Add the type imports at the top:

```typescript
import type {
  // ... existing imports ...
  SeriesImportCommitConfig,
  SeriesImportPreview,
  SeriesImportResult,
} from '../domain/types';
```

Add a new `seriesImport` namespace to the `contextBridge.exposeInMainWorld` call, inside the `novelEngine` object. Place it after the existing `import` namespace:

```typescript
seriesImport: {
  selectFiles: (): Promise<string[] | null> =>
    ipcRenderer.invoke('import:selectFiles'),
  preview: (filePaths: string[]): Promise<SeriesImportPreview> =>
    ipcRenderer.invoke('import:seriesPreview', filePaths),
  commit: (config: SeriesImportCommitConfig): Promise<SeriesImportResult> =>
    ipcRenderer.invoke('import:seriesCommit', config),
},
```

Also update the `NovelEngineAPI` type declaration (used by `window.novelEngine`) to include the new namespace:

```typescript
seriesImport: {
  selectFiles(): Promise<string[] | null>;
  preview(filePaths: string[]): Promise<SeriesImportPreview>;
  commit(config: SeriesImportCommitConfig): Promise<SeriesImportResult>;
};
```

---

## Architecture Compliance

- [x] Domain files import from nothing
- [x] Infrastructure imports only from domain + external packages
- [x] Application imports only from domain interfaces (not concrete classes)
- [x] IPC handlers are one-liner delegations (selectFiles uses dialog, which is acceptable for IPC layer)
- [x] Renderer accesses backend only through `window.novelEngine`
- [x] All new IPC channels are namespaced (`import:selectFiles`, `import:seriesPreview`, `import:seriesCommit`)
- [x] All async operations have error handling
- [x] No `any` types

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. The new IPC channels are registered in handlers.ts
3. The preload bridge exposes `window.novelEngine.seriesImport` with all three methods
4. The composition root creates `SeriesImportService` with the correct dependencies
5. No business logic in IPC handlers — just delegation

---

## State Update

After completing this session, update `prompts/feature/import-series/STATE.md`:
- Set SESSION-03 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
