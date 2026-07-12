# SESSION-02 — README Deep Update

> **Program:** Novel Engine
> **Feature:** deployment-prep
> **Modules:** M01–M11 (read-only analysis), README.md (write)
> **Depends on:** SESSION-01 (release notes must exist for accuracy cross-check)
> **Estimated effort:** 25–30 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| `M01` | domain | `src/domain/types.ts`, `src/domain/interfaces.ts`, `src/domain/constants.ts` | Catalog all agents, pipeline phases, service interfaces, verify against README |
| `M02` | settings | `src/infrastructure/settings/SettingsService.ts` | Settings management, CLI detection |
| `M03` | database | `src/infrastructure/database/schema.ts`, `DatabaseService.ts` | DB schema, query methods |
| `M04` | agents | `src/infrastructure/agents/AgentService.ts` | Agent prompt loading |
| `M05` | filesystem | `src/infrastructure/filesystem/FileSystemService.ts`, `BookWatcher.ts`, `BooksDirWatcher.ts` | Book CRUD, file I/O, watchers |
| `M06` | claude-cli | `src/infrastructure/claude-cli/ClaudeCodeClient.ts`, `StreamSessionTracker.ts` | CLI invocation, streaming |
| `M07` | pandoc | `src/infrastructure/pandoc/index.ts` | Pandoc binary resolution |
| `M08` | application | `src/application/*.ts` | All services: Chat, Pipeline, Build, Usage, ContextWrangler, QueryService, etc. |
| `M09` | main/ipc | `src/main/index.ts`, `src/main/ipc/handlers.ts`, `src/preload/index.ts` | Composition root, IPC channels, preload bridge API |
| `M10` | renderer | `src/renderer/stores/*.ts`, `src/renderer/components/**/*.tsx`, `src/renderer/App.tsx` | All views, stores, components |
| `M11` | codex-cli | `src/infrastructure/codex-cli/CodexCliClient.ts` | Codex CLI integration |

## Context

The README was last written for the v0.8.0 release. Since then, 15 commits introduced a **Query Manager** feature (new pipeline phase, new view, new IPC channels, new store) and multiple **Codex CLI hardening** fixes. The README must be updated to reflect the current codebase.

The current README already uses the "build books, not write them" narrative and has a good structure. This session verifies every claim against actual source code, removes phantom features, adds missing features (especially the Query Manager), and updates version numbers, dependency tables, and the source tree.

`RELEASE_NOTES.md` from SESSION-01 is available as a cross-reference — items in the release notes should appear in the README if they're user-facing features.

This session executes `prompts/meta/readme-deep-update.md` in full. Read that prompt before starting.

**Preserve verbatim** (do not modify content or formatting):
1. The `# Heads up` section — *does not exist in the current README* (skip this)
2. The `# Dedication` section (the two italicized paragraphs at the bottom)
3. The `# Questions, comments, or rants?` section — *does not exist in the current README* (skip this)

Actually, examining the current README: it does NOT have `# Heads up` or `# Questions, comments, or rants?` sections. It has `# Dedication` at the bottom. Preserve the `# Dedication` section verbatim. The current README structure starts with `# Novel Engine` directly.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `README.md` | Modify | Full rewrite preserving Dedication section, updating all features, agents, pipeline, tech stack, structure |

## Implementation

### 1. Domain Layer Analysis

Read completely:
- `src/domain/types.ts` — catalog every type, enum, type alias
- `src/domain/interfaces.ts` — catalog every service interface and methods
- `src/domain/constants.ts` — catalog agent definitions, pipeline phases, pricing, defaults

Document all agent names (should be 7: Spark, Verity, Ghostlight, Lumen, Forge, Sable, Quill), all pipeline phases (should be 14 phases + possibly `query-agents` as phase 15?), all service interfaces including the new `IQueryService`.

**Key question:** Has `query-agents` been added to the 14-phase pipeline, making it 15? Check `PIPELINE_PHASES` in `constants.ts`. Update the README's pipeline table accordingly.

### 2. Infrastructure Layer Analysis

Read every file in `src/infrastructure/`:
- `settings/SettingsService.ts` — settings management, CLI/provider detection
- `database/schema.ts` — all tables, columns, indexes (check for new tables)
- `database/DatabaseService.ts` — query methods
- `agents/AgentService.ts` — agent prompt loading
- `filesystem/FileSystemService.ts` — book CRUD, file I/O, directory structure (have query letters been added?)
- `filesystem/BookWatcher.ts`, `BooksDirWatcher.ts` — file watching
- `claude-cli/ClaudeCodeClient.ts` — CLI invocation, streaming
- `codex-cli/CodexCliClient.ts` — Codex CLI integration
- `pandoc/index.ts` — Pandoc binary resolution

### 3. Application Layer Analysis

