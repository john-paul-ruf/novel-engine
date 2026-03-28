# SESSION-05 — Service Migration to IProviderRegistry

> **Feature:** multi-model-providers
> **Layer(s):** Application, Main
> **Depends on:** SESSION-03, SESSION-04
> **Estimated effort:** 30 min

---

## Context

Sessions 01-04 built the domain types, the ProviderRegistry, the OpenAiCompatibleProvider, and adapted ClaudeCodeClient to implement IModelProvider. The infrastructure is ready.

This session performs the core migration: all application services that currently depend on IClaudeClient switch to IProviderRegistry. The composition root (src/main/index.ts) is rewired to instantiate the ProviderRegistry, register providers, and inject the registry into services.

This is the most impactful session. It touches many files but each change is mechanical: replace IClaudeClient with IProviderRegistry in constructor signatures and update call sites.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/application/ChatService.ts` | Modify | Replace `IClaudeClient` with `IProviderRegistry` |
| `src/application/HotTakeService.ts` | Modify | Replace `IClaudeClient` with `IProviderRegistry` |
| `src/application/PitchRoomService.ts` | Modify | Replace `IClaudeClient` with `IProviderRegistry` |
| `src/application/AdhocRevisionService.ts` | Modify | Replace `IClaudeClient` with `IProviderRegistry` |
| `src/application/AuditService.ts` | Modify | Replace `IClaudeClient` with `IProviderRegistry` |
| `src/application/RevisionQueueService.ts` | Modify | Replace `IClaudeClient` with `IProviderRegistry` |
| `src/main/index.ts` | Modify | Instantiate ProviderRegistry, register providers, inject into services |

---

## Implementation

### 1. Migration Pattern

Every service that currently has:

```typescript
import type { IClaudeClient } from '@domain/interfaces';
// ...
constructor(private claude: IClaudeClient) {}
```

Changes to:

```typescript
import type { IProviderRegistry } from '@domain/interfaces';
// ...
constructor(private providers: IProviderRegistry) {}
```

Call site mapping:
- `this.claude.sendMessage(...)` -> `this.providers.sendMessage(...)`
- `this.claude.abortStream(...)` -> `this.providers.abortStream(...)`
- `this.claude.isAvailable()` -> `this.providers.getDefaultProvider().isAvailable()`
- `this.claude.hasActiveProcesses()` -> `this.providers.hasActiveProcesses()`
- `this.claude.hasActiveProcessesForBook(...)` -> `this.providers.hasActiveProcessesForBook(...)`

### 2. Migrate ChatService

Read `src/application/ChatService.ts`. Replace `IClaudeClient` import with `IProviderRegistry`. In the constructor, replace `private claude: IClaudeClient` with `private providers: IProviderRegistry`. Update all `this.claude.*` calls per the mapping above.

### 3. Migrate HotTakeService

Read `src/application/HotTakeService.ts`. Same pattern as ChatService.

### 4. Migrate PitchRoomService

Read `src/application/PitchRoomService.ts`. Same migration pattern.

### 5. Migrate AdhocRevisionService

Read `src/application/AdhocRevisionService.ts`. Same migration pattern.

### 6. Migrate AuditService

Read `src/application/AuditService.ts`. Same migration pattern.

### 7. Migrate RevisionQueueService

Read `src/application/RevisionQueueService.ts`. Same migration pattern.

### 8. Rewire the Composition Root

Read `src/main/index.ts`.

Add imports:
```typescript
import { ProviderRegistry, OpenAiCompatibleProvider } from '@infra/providers';
import { BUILT_IN_PROVIDER_CONFIGS } from '@domain/constants';
```

After instantiating infrastructure (step 3), add provider registry setup:

```typescript
// 3b. Initialize provider registry
const providerRegistry = new ProviderRegistry(settings);

// Register the built-in Claude CLI provider
const appSettings = await settings.load();
const claudeConfig = appSettings.providers.find(p => p.id === 'claude-cli');
providerRegistry.registerProvider(
  claudeClient,
  claudeConfig ?? BUILT_IN_PROVIDER_CONFIGS[0],
);

// Initialize user-configured providers from settings
for (const config of appSettings.providers) {
  if (config.id === 'claude-cli') continue;
  if (!config.enabled) continue;

  if (config.type === 'openai-compatible') {
    const provider = new OpenAiCompatibleProvider(
      config.id,
      config.baseUrl ?? 'http://localhost:11434',
      config.apiKey ?? '',
      config.capabilities,
    );
    providerRegistry.registerProvider(provider, config);
  }
}

providerRegistry.setDefaultProvider(appSettings.activeProviderId);
```

Update service instantiation (step 4) — replace `claudeClient` with `providerRegistry` in every service constructor. Read each service to confirm the exact parameter position:

```typescript
const audit = new AuditService(settings, agents, providerRegistry, db, fs, usage);
const pitchRoom = new PitchRoomService(agents, providerRegistry, db, fs, streamManager);
const hotTake = new HotTakeService(agents, providerRegistry, db, fs, streamManager);
const adhocRevision = new AdhocRevisionService(agents, audit, providerRegistry, db, fs, streamManager);
const chat = new ChatService(settings, agents, db, providerRegistry, fs, chapterValidator, pitchRoom, hotTake, adhocRevision, streamManager);
const revisionQueue = new RevisionQueueService(fs, providerRegistry, agents, db, settings);
```

Note: the exact parameter order must match each service's constructor. Read the file first.

---

## Architecture Compliance

- [x] Domain files import from nothing
- [x] Infrastructure imports only from domain + external packages
- [x] Application imports only from domain interfaces (IProviderRegistry, not ProviderRegistry)
- [x] IPC handlers are one-liner delegations
- [x] Renderer accesses backend only through window.novelEngine
- [x] No any types
- [x] All async operations have error handling
- [x] Services depend on IProviderRegistry interface, not concrete ProviderRegistry

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. No service imports `IClaudeClient` (all use `IProviderRegistry`)
3. `src/main/index.ts` instantiates `ProviderRegistry` and registers `ClaudeCodeClient`
4. User-configured OpenAI-compatible providers are initialized from settings
5. All existing chat, revision, audit, and build flows still work (behavioral parity)

---

## State Update

After completing this session, update `prompts/feature/multi-model-providers/STATE.md`:
- Set SESSION-05 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
