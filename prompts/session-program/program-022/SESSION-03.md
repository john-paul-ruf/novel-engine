# SESSION-03 — Docs + changelog

> **Program**: Novel Engine
> **Feature**: web-search-all-providers
> **Modules**: M05 (codex-cli), M06 (ollama-cli)
> **Depends on**: 01, 02
> **Estimated effort**: 10 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M05 | `src/infrastructure/codex-cli/CodexCliClient.ts` | The changes made in Session 02 | Document the `--enable standalone_web_search` arg and the new `web_search` event parsing in `docs/architecture/INFRASTRUCTURE.md` |
| M06 | `src/infrastructure/ollama-cli/tools.ts`, `src/infrastructure/ollama-cli/ToolExecutor.ts` | The changes made in Session 01 | Document the new `WebSearch` tool definition and executor in `docs/architecture/INFRASTRUCTURE.md` |
| — | All changed files | For the CHANGELOG entry | Read each file to verify actual contents before documenting |

## Context

Per the project's `AGENTS.md` workflow rules, every code change must be reflected in:
- `CHANGELOG.md` (mandatory, always) — append a new entry under today's date
- `docs/architecture/INFRASTRUCTURE.md` — when any infrastructure module changes (it did: codex-cli, ollama-cli)
- `docs/architecture/ARCHITECTURE.md` — only when source tree, dependency graph, or conventions change (no change here — file paths are unchanged, no new modules)
- Other docs (DOMAIN.md, APPLICATION.md, IPC.md, RENDERER.md) — skip, no changes in those layers

This session runs **after** Sessions 01 and 02 are complete so it can document the actual final state of the code.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `CHANGELOG.md` | Modify | Append a new dated entry covering both Session 01 and Session 02 changes |
| `docs/architecture/INFRASTRUCTURE.md` | Modify | Update the `ollama-cli/` and `codex-cli/` module sections to mention `WebSearch` tool / `standalone_web_search` flag |

## Implementation

### 1. Read all changed files before writing the changelog

Per `AGENTS.md` rule: "Read the files you changed before writing the entry. Don't document from memory."

Read each of these:
- `src/infrastructure/ollama-cli/tools.ts` — confirm the `WebSearch` entry exists in `OLLAMA_TOOLS` and the new `READ_TOOLS` / `WRITE_TOOLS` sets are UNCHANGED.
- `src/infrastructure/ollama-cli/ToolExecutor.ts` — confirm `case 'WebSearch'` and `executeWebSearch` exist; confirm the `performWebSearch`, `parseBingResults`, `decodeBingRedirect`, `stripTags`, `truncate` module-level functions exist.
- `src/infrastructure/codex-cli/CodexCliClient.ts` — confirm `'--enable', 'standalone_web_search'` appears in the args array, and the `web_search` branch exists in `extractToolInfo`.

### 2. Append to `CHANGELOG.md`

Insert a new entry directly under the top-level header block, AFTER the `# Changelog\n\nAll notable changes to Novel Engine are documented here.\n\n---\n` banner and BEFORE the existing newest entry (keep the file sorted newest-first per the existing convention).

```markdown
## [YYYY-MM-DD] — Web search enabled for Codex CLI, Ollama, and llama-server providers

### Summary

Quill's Query Manager research flow (which instructs the agent to "use WebSearch") now works for every tool-use-capable provider, not just Claude CLI. Codex CLI gets its native `standalone_web_search` feature flag; Ollama and llama-server get a new `WebSearch` function-calling tool backed by a free Bing HTML scrape (no API key required).

### Added
- `src/infrastructure/ollama-cli/tools.ts` — `WebSearch` tool definition appended to `OLLAMA_TOOLS` array (query parameter, no required file inputs)
- `src/infrastructure/ollama-cli/ToolExecutor.ts` — `executeWebSearch` method + module-level `performWebSearch`, `parseBingResults`, `decodeBingRedirect`, `stripTags`, `truncate` helpers; Bing HTML scrape backend with 10-result cap and 8KB payload cap

### Changed
- `src/infrastructure/codex-cli/CodexCliClient.ts` — Added `--enable standalone_web_search` to `codex exec` spawn args; `extractToolInfo` now recognizes `item.type === 'web_search'` events and emits `WebSearch` toolUse StreamEvents (filePath repurposed as the search query for the UI label)

### Architecture Impact
- New tool available to Ollama + llama-server: `WebSearch` (executed by `ToolExecutor`, backend is Bing HTML scrape)
- New CLI flag for Codex: `--enable standalone_web_search` (always on, activates Codex native web_search tool)
- Tool-use StreamEvent surface extended: `WebSearch` toolUse events now appear in the UI for all three non-Claude providers
- No new IPC channels, no new stores, no renderer changes — UI consumes existing `toolUse` StreamEvent format

### Migration Notes
None — all additions are backward compatible. The `WebSearch` tool is offered to Ollama/llama-server models; they will only invoke it when the Quill prompt explicitly asks (per existing `QueryService` prompts). No user configuration required.
```

