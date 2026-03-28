# SESSION-01 — Domain Types & Interfaces for Provider Abstraction

> **Feature:** multi-model-providers
> **Layer(s):** Domain
> **Depends on:** Nothing
> **Estimated effort:** 25 min

---

## Context

Novel Engine currently hard-codes Claude CLI as its only AI backend. The `IClaudeClient` interface is wired directly into 6+ application services. The `AVAILABLE_MODELS` constant lists only Claude models. This session establishes the domain-layer foundation for a pluggable provider architecture that supports Claude CLI (primary), OpenAI-compatible APIs (BYOK, self-hosted), and future CLI backends (OpenCode CLI).

No code changes outside `src/domain/` in this session — we're defining the types, interfaces, and constants that every other layer will depend on.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/domain/types.ts` | Modify | Add provider-related types: `ProviderId`, `ProviderType`, `ProviderCapability`, `ProviderConfig`, `ModelInfo`, `ProviderStatus`. Update `AppSettings` with provider fields. |
| `src/domain/interfaces.ts` | Modify | Add `IModelProvider` interface (abstracted from `IClaudeClient`), add `IProviderRegistry` interface, mark `IClaudeClient` as deprecated alias |
| `src/domain/constants.ts` | Modify | Add `DEFAULT_PROVIDER_CONFIGS`, `CLAUDE_CLI_PROVIDER_ID`, refactor `AVAILABLE_MODELS` to add deprecation |

---

## Implementation

### 1. Add Provider Types to `types.ts`

Read `src/domain/types.ts`. Add the following types after the `// === Settings ===` section (before `AppSettings`):

```typescript
// === Model Providers ===

/** Unique identifier for a provider instance. Stable across sessions. */
export type ProviderId = string;

/** The implementation strategy for a provider. Determines which infrastructure class is instantiated. */
export type ProviderType = 'claude-cli' | 'opencode-cli' | 'openai-compatible';

/** Capabilities a provider may support. Used to gate features in the UI and services. */
export type ProviderCapability =
  | 'text-completion'   // basic chat — all providers
  | 'tool-use'          // can read/write files via agent loop — CLI providers only
  | 'thinking'          // extended thinking / reasoning traces
  | 'streaming';        // real-time token streaming

/** Runtime status of a provider — checked on app startup and on demand. */
export type ProviderStatus = 'available' | 'unavailable' | 'unchecked' | 'error';

/** Stored configuration for a single provider instance. Persisted in settings.json. */
export type ProviderConfig = {
  id: ProviderId;
  type: ProviderType;
  name: string;                          // user-facing display name
  enabled: boolean;
  isBuiltIn: boolean;                    // true for Claude CLI (cannot be deleted)
  apiKey?: string;                       // for BYOK providers (stored in settings)
  baseUrl?: string;                      // custom endpoint for self-hosted / proxied
  models: ModelInfo[];                   // models available through this provider
  defaultModel?: string;                 // preferred model ID from this provider
  capabilities: ProviderCapability[];
};

/** Describes a single model available through a provider. */
export type ModelInfo = {
  id: string;                            // e.g. 'claude-opus-4-20250514', 'gpt-4o'
  label: string;                         // display name
  description: string;
  providerId: ProviderId;                // which provider offers this model
  contextWindow?: number;                // max tokens (informational)
  supportsThinking?: boolean;            // whether extended thinking is available
  supportsToolUse?: boolean;             // whether agent-loop tool use works
};
```

### 2. Update `AppSettings` in `types.ts`

In the `AppSettings` type, add two new fields at the end. Keep all existing fields unchanged for backward compatibility:

```typescript
export type AppSettings = {
  hasClaudeCli: boolean;
  model: string;
  maxTokens: number;
  enableThinking: boolean;
  thinkingBudget: number;
  overrideThinkingBudget: boolean;
  autoCollapseThinking: boolean;
  enableNotifications: boolean;
  theme: 'light' | 'dark' | 'system';
  initialized: boolean;
  authorName: string;
  // Multi-provider configuration
  providers: ProviderConfig[];           // all configured providers (persisted)
  activeProviderId: ProviderId;          // which provider is currently selected
};
```

### 3. Add `IModelProvider` Interface to `interfaces.ts`

