# SESSION-01 — Rename Forge Model Labels

> **Program:** Novel Engine
> **Feature:** forge-model-labels
> **Modules:** M01 (domain/types, domain/constants), M08 (RevisionQueueService), M10 (RevisionQueue renderer components), agents (FORGE.md, WRANGLER-PARSE.md)
> **Depends on:** —
> **Estimated effort:** 15 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M01 | `src/domain/types.ts` | `RevisionSession` type | Change `model` field union |
| M01 | `src/domain/constants.ts` | `CLAUDE_CLI_PRIMARY_MODEL` / `SECONDARY_MODEL` comments | Update to mention Forge |
| M08 | `src/application/RevisionQueueService.ts` | `ParsedWranglerOutput` type, `loadPlan` mapping | Rename inner `model` field union |
| M10 | `src/renderer/components/RevisionQueue/RevisionSessionPanel.tsx` | Badge JSX | Swap badge text and conditional |
| M10 | `src/renderer/components/RevisionQueue/SessionCard.tsx` | Badge JSX | Same swap |
| — | `agents/FORGE.md` | Model Assignment table + session header template | Opus/Sonnet → Primary/Secondary |
| — | `agents/WRANGLER-PARSE.md` | JSON example + rule 3 | `"sonnet"`/`"opus"` → `"primary"`/`"secondary"` |

## Context

Forge currently labels revision sessions as `"opus"` or `"sonnet"` — Claude-specific model names. In a multi-provider world (Ollama, OpenAI-compatible, Codex), these labels are meaningless. Replace them with generic tier labels `"primary"` and `"secondary"` that correspond to the user's configured primary and secondary models in `AppSettings`.

The runtime already ignores per-session model assignments (always uses `appSettings.model` per a safety fix), so this is entirely a labeling/display change.

## Files to Create/Modify

| File | Action | What Changes |
|---|---|---|
| `src/domain/types.ts` | Modify | `RevisionSession.model`: `'opus' \| 'sonnet'` → `'primary' \| 'secondary'` |
| `src/application/RevisionQueueService.ts` | Modify | `ParsedWranglerOutput.sessions.model`: same rename. Update comment on Wrangler parse rule. |
| `src/renderer/components/RevisionQueue/RevisionSessionPanel.tsx` | Modify | Badge condition + text: `=== 'sonnet'` → `=== 'secondary'`; `'Opus'` → `'Primary'`; `'Sonnet'` → `'Secondary'` |
| `src/renderer/components/RevisionQueue/SessionCard.tsx` | Modify | Same badge condition + text swap |
| `agents/FORGE.md` | Modify | Model Assignment table: "Opus" → "Primary", "Sonnet" → "Secondary". Session header template: `[Opus/Sonnet]` → `[Primary/Secondary]` |
| `agents/WRANGLER-PARSE.md` | Modify | JSON example: `"model": "sonnet"` → `"model": "secondary"`. Rule 3: search for "Model: Opus", "Sonnet", etc → "Model: Primary", "Secondary", etc. Default: `"opus"` → `"primary"` |
| `src/domain/constants.ts` | Modify | Update JSDoc comments for `CLAUDE_CLI_PRIMARY_MODEL` and `CLAUDE_CLI_SECONDARY_MODEL` to mention "Used by Forge pipeline to label session tiers" |

## Implementation

### 1. Rename `RevisionSession.model` type in `src/domain/types.ts`

Read around line 410. Replace:
```ts
  model: 'opus' | 'sonnet';       // Forge's model assignment
```
with:
```ts
  model: 'primary' | 'secondary'; // Forge's model tier assignment
```

### 2. Update `ParsedWranglerOutput` in `src/application/RevisionQueueService.ts`

Read around line 40. Replace:
```ts
    model: 'opus' | 'sonnet';
```
with:
```ts
    model: 'primary' | 'secondary';
```

Read the comment around line 641. Change:
```ts
    // The Wrangler's 'sonnet' tier designation is
```
to:
```ts
    // The Wrangler's 'secondary' tier designation is
```

### 3. Update UI badges

In `src/renderer/components/RevisionQueue/RevisionSessionPanel.tsx` (~line 113 and 117):
- Replace `session.model === 'sonnet'` with `session.model === 'secondary'`
- Replace `'Sonnet'` with `'Secondary'`
- Replace `'Opus'` with `'Primary'`

In `src/renderer/components/RevisionQueue/SessionCard.tsx` (~line 78 and 82):
- Same three replacements as above.

### 4. Update agent prompts

In `agents/FORGE.md` (~line 154–163):
Replace the Model Assignment table:
```markdown
| Task Type | Model | Reasoning |
|---|---|---|
| Read-only audits, catalogs | Sonnet | Analytical, not prose. |
| Reference doc updates | Sonnet | Structural, not voice-dependent. |
| All prose revision | Opus | Voice fidelity requires it. |
| Line polish | Opus | Sentence-level craft requires it. |
```
with:
```markdown
| Task Type | Model | Reasoning |
|---|---|---|
| Read-only audits, catalogs | Secondary | Analytical, not prose. |
| Reference doc updates | Secondary | Structural, not voice-dependent. |
| All prose revision | Primary | Voice fidelity requires it. |
| Line polish | Primary | Sentence-level craft requires it. |
```

Update the session header template (~line 170):
```markdown
## Session [N] — [Title] | Model: [Primary/Secondary]
```

In `agents/WRANGLER-PARSE.md` (~line 20):
Replace `"model": "sonnet"` with `"model": "secondary"`.

Update rule 3 (~line 37):
```markdown
3. Identify the model from Forge's assignment. Look for "Model: Primary", "Secondary", "(analytical — Secondary)", etc. Default to "primary" if unclear.
```

### 5. Update constants comments

In `src/domain/constants.ts`, update the JSDoc on `CLAUDE_CLI_PRIMARY_MODEL` (~line 230–234) to mention Forge:
```ts
/**
 * The primary (highest-quality) Claude CLI model.
 * Used by Forge pipeline to label session tiers as 'primary'.
 */
```

Update `CLAUDE_CLI_SECONDARY_MODEL` (~line 238–243):
```ts
/**
 * The secondary (faster/cheaper) Claude CLI model.
 * Used by Forge pipeline to label session tiers as 'secondary'.
 */
```

## Verification

1. Run `npx tsc --noEmit` — should pass with zero errors.
2. Grep for `"opus"` and `"sonnet"` (case-insensitive) in the changed source files — should return zero matches.
3. Confirm `RevisionSessionPanel.tsx` and `SessionCard.tsx` render `"Primary"` / `"Secondary"` badges.
4. Agent docs compile (no syntax errors in markdown). No runtime test needed — purely display/label change with no functional impact.

## State Update

After verification:
- Update `STATE.md`: set Session 1 status to `done`, Completed to today's date.
- Append CHANGELOG.md entry per AGENTS.MD.
- Update affected architecture docs (`DOMAIN.md`, `INFRASTRUCTURE.md` if Forge agent changed, `RENDERER.md`).
