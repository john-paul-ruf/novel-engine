# SESSION-02 — README Deep Update (Phase 2)

> **Program:** Novel Engine
> **Feature:** deployment-prep
> **Modules:** M01, M08 (read only — modifies only `README.md`)
> **Depends on:** SESSION-01 (uses version + release notes context)
> **Estimated effort:** ~30 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M01 | domain | `src/domain/types.ts`, `src/domain/interfaces.ts`, `src/domain/constants.ts` | Catalog agents, phases, interfaces, constants for accuracy |
| M02 | settings | `src/infrastructure/settings/SettingsService.ts` | Settings management, CLI detection |
| M03 | database | `src/infrastructure/database/schema.ts`, `DatabaseService.ts` | Schema documentation |
| M04 | agents | `src/infrastructure/agents/AgentService.ts` | Agent loading |
| M05 | filesystem | `src/infrastructure/filesystem/` | Book CRUD, file I/O, watchers |
| M06 | claude-cli | `src/infrastructure/claude-cli/ClaudeCodeClient.ts` | CLI invocation, streaming |
| M11 | codex-cli | `src/infrastructure/codex-cli/CodexCliClient.ts` | Codex provider |
| M08 | application | All files in `src/application/` | ChatService, PipelineService, BuildService, QueryService, etc. |
| M09 | main/ipc | `src/main/index.ts`, `src/main/ipc/handlers.ts`, `src/preload/index.ts` | IPC channels, bridge API, composition root |
| M10 | renderer | `src/renderer/App.tsx`, `stores/`, `components/` | Views, stores, features for accuracy |
| — | `package.json` | Yes | Scripts, dependencies, version |
| — | `forge.config.ts` | Yes | Packaging config |
| — | `RELEASE_NOTES.md` | Yes | Fresh from SESSION-01 — feeds README content |
| — | `agents/` directory | List | Confirm which agents exist |
| — | `AGENTS.md` | Yes | Architect role definition |
| — | `TECHNICAL.md` | Yes | Existing technical guide (referenced by README) |
| — | `LICENSE` | Yes | Confirm license type |

## Context

The current `README.md` (205 lines) was written for v0.8.0. Since then, 33 commits added: Query Manager, WebSearch, Codex CLI hardening, query tracker resilience. The README must reflect all current capabilities.

The readme-deep-update prompt (at `prompts/session-program/program-025/input-files/readme-deep-update.md`) specifies a "Build Books, Not Write Them" narrative. However, the current README already uses a more product-oriented tone ("A Desktop Publishing Studio for Novels"). **Follow the current README's existing voice and structure** — update it with new features and verify accuracy. Do not force the "Build" narrative if the project has already moved to "Publishing Studio" language. The prompt is a guide, not a straitjacket.

Execute the full readme-deep-update prompt. Do not skip the analysis steps.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `README.md` | Modify | Update with new features, verify all claims, fix version references |

## Implementation

### 1. Domain Layer Analysis (Step 1)

Read fully:
- `src/domain/types.ts` — catalog every type, enum, alias
- `src/domain/interfaces.ts` — catalog every service interface and methods
- `src/domain/constants.ts` — agents, pipeline phases, pricing, defaults

Verify the README's agent table matches `AGENT_REGISTRY` in `constants.ts`. Verify pipeline phases match `PIPELINE_PHASES`.

### 2. Infrastructure Layer Analysis (Step 2)

Read every file in `src/infrastructure/`. Document database schema, file operations, CLI invocation, watchers. **New since last README update:** `codex-cli/` module, QueryService tracker I/O.

### 3. Application Layer Analysis (Step 3)

Read every file in `src/application/`. **New since last README:** `QueryService.ts` — Quill's query-agent research, target tracking, query letter generation, field fill. Check for `ContextWrangler.ts` or simpler `ContextBuilder.ts`.

### 4. Main Process Analysis (Step 4)

Read `src/main/index.ts`, `src/main/ipc/handlers.ts`, `src/preload/index.ts`. **New IPC channels since last README:** `query:*` namespace (research, generate, fill-field, target CRUD).

### 5. Renderer Analysis (Step 5)

Read all stores and scan all components. **New since last README:** `QueryManagerView`, `queryStore`, possibly updated onboarding flow, `ResearchPanel`, `TargetCard` AI buttons.

### 6. Configuration Analysis (Step 6)

Read `package.json`, `forge.config.ts`, `tsconfig.json`, Vite configs, `scripts/`.

### 7. Agent Prompts Analysis (Step 7)

List files in `agents/` directory. Confirm 7 agents match `constants.ts`.

### 8. Additional Files (Step 8)

Read `AGENTS.md`, `TECHNICAL.md`, `LICENSE`, `CHAPTER_VALIDATION.md` (if exists).

### 9. Rewrite README

Update the existing README structure. Key updates needed:
- **New feature: Query Manager** — Quill can now research query targets (agents/publicists), generate query letters, and auto-populate fields from research. This is a major addition to the "Publish" phase.
- **New feature: WebSearch** — all providers support web search for research
- **New provider: Codex CLI** — already in current README? Verify.
- **Codex CLI hardening** — improved reliability
- **Query tracker resilience** — internal fix, probably not README-facing
- Verify all existing claims still hold
- Remove any phantom features
- Preserve: Heads Up (none currently), Dedication section, Questions/comments section
- The current README has no `# Heads up` section at the top — it starts with `# Novel Engine`. The Dedication is at the bottom. Preserve those.
- Version references should match the suggested version from SESSION-01

### 10. Verification Checklist

- [ ] Every agent listed matches `constants.ts`
- [ ] Every pipeline phase matches the actual detection logic in `PipelineService.ts`
- [ ] Every npm script listed exists in `package.json`
- [ ] Every dependency listed matches `package.json`
- [ ] Every feature described has corresponding source code
- [ ] The `src/` tree matches actual file structure (or is linked to TECHNICAL.md)
- [ ] No features described that don't exist
- [ ] The Dedication section is preserved verbatim
- [ ] Links to internal files use correct relative paths
- [ ] Query Manager feature is accurately described
- [ ] WebSearch is accurately described
- [ ] Screenshots referenced exist in `screenshots/`

## Verification

- `README.md` passes the full verification checklist above
- Every agent in the README table matches `AGENT_REGISTRY` in `src/domain/constants.ts`
- Every pipeline phase in the README table matches `PIPELINE_PHASES` in same file
- Feature claims verified against actual source code
- No phantom features (described but not implemented)
- Query Manager and WebSearch are documented

## State Update

Update `prompts/session-program/program-025/STATE.md`:
- Session 02 → `done`, date, notes
- Handoff Notes: features added vs removed, significant narrative changes, updated tech stack
- SESSION-03/04/05 can now proceed (website rebuild)