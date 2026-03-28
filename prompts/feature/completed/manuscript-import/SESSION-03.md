# SESSION-03 — IPC Wiring, Preload Bridge & Composition Root

> **Feature:** manuscript-import
> **Layer(s):** IPC / Main
> **Depends on:** SESSION-02
> **Estimated effort:** 15 min

---

## Context

SESSION-01 added domain types and the `IManuscriptImportService` interface. SESSION-02 implemented `ChapterDetector` and `ManuscriptImportService` in the application layer. This session wires everything together:

1. Instantiate `ManuscriptImportService` in the composition root (`src/main/index.ts`)
2. Add IPC handlers for file selection, preview, and commit
3. Expose the import API through the preload bridge so the renderer can access it via `window.novelEngine.import.*`

The IPC flow follows the established pattern: the file dialog opens in the handler (same as `books:uploadCover`), and the service methods are thin one-liner delegations.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/main/index.ts` | Modify | Import and instantiate `ManuscriptImportService`, pass to `registerIpcHandlers` |
| `src/main/ipc/handlers.ts` | Modify | Add `import:selectFile`, `import:preview`, `import:commit` handlers |
| `src/preload/index.ts` | Modify | Add `window.novelEngine.import` namespace with three methods |

---

## Implementation

### 1. Wire `ManuscriptImportService` in composition root

Read `src/main/index.ts`. Add the import for `ManuscriptImportService`:

```typescript
import { ManuscriptImportService } from '@app/ManuscriptImportService';
```

In the `initializeApp()` function, after the existing service instantiations (near line 268, after `const version = ...`), instantiate:

```typescript
const manuscriptImport = new ManuscriptImportService(fs, pandocPath);
```

Update the `registerIpcHandlers` call to pass the new service. Add `manuscriptImport` to the services object:

```typescript
registerIpcHandlers(
  { settings, agents, db, fs, chat, audit, pipeline, build, usage, revisionQueue, motifLedger, notifications, version, providerRegistry, manuscriptImport },
  // ...
);
```

### 2. Update handler registration signature

Read `src/main/ipc/handlers.ts`. Add `IManuscriptImportService` to the imports from `@domain/interfaces`:

```typescript
import type {
  // ... existing imports ...
  IManuscriptImportService,
} from '@domain/interfaces';
```

Add `ImportCommitConfig` to the type imports from `@domain/types`:

```typescript
import type {
  // ... existing imports ...
  ImportCommitConfig,
} from '@domain/types';
```

Add `manuscriptImport` to the `services` parameter type:

```typescript
export function registerIpcHandlers(services: {
  // ... existing services ...
  manuscriptImport: IManuscriptImportService;
}, paths: { ... }, hooks?: { ... }): void {
```

### 3. Add import IPC handlers

Add the following handlers inside `registerIpcHandlers`, grouped under a `// === Manuscript Import ===` section. Place this after the `// === Books ===` section since it's book-creation-adjacent:

```typescript
// === Manuscript Import ===

ipcMain.handle('import:selectFile', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) throw new Error('No window found');

  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Import Manuscript',
    filters: [
      { name: 'Manuscripts', extensions: ['md', 'markdown', 'docx'] },
      { name: 'Markdown', extensions: ['md', 'markdown'] },
      { name: 'Word Document', extensions: ['docx'] },
    ],
    properties: ['openFile'],
  });

  if (canceled || filePaths.length === 0) return null;
  return filePaths[0];
});

ipcMain.handle('import:preview', (_, filePath: string) =>
  services.manuscriptImport.preview(filePath),
);

ipcMain.handle('import:commit', async (_, config: ImportCommitConfig) => {
  const result = await services.manuscriptImport.commit(config);
  hooks?.onActiveBookChanged?.(result.bookSlug);
  return result;
});
```

Note: `import:commit` calls `hooks?.onActiveBookChanged?.(result.bookSlug)` so the BookWatcher starts watching the newly imported book, matching the pattern used by `books:create`.

### 4. Add preload bridge methods

Read `src/preload/index.ts`. Add the import types at the top:

```typescript
import type {
  // ... existing imports ...
  ImportPreview,
  ImportCommitConfig,
  ImportResult,
} from '@domain/types';
```

Add the `import` namespace to the `api` object, after the `books` namespace:

```typescript
// Manuscript Import
import: {
  selectFile: (): Promise<string | null> =>
    ipcRenderer.invoke('import:selectFile'),
  preview: (filePath: string): Promise<ImportPreview> =>
    ipcRenderer.invoke('import:preview', filePath),
  commit: (config: ImportCommitConfig): Promise<ImportResult> =>
    ipcRenderer.invoke('import:commit', config),
},
```

---

## Architecture Compliance

- [x] Domain files import from nothing
- [x] Infrastructure imports only from domain + external packages
- [x] Application imports only from domain interfaces (not concrete classes)
- [x] IPC handlers are one-liner delegations (dialog logic is the only exception, matching `books:uploadCover` pattern)
- [x] Renderer will access backend only through `window.novelEngine.import`
- [x] All new IPC channels are namespaced (`import:selectFile`, `import:preview`, `import:commit`)
- [x] All async operations have error handling
- [x] No `any` types

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `ManuscriptImportService` is instantiated in the composition root with correct dependencies (`fs` and `pandocPath`)
3. Three new IPC channels are registered: `import:selectFile`, `import:preview`, `import:commit`
4. Preload bridge exposes `window.novelEngine.import` with `selectFile`, `preview`, and `commit` methods
5. `import:commit` handler calls `onActiveBookChanged` hook (consistent with `books:create`)

---

## State Update

After completing this session, update `prompts/feature/manuscript-import/STATE.md`:
- Set SESSION-03 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
