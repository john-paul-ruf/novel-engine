# Session 05 — Agent Loader

## Context

Novel Engine Electron app. Sessions 01–04 done. Now I need the **agent loader** — it reads the agent `.md` files from disk and returns typed `Agent` objects.

## Architecture Rule

Lives in `src/infrastructure/agents/`. Imports from `@domain` and `node:fs/promises`. Implements `IAgentService`. No Electron imports needed.

## Task

Create `src/infrastructure/agents/AgentService.ts` and `index.ts` barrel.

### How it works

Constructor: `constructor(agentsDir: string)` — the path to the directory containing agent `.md` files.

**`loadAll()`:**
1. Read all `.md` files from `agentsDir`
2. For each file, derive the agent name by matching the filename against `AGENT_REGISTRY` from `@domain/constants` (e.g., `SPARK.md` → look up by filename)
3. Read the file contents as the `systemPrompt`
4. Merge with the registry metadata to produce a full `Agent` object
5. If a `.md` file doesn't match any registry entry, skip it (allows custom agents later)
6. Return all loaded agents, sorted by pipeline order (Spark first, Quill last — use `PIPELINE_PHASES` to derive order)

**`load(name)`:**
Call `loadAll()`, find by name. Throw a descriptive error if not found.

**Important:** The `.md` files may have different casings (e.g., `FORGE.MD` vs `FORGE.md`). Do case-insensitive matching against the registry.

## Verification

- Compiles with `npx tsc --noEmit`
- Implements `IAgentService`
- No imports from Electron, application, renderer, or other infrastructure
- Returns `Agent[]` with all 7 agents when the `.md` files are present
