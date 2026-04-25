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
      // Protect immutable fields
      id: existing.id,
      type: existing.type,
      isBuiltIn: existing.isBuiltIn,
    };

    this.configs.set(providerId, updated);
    this.rebuildModelIndex();
    this.persistConfigs();

    // If the baseUrl changed, notify the provider instance so it can
    // reconnect to the new endpoint without requiring an app restart.
    if (partial.baseUrl !== undefined && partial.baseUrl !== existing.baseUrl) {
      const provider = this.providers.get(providerId);
      if (provider && 'setBaseUrl' in provider && typeof (provider as { setBaseUrl: unknown }).setBaseUrl === 'function') {
        (provider as { setBaseUrl: (url: string) => void }).setBaseUrl(partial.baseUrl);
      }

      // For Ollama: auto-fetch models from the new endpoint so the user
      // doesn't need to restart the app after changing the host.
      if (existing.type === 'ollama-cli' && partial.baseUrl) {
        this.refreshOllamaModels(providerId, partial.baseUrl).catch((err) =>
          console.error('[ProviderRegistry] Failed to refresh Ollama models:', err),
        );
      }
    }
  }

  /**
   * Fetch models from an Ollama endpoint via /api/tags and update the
   * provider config's model list. Called when the Ollama base URL changes.
   */
  private async refreshOllamaModels(providerId: ProviderId, baseUrl: string): Promise<void> {
    const normalizedUrl = baseUrl.startsWith('http') ? baseUrl : `http://${baseUrl}`;
    try {
      const resp = await fetch(`${normalizedUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5_000),
      });
      if (!resp.ok) return;
      const data = await resp.json() as { models?: { name: string }[] };
      const models: ModelInfo[] = (data.models ?? []).map((m) => ({
        id: m.name,
        label: m.name.replace(/:latest$/, ''),
        description: `Ollama model — ${m.name}`,
        providerId,
        supportsThinking: false,
        supportsToolUse: false,
      }));

      if (models.length > 0) {
        const existing = this.configs.get(providerId);
        if (existing) {
          const updated: ProviderConfig = {
            ...existing,
            enabled: true,
            models,
            defaultModel: existing.defaultModel ?? models[0]?.id,
          };
          this.configs.set(providerId, updated);
          this.rebuildModelIndex();
          this.persistConfigs();
          console.log(`[ProviderRegistry] Refreshed Ollama models from ${normalizedUrl} — ${models.length} models`);
        }
      }
    } catch (err) {
      console.warn(`[ProviderRegistry] Could not fetch Ollama models from ${normalizedUrl}:`, err);
    }
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

    // Register user-added providers first, then built-in providers.
    // This way, built-in providers (which have richer capabilities like
    // tool-use) always win when a model ID exists in multiple providers.
    const sorted = Array.from(this.configs.values()).sort((a, b) => {
      if (a.isBuiltIn && !b.isBuiltIn) return 1;  // built-in comes last (overwrites)
      if (!a.isBuiltIn && b.isBuiltIn) return -1;
      return 0;
    });

    for (const config of sorted) {
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
