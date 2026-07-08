# Forge Model Labels

## Core Change

The **Forge** agent's revision plan currently labels sessions with concrete model names — `Opus` and `Sonnet` — which are Claude-specific branding. In a multi-provider world (Claude CLI, Ollama, Codex, OpenAI-compatible, etc.), these labels are meaningless. The pipeline should use **generic tier labels** that resolve to the user's configured models at runtime.

## New Behavior

- Forge labels sessions as **`primary`** (the user's configured primary/highest-quality model) or **`secondary`** (the user's configured secondary/faster-cheaper model).
- The `RevisionSession.model` type changes from `'opus' | 'sonnet'` to `'primary' | 'secondary'`.
- UI badges show **"Primary"** / **"Secondary"** instead of "Opus" / "Sonnet".
- The Wrangler parse prompt (`WRANGLER-PARSE.md`) and Forge agent prompt (`FORGE.md`) are updated to emit/parse `primary`/`secondary`.
- `RevisionQueueService.runSession()` already ignores the per-session model (uses `appSettings.model` for all sessions). The `session.model` field becomes a **display-only preference indicator**.
- No runtime model resolution changes needed — the existing safety behavior (always using `appSettings.model`) already handles multi-provider correctly.

## Files to Change

| File | What |
|------|------|
| `src/domain/types.ts` | `RevisionSession.model`: `'opus' | 'sonnet'` → `'primary' | 'secondary'` |
| `src/application/RevisionQueueService.ts` | `ParsedWranglerOutput.model`: same rename. Update comments about Wrangler model choice. |
| `src/renderer/components/RevisionQueue/RevisionSessionPanel.tsx` | Badge text: `"Opus"` → `"Primary"`, `"Sonnet"` → `"Secondary"` |
| `src/renderer/components/RevisionQueue/SessionCard.tsx` | Same badge text change |
| `agents/FORGE.md` | Model Assignment table + session header template: Opus/Sonnet → Primary/Secondary |
| `agents/WRANGLER-PARSE.md` | JSON example, rule 3, defaults: `"sonnet"`/`"opus"` → `"primary"`/`"secondary"` |
| `src/domain/constants.ts` | Update comments on `CLAUDE_CLI_PRIMARY_MODEL` / `CLAUDE_CLI_SECONDARY_MODEL` to mention Forge usage |

## Docs

Update `docs/architecture/DOMAIN.md`, `INFRASTRUCTURE.md` (if Forge prompt changed), `RENDERER.md` per AGENTS.MD.
