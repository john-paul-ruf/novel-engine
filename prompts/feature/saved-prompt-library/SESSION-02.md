# SESSION-02 — IPC Wiring + Main Composition

> **Feature:** saved-prompt-library
> **Layer(s):** IPC / Main
> **Depends on:** SESSION-01
> **Estimated effort:** 20 min

---

## Context

SESSION-01 created the `SavedPrompt` type, `ISavedPromptService` interface, and `SavedPromptService` infrastructure implementation. The service is fully implemented but not yet connected to the Electron IPC layer.

This session wires the service into the app:
1. Register `savedPrompts:*` IPC handlers in `handlers.ts`
2. Expose `window.novelEngine.savedPrompts` in the preload bridge
3. Instantiate `SavedPromptService` in the composition root and pass it to `registerIpcHandlers`

After this session the renderer can call `window.novelEngine.savedPrompts.*` even before the UI is built.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/main/ipc/handlers.ts` | Modify | Add `ISavedPromptService` to services param; add four `savedPrompts:*` handlers |
| `src/preload/index.ts` | Modify | Add `SavedPrompt` type import; add `savedPrompts` namespace |
| `src/main/index.ts` | Modify | Import + instantiate `SavedPromptService`; pass to `registerIpcHandlers` |

---

## Implementation

### 1. Update `src/main/ipc/handlers.ts`

Read `src/main/ipc/handlers.ts` first.

**Step A:** Add `ISavedPromptService` to the `from '@domain/interfaces'` import block.

**Step B:** Add `SavedPrompt` to the `from '@domain/types'` import block if it is not already present.

**Step C:** Add `savedPrompts: ISavedPromptService` to the `services` parameter object in `registerIpcHandlers`. The full parameter type already has many services — add this one at the end of the list:

```typescript
  savedPrompts: ISavedPromptService;
```

**Step D:** Register the four handlers. Place them at the bottom of the handler registration block, after the `findReplace:*` handlers:

```typescript
  // === Saved Prompts ===

  ipcMain.handle('savedPrompts:list', () =>
    services.savedPrompts.list(),
  );

  ipcMain.handle('savedPrompts:create', (_event, params: { name: string; prompt: string; agentName: AgentName | null }) =>
    services.savedPrompts.create(params),
  );

  ipcMain.handle('savedPrompts:update', (_event, id: string, partial: Partial<Pick<SavedPrompt, 'name' | 'prompt' | 'agentName'>>) =>
    services.savedPrompts.update(id, partial),
  );

  ipcMain.handle('savedPrompts:delete', (_event, id: string) =>
    services.savedPrompts.delete(id),
  );
```

`AgentName` and `SavedPrompt` are already imported from `@domain/types` (after Step B above). Each handler is a single-expression delegation — no business logic.

---

### 2. Update `src/preload/index.ts`

Read `src/preload/index.ts` first.

**Step A:** Add `SavedPrompt` to the `from '@domain/types'` import block at the top of the file. `AgentName` is already imported — confirm and do not duplicate.

**Step B:** Add the `savedPrompts` namespace to the `api` object. Place it after the `helper` namespace, before the closing `};` of `const api`:

```typescript
  // Saved Prompts
  savedPrompts: {
    list: (): Promise<SavedPrompt[]> =>
      ipcRenderer.invoke('savedPrompts:list'),

    create: (params: {
      name: string;
      prompt: string;
      agentName: AgentName | null;
    }): Promise<SavedPrompt> =>
      ipcRenderer.invoke('savedPrompts:create', params),

    update: (
      id: string,
      partial: Partial<Pick<SavedPrompt, 'name' | 'prompt' | 'agentName'>>,
    ): Promise<SavedPrompt> =>
      ipcRenderer.invoke('savedPrompts:update', id, partial),

    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke('savedPrompts:delete', id),
  },
```

---

### 3. Update `src/main/index.ts`

Read `src/main/index.ts` first.

**Step A:** Add the infrastructure import in the `// Infrastructure` import block:

```typescript
import { SavedPromptService } from '@infra/saved-prompts';
```

**Step B:** In `initializeApp()`, instantiate the service immediately after `const settings = new SettingsService(userDataPath)` (step 3 of the composition root):

```typescript
  const savedPrompts = new SavedPromptService(userDataPath);
```

**Step C:** Add `savedPrompts` to the services object passed to `registerIpcHandlers`. The existing call looks like:

```typescript
  registerIpcHandlers(
    { settings, agents, db, fs, chat, audit, pipeline, build, usage, revisionQueue, motifLedger, notifications, version, providerRegistry, manuscriptImport, sourceGeneration, series, seriesImport, helper, findReplace },
    ...
  );
```

Update it to include `savedPrompts` at the end:

```typescript
  registerIpcHandlers(
    { settings, agents, db, fs, chat, audit, pipeline, build, usage, revisionQueue, motifLedger, notifications, version, providerRegistry, manuscriptImport, sourceGeneration, series, seriesImport, helper, findReplace, savedPrompts },
    ...
  );
```

---

## Architecture Compliance

- [x] Domain files import from nothing
- [x] Infrastructure imports only from domain + external packages
- [x] Application imports only from domain interfaces — N/A this session
- [x] IPC handlers are one-liner delegations — each `savedPrompts:*` handler is a single expression
- [x] Renderer accesses backend only through `window.novelEngine`
- [x] All new IPC channels are namespaced (`savedPrompts:action`)
- [x] All async operations have error handling (service handles errors; IPC propagates rejections)
- [x] No `any` types

---

## Verification

1. `npx tsc --noEmit` passes with zero errors.
2. `savedPrompts:list` appears in both `handlers.ts` and `preload/index.ts`.
3. `SavedPromptService` is imported and instantiated in `main/index.ts`.
4. `savedPrompts` is present in the `registerIpcHandlers` call in `main/index.ts`.

---

## State Update

After completing this session, update `prompts/feature/saved-prompt-library/STATE.md`:
- Set SESSION-02 status to `done`
- Set Completed date to today
- Add notes about any decisions or complications
- Update Handoff Notes for SESSION-03