Read every file in `src/application/`:
- `ChatService.ts` — send/stream/save flow
- `ContextWrangler.ts` (or `ContextBuilder.ts`?) — context assembly (the prompt mentions both names — read what actually exists)
- `PipelineService.ts` — phase detection logic (verify `query-agents` detection)
- `BuildService.ts` — Pandoc execution, export formats
- `UsageService.ts` — token tracking
- `QueryService.ts` — **NEW** — query manager orchestration (tracker I/O, target CRUD, query letter generation)
- `RevisionQueueService.ts` — revision queue
- `ChapterValidator.ts` — validation rules
- `context/TokenEstimator.ts` — token counting

### 4. Main Process Analysis

Read:
- `src/main/index.ts` — composition root (all services instantiated, window creation)
- `src/main/ipc/handlers.ts` — every IPC channel (look for new `query:*` channels)
- `src/preload/index.ts` — preload bridge API (look for new `query` namespace)

### 5. Renderer Analysis

Read all stores in `src/renderer/stores/` — look for new `queryStore.ts`.
Read all component directories — look for new `QueryManager/` components.
Read `src/renderer/App.tsx` — view routing (look for `query-manager` view).
Read `src/renderer/stores/viewStore.ts` — check ViewId union for additions.

**Features to check** (from the README deep-update prompt):
- Pitch Room / Shelved Pitches — still implemented?
- CLI Activity monitoring — still implemented?
- Modal Chat — still implemented?
- Auto-Draft system — still implemented?
- Stream routing — still implemented?
- File change detection/watching — still implemented?
- Thinking budget slider — still implemented?
- Chapter validation — still implemented?
- Query Manager — **NEW** — verify implementation
- Version history — still implemented?
- Hot Take — still implemented?
- Motif Ledger — still implemented?
- Series support — still implemented?
- Statistics — still implemented?
- Command palette — still implemented?
- Import manuscript — still implemented?

### 6. Configuration Analysis

Read:
- `package.json` — all scripts, dependencies, version (verify version matches what SESSION-01 suggested)
- `forge.config.ts` — Electron Forge configuration
- `tsconfig.json` — TypeScript config, path aliases

### 7. Write the README

Use the current README as the base structure — it already follows the "build books" narrative. Update:

**Must update:**
- Pipeline table — add `query-agents` phase if it's now in `PIPELINE_PHASES` (making it 15 phases, or is it a sub-phase of Publish?)
- Agent table — verify all 7 agents match `constants.ts` (names, roles, descriptions)
- Key Features list — add Query Manager feature, verify all existing features still exist in code
- Technology Stack table — verify versions against `package.json`
- Project Structure — update `src/` tree to reflect new files (QueryService, queryStore, QueryManager components)
- npm scripts — verify against `package.json` scripts
- Prerequisites — verify Node.js version requirement (package.json says 18+, code might need 20+)
- Download links — verify GitHub releases URL is correct
- Provider table — verify Claude, Codex, Ollama are all still supported
- Screenshots — verify screenshot filenames match actual files in `screenshots/`

**Preserve verbatim:**
- `# Dedication` section (bottom of README)

**Remove if phantom:**
- Any feature described that doesn't exist in code

**Add if missing:**
- Query Manager feature description
- Any feature in code not mentioned in README

### 8. Verification Checklist

Before finalizing, verify each item from `prompts/meta/readme-deep-update.md`:

- [ ] Every agent listed matches `constants.ts`
- [ ] Every pipeline phase matches the actual detection logic in `PipelineService.ts`
- [ ] Every npm script listed actually exists in `package.json`
- [ ] Every dependency listed matches `package.json`
- [ ] Every feature described has corresponding source code
- [ ] The src/ tree matches the actual file structure
- [ ] The userData directory structure matches `FileSystemService` behavior
- [ ] The preload bridge API matches what's actually exposed
- [ ] No features are described that don't exist
- [ ] The dedication section is preserved verbatim
- [ ] Links to internal files use correct relative paths

## Verification

1. `README.md` exists at repo root and has been updated
2. Dedication section preserved exactly (two italicized paragraphs)
3. Agent table matches `src/domain/constants.ts` `AGENT_REGISTRY`
4. Pipeline table matches `PIPELINE_PHASES` in `src/domain/constants.ts` and detection in `PipelineService.ts`
5. Query Manager feature mentioned (if `query-agents` phase + QueryManager view exist in code)
6. Technology stack versions match `package.json`
7. No phantom features remain
8. All npm scripts listed exist in `package.json`
9. Source tree matches actual `src/` directory

## State Update

Update `prompts/session-program/program-020/STATE.md`:
- Set SESSION-02 status to `done`
- Add completion date
- Add handoff notes: features added vs removed count, significant narrative changes, updated technology stack
- Carry forward: the features list, agent table, pipeline table, technology stack — these feed SESSION-03 (website content)