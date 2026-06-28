# State Tracker — Novel Engine / remove-model-hardcodes

## Program
**Novel Engine**

## Feature
**remove-model-hardcodes**

## Intent
Remove all hardcoded Claude model ID strings (`'claude-opus-4-20250514'`, `'claude-sonnet-4-20250514'`) from the codebase. Replace with derived constants or runtime-resolved values so the app works correctly regardless of which models are available in the active provider.

## Sessions
3 sessions across domain, application, and renderer layers.

---

## Session Status

| # | Session | Modules | Status | Completed | Notes |
|---|---------|---------|--------|-----------|-------|
| 01 | Domain: Single Source of Truth for Model IDs | M01 | done | 2026-06-28 | Derived constants added; runtime values unchanged |
| 02 | Application Layer: Remove Runtime Model Hardcodes | M08 | pending | — | Depends on SESSION-01 |
| 03 | Renderer: Remove Hardcoded Model IDs from UI Components | M10 | pending | — | Depends on SESSION-01 |

---

## Dependency Graph

```
SESSION-01 (M01: constants)
  └─► SESSION-02 (M08: StatisticsService, RevisionQueueService)
  └─► SESSION-03 (M10: OnboardingWizard, SettingsView, cliActivityStore)
```

SESSION-02 and SESSION-03 both depend on SESSION-01 but are independent of each other and can run in either order.

---

## Architecture Reference

**Hardcode inventory (pre-fix):**

| Location | Hardcoded string | Category |
|----------|-----------------|----------|
| `src/domain/constants.ts:385` | `HOT_TAKE_MODEL = 'claude-opus-4-20250514'` | Constant definition |
| `src/domain/constants.ts:432` | `VERITY_AUDIT_MODEL = 'claude-sonnet-4-20250514'` | Constant definition |
| `src/domain/constants.ts:211` | `DEFAULT_SETTINGS.model = 'claude-sonnet-4-20250514'` | Default value |
| `src/application/StatisticsService.ts:78` | `MODEL_PRICING['claude-opus-4-20250514']` | Pricing lookup key |
| `src/application/RevisionQueueService.ts:641` | `'claude-sonnet-4-20250514'` | Model resolution |
| `src/renderer/components/Onboarding/OnboardingWizard.tsx:174` | `useState('claude-opus-4-20250514')` | Default UI state |
| `src/renderer/components/Onboarding/OnboardingWizard.tsx:213` | `model.id === 'claude-opus-4-20250514'` | Badge condition |
| `src/renderer/components/Onboarding/OnboardingWizard.tsx:387` | `useState('claude-opus-4-20250514')` | Default UI state |
| `src/renderer/components/Settings/SettingsView.tsx:81` | `?? 'claude-opus-4-20250514'` | Fallback |
| `src/renderer/components/Settings/SettingsView.tsx:145` | `model.id === 'claude-opus-4-20250514'` | Badge condition |
| `src/renderer/stores/cliActivityStore.ts:136` | `model.includes('sonnet')` → `'Sonnet 4'` | Label extraction |

**Not changed** (intentional model ID appearances):
- `src/domain/constants.ts` — `BUILT_IN_PROVIDER_CONFIGS` model list: this IS the source of truth, hardcodes here are correct
- `src/domain/constants.ts` — `AVAILABLE_MODELS`: already deprecated, retained for backward compat
- `src/domain/constants.ts` — `MODEL_PRICING` keys: pricing lookup table, correct to use model IDs as keys
- `src/domain/types.ts:324` — JSDoc example string, not executable code
- `src/application/RevisionQueueService.ts:40` — `model: 'opus' | 'sonnet'` type: logical tier designation from Wrangler, not a model ID
- `src/renderer/components/RevisionQueue/SessionCard.tsx:78,82` — comparing `session.model === 'sonnet'`: logical tier, not model ID
- `src/renderer/components/RevisionQueue/RevisionSessionPanel.tsx:113,117` — same as above

---

## Scope Summary

| Module ID | Module | Sessions | Impact |
|-----------|--------|----------|--------|
| M01 | domain/constants | S01 | New derived constants; 3 exports updated |
| M08 | application | S02 | 2 service files; no interface changes |
| M10 | renderer | S03 | 2 components + 1 store file |

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Derive `CLAUDE_CLI_PRIMARY_MODEL` / `CLAUDE_CLI_SECONDARY_MODEL` from `BUILT_IN_PROVIDER_CONFIGS[0]` | Single source of truth — changing the provider config automatically updates all derived constants |
| Keep `HOT_TAKE_MODEL` and `VERITY_AUDIT_MODEL` as exported aliases | Zero disruption to `AuditService` and `HotTakeService` importers; no cascading changes needed |
| Use `Object.values(MODEL_PRICING)[0]` in `StatisticsService` | Cost estimation is best-effort; avoids a specific model key while preserving the fallback behaviour |
| "Recommended" badge → `models[0]?.id === model.id` | The first model from `getAvailable()` is always the best-available model for the active provider |
| `getModelLabel` generic parser (strip date + vendor prefix, title-case) | Works for any provider's model IDs without hardcoded substring checks |
| `model: 'opus' \| 'sonnet'` type NOT changed | This is a logical tier designation from the Wrangler agent, not a model ID — semantically correct to remain |

---

## Handoff Notes

### SESSION-01 — 2026-06-28
Derived constants added. `CLAUDE_CLI_PRIMARY_MODEL` and `CLAUDE_CLI_SECONDARY_MODEL` inserted immediately after `BUILT_IN_PROVIDER_CONFIGS` closing bracket. `HOT_TAKE_MODEL`, `VERITY_AUDIT_MODEL`, and `DEFAULT_SETTINGS.model` now reference the derived constants. Runtime values unchanged — Opus 4 is primary, Sonnet 4 is secondary. `npx tsc --noEmit` passes clean. SESSION-02 and SESSION-03 can both proceed.
