# SESSION-06 — IPC Channels and Preload Bridge for Provider Management

> **Feature:** multi-model-providers
> **Layer(s):** IPC, Main, Preload
> **Depends on:** SESSION-05
> **Estimated effort:** 20 min

---

## Context

SESSION-05 wired the ProviderRegistry into all application services and the composition root. The backend can now manage multiple providers. This session exposes provider management to the renderer through IPC channels and the preload bridge.

New IPC channels allow the renderer to list providers, add/update/remove them, test connectivity, list models from all providers, and change the active provider.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/main/ipc/handlers.ts` | Modify | Add `providers:*` IPC handlers, update `models:getAvailable` to use registry |
| `src/preload/index.ts` | Modify | Add `providers` namespace to the bridge API |
| `src/main/index.ts` | Modify | Pass `providerRegistry` to `registerIpcHandlers` |

---

## Implementation

### 1. Update IPC Handler Registration

Read `src/main/ipc/handlers.ts`.

Add `IProviderRegistry` to the imports from `@domain/interfaces`. Add `ProviderConfig, ProviderId, ProviderStatus, ModelInfo` to the type imports from `@domain/types`.

Add `providerRegistry: IProviderRegistry` to the `services` parameter type.

Add provider IPC handlers (one-liner delegations):

```typescript
// === Providers ===

ipcMain.handle('providers:list', () =>
  services.providerRegistry.listProviders()
);

ipcMain.handle('providers:getConfig', (_, providerId: ProviderId) =>
  services.providerRegistry.getProviderConfig(providerId)
);

ipcMain.handle('providers:add', async (_, config: ProviderConfig) => {
  if (config.type === 'openai-compatible') {
    const { OpenAiCompatibleProvider } = await import('@infra/providers');
    const provider = new OpenAiCompatibleProvider(
      config.id, config.baseUrl ?? '', config.apiKey ?? '', config.capabilities,
    );
    services.providerRegistry.registerProvider(provider, config);
  }
});

ipcMain.handle('providers:update', (_, providerId: ProviderId, partial: Partial<ProviderConfig>) =>
  services.providerRegistry.updateProviderConfig(providerId, partial)
);

ipcMain.handle('providers:remove', (_, providerId: ProviderId) =>
  services.providerRegistry.removeProvider(providerId)
);

ipcMain.handle('providers:checkStatus', (_, providerId: ProviderId) =>
  services.providerRegistry.checkProviderStatus(providerId)
);

ipcMain.handle('providers:setDefault', async (_, providerId: ProviderId) => {
  // setDefaultProvider is on the concrete class, not the interface
  // Cast is needed here — this is the composition boundary
  const registry = services.providerRegistry as { setDefaultProvider?: (id: string) => void };
  registry.setDefaultProvider?.(providerId);
  await services.settings.update({ activeProviderId: providerId });
});
```

Update the existing `models:getAvailable` handler to use the registry:

```typescript
ipcMain.handle('models:getAvailable', () =>
  services.providerRegistry.listAllModels()
);
```

### 2. Update Preload Bridge

Read `src/preload/index.ts`.

Add type imports: `ModelInfo, ProviderConfig, ProviderId, ProviderStatus`.

Add `providers` namespace to the `api` object:

```typescript
// Providers
providers: {
  list: (): Promise<ProviderConfig[]> => ipcRenderer.invoke('providers:list'),
  getConfig: (providerId: ProviderId): Promise<ProviderConfig | null> =>
    ipcRenderer.invoke('providers:getConfig', providerId),
  add: (config: ProviderConfig): Promise<void> => ipcRenderer.invoke('providers:add', config),
  update: (providerId: ProviderId, partial: Partial<ProviderConfig>): Promise<void> =>
    ipcRenderer.invoke('providers:update', providerId, partial),
  remove: (providerId: ProviderId): Promise<void> => ipcRenderer.invoke('providers:remove', providerId),
  checkStatus: (providerId: ProviderId): Promise<ProviderStatus> =>
    ipcRenderer.invoke('providers:checkStatus', providerId),
  setDefault: (providerId: ProviderId): Promise<void> =>
    ipcRenderer.invoke('providers:setDefault', providerId),
},
```

Update the existing `models` namespace return type to use `ModelInfo[]`.

### 3. Update Composition Root

Read `src/main/index.ts`. Add `providerRegistry` to the services object in the `registerIpcHandlers` call:

```typescript
registerIpcHandlers(
  { settings, agents, db, fs, chat, audit, pipeline, build, usage,
    revisionQueue, motifLedger, notifications, version, providerRegistry },
  { userDataPath, booksDir },
  { onActiveBookChanged: (slug: string) => { bookWatcher?.watch(slug); } },
);
```

---

## Architecture Compliance

- [x] Domain files import from nothing
- [x] Infrastructure imports only from domain + external packages
- [x] Application imports only from domain interfaces
- [x] IPC handlers are one-liner delegations (except providers:add mini-factory)
- [x] Renderer accesses backend only through window.novelEngine
- [x] All new IPC channels are namespaced (providers:*)
- [x] All async operations have error handling

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. All `providers:*` channels registered in handlers
3. Preload bridge exposes `window.novelEngine.providers.*` methods
4. `models:getAvailable` returns ModelInfo[] from all providers
5. `providerRegistry` passed to `registerIpcHandlers`

---

## State Update

After completing this session, update `prompts/feature/multi-model-providers/STATE.md`:
- Set SESSION-06 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
