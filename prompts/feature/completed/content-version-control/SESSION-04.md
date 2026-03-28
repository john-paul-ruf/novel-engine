# SESSION-04 — IPC Wiring, Preload Bridge & Composition Root

> **Feature:** content-version-control
> **Layer(s):** IPC / Main
> **Depends on:** SESSION-03
> **Estimated effort:** 30 min

---

## Context

SESSION-03 created the `VersionService` application service. This session wires it into the Electron app:

1. **Composition root** (`src/main/index.ts`) — instantiate `VersionService`, inject into IPC handlers
2. **IPC handlers** (`src/main/ipc/handlers.ts`) — register `versions:*` channels
3. **Preload bridge** (`src/preload/index.ts`) — expose version API to renderer
4. **Auto-snapshotting** — hook into every place files are written, across all books
5. **Startup pruning** — prune old versions on app launch (like existing `pruneStreamEvents`)

### Multi-Book Snapshotting

This is a multi-book system — the user can have concurrent CLI streams running against different books simultaneously (e.g., Verity drafting on Book A while Forge plans on Book B). The `BookWatcher` only watches the **active** book directory. It misses writes to non-active books entirely.

To capture agent writes across ALL books, we snapshot at **four levels**:

| Hook Point | Covers | bookSlug Source |
|---|---|---|
| `files:write` IPC handler | User edits via UI | Handler parameter |
| `chat:send` handler — post-stream `changedFiles` | Main chat agent writes | `params.bookSlug` |
| `hot-take:start` / `adhoc-revision:start` — stream `filesChanged` events | Background agent writes | Handler parameter |
| `BookWatcher` callback | External edits, manual file drops, catch-all for active book | `fs.getActiveBookSlug()` |
| Revision queue `onEvent` — `session:streamEvent` with `filesChanged` type | Revision queue writes across any book | Event's `bookSlug` from the plan |

The primary agent-write capture is at the stream-completion level (where we have both the correct `bookSlug` and the file list). The BookWatcher is a **fallback** for edge cases only.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/main/index.ts` | Modify | Instantiate `VersionService`, pass to handlers, add BookWatcher fallback hook, add startup pruning |
| `src/main/ipc/handlers.ts` | Modify | Add `versions:*` IPC handlers, modify `files:write` to auto-snapshot, add snapshot hooks to `chat:send`, `hot-take:start`, `adhoc-revision:start`, and revision queue event forwarding |
| `src/preload/index.ts` | Modify | Add `versions` namespace to the preload bridge |

---

## Implementation

### 1. Update the composition root (`src/main/index.ts`)

Read `src/main/index.ts`. Make these changes:

**Add import:**
```typescript
import { VersionService } from '@app/VersionService';
```

**Instantiate after other application services (step 4 section):**
```typescript
  const version = new VersionService(db, fs);
```

**Add to the `registerIpcHandlers` call — add `version` to the services object:**
```typescript
  registerIpcHandlers(
    { settings, agents, db, fs, chat, audit, pipeline, build, usage, revisionQueue, motifLedger, notifications, version },
    { userDataPath, booksDir },
    // ... hooks
  );
```

**Add startup pruning** (after the existing `pruneStreamEvents` block, around step 4b):
```typescript
  // Prune old file versions (keep last 50 per file per book)
  try {
    const books = await fs.listBooks();
    for (const book of books) {
      await version.pruneVersions(book.slug, 50);
    }
  } catch (err) {
    console.warn('[startup] pruneFileVersions failed:', err);
  }
```

**Add auto-snapshot to BookWatcher callback** (step 7 section). This is the **fallback** hook — it catches external edits and manual file changes for the active book only. The primary agent-write capture happens in the IPC handlers (step 2 below).

```typescript
  bookWatcher = new BookWatcher(booksDir, async (changedPaths) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('chat:filesChanged', changedPaths);
    }

    // Fallback snapshot: catches external edits and manual file drops for active book.
    // Primary agent-write capture is in the IPC handlers (chat:send, hot-take, etc.)
    // which have the correct bookSlug for any book, not just the active one.
    const activeSlug = await fs.getActiveBookSlug().catch(() => '');
    if (activeSlug) {
      for (const changedPath of changedPaths) {
        version.snapshotFile(activeSlug, changedPath, 'agent').catch(() => {
          // Snapshot failure is non-critical
        });
      }
    }
  });