Read `src/domain/interfaces.ts`. Add these types to the existing import block from `'./types'`:

```
ProviderCapability, ProviderConfig, ProviderId, ProviderStatus, ModelInfo
```

Add the `IModelProvider` interface after the existing `IClaudeClient` interface:

```typescript
/**
 * A model provider that can send messages and stream responses.
 *
 * This is the core abstraction for all AI backends. Claude CLI, OpenCode CLI,
 * and OpenAI-compatible API providers all implement this interface.
 *
 * Providers declare their capabilities (tool-use, thinking, streaming) so
 * services can adapt their behavior based on what the backend supports.
 */
export interface IModelProvider {
  /** Stable identifier matching the ProviderConfig.id this provider was created from. */
  readonly providerId: ProviderId;

  /** What this provider can do. Checked by services to gate features. */
  readonly capabilities: ProviderCapability[];

  /**
   * Send a message and stream the response via onEvent callbacks.
   * The provider translates its native streaming format into StreamEvent.
   */
  sendMessage(params: {
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
  }): Promise<void>;

  /** Kill an active stream for the given conversation. No-op if nothing is active. */
  abortStream(conversationId: string): void;

  /** Check if this provider's backend is reachable and authenticated. */
  isAvailable(): Promise<boolean>;

  /** Force re-check on next isAvailable() call. */
  invalidateAvailabilityCache(): void;

  /** Whether this provider has any active (in-flight) requests. */
  hasActiveProcesses(): boolean;

  /** Whether this provider has active requests for a specific book. */
  hasActiveProcessesForBook(bookSlug: string): boolean;
}
```

### 4. Add `IProviderRegistry` Interface to `interfaces.ts`

Add directly after `IModelProvider`:

```typescript
/**
 * Registry that manages all configured model providers.
 *
 * Acts as a router — services call it with a model ID, and it resolves
 * which provider handles that model. Also provides CRUD for provider configs.
 */
export interface IProviderRegistry {
  /** Register a provider instance. Called during app initialization. */
  registerProvider(provider: IModelProvider, config: ProviderConfig): void;

  /** Remove a provider. No-op for built-in providers. */
  removeProvider(providerId: ProviderId): void;

  /** Get a specific provider by ID. Returns null if not registered. */
  getProvider(providerId: ProviderId): IModelProvider | null;

  /** Get the provider designated as default (Claude CLI initially). */
  getDefaultProvider(): IModelProvider;

  /** Resolve which provider handles a given model ID. Returns null if no provider claims it. */
  getProviderForModel(modelId: string): IModelProvider | null;

  /** List all registered provider configs. */
  listProviders(): ProviderConfig[];

  /** List all models from all enabled providers. */
  listAllModels(): ModelInfo[];

  /** Check availability of a specific provider. */
  checkProviderStatus(providerId: ProviderId): Promise<ProviderStatus>;

  /** Get the current config for a provider. */
  getProviderConfig(providerId: ProviderId): ProviderConfig | null;

  /** Update a provider's config (e.g. API key, base URL, enabled state, model list). */
  updateProviderConfig(providerId: ProviderId, partial: Partial<ProviderConfig>): void;

  // === Convenience delegates (route to the appropriate provider) ===

  /** Send a message using whichever provider owns the specified model. */
  sendMessage(params: {
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
  }): Promise<void>;

  /** Abort a stream — checks all providers since the caller may not know which is active. */
  abortStream(conversationId: string): void;

  /** Whether any provider has active requests. */
  hasActiveProcesses(): boolean;

  /** Whether any provider has active requests for a specific book. */
  hasActiveProcessesForBook(bookSlug: string): boolean;
}
```

### 5. Deprecate `IClaudeClient` in `interfaces.ts`

Add a deprecation JSDoc comment to the existing `IClaudeClient` interface. Do **not** remove it — other layers still depend on it until SESSION-05 migrates them.

```typescript
/**
 * @deprecated Use `IModelProvider` for the provider interface or `IProviderRegistry`
 * for routed access to all providers. This interface is retained during the
 * multi-model migration. ClaudeCodeClient implements both IClaudeClient and
 * IModelProvider (they have the same method signatures). Will be removed
 * after all services migrate to IProviderRegistry.
 */
export interface IClaudeClient {
  // ... keep all existing methods exactly as they are ...
}
```

