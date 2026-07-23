# Crash Analysis — 2026-07-23

## Crash Log Summary

Three distinct issues found in the crash log:

### Issue 1 — `settings:load` handler race (line 55, MINOR)
```
Error occurred in handler for 'settings:load': Error: No handler registered for 'settings:load'
```
Happens on main-process restart (`rs`). The renderer fires `settings:load` before
`registerIpcHandlers()` has completed re-registering handlers. Non-fatal — the app
recovers and continues. Not addressed in this program (cosmetic).

### Issue 2 — Renderer OOM from unbounded thinking buffer (lines 245-246, CRITICAL)
```
V8 process OOM (Oilpan: Large allocation. Ran out of reservation)
```
The Ollama model produced **225,328 chars of thinking text** across 30 turns.
The chatStore accumulates every `thinkingDelta` via string concatenation
(`thinkingBuffer + text`) and calls `setState` on every single token delta.
With 225K+ chars this creates O(N²) string allocations + React re-renders of
massive text content → renderer V8 OOM crash.

Root cause: `src/renderer/stores/chatStore.ts:408` — unbounded accumulation.
Also `src/renderer/stores/chatStore.ts:409` — same pattern for `streamBuffer`.

### Issue 3 — Stream events to dead renderer (lines 246-400, MODERATE)
```
Error sending from webFrameMain: Error: Render frame was disposed before WebFrameMain could be accessed
```
After the renderer OOM crashes, the main process keeps streaming (17+ more turns).
Every `broadcastStreamEvent` call tries `w.webContents.send()` on the dead
WebContents. The existing try/catch catches the thrown error, but Electron's
internals log the error to stderr on every attempt — hundreds of log lines.

Root cause: `src/main/ipc/handlers.ts` — 7+ `broadcastStreamEvent` closures
don't check `webContents.isDestroyed()` or render-frame validity before `.send()`.
Also `src/main/index.ts:708` — BookWatcher callback sends to potentially dead window.

## Fix Plan

1. **SESSION-01**: Guard all `broadcastStreamEvent` instances against disposed
   render frames — add `isWebContentsAlive()` helper, apply everywhere.

2. **SESSION-02**: Cap `thinkingBuffer`/`streamBuffer` in chatStore + debatch
   delta updates (flush every 100ms instead of every token) — prevents OOM.