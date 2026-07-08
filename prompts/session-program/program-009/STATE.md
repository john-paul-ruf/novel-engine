# State Tracker — Novel Engine / forge-model-labels

## Program / Feature / Intent / Sessions

| Field | Value |
|---|---|
| Program | Novel Engine |
| Feature | forge-model-labels |
| Intent | Replace Claude-specific `opus`/`sonnet` labels in Forge revision plans with generic `primary`/`secondary` tier labels so the pipeline remains provider-agnostic. |
| Sessions | 1 |

## Session Status

| # | Session | Modules | Status | Completed | Notes |
|---|---|---|---|---|---|
| 1 | SESSION-01 — Rename Forge Model Labels | M01 domain, M08 application, M10 renderer, agents | pending | — | — |

## Dependency Graph

```
SESSION-01 (no deps)
```

## Architecture Reference

- `RevisionSession.model` in M01 is the canonical type — drives all downstream usage.
- M08 (`RevisionQueueService.ts`) parses Wrangler output into this type.
- M10 (`RevisionSessionPanel.tsx`, `SessionCard.tsx`) renders the badge.
- `agents/FORGE.md` defines what Forge writes into prompts.
- `agents/WRANGLER-PARSE.md` tells the Wrangler what to extract.

## Scope Summary

| Module ID | Files Affected |
|---|---|
| M01 | `src/domain/types.ts`, `src/domain/constants.ts` |
| M08 | `src/application/RevisionQueueService.ts` |
| M10 | `src/renderer/components/RevisionQueue/RevisionSessionPanel.tsx`, `src/renderer/components/RevisionQueue/SessionCard.tsx` |
| agents | `agents/FORGE.md`, `agents/WRANGLER-PARSE.md` |
| docs | `docs/architecture/DOMAIN.md`, `docs/architecture/INFRASTRUCTURE.md`, `docs/architecture/RENDERER.md` |

## Design Decisions

- **No runtime model switch needed.** The existing behavior already uses `appSettings.model` for every session regardless of its `model` field. This means the change is purely labeling + display. No infrastructure changes.
- **No state migration needed.** The Wrangler re-parses the files every time they change; the cached plan is keyed by content hash. When Forge starts emitting new labels, the cache is automatically invalidated and re-parsed.

## Handoff Notes

_(agents write here after each session)_
