# SESSION-01 — Domain Types & Constants for Codex CLI Provider

> **Program:** Novel Engine
> **Feature:** codex-cli-support
> **Modules:** M01 (domain)
> **Depends on:** none
> **Estimated effort:** 10 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M01 | domain | `src/domain/types.ts`, `src/domain/constants.ts` | Adding provider type, ID, config, and settings field |

## Context

The multi-provider architecture already supports `ProviderType = 'claude-cli' | 'ollama-cli' | 'llama-server' | 'opencode-cli' | 'openai-compatible'`. We need to add `'codex-cli'` to this union and register the built-in provider config with default models.

The `AppSettings` type already has `hasClaudeCli` and `hasOllamaCli` booleans — we add `hasCodexCli`.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/domain/types.ts` | Modify | Add `'codex-cli'` to `ProviderType` union; add `hasCodexCli` to `AppSettings` |
| `src/domain/constants.ts` | Modify | Add `CODEX_CLI_PROVIDER_ID`, add Codex entry to `BUILT_IN_PROVIDER_CONFIGS`, add `hasCodexCli: false` to `DEFAULT_SETTINGS` |

## Implementation

### 1. Add `'codex-cli'` to `ProviderType`

Read `src/domain/types.ts`. Find the `ProviderType` union (line ~296):

```typescript
export type ProviderType = 'claude-cli' | 'ollama-cli' | 'llama-server' | 'opencode-cli' | 'openai-compatible';
```

Add `'codex-cli'`:

```typescript
export type ProviderType = 'claude-cli' | 'codex-cli' | 'ollama-cli' | 'llama-server' | 'opencode-cli' | 'openai-compatible';
```

### 2. Add `hasCodexCli` to `AppSettings`

In the same file, find the `AppSettings` type. After the `hasOllamaCli` field, add:

```typescript
hasCodexCli: boolean;    // true if `codex` CLI is detected and authenticated
```

### 3. Add `CODEX_CLI_PROVIDER_ID` constant

Read `src/domain/constants.ts`. After the `LLAMA_SERVER_PROVIDER_ID` declaration (line ~140), add:

```typescript
/** Built-in Codex CLI provider ID. Always present if CLI is detected. */
export const CODEX_CLI_PROVIDER_ID: ProviderId = 'codex-cli';
```

### 4. Add Codex to `BUILT_IN_PROVIDER_CONFIGS`

After the llama-server config entry (ends around line ~192), add a new entry:

```typescript
{
  id: CODEX_CLI_PROVIDER_ID,
  type: 'codex-cli',
  name: 'Codex CLI',
  enabled: false, // enabled dynamically when CLI is detected
  isBuiltIn: true,
  models: [], // populated at runtime from ~/.codex/models_cache.json
  capabilities: ['text-completion', 'tool-use', 'thinking', 'streaming'],
},
```

### 5. Add `hasCodexCli: false` to `DEFAULT_SETTINGS`

In `DEFAULT_SETTINGS`, after `hasOllamaCli: false`, add:

```typescript
hasCodexCli: false,
```

## Verification

```bash
npx tsc --noEmit
```

Confirm no type errors. The new constant is exported from `src/domain/constants.ts` and the type change propagates cleanly.

## State Update

Set SESSION-01 status to `done`. Note: domain layer updated, no runtime behavior change yet.
