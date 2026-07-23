# State Tracker — Novel Engine / fix-renderer-crash-recovery

## Program
Novel Engine — Electron + React 18 + TypeScript 5 + Zustand + Ollama CLI provider

## Feature
fix-renderer-crash-recovery

## Intent
Fix three issues found in the 2026-07-23 crash log: (1) renderer OOM from
unbounded thinking buffer accumulation, (2) main process sending stream
events to disposed render frames, (3) settings:load handler race (cosmetic,
not addressed).

## Sessions

| # | Session | Modules | Status | Completed | Notes |
|---|---------|---------|--------|-----------|-------|
| 01 | Guard broadcastStreamEvent against disposed render frames | M09, M05, M16 | done | 2026-07-23 | See handoff |
| 02 | Cap thinking/stream buffers + debatch delta updates in chatStore | M10 | pending | | depends on SESSION-01 |

## Dependency Graph

```
SESSION-01 (main process guards)
    └── SESSION-02 (renderer buffer cap + debatching)
```

SESSION-01 can run independently. SESSION-02 depends on SESSION-01 only
because both touch the streaming pipeline and should be applied in order
(main process guard first, then renderer hardening).

## Architecture Reference

- **M09** (`src/main/ipc/handlers.ts`) — 7+ `broadcastStreamEvent` closures
  that call `BrowserWindow.getAllWindows()` → `webContents.send()`. All
  need `isWebContentsAlive()` guard.
- **M05** (`src/main/index.ts:706-741`) — BookWatcher/BooksDirWatcher
  callbacks send to `mainWindow.webContents`. Already check
  `!mainWindow.isDestroyed()` but not `webContents.isDestroyed()`.
- **M10** (`src/renderer/stores/chatStore.ts:408-409`) —
  `onThinkingDelta`/`onTextDelta` do per-token `setState` with string
  concatenation → O(N²) + OOM with 225K+ chars.
- **M16** (`src/test/mocks/electron.ts:38`) — `webContents` mock needs
  `isDestroyed` method for testing the guard.

## Scope Summary

| ID | Module | Files Affected |
|----|--------|---------------|
| M09 | main/ipc | `src/main/ipc/handlers.ts` |
| M09 | main | `src/main/index.ts` |
| M16 | test | `src/test/mocks/electron.ts` |
| M09 | main/ipc test | `src/main/ipc/handlers.test.ts` |
| M10 | renderer | `src/renderer/stores/chatStore.ts` |

## Design Decisions

1. **isWebContentsAlive() helper** — checks both `window.isDestroyed()` and
   `window.webContents.isDestroyed()`. Window can be alive while render frame
   is disposed (refresh, OOM). Rationale: existing try/catch catches the thrown
   error but Electron still logs to stderr on every attempt.

2. **MAX_BUFFER_CHARS = 50,000** — thinking and stream buffers capped at 50K.
   Main process (StreamManager) saves full content to DB. Renderer buffer is
   only for live display. 50K is generous for display; the OOM crash happened
   at 225K+ chars. Rationale: prevents OOM while preserving useful live preview.

3. **Debatch with 100ms interval** — deltas accumulate in module-scoped
   `let` variables, flush to Zustand state every 100ms via `setInterval`.
   Reduces React re-renders from thousands per second to ~10/sec.
   Rationale: per-token setState with O(N²) concatenation is the root cause
   of the OOM. 100ms is imperceptible to users.

4. **Module-scoped accumulators, not Zustand state** — pending deltas stored
   in `let _pendingThinking` / `let _pendingText` outside the store. Rationale:
   avoids triggering Zustand notifications on every delta — only the 100ms
   flush triggers state updates.

## Handoff Notes

### SESSION-01 (completed 2026-07-23)

Added `isWebContentsAlive()` helper to `src/main/ipc/handlers.ts` — checks both
`window.isDestroyed()` and `window.webContents.isDestroyed()`. Applied guard to
all 14 `BrowserWindow.getAllWindows()` broadcast loops in handlers.ts.

Tightened BookWatcher and BooksDirWatcher callbacks in `src/main/index.ts`
to also check `!mainWindow.webContents.isDestroyed()` before calling
`webContents.send()`.

Updated `src/test/mocks/electron.ts` — added `isDestroyed: vi.fn((): boolean => false)`
to the `webContents` mock object.

Added test in `src/main/ipc/handlers.test.ts` — verifies a window with destroyed
webContents is skipped during stream event broadcast.

SESSION-02 can proceed: chatStore buffer cap + debatching. The main process
guards are now in place so disposed renderers won't receive events.