```

### 2. Update IPC handlers (`src/main/ipc/handlers.ts`)

Read `src/main/ipc/handlers.ts`. Make these changes:

**Add `IVersionService` to the import block:**
```typescript
import type {
  // ... existing imports ...
  IVersionService,
} from '@domain/interfaces';
```

**Add `FileVersionSource` to the types import:**
```typescript
import type {
  // ... existing imports ...
  FileVersionSource,
} from '@domain/types';
```

**Add `version` to the services parameter:**
```typescript
export function registerIpcHandlers(services: {
  // ... existing services ...
  version: IVersionService;
}, paths: { ... }, hooks?: { ... }): void {
```

#### 2a. Create a shared snapshot helper

Add a helper function inside `registerIpcHandlers` (at the top, after the opening brace) that snapshots a list of changed files for a given book. This avoids duplicating the snapshot loop in every handler:

```typescript
  /**
   * Snapshot changed files after a CLI stream completes.
   * Called from chat:send, hot-take, adhoc-revision, and revision queue handlers.
   * Dedup by hash ensures no duplicate versions if the BookWatcher also fires.
   */
  const snapshotChangedFiles = (bookSlug: string, changedPaths: string[], source: FileVersionSource = 'agent') => {
    for (const filePath of changedPaths) {
      services.version.snapshotFile(bookSlug, filePath, source).catch((err) => {
        console.warn('[versions] Auto-snapshot failed for', filePath, err);
      });
    }
  };
```

#### 2b. Modify `files:write` handler — snapshot user edits

```typescript
  ipcMain.handle('files:write', async (_, bookSlug: string, filePath: string, content: string) => {
    await services.fs.writeFile(bookSlug, filePath, content);
    // Auto-snapshot the written content (dedup by hash — no-op if unchanged)
    await services.version.snapshotContent(bookSlug, filePath, content, 'user').catch((err) => {
      console.warn('[versions] Auto-snapshot failed:', err);
    });
  });
```

#### 2c. Modify `chat:send` handler — snapshot after stream completes

Find the existing block at the end of the `chat:send` handler where `changedFiles` is broadcast to the renderer. Add a snapshot call **after** the broadcast:

```typescript
    // Existing: notify renderer of changed files
    const changedFiles = result.changedFiles;
    if (changedFiles.length > 0) {
      for (const w of BrowserWindow.getAllWindows()) {
        try {
          w.webContents.send('chat:filesChanged', changedFiles, params.bookSlug);
        } catch {
          // Window may be closing — skip
        }
      }
      // Snapshot agent-written files (uses params.bookSlug — correct for any book, not just active)
      snapshotChangedFiles(params.bookSlug, changedFiles);
    }
```

#### 2d. Modify `hot-take:start` handler — snapshot on filesChanged stream event

Find the `hot-take:start` handler. It currently fires-and-forgets the `sendMessage` call. We need to track changed files and snapshot them. Add tracking similar to `adhoc-revision:start`:

Inside the `onEvent` callback of the `sendMessage` call, add:

```typescript
    let hotTakeChangedFiles: string[] = [];
    services.chat.sendMessage({
      // ... existing params ...
      onEvent: (streamEvent) => {
        broadcastStreamEvent({ ...streamEvent, callId, conversationId: conversation.id, source: 'hot-take' });

        // Track changed files for version snapshotting
        if (streamEvent.type === 'filesChanged') {
          hotTakeChangedFiles = streamEvent.paths;
        }
        if ((streamEvent.type === 'done' || streamEvent.type === 'error') && hotTakeChangedFiles.length > 0) {
          snapshotChangedFiles(bookSlug, hotTakeChangedFiles);
        }
      },
    }).catch((err) => {
      console.error('[hot-take] Stream error:', err);
    });
```

#### 2e. Modify `adhoc-revision:start` handler — snapshot on completion

Find the `adhoc-revision:start` handler. It already tracks `adhocChangedFiles`. Add snapshot after the existing `chat:filesChanged` broadcast inside the `done`/`error` block:

```typescript
        if (streamEvent.type === 'done' || streamEvent.type === 'error') {
          if (adhocChangedFiles.length > 0) {
            for (const w of BrowserWindow.getAllWindows()) {
              try {
                w.webContents.send('chat:filesChanged', adhocChangedFiles, bookSlug);
              } catch {
                // Window may be closing
              }
            }
            // Snapshot agent-written files for this book
            snapshotChangedFiles(bookSlug, adhocChangedFiles);
          }
        }
```

#### 2f. Modify revision queue event forwarding — snapshot on filesChanged

Find the `services.revisionQueue.onEvent(...)` block at the bottom of the handler. When we see a `session:streamEvent` with type `filesChanged`, snapshot those files. We need the bookSlug from the plan. Add after the existing event forwarding:

```typescript
  services.revisionQueue.onEvent((event) => {
    // ... existing window send logic ...

    // Snapshot files changed during revision sessions
    if (event.type === 'session:streamEvent' && event.event.type === 'filesChanged') {
      // Get bookSlug from the revision plan — the queue service tracks this
      // We can derive it from the plan associated with this session
      // For now, use the active book slug as revision queue always runs on active book
      services.fs.getActiveBookSlug().then((activeSlug) => {
        if (activeSlug) {
          snapshotChangedFiles(activeSlug, event.event.type === 'filesChanged' ? event.event.paths : []);
        }
      }).catch(() => {});
    }
  });
```

**Better approach:** Since the revision queue always operates on a specific book (the plan has a `bookSlug` field), read it from the plan. Modify to:

```typescript
    // Snapshot files changed during revision sessions
    if (event.type === 'session:streamEvent' && event.event.type === 'filesChanged') {
      // The revision queue always runs on a known book — get it from any loaded plan
      // or fall back to active book slug
      const rqBookSlug = (() => {
        // Try to get the bookSlug from the plan (if accessible)
        // The session event doesn't carry bookSlug directly, but the stream event might
        const streamEvt = event.event;
        if (streamEvt.type === 'filesChanged') {
          return undefined; // filesChanged doesn't carry bookSlug
        }
        return undefined;
      })();

      const resolveSlug = rqBookSlug
        ? Promise.resolve(rqBookSlug)
        : services.fs.getActiveBookSlug();

      resolveSlug.then((slug) => {
        if (slug && event.event.type === 'filesChanged') {
          snapshotChangedFiles(slug, event.event.paths);
        }
      }).catch(() => {});
    }
```

**Simplest correct approach:** Since the revision queue event doesn't carry `bookSlug`, and the revision queue always runs on the active book (you can't run revision queue on a background book), use `getActiveBookSlug()`:

```typescript
    // Snapshot files changed during revision sessions
    if (event.type === 'session:streamEvent' && event.event.type === 'filesChanged') {
      services.fs.getActiveBookSlug().then((slug) => {
        if (slug) {
          snapshotChangedFiles(slug, event.event.paths);
        }
      }).catch(() => {});
    }
```

#### 2g. Add the `versions:*` handler section

Add after the `// === Files ===` section:

```typescript
  // === Versions ===

  ipcMain.handle('versions:getHistory', (_, bookSlug: string, filePath: string, limit?: number, offset?: number) =>
    services.version.getHistory(bookSlug, filePath, limit ?? 50, offset ?? 0),
  );

  ipcMain.handle('versions:getVersion', (_, versionId: number) =>
    services.version.getVersion(versionId),
  );

  ipcMain.handle('versions:getDiff', (_, oldVersionId: number | null, newVersionId: number) =>
    services.version.getDiff(oldVersionId, newVersionId),
  );

  ipcMain.handle('versions:revert', async (_, bookSlug: string, filePath: string, versionId: number) => {
    const result = await services.version.revertToVersion(bookSlug, filePath, versionId);
    // Notify renderer that a file was changed (revert is a write)
    for (const w of BrowserWindow.getAllWindows()) {
      try {
        w.webContents.send('chat:filesChanged', [filePath], bookSlug);
      } catch {
        // Window may be closing
      }
    }
    return result;
  });

  ipcMain.handle('versions:getCount', (_, bookSlug: string, filePath: string) =>
    services.version.getVersionCount(bookSlug, filePath),
  );

  ipcMain.handle('versions:snapshot', (_, bookSlug: string, filePath: string, source: FileVersionSource) =>
    services.version.snapshotFile(bookSlug, filePath, source),
  );
```

### 3. Update the preload bridge (`src/preload/index.ts`)

Read `src/preload/index.ts`. Make these changes:

**Add to the type imports:**
```typescript
import type {
  // ... existing imports ...
  FileDiff,
  FileVersion,
  FileVersionSource,
  FileVersionSummary,
} from '@domain/types';
```

**Add the `versions` namespace** to the `api` object (after the `files` namespace):

```typescript
  // Versions (file history)
  versions: {
    getHistory: (bookSlug: string, filePath: string, limit?: number, offset?: number): Promise<FileVersionSummary[]> =>
      ipcRenderer.invoke('versions:getHistory', bookSlug, filePath, limit, offset),
    getVersion: (versionId: number): Promise<FileVersion | null> =>
      ipcRenderer.invoke('versions:getVersion', versionId),
    getDiff: (oldVersionId: number | null, newVersionId: number): Promise<FileDiff> =>
      ipcRenderer.invoke('versions:getDiff', oldVersionId, newVersionId),
    revert: (bookSlug: string, filePath: string, versionId: number): Promise<FileVersion> =>
      ipcRenderer.invoke('versions:revert', bookSlug, filePath, versionId),
    getCount: (bookSlug: string, filePath: string): Promise<number> =>
      ipcRenderer.invoke('versions:getCount', bookSlug, filePath),
    snapshot: (bookSlug: string, filePath: string, source: FileVersionSource): Promise<FileVersion | null> =>
      ipcRenderer.invoke('versions:snapshot', bookSlug, filePath, source),
  },
```

---

## Architecture Compliance

- [x] Domain files import from nothing
- [x] Infrastructure imports only from domain + external packages
- [x] Application imports only from domain interfaces (not concrete classes)
- [x] IPC handlers are thin delegations (versions:* handlers are one-liner delegations; snapshot hooks are non-blocking fire-and-forget calls alongside existing logic)
- [x] Renderer accesses backend only through `window.novelEngine`
- [x] All new IPC channels are namespaced (`versions:action`)
- [x] All async operations have error handling
- [x] No `any` types
- [x] Composition root is the only place concrete classes are instantiated
- [x] Multi-book safe: every snapshot hook uses the handler's own `bookSlug` parameter, not just the active book

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `VersionService` is instantiated in `src/main/index.ts` and injected into handlers
3. All `versions:*` IPC channels are registered in handlers and exposed in preload
4. `files:write` handler auto-snapshots with source='user' after writing
5. `chat:send` handler snapshots `changedFiles` with the correct `params.bookSlug`
6. `hot-take:start` handler snapshots changed files on stream completion
7. `adhoc-revision:start` handler snapshots changed files on stream completion
8. Revision queue event handler snapshots `filesChanged` events
9. `BookWatcher` callback provides fallback snapshotting for the active book
10. Startup pruning runs after existing stream event pruning
11. `window.novelEngine.versions.*` is available in the preload type declarations
12. **Multi-book test:** Verify that snapshotting uses handler-scoped `bookSlug`, not `getActiveBookSlug()`, in `chat:send`, `hot-take:start`, and `adhoc-revision:start`

---

## State Update

After completing this session, update `prompts/feature/content-version-control/STATE.md`:
- Set SESSION-04 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
