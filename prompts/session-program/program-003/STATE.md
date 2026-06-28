# State Tracker — Novel Engine / claude-model-picker

## Program
Novel Engine

## Feature
`claude-model-picker` — Primary + Secondary Claude model selection in Settings

## Intent
Allow the user to pick a primary and secondary model for Claude in Settings → Writing tab. The primary model is used for all agent sessions; the secondary model is used for fast lightweight passes (chapter audits).

## Sessions
3 total

---

## Session Status

| # | Session | Modules | Status | Completed | Notes |
|---|---------|---------|--------|-----------|-------|
| 01 | Domain: Add `secondaryModel` to AppSettings | M01 | done | 2026-06-28 | `secondaryModel: string` added to `AppSettings`; default = `CLAUDE_CLI_SECONDARY_MODEL` |
| 02 | Application: Wire `secondaryModel` into AuditService + HotTakeService | M08 | pending | — | Depends on SESSION-01 |
| 03 | Renderer: Dual primary/secondary model picker in SettingsView | M10 | pending | — | Depends on SESSION-01 |

---

## Dependency Graph

```
SESSION-01 (domain types)
    ├── SESSION-02 (application services)
    └── SESSION-03 (renderer UI)
```

SESSION-02 and SESSION-03 are independent of each other; both require SESSION-01.

---

## Architecture Reference

- `AppSettings` — `src/domain/types.ts` line ~345
- `DEFAULT_SETTINGS` — `src/domain/constants.ts` line ~232
- `AuditService.resolveAuditModel()` — `src/application/AuditService.ts` line ~48
- `HotTakeService.handleSingleCall()` — `src/application/HotTakeService.ts` line ~72
- `ModelSelectionSection` — `src/renderer/components/Settings/SettingsView.tsx` line ~72
- `CLAUDE_CLI_PRIMARY_MODEL` / `CLAUDE_CLI_SECONDARY_MODEL` — `src/domain/constants.ts` lines 218, 227
- `VERITY_AUDIT_MODEL` = `CLAUDE_CLI_SECONDARY_MODEL` (to be removed from AuditService usage)
- `HOT_TAKE_MODEL` = `CLAUDE_CLI_PRIMARY_MODEL` (to be removed from HotTakeService usage)

---

## Scope Summary

| Module ID | Module | Changed? | What |
|-----------|--------|----------|------|
| M01 | domain | Yes | `AppSettings` + `DEFAULT_SETTINGS` |
| M08 | application | Yes | `AuditService`, `HotTakeService` |
| M10 | renderer | Yes | `SettingsView.tsx` `ModelSelectionSection` |
| M02 | settings | No | `SettingsService` merges defaults automatically |
| M09 | main/ipc | No | No IPC changes needed |

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Secondary picker shows only Claude CLI models | `secondaryModel` is only used in `AuditService.resolveAuditModel()` which already gates on `isClaudeCli`. No other provider uses it. |
| Default `secondaryModel` = `CLAUDE_CLI_SECONDARY_MODEL` | Preserves existing behaviour for users upgrading — their audit passes continue using Sonnet. |
| `handleSelectSecondary` does NOT change `activeProviderId` | Secondary model is always from the built-in Claude CLI provider. Switching providers on secondary selection would be confusing. |
| `HOT_TAKE_MODEL` constant retained in `constants.ts` | Other code may import it in future. Removing it from service files is sufficient. Only the service references change. |

---

## Handoff Notes

### SESSION-01 (done 2026-06-28)
- Added `secondaryModel: string` to `AppSettings` in `src/domain/types.ts` (after `model: string`)
- Added `secondaryModel: CLAUDE_CLI_SECONDARY_MODEL` to `DEFAULT_SETTINGS` in `src/domain/constants.ts`
- `npx tsc --noEmit` passes with zero errors
- SESSION-02 and SESSION-03 are now unblocked
