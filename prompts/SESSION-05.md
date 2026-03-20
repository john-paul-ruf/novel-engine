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
6. Return all loaded agents **excluding the Wrangler** (it's an infrastructure agent, not a creative agent). Sort by pipeline order (Spark first, Quill last — use `PIPELINE_PHASES` to derive order). Use `CREATIVE_AGENT_NAMES` from constants to filter.

**`load(name)`:**
Call a private `loadAllIncludingWrangler()` method, find by name. Throw a descriptive error if not found. This method MUST be able to load the Wrangler agent — the `ContextWrangler` service calls `agents.load('Wrangler')` before every creative agent call.

**Important:** The `.md` files may have different casings (e.g., `FORGE.MD` vs `FORGE.md`). Do case-insensitive matching against the registry.

**Important:** The `loadAll()` public method returns only creative agents (for the UI). The `load(name)` method can load ANY registered agent including the Wrangler. Internally, implement a `loadAllIncludingWrangler()` that returns all agents, and have `loadAll()` filter it.

## Verification

- Compiles with `npx tsc --noEmit`
- Implements `IAgentService`
- No imports from Electron, application, renderer, or other infrastructure
- `loadAll()` returns `Agent[]` with the 7 creative agents (NOT the Wrangler)
- `load('Wrangler')` successfully loads the Wrangler agent from `WRANGLER.md`
