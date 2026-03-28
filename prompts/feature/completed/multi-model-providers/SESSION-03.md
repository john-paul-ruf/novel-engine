# SESSION-03 — ProviderRegistry Infrastructure

> **Feature:** multi-model-providers
> **Layer(s):** Infrastructure
> **Depends on:** SESSION-02
> **Estimated effort:** 25 min

---

## Context

SESSION-01 defined the `IProviderRegistry` interface. SESSION-02 made `ClaudeCodeClient` implement `IModelProvider`. This session builds the concrete `ProviderRegistry` class that manages all registered providers, routes model requests to the correct provider, and persists provider configurations.

The registry is the central hub for multi-model support. When a service calls `registry.sendMessage({ model: 'gpt-4o', ... })`, the registry looks up which provider owns `gpt-4o` and delegates the call. It also handles provider CRUD (add, update, remove) and persists configs back to settings.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/infrastructure/providers/ProviderRegistry.ts` | Create | Implements `IProviderRegistry` — provider registration, model routing, config CRUD |
| `src/infrastructure/providers/index.ts` | Create | Barrel export |

---

## Implementation

### 1. Create ProviderRegistry

Create `src/infrastructure/providers/ProviderRegistry.ts`:

```typescript
import type {
  IModelProvider,
  IProviderRegistry,
  ISettingsService,
} from '@domain/interfaces';
import type {
  MessageRole,
  ModelInfo,
  ProviderConfig,
  ProviderId,
  ProviderStatus,
  StreamEvent,
} from '@domain/types';

/**
 * Central registry for all model providers.
 *
 * Manages provider instances and their configurations. Routes model requests
 * to the correct provider based on model ID. Persists configuration changes
 * back to settings.
 */
export class ProviderRegistry implements IProviderRegistry {
  /** Provider instances keyed by their providerId. */
  private providers = new Map<ProviderId, IModelProvider>();

  /** Provider configs keyed by providerId. Source of truth for UI and persistence. */
  private configs = new Map<ProviderId, ProviderConfig>();

  /** Reverse index: model ID -> providerId. Rebuilt on every registration/config change. */
  private modelIndex = new Map<string, ProviderId>();

  /** The ID of the default (fallback) provider. */
  private defaultProviderId: ProviderId | null = null;

  constructor(private settings: ISettingsService) {}

  registerProvider(provider: IModelProvider, config: ProviderConfig): void {
    this.providers.set(provider.providerId, provider);
    this.configs.set(provider.providerId, config);

    // First registered provider becomes the default if none is set
    if (!this.defaultProviderId) {
      this.defaultProviderId = provider.providerId;
    }

    this.rebuildModelIndex();
  }

  removeProvider(providerId: ProviderId): void {
    const config = this.configs.get(providerId);
    if (config?.isBuiltIn) return;

    this.providers.delete(providerId);
    this.configs.delete(providerId);
    this.rebuildModelIndex();
    this.persistConfigs();
  }

  getProvider(providerId: ProviderId): IModelProvider | null {
    return this.providers.get(providerId) ?? null;
  }

  getDefaultProvider(): IModelProvider {
    if (this.defaultProviderId) {
      const provider = this.providers.get(this.defaultProviderId);
      if (provider) return provider;
    }
    const first = this.providers.values().next();
    if (first.done) {
      throw new Error('No model providers registered. At least Claude CLI must be available.');
    }
    return first.value;
  }

  getProviderForModel(modelId: string): IModelProvider | null {
    const providerId = this.modelIndex.get(modelId);
    if (!providerId) return null;
    return this.providers.get(providerId) ?? null;
  }

  listProviders(): ProviderConfig[] {
    return Array.from(this.configs.values());
  }

  listAllModels(): ModelInfo[] {
    const models: ModelInfo[] = [];
    for (const config of this.configs.values()) {
      if (!config.enabled) continue;
      models.push(...config.models);
    }
    return models;
  }

  async checkProviderStatus(providerId: ProviderId): Promise<ProviderStatus> {
    const provider = this.providers.get(providerId);
    if (!provider) return 'unavailable';
    try {
      const available = await provider.isAvailable();
      return available ? 'available' : 'unavailable';
    } catch {
      return 'error';
    }
  }

  getProviderConfig(providerId: ProviderId): ProviderConfig | null {
    return this.configs.get(providerId) ?? null;
  }

  updateProviderConfig(providerId: ProviderId, partial: Partial<ProviderConfig>): void {
    const existing = this.configs.get(providerId);
    if (!existing) return;

    const updated: ProviderConfig = {
      ...existing,
      ...partial,
      id: existing.id,
      type: existing.type,
      isBuiltIn: existing.isBuiltIn,
    };

    this.configs.set(providerId, updated);
    this.rebuildModelIndex();
    this.persistConfigs();
  }

  setDefaultProvider(providerId: ProviderId): void {
    if (!this.providers.has(providerId)) return;
    this.defaultProviderId = providerId;
  }

  // === Convenience delegates ===

  async sendMessage(params: {
    model: string;
    systemPrompt: string;
    messages: { role: MessageRole; content: string }[];
    maxTokens: number;
    thinkingBudget?: number;
    maxTurns?: number;
    bookSlug?: string;
    workingDir?: string;
    sessionId?: string;
    conversationId?: string;
    onEvent: (event: StreamEvent) => void;
  }): Promise<void> {
    const provider = this.getProviderForModel(params.model);
    if (!provider) {
      const defaultProvider = this.getDefaultProvider();
      return defaultProvider.sendMessage(params);
    }
    return provider.sendMessage(params);
  }

  abortStream(conversationId: string): void {
    for (const provider of this.providers.values()) {
      provider.abortStream(conversationId);
    }
  }

  hasActiveProcesses(): boolean {
    for (const provider of this.providers.values()) {
      if (provider.hasActiveProcesses()) return true;
    }
    return false;
  }

  hasActiveProcessesForBook(bookSlug: string): boolean {
    for (const provider of this.providers.values()) {
      if (provider.hasActiveProcessesForBook(bookSlug)) return true;
    }
    return false;
  }

  // === Internal ===

  private rebuildModelIndex(): void {
    this.modelIndex.clear();
    for (const config of this.configs.values()) {
      if (!config.enabled) continue;
      for (const model of config.models) {
        this.modelIndex.set(model.id, config.id);
      }
    }
  }

  private persistConfigs(): void {
    const configs = Array.from(this.configs.values());
    this.settings.update({ providers: configs }).catch((err) => {
      console.error('[ProviderRegistry] Failed to persist provider configs:', err);
    });
  }
}
```

### 2. Create Barrel Export

Create `src/infrastructure/providers/index.ts`:

```typescript
export { ProviderRegistry } from './ProviderRegistry';
```

---

## Architecture Compliance

- [x] Domain files import from nothing
- [x] Infrastructure imports only from domain + external packages
- [x] No cross-infrastructure imports (ProviderRegistry does not import from `claude-cli/`)
- [x] Application imports only from domain interfaces (not affected)
- [x] IPC handlers are one-liner delegations (not affected)
- [x] No `any` types
- [x] All async operations have error handling

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `ProviderRegistry` implements all methods declared in `IProviderRegistry`
3. `registerProvider` + `getProviderForModel` correctly routes by model ID
4. `removeProvider` is a no-op for built-in providers
5. `listAllModels` only returns models from enabled providers
6. `sendMessage` falls back to default provider for unrecognized models
7. `abortStream` tries all providers (safe — abortStream is idempotent)

---

## State Update

After completing this session, update `prompts/feature/multi-model-providers/STATE.md`:
- Set SESSION-03 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
