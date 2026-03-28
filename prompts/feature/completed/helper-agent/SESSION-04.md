# SESSION-04 — IPC Wiring: Handlers, Preload Bridge, Composition Root

> **Feature:** helper-agent
> **Layer(s):** IPC / Main
> **Depends on:** SESSION-03
> **Estimated effort:** 20 min

---

## Context

SESSION-03 created the `HelperService` application class. This session wires it into the Electron architecture: instantiate it in the composition root, register IPC handlers, and expose the API through the preload bridge so the renderer can use it.

The helper needs these IPC channels:
- `helper:getOrCreateConversation` — returns the persistent helper conversation
- `helper:getMessages` — loads message history
- `helper:send` — sends a message (triggers streaming)
- `helper:abort` — kills active stream
- `helper:reset` — deletes conversation and starts fresh

Stream events are delivered through the existing `chat:streamEvent` channel — no new push event channel is needed. The helper's stream events flow through the same global broadcast mechanism, scoped by `callId`.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/main/index.ts` | Modify | Instantiate `HelperService` in composition root, pass to `registerIpcHandlers` |
| `src/main/ipc/handlers.ts` | Modify | Add `helper:*` IPC handlers |
| `src/preload/index.ts` | Modify | Add `helper` namespace to the bridge API |

---

## Implementation

### 1. Update Composition Root

Read `src/main/index.ts`.

Import `HelperService`:

```typescript
import { HelperService } from '@app/HelperService';
```

After the existing service instantiations (near line ~270, after `sourceGeneration`), add:

```typescript
const helper = new HelperService(settings, agents, db, fs, providerRegistry, userDataPath);
```

Add `helper` to the `registerIpcHandlers` call's first argument object:

```typescript
registerIpcHandlers(
  { settings, agents, db, fs, chat, audit, pipeline, build, usage, revisionQueue, motifLedger, notifications, version, providerRegistry, manuscriptImport, sourceGeneration, series, seriesImport, helper },
  { userDataPath, booksDir },
  { ... },
);
```

### 2. Add IPC Handlers

Read `src/main/ipc/handlers.ts`.

First, update the `services` parameter type in `registerIpcHandlers` to include `helper`:

```typescript
import type { IHelperService } from '@domain/interfaces';

// In the services parameter type:
helper: IHelperService;
```

Then add the handler registrations. Following the existing pattern (one-liner delegations), add inside `registerIpcHandlers`:

```typescript
// === Helper ===

ipcMain.handle('helper:getOrCreateConversation', async () => {
  return services.helper.getOrCreateConversation();
});

ipcMain.handle('helper:getMessages', async (_event, conversationId: string) => {
  return services.helper.getMessages(conversationId);
});

ipcMain.handle('helper:send', async (_event, params: { message: string; conversationId: string; callId?: string }) => {
  const { message, conversationId, callId } = params;
  await services.helper.sendMessage({
    message,
    conversationId,
    callId,
    onEvent: (event) => {
      for (const w of BrowserWindow.getAllWindows()) {
        try {
          w.webContents.send('chat:streamEvent', event);
        } catch { /* window closing */ }
      }
    },
  });
});

ipcMain.handle('helper:abort', async (_event, conversationId: string) => {
  services.helper.abortStream(conversationId);
});

ipcMain.handle('helper:reset', async () => {
  await services.helper.resetConversation();
});
```

Note: The `helper:send` handler broadcasts stream events on the existing `chat:streamEvent` channel. This is intentional — the renderer's stream handler infrastructure already listens on this channel and uses `callId` to scope events to the correct store. No new push event channel needed.

Make sure `BrowserWindow` is imported from `electron` at the top of the file (it likely already is for existing handlers that broadcast events).

### 3. Update Preload Bridge

Read `src/preload/index.ts`.

Add the `helper` namespace to the `api` object. Add any needed type imports at the top:

```typescript
import type { Conversation, Message } from '@domain/types';
```

(These are likely already imported — check before adding duplicates.)

Add the `helper` namespace inside the `api` object:

```typescript
// Helper Agent
helper: {
  getOrCreateConversation: (): Promise<Conversation> =>
    ipcRenderer.invoke('helper:getOrCreateConversation'),
  getMessages: (conversationId: string): Promise<Message[]> =>
    ipcRenderer.invoke('helper:getMessages', conversationId),
  send: (params: { message: string; conversationId: string; callId?: string }): Promise<void> =>
    ipcRenderer.invoke('helper:send', params),
  abort: (conversationId: string): Promise<void> =>
    ipcRenderer.invoke('helper:abort', conversationId),
  reset: (): Promise<void> =>
    ipcRenderer.invoke('helper:reset'),
},
```

This exposes `window.novelEngine.helper.*` to the renderer.

---

## Architecture Compliance

- [x] IPC handlers are one-liner delegations — zero business logic
- [x] All new IPC channels are namespaced (`helper:action`)
- [x] Preload bridge uses `contextBridge` + `ipcRenderer` — no direct node access
- [x] Composition root is the only place concrete `HelperService` is instantiated
- [x] Stream events reuse existing `chat:streamEvent` channel (no new push event infrastructure)
- [x] `contextIsolation: true` and `nodeIntegration: false` maintained

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `window.novelEngine.helper` is typed in the global Window declaration
3. All 5 IPC channels (`helper:getOrCreateConversation`, `helper:getMessages`, `helper:send`, `helper:abort`, `helper:reset`) are registered
4. `HelperService` is instantiated in `src/main/index.ts` with all required dependencies
5. Stream events from helper flow through `chat:streamEvent` (verified by reading handler code)

---

## State Update

After completing this session, update `prompts/feature/helper-agent/STATE.md`:
- Set SESSION-04 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