### 6. Update Constants in `constants.ts`

Read `src/domain/constants.ts`. Add the new provider imports and constants.

Add to the import statement:

```typescript
import type { ProviderId, ProviderConfig, ModelInfo } from './types';
```

Add after the existing `AVAILABLE_MODELS`:

```typescript
/** The built-in Claude CLI provider ID. Always present, cannot be removed. */
export const CLAUDE_CLI_PROVIDER_ID: ProviderId = 'claude-cli';

/** Reserved provider ID for OpenCode CLI (future implementation). */
export const OPENCODE_CLI_PROVIDER_ID: ProviderId = 'opencode-cli';

/** Default provider configurations shipped with the app. */
export const BUILT_IN_PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    id: CLAUDE_CLI_PROVIDER_ID,
    type: 'claude-cli',
    name: 'Claude CLI',
    enabled: true,
    isBuiltIn: true,
    models: [
      {
        id: 'claude-opus-4-20250514',
        label: 'Claude Opus 4',
        description: 'Best quality — recommended for all agents',
        providerId: CLAUDE_CLI_PROVIDER_ID,
        contextWindow: 200_000,
        supportsThinking: true,
        supportsToolUse: true,
      },
      {
        id: 'claude-sonnet-4-20250514',
        label: 'Claude Sonnet 4',
        description: 'Faster and cheaper — good for copy editing',
        providerId: CLAUDE_CLI_PROVIDER_ID,
        contextWindow: 200_000,
        supportsThinking: true,
        supportsToolUse: true,
      },
    ],
    defaultModel: 'claude-opus-4-20250514',
    capabilities: ['text-completion', 'tool-use', 'thinking', 'streaming'],
  },
];
```

Add a deprecation comment to the existing `AVAILABLE_MODELS`:

```typescript
/**
 * @deprecated Use `BUILT_IN_PROVIDER_CONFIGS[0].models` or
 * `IProviderRegistry.listAllModels()` instead. Retained for backward
 * compatibility until the renderer SettingsView is updated.
 */
export const AVAILABLE_MODELS = [
  // ... keep existing content unchanged ...
] as const;
```

Update `DEFAULT_SETTINGS` to include the new fields:

```typescript
export const DEFAULT_SETTINGS: AppSettings = {
  hasClaudeCli: false,
  model: 'claude-sonnet-4-20250514',
  maxTokens: 8192,
  enableThinking: false,
  thinkingBudget: 5000,
  overrideThinkingBudget: false,
  autoCollapseThinking: true,
  enableNotifications: true,
  theme: 'dark',
  initialized: false,
  authorName: '',
  providers: BUILT_IN_PROVIDER_CONFIGS,
  activeProviderId: CLAUDE_CLI_PROVIDER_ID,
};
```

---

## Architecture Compliance

- [x] Domain files import from nothing (new types are pure declarations)
- [x] Infrastructure imports only from domain + external packages (N/A this session)
- [x] Application imports only from domain interfaces (N/A this session)
- [x] IPC handlers are one-liner delegations (N/A this session)
- [x] Renderer accesses backend only through `window.novelEngine` (N/A this session)
- [x] All new IPC channels are namespaced (N/A this session)
- [x] No `any` types
- [x] `IClaudeClient` retained for backward compat — not removed yet

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. All new types (`ProviderId`, `ProviderType`, `ProviderCapability`, `ProviderConfig`, `ModelInfo`, `ProviderStatus`) are exported from `src/domain/types.ts`
3. `IModelProvider` and `IProviderRegistry` are exported from `src/domain/interfaces.ts`
4. `CLAUDE_CLI_PROVIDER_ID`, `BUILT_IN_PROVIDER_CONFIGS` are exported from `src/domain/constants.ts`
5. `DEFAULT_SETTINGS` includes `providers` and `activeProviderId` fields
6. `IClaudeClient` still exists (not removed) with a deprecation comment
7. Existing `AVAILABLE_MODELS` still exists with deprecation comment

---

## State Update

After completing this session, update `prompts/feature/multi-model-providers/STATE.md`:
- Set SESSION-01 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
