# SESSION-04 — IPC Wiring, Preload Bridge & Composition Root

> **Feature:** series-bible
> **Layer(s):** IPC / Main
> **Depends on:** SESSION-01, SESSION-02, SESSION-03
> **Estimated effort:** 25 min

---

## Context

Sessions 01–03 added domain types, the infrastructure `SeriesService`, and integrated series context into `ContextBuilder` and `ChatService`. This session wires everything together:

1. Instantiate `SeriesService` in the composition root (`src/main/index.ts`)
2. Pass it to `ChatService` (which now expects `ISeriesService` as a constructor arg)
3. Add `series:*` IPC handlers in `src/main/ipc/handlers.ts`
4. Expose `series` namespace in the preload bridge (`src/preload/index.ts`)
5. Ensure `bootstrap.ts` creates the `series/` directory on first run

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/main/index.ts` | Modify | Import and instantiate `SeriesService`, pass to `ChatService`, pass to `registerIpcHandlers` |
| `src/main/ipc/handlers.ts` | Modify | Add `series:*` IPC handlers, accept `ISeriesService` in services param |
| `src/preload/index.ts` | Modify | Add `series` namespace to the bridge API |
| `src/main/bootstrap.ts` | Modify | Create `series/` directory in bootstrap |

---

## Implementation

### 1. Update `src/main/bootstrap.ts`

Read `src/main/bootstrap.ts`. In the bootstrap function (or `needsBootstrap`), add creation of the `series/` directory alongside `books/` and `custom-agents/`:

```typescript
await fs.mkdir(path.join(userDataPath, 'series'), { recursive: true });
```

### 2. Update `src/main/index.ts` (Composition Root)

Read `src/main/index.ts` in full.

**2a.** Add import:

```typescript
import { SeriesService } from '@infra/series';
```

**2b.** Instantiate the service after the other infrastructure services:

```typescript
const seriesService = new SeriesService(userDataPath);
```

**2c.** Update the `ChatService` constructor call to pass `seriesService`:

The `ChatService` constructor (after SESSION-03) expects `ISeriesService` as the last parameter. Add `seriesService` as the final argument.

**2d.** Add `seriesService` to the services object passed to `registerIpcHandlers`:

```typescript
registerIpcHandlers({
  // ...existing services...
  series: seriesService,
}, paths, hooks);
```

**2e.** Invalidate the series cache when books change. After `booksDirWatcher` is set up (if it emits a 'change' event), call `seriesService.invalidateCache()`. Find the existing `booksDirWatcher.on('change', ...)` listener and add the invalidation there.

### 3. Update `src/main/ipc/handlers.ts`

Read `src/main/ipc/handlers.ts` in full.

**3a.** Add `ISeriesService` to the imports:

```typescript
import type { ISeriesService } from '@domain/interfaces';
```

Add `SeriesMeta` and `SeriesSummary` to the type imports from `@domain/types`.

**3b.** Add `series: ISeriesService` to the `services` parameter object:

```typescript
export function registerIpcHandlers(services: {
  // ...existing...
  series: ISeriesService;
}, paths: { ... }, hooks?: { ... }): void {
```

**3c.** Add the following IPC handlers inside the function body. Each is a one-liner delegation:

```typescript
// Series
ipcMain.handle('series:list', () => services.series.listSeries());

ipcMain.handle('series:get', (_e, slug: string) => services.series.getSeries(slug));

ipcMain.handle('series:create', (_e, name: string, description?: string) =>
  services.series.createSeries(name, description));

ipcMain.handle('series:update', (_e, slug: string, partial: Partial<Pick<SeriesMeta, 'name' | 'description'>>) =>
  services.series.updateSeries(slug, partial));

ipcMain.handle('series:delete', (_e, slug: string) => services.series.deleteSeries(slug));

ipcMain.handle('series:addVolume', (_e, seriesSlug: string, bookSlug: string, volumeNumber?: number) =>
  services.series.addVolume(seriesSlug, bookSlug, volumeNumber));

ipcMain.handle('series:removeVolume', (_e, seriesSlug: string, bookSlug: string) =>
  services.series.removeVolume(seriesSlug, bookSlug));

ipcMain.handle('series:reorderVolumes', (_e, seriesSlug: string, orderedSlugs: string[]) =>
  services.series.reorderVolumes(seriesSlug, orderedSlugs));

ipcMain.handle('series:getForBook', (_e, bookSlug: string) =>
  services.series.getSeriesForBook(bookSlug));

ipcMain.handle('series:readBible', (_e, seriesSlug: string) =>
  services.series.readSeriesBible(seriesSlug));

ipcMain.handle('series:writeBible', (_e, seriesSlug: string, content: string) =>
  services.series.writeSeriesBible(seriesSlug, content));
```

### 4. Update `src/preload/index.ts`

Read `src/preload/index.ts` in full.

**4a.** Add the new types to the import:

```typescript
import type { SeriesMeta, SeriesSummary } from '@domain/types';
```

**4b.** Add the `series` namespace to the `api` object:

```typescript
// Series
series: {
  list: (): Promise<SeriesSummary[]> => ipcRenderer.invoke('series:list'),
  get: (slug: string): Promise<SeriesMeta | null> => ipcRenderer.invoke('series:get', slug),
  create: (name: string, description?: string): Promise<SeriesMeta> =>
    ipcRenderer.invoke('series:create', name, description),
  update: (slug: string, partial: Partial<Pick<SeriesMeta, 'name' | 'description'>>): Promise<SeriesMeta> =>
    ipcRenderer.invoke('series:update', slug, partial),
  delete: (slug: string): Promise<void> => ipcRenderer.invoke('series:delete', slug),
  addVolume: (seriesSlug: string, bookSlug: string, volumeNumber?: number): Promise<SeriesMeta> =>
    ipcRenderer.invoke('series:addVolume', seriesSlug, bookSlug, volumeNumber),
  removeVolume: (seriesSlug: string, bookSlug: string): Promise<SeriesMeta> =>
    ipcRenderer.invoke('series:removeVolume', seriesSlug, bookSlug),
  reorderVolumes: (seriesSlug: string, orderedSlugs: string[]): Promise<SeriesMeta> =>
    ipcRenderer.invoke('series:reorderVolumes', seriesSlug, orderedSlugs),
  getForBook: (bookSlug: string): Promise<SeriesMeta | null> =>
    ipcRenderer.invoke('series:getForBook', bookSlug),
  readBible: (seriesSlug: string): Promise<string> =>
    ipcRenderer.invoke('series:readBible', seriesSlug),
  writeBible: (seriesSlug: string, content: string): Promise<void> =>
    ipcRenderer.invoke('series:writeBible', seriesSlug, content),
},
```

### 5. Update `window.novelEngine` Type Declaration

If there is a type declaration for `window.novelEngine` (check `src/renderer/types/` or a `.d.ts` file), add the `series` namespace to it. If the type is inferred from the preload export, no additional change is needed.

---

## Architecture Compliance

- [ ] IPC handlers are one-liner delegations — zero business logic
- [ ] Preload bridge exposes only serializable data (no classes, no functions in params/returns)
- [ ] Composition root is the only place `SeriesService` is instantiated
- [ ] All new channels are namespaced: `series:*`
- [ ] `ChatService` receives `ISeriesService` via constructor injection

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `SeriesService` is instantiated in `src/main/index.ts` and passed to both `ChatService` and `registerIpcHandlers`
3. All 11 `series:*` IPC channels are registered in handlers
4. `window.novelEngine.series` namespace is available in the preload bridge
5. Bootstrap creates `series/` directory

---

## State Update

After completing this session, update `prompts/feature/series-bible/STATE.md`:
- Set SESSION-04 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
