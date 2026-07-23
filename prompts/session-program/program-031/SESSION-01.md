# SESSION-01 — Guard broadcastStreamEvent against disposed render frames

> **Program:** Novel Engine
> **Feature:** fix-renderer-crash-recovery
> **Modules:** M09 (main/ipc), M05 (filesystem watcher)
> **Depends on:** none
> **Estimated effort:** 20 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M09 | `src/main/ipc/handlers.ts` | Full file — 1216 lines | 7+ broadcastStreamEvent closures that send to dead windows |
| M09 | `src/main/index.ts` | Lines 700-750 | BookWatcher + BooksDirWatcher callbacks send to mainWindow |
| M16 | `src/test/mocks/electron.ts` | Full file — understand BrowserWindow mock | Need to add `isDestroyed()` on webContents mock if missing |

## Context

When the renderer crashes (OOM) or is refreshed (Cmd+R), the main process keeps
streaming CLI output. Every `broadcastStreamEvent` closure calls
`w.webContents.send()` on ALL windows via `BrowserWindow.getAllWindows()`.
The existing `try/catch` catches the thrown error but Electron still logs
`Error sending from webFrameMain: Error: Render frame was disposed` to stderr
on every attempt — producing hundreds of log lines per crashed stream.

`src/main/index.ts` already guards BookWatcher/BooksDirWatcher callbacks with
`!mainWindow.isDestroyed()`, but that only checks the *window* object — the
*webContents* (render frame) can be disposed while the window is still alive
(e.g. during a refresh).

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/main/ipc/handlers.ts` | Modify | Add `isWebContentsAlive()` helper; apply to all 7+ broadcast closures |
| `src/main/index.ts` | Modify | Tighten BookWatcher/BooksDirWatcher guards to check webContents |
| `src/test/mocks/electron.ts` | Modify | Add `isDestroyed()` to `webContents` mock object |
| `src/main/ipc/handlers.test.ts` | Modify | Add test: destroyed webContents is skipped |

## Implementation

### 1. Add `isWebContentsAlive` helper to handlers.ts

At the top of `src/main/ipc/handlers.ts`, after imports (around line 50), add:

```typescript
/**
 * Check whether a BrowserWindow's webContents is still alive and sendable.
 * Windows can exist (not destroyed) while their render frame is disposed
 * (e.g. during a renderer refresh or OOM crash). This guard prevents
 * hundreds of "Render frame was disposed" log lines when the main process
 * keeps streaming to a dead renderer.
 */
function isWebContentsAlive(w: BrowserWindow): boolean {
  return !w.isDestroyed() && !w.webContents.isDestroyed();
}
```

### 2. Update all broadcastStreamEvent closures in handlers.ts

There are 7 locations where `for (const w of BrowserWindow.getAllWindows())`
loops call `w.webContents.send(...)`. Each currently relies on try/catch.
Replace the pattern in each:

**Before** (repeated 7+ times):
```typescript
for (const w of BrowserWindow.getAllWindows()) {
  try {
    w.webContents.send('chat:streamEvent', streamEvent);
  } catch {
    // Window may be closing
  }
}
```

**After**:
```typescript
for (const w of BrowserWindow.getAllWindows()) {
  if (!isWebContentsAlive(w)) continue;
  try {
    w.webContents.send('chat:streamEvent', streamEvent);
  } catch {
    // Window may be closing
  }
}
```

The specific locations (search for `broadcastStreamEvent` or `BrowserWindow.getAllWindows`):
1. **Line ~288** — source generation `broadcastStreamEvent`
2. **Line ~465** — `chat:send` handler `broadcastStreamEvent`
3. **Line ~506** — `chat:filesChanged` broadcast in `chat:send`
4. **Line ~657** — `chat:deepDive` handler
5. **Line ~760** — `hot-take:start` handler
6. **Line ~816** — `adhoc-revision:start` handler
7. **Line ~843** — `adhoc-revision` `chat:filesChanged` broadcast
8. **Line ~865** — `broadcastVerityEvent` factory
9. **Line ~880** — `emitVerityCallStart`
10. **Line ~1170** — `broadcastQueryStreamEvent`

Also apply to all `chat:filesChanged` broadcasts within those handlers.

### 3. Tighten BookWatcher/BooksDirWatcher guards in index.ts

Read `src/main/index.ts` lines 704-741.

**Line 707** — BookWatcher callback:
```typescript
// Before
if (mainWindow && !mainWindow.isDestroyed()) {
  mainWindow.webContents.send('chat:filesChanged', changedPaths);
}
// After
if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
  mainWindow.webContents.send('chat:filesChanged', changedPaths);
}
```

**Line 736** — BooksDirWatcher callback:
```typescript
// Before
if (mainWindow && !mainWindow.isDestroyed()) {
  mainWindow.webContents.send('books:changed');
}
// After
if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
  mainWindow.webContents.send('books:changed');
}
```

### 4. Update electron mock for tests

In `src/test/mocks/electron.ts`, the `webContents` object on `BrowserWindow`
needs an `isDestroyed` method:

```typescript
webContents = { send: vi.fn(), isDestroyed: vi.fn((): boolean => false) };
```

### 5. Add test for destroyed webContents skip

In `src/main/ipc/handlers.test.ts`, add a test in the existing `describe` block
that verifies a window with destroyed webContents is skipped during broadcast:

```typescript
it('skips windows with destroyed webContents when broadcasting stream events', async () => {
  const deadWin = new BrowserWindow();
  deadWin.webContents.isDestroyed = vi.fn((): boolean => true);
  vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([deadWin]);

  // chat:send triggers broadcasting
  await invoke('chat:send', {
    agentName: 'Spark', message: 'hi', conversationId: 'conv-1',
    bookSlug: 'book-a', callId: 'call-1',
  });

  expect(deadWin.webContents.send).not.toHaveBeenCalled();
});
```

## Verification

1. `npx tsc --noEmit` — no type errors
2. `npm test` — all tests pass including new test
3. Confirm grep shows no remaining unguarded `BrowserWindow.getAllWindows()` loops
   that call `webContents.send` without the `isWebContentsAlive` check:
   ```
  rg "BrowserWindow.getAllWindows" src/main/ --A2 | grep -c "isWebContentsAlive"
   ```
   Should match every loop.

## State Update

Update `prompts/session-program/program-031/STATE.md`:
- SESSION-01 → done
- Handoff: "Guarded all broadcastStreamEvent closures with isWebContentsAlive().
  Updated electron mock. Added test for destroyed webContents skip."