Replace `YYYY-MM-DD` with today's date (the date the session executed, not the date the program was generated).

### 3. Update `docs/architecture/INFRASTRUCTURE.md`

Read the file first to confirm its current structure. Then make two surgical edits.

#### 3a. Update the `ollama-cli/` module section

Find the existing `ollama-cli/` module inventory subsection. It lists files including `tools.ts`, `ToolExecutor.ts`, `BashEmulator.ts`, etc. with their purposes.

Update the row for `tools.ts` to mention `WebSearch`:

```markdown
| `tools.ts` | OpenAI-style function-calling tool definitions (Read, Write, Edit, LS, Bash, WebSearch) |
```

Update the row for `ToolExecutor.ts` to mention WebSearch execution:

```markdown
| `ToolExecutor.ts` | Executes tool calls from the function-calling API. Tools: Read, Write, Edit, LS, Bash (emulated), WebSearch (Bing HTML scrape) |
```

If the file has a "Key behavior" bullet list under `ollama-cli/`, add one bullet:
- `WebSearch` tool: fetches Bing HTML search results, parses `<li class="b_algo">` blocks, returns up to 10 results (title + URL + snippet, 8KB payload cap). No API key required.

#### 3b. Update the `codex-cli/` module section

Find the existing `codex-cli/` module inventory subsection. It contains a row for `CodexCliClient.ts`.

Update its purpose line / key behavior to mention the new flag:

```markdown
| `CodexCliClient.ts` | Implements `IModelProvider` for Codex CLI. Spawns `codex exec` with `--json`, `--sandbox workspace-write`, `--enable standalone_web_search` |
```

If there's a "Key behavior" or "Codex CLI Integration" subsection that lists CLI flags, add `--enable standalone_web_search` to that list with a brief note: "Enables Codex's native `web_search` tool for web research (e.g. Quill's Query Manager research flow)."

### 4. Do NOT update other docs

- `docs/architecture/ARCHITECTURE.md` — no source tree change, no dependency graph change, no conventions change. Skip.
- `docs/architecture/DOMAIN.md` — no type changes. Skip.
- `docs/architecture/APPLICATION.md` — no service changes. Skip.
- `docs/architecture/IPC.md` — no IPC channel changes. Skip.
- `docs/architecture/RENDERER.md` — no store or component changes. Skip.

### 5. Verify documentation rule compliance

Per `AGENTS.md`:
- Every line in the changelog entry references a real file path — ✓
- Architecture Impact section present and concrete — ✓
- Migration Notes section present ("None" is valid) — ✓
- No empty sections (omit `### Removed` and `### Fixed` if empty) — ✓ (no Removed/Fixed this session)
- Omitted changelog sections should be skipped entirely, not left as `### Removed\n- None` — ✓

## Verification

1. Read `CHANGELOG.md` — confirm the new entry is present, dated correctly, and follows the required format (Summary, Added, Changed, Architecture Impact, Migration Notes only — skip Removed/Fixed since they're empty).
2. Read `docs/architecture/INFRASTRUCTURE.md` — confirm the `ollama-cli/` and `codex-cli/` subsections now mention `WebSearch` / `standalone_web_search`.
3. Grep `WebSearch` in `docs/architecture/INFRASTRUCTURE.md` — should return matches in both module subsections.
4. No other docs files should have been modified this session.

## State Update

Update `prompts/session-program/program-022/STATE.md`:
- Set Session 03 status → `done`
- Add completion date
- Add handoff note: "Session 03 complete. CHANGELOG.md and docs/architecture/INFRASTRUCTURE.md updated. All sessions done — feature complete."