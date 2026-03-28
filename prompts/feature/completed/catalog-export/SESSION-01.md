# SESSION-01 — IPC Handler + Preload Bridge for Catalog Export

> **Feature:** catalog-export
> **Layer(s):** IPC
> **Depends on:** Nothing
> **Estimated effort:** 10 min

---

## Context

The user wants to export their entire book catalog (all books) as a single ZIP archive that they can save anywhere on disk. The app already has `archiver` as a dependency and uses it in the existing `build:exportZip` handler — this session adds a parallel handler for the full catalog.

No domain types, interfaces, or application services are needed. The operation is a straightforward "zip a directory and save it" — identical in pattern to the existing `build:exportZip` handler but targeting the entire `books/` directory instead of a single book's `dist/` folder.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/main/ipc/handlers.ts` | Modify | Add `catalog:exportZip` handler |
| `src/preload/index.ts` | Modify | Add `catalog.exportZip()` bridge method |

---

## Implementation

### 1. Add the IPC Handler

Read `src/main/ipc/handlers.ts`. Add a new `catalog:exportZip` handler after the existing `build:exportZip` handler (around line 408). The handler should:

1. Show a native save dialog with default filename `novel-engine-catalog-YYYY-MM-DD.zip`
2. Use `archiver` to zip the entire `paths.booksDir` directory (already available in the handler scope)
3. Return the saved file path, or `null` if the user cancelled

```typescript
// === Catalog Export ===

ipcMain.handle('catalog:exportZip', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) throw new Error('No window found');

  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Export Book Catalog',
    defaultPath: `novel-engine-catalog-${dateStr}.zip`,
    filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
  });

  if (canceled || !filePath) return null;

  return new Promise<string>((resolve, reject) => {
    const output = createWriteStream(filePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve(filePath));
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(paths.booksDir, 'books');
    archive.finalize();
  });
});
```

Key difference from `build:exportZip`: the second argument to `archive.directory()` is `'books'` — this preserves a top-level `books/` folder inside the ZIP so the structure is clear when extracted.

### 2. Add the Preload Bridge Method

Read `src/preload/index.ts`. Add a `catalog` namespace to the API object, after the `build` namespace (around line 201):

```typescript
// Catalog Export
catalog: {
  exportZip: (): Promise<string | null> =>
    ipcRenderer.invoke('catalog:exportZip'),
},
```

---

## Architecture Compliance

- [x] Domain files import from nothing — no domain changes
- [x] Infrastructure imports only from domain + external packages — no infra changes
- [x] Application imports only from domain interfaces — no app changes
- [x] IPC handlers are one-liner delegations — this handler is self-contained (no service to delegate to), consistent with the existing `build:exportZip` pattern
- [x] Renderer accesses backend only through `window.novelEngine` — bridge method added
- [x] All new IPC channels are namespaced (`catalog:exportZip`)
- [x] All async operations have error handling — archiver error event wired to reject
- [x] No `any` types

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `window.novelEngine.catalog.exportZip` is callable from the renderer console
3. The handler appears in `handlers.ts` with the `catalog:` namespace

---

## State Update

After completing this session, update `prompts/feature/catalog-export/STATE.md`:
- Set SESSION-01 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
