# SESSION-07 — Renderer: Provider Settings UI and Model Selection

> **Feature:** multi-model-providers
> **Layer(s):** Renderer
> **Depends on:** SESSION-06
> **Estimated effort:** 30 min

---

## Context

Sessions 01-06 built the full backend: domain types, provider infrastructure, service migration, and IPC wiring. The renderer can now call `window.novelEngine.providers.*` to manage providers and `window.novelEngine.models.getAvailable()` returns models from all enabled providers.

This session updates the renderer to add a Provider Management section to Settings, update Model Selection to show models grouped by provider, and add a providerStore for state management.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/stores/providerStore.ts` | Create | Zustand store for provider state management |
| `src/renderer/components/Settings/ProviderSection.tsx` | Create | Provider management UI: add, edit, remove, test providers |
| `src/renderer/components/Settings/SettingsView.tsx` | Modify | Add ProviderSection, update ModelSelectionSection for multi-provider |

---

## Implementation

### 1. Create Provider Store

Create `src/renderer/stores/providerStore.ts`:

```typescript
import { create } from 'zustand';
import type { ProviderConfig, ProviderId, ProviderStatus } from '@domain/types';

type ProviderState = {
  providers: ProviderConfig[];
  statuses: Record<ProviderId, ProviderStatus>;
  loading: boolean;
  load: () => Promise<void>;
  addProvider: (config: ProviderConfig) => Promise<void>;
  updateProvider: (providerId: ProviderId, partial: Partial<ProviderConfig>) => Promise<void>;
  removeProvider: (providerId: ProviderId) => Promise<void>;
  checkStatus: (providerId: ProviderId) => Promise<ProviderStatus>;
  setDefault: (providerId: ProviderId) => Promise<void>;
};

export const useProviderStore = create<ProviderState>((set, get) => ({
  providers: [],
  statuses: {},
  loading: false,

  load: async () => {
    set({ loading: true });
    try {
      const providers = await window.novelEngine.providers.list();
      set({ providers, loading: false });
    } catch (error) {
      console.error('Failed to load providers:', error);
      set({ loading: false });
    }
  },

  addProvider: async (config) => {
    await window.novelEngine.providers.add(config);
    await get().load();
  },

  updateProvider: async (providerId, partial) => {
    await window.novelEngine.providers.update(providerId, partial);
    await get().load();
  },

  removeProvider: async (providerId) => {
    await window.novelEngine.providers.remove(providerId);
    await get().load();
  },

  checkStatus: async (providerId) => {
    const status = await window.novelEngine.providers.checkStatus(providerId);
    set((s) => ({ statuses: { ...s.statuses, [providerId]: status } }));
    return status;
  },

  setDefault: async (providerId) => {
    await window.novelEngine.providers.setDefault(providerId);
    await get().load();
  },
}));
```

### 2. Create ProviderSection Component

Create `src/renderer/components/Settings/ProviderSection.tsx`.

This component renders:

**A. Provider list** showing each configured provider as a card with:
- Provider name and type badge ("Claude CLI", "OpenAI Compatible")
- Status indicator (green/red/gray dot)
- Model count
- "Test Connection" button
- "Edit"/"Remove" buttons (disabled for built-in)
- Enabled/disabled toggle

**B. "Add Provider" expandable form** with:
- Provider name (text input)
- Base URL (text input, placeholder "https://api.openai.com" or "http://localhost:11434")
- API Key (password input, optional for Ollama)
- Model list (textarea, one model ID per line)
- "Test & Add" button

Model entry generates ModelInfo objects:
```typescript
const models: ModelInfo[] = lines
  .filter(l => l.trim())
  .map(line => ({
    id: line.trim(),
    label: line.trim(),
    description: '',
    providerId: newId,
  }));
```

Use `nanoid` or `crypto.randomUUID()` for provider IDs (check what's available in the renderer context — `crypto.randomUUID()` works in modern Electron).

**Styling** follows existing SettingsView patterns:
- Cards: `rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-200/50 dark:bg-zinc-800/50 p-4`
- Status dots: `h-3 w-3 rounded-full` with `bg-green-500`/`bg-red-500`/`bg-zinc-400`
- Buttons match existing settings button styles
- Type badges: `rounded bg-zinc-200 dark:bg-zinc-700 px-2 py-0.5 text-xs`
- "Tool use" warning badges: `rounded bg-amber-500/20 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400`

Load providers on mount via `useEffect` calling `useProviderStore.getState().load()`.

### 3. Update SettingsView

Read `src/renderer/components/Settings/SettingsView.tsx`.

Import:
```typescript
import { ProviderSection } from './ProviderSection';
```

Add between ClaudeCliSection and ModelSelectionSection:
```tsx
<ClaudeCliSection />
<SectionDivider />
<ProviderSection />
<SectionDivider />
<ModelSelectionSection />
```

### 4. Update ModelSelectionSection

The existing `ModelSelectionSection` fetches models and renders a flat list. Update it to:

1. **Group models by provider** — use `providerId` from each `ModelInfo` to group
2. **Show provider name** as a subtle heading above each group
3. **Badge models without tool-use** — if `supportsToolUse` is false, show "Text only" badge
4. **Update activeProviderId** when selecting a model from a different provider — call `window.novelEngine.providers.setDefault(model.providerId)` alongside the model update

The grouped display uses the existing radio-button card pattern, with provider group headers:

```tsx
{Object.entries(groupedModels).map(([providerId, models]) => (
  <div key={providerId} className="space-y-2">
    <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
      {providerName}
    </h4>
    {models.map(model => (
      <button key={model.id} onClick={() => handleSelect(model)} ...>
        {/* existing model card content */}
        {!model.supportsToolUse && (
          <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">
            Text only
          </span>
        )}
      </button>
    ))}
  </div>
))}
```

---

## Architecture Compliance

- [x] Renderer accesses backend only through `window.novelEngine`
- [x] Store follows existing Zustand patterns
- [x] Uses `import type` for domain types (no value imports from domain except constants)
- [x] Tailwind utility classes only
- [x] No `any` types
- [x] useEffect cleanup for subscriptions (if any)

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Settings page shows "Model Providers" section
3. Claude CLI appears as built-in (cannot remove)
4. "Add Provider" form creates an OpenAI-compatible provider
5. "Test Connection" shows availability status
6. Model selection groups by provider
7. "Text only" badge appears for models without tool-use
8. Selecting a model from a different provider updates activeProviderId

---

## State Update

After completing this session, update `prompts/feature/multi-model-providers/STATE.md`:
- Set SESSION-07 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
