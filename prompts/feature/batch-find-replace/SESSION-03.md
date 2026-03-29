# SESSION-03 — IPC: Handlers, Preload Bridge, and Composition Root

> **Feature:** batch-find-replace
> **Layer(s):** IPC / Main
> **Depends on:** SESSION-02
> **Estimated effort:** 20 min

---

## Context

SESSION-01 defined the domain types and `IFindReplaceService` interface.
SESSION-02 implemented `FindReplaceService` in the application layer.

This session wires the service into the running application:
1. Instantiates `FindReplaceService` in the composition root (`src/main/index.ts`)
2. Registers two IPC handlers in `src/main/ipc/handlers.ts`
3. Exposes those handlers to the renderer via a new `findReplace` namespace in `src/preload/index.ts`

Two new IPC channels are introduced:
- `findReplace:preview` — invoke, returns `FindReplacePreviewResult`
- `findReplace:apply` — invoke, returns `FindReplaceApplyResult`

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/main/index.ts` | Modify | Import `FindReplaceService`; instantiate it; pass to `registerIpcHandlers` |
| `src/main/ipc/handlers.ts` | Modify | Add `findReplace: IFindReplaceService` service param; register two new handlers |
| `src/preload/index.ts` | Modify | Add `findReplace` namespace to the bridge API; import new types |

---

## Implementation

### 1. Read all three files in full before making any changes

Read each target file completely:
- `src/main/index.ts` — find where `FindReplaceService` should be imported (near other `@app/*` imports) and where it is instantiated (near `VersionService`)
- `src/main/ipc/handlers.ts` — read the `registerIpcHandlers` function signature and the pattern used by other invoke handlers
- `src/preload/index.ts` — read the full `api` object to understand the namespace pattern

### 2. Modify `src/main/index.ts`

**Step A — Import the service.** In the `// Application` imports block, add:

```typescript
import { FindReplaceService } from '@app/FindReplaceService';
```

**Step B — Instantiate the service.** Find where `versionService` is instantiated (it is a dependency). After that instantiation, add:

```typescript
const findReplaceService = new FindReplaceService(fileSystemService, versionService);
```

(`fileSystemService` and `versionService` are the existing variable names for those services in the composition root. Verify the actual names by reading the file before editing.)

**Step C — Pass to `registerIpcHandlers`.** Find the `registerIpcHandlers({ ... })` call. Add `findReplace: findReplaceService` to the services object passed to it.

### 3. Modify `src/main/ipc/handlers.ts`

**Step A — Add the import.** The handler file already imports `IVersionService`. Add `IFindReplaceService` to the same `import type { ... } from '@domain/interfaces'` block.

Also add the following to the `import type { ... } from '@domain/types'` block:
- `FindReplaceApplyResult`
- `FindReplaceOptions`
- `FindReplacePreviewResult`

**Step B — Extend the `services` parameter.** In the `registerIpcHandlers(services: { ... })` parameter type, add:

```typescript
findReplace: IFindReplaceService;
```

**Step C — Register the two handlers.** Find a logical grouping location in the function body (near the `versions:*` or `files:*` handlers). Add:

```typescript
// Find & Replace
ipcMain.handle('findReplace:preview', async (_, bookSlug: string, searchTerm: string, options: FindReplaceOptions): Promise<FindReplacePreviewResult> =>
  services.findReplace.preview(bookSlug, searchTerm, options),
);

ipcMain.handle('findReplace:apply', async (_, params: {
  bookSlug: string;
  searchTerm: string;
  replacement: string;
  filePaths: string[];
  options: FindReplaceOptions;
}): Promise<FindReplaceApplyResult> =>
  services.findReplace.apply(params),
);
```

These are strict one-liner delegations — no logic lives in the handler.

### 4. Modify `src/preload/index.ts`

**Step A — Add type imports.** In the existing `import type { ... } from '@domain/types'` block, add:
- `FindReplaceApplyResult`
- `FindReplaceOptions`
- `FindReplacePreviewResult`

**Step B — Add the `findReplace` namespace.** Add a new namespace to the `api` object, placed logically near the `files` or `versions` namespace:

```typescript
// Find & Replace
findReplace: {
  preview: (
    bookSlug: string,
    searchTerm: string,
    options: FindReplaceOptions,
  ): Promise<FindReplacePreviewResult> =>
    ipcRenderer.invoke('findReplace:preview', bookSlug, searchTerm, options),

  apply: (params: {
    bookSlug: string;
    searchTerm: string;
    replacement: string;
    filePaths: string[];
    options: FindReplaceOptions;
  }): Promise<FindReplaceApplyResult> =>
    ipcRenderer.invoke('findReplace:apply', params),
},
```

---

## Architecture Compliance

- [x] IPC handlers are one-liner delegations — zero business logic
- [x] `handlers.ts` imports only interfaces, not concrete classes
- [x] `preload/index.ts` imports only `electron` and type declarations — no service imports
- [x] All new IPC channels are namespaced (`findReplace:preview`, `findReplace:apply`)
- [x] Data crossing the bridge is fully serializable (plain objects, no class instances)
- [x] No `any` types

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `grep "findReplace:preview\|findReplace:apply" src/main/ipc/handlers.ts` returns both handler registrations
3. `grep "findReplace" src/preload/index.ts` returns the new namespace and both methods
4. `grep "FindReplaceService" src/main/index.ts` confirms the import and instantiation

---

## State Update

After completing this session, update `prompts/feature/batch-find-replace/STATE.md`:
- Set SESSION-03 status to `done`
- Set Completed date to today
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
