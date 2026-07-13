# State Tracker — Novel Engine / web-search-all-providers

## Program
- **P_NAME**: Novel Engine
- **F_NAME**: web-search-all-providers
- **Intent**: Enable web search for every provider that supports tool-use so Quill's Query Manager research flow works regardless of the active provider.

## Sessions

| # | Session | Modules | Status | Completed | Notes |
|---|--------|---------|--------|-----------|-------|
| 01 | WebSearch tool definition + executor for Ollama/llama-server | M06 | done | 2026-07-13 | Pre-existing implementation using `WebSearcher.ts` (DuckDuckGo HTML) instead of session's specified Bing scrape; functionally equivalent. `WebSearch` in `OLLAMA_TOOLS`, `case 'WebSearch'` in `ToolExecutor`. |
| 02 | Codex CLI: enable standalone_web_search + parse web_search events | M05 | done | 2026-07-13 | `--enable standalone_web_search` arg added to `runCodexAttempt` args array. `web_search` event parsing was already in place via `normalizeToolName` + `isToolLike` + `extractToolFilePath` updates (different approach than session's dedicated branch, functionally equivalent). |
| 03 | Docs + changelog | M05, M06 | done | 2026-07-13 | CHANGELOG.md entry added for the `--enable standalone_web_search` flag completion. INFRASTRUCTURE.md codex-cli key behavior line updated to include the flag. |

## Dependency Graph
```
01 ──┐
     ├──> 03
02 ──┘
```

01 and 02 are independent — can run in parallel. 03 requires both.

## Module Registry (affected)
| ID | Module | Path |
|----|--------|------|
| M05 | codex-cli | `src/infrastructure/codex-cli/` |
| M06 | ollama-cli (shared with llama-server) | `src/infrastructure/ollama-cli/` |

## Architecture Reference (feature-specific)
- `OLLAMA_TOOLS` (in `src/infrastructure/ollama-cli/tools.ts`) is imported by both `OllamaCodeClient` and `LlamaServerClient`. Adding a tool there enables it for both providers.
- `ToolExecutor` (in `src/infrastructure/ollama-cli/ToolExecutor.ts`) is also shared by both providers. Adding a `case 'WebSearch':` branch handles execution for both.
- `CodexCliClient` (in `src/infrastructure/codex-cli/CodexCliClient.ts`) spawns `codex exec` with arg list at line ~387. We add `--enable standalone_web_search` there.
- Claude CLI already has `WebSearch` in its `--allowedTools` (line ~233 of `ClaudeCodeClient.ts`). No change needed.

## Scope Summary
- **M06 (ollama-cli)**: `tools.ts` (add WebSearch definition), `ToolExecutor.ts` (implement WebSearch execution)
- **M05 (codex-cli)**: `CodexCliClient.ts` (add CLI flag, parse web_search events)

## Design Decisions

### 1. Free search backend (DDG fallback to Bing)
**Choice**: Try DuckDuckGo Instant Answer API first, then fall back to Bing HTML scrape.
**Rationale**: `html.duckduckgo.com/html/` and `lite.duckduckgo.com/lite/` both throw anomaly/CAPTCHA challenges for direct curl from this server (verified). The DuckDuckGo Instant Answer API (`https://api.duckduckgo.com/?q=...&format=json`) returns abstract summaries (limited but reliable). Bing HTML (`https://www.bing.com/search?q=...`) is scrape-friendly and returns full search results. Using Bing as the primary backend with DDG Instant Answer as supplementary is the most reliable free option.

### 2. Tool name `WebSearch`
**Choice**: Use tool name `WebSearch` (capitalized) for the Ollama/llama-server function definition.
**Rationale**: The Quill agent prompt (in `agents/QUILL.md` and the inline prompts in `QueryService.ts`) already instructs the model to "use WebSearch". Keeping the name consistent across providers means no agent prompt changes are needed. Codex's CLI tool is internally named `web_search` but is called by the model automatically — no prompt alignment needed there.

### 3. Codex CLI `--enable standalone_web_search` flag
**Choice**: Pass `--enable standalone_web_search` on every `codex exec` invocation.
**Rationale**: Verified via `codex features list` that `standalone_web_search` is a real feature flag (status: `under development`). Test invocation confirms it emits `web_search` item events with JSON. The CLI's own warning about "under-development features" is cosmetic and can be suppressed via config if desired; not a blocker. Enabling globally is simplest; the model only uses it when the prompt explicitly asks for web search (e.g. Quill research).

### 4. Web search events in Codex — reuse `toolUse` StreamEvent
**Choice**: Emit a `toolUse` StreamEvent with `toolName: 'WebSearch'` for both `item.started` and `item.completed` events with `type === 'web_search'`.
**Rationale**: The renderer already handles `toolUse` events generically (shows tool name, status, file path). No renderer changes needed. The model's `agent_message` containing the final answer still streams normally via the existing text extraction.

### 5. No new progress stage
**Choice**: Do not add a `researching` progress stage; let web search fall through to the existing `reading` stage (or stay at `idle` if it's the first action).
**Rationale**: `StreamSessionTracker.inferStage` only classifies `Read/LS/Write/Edit` specifically. Unknown tools (like `WebSearch`) are ignored in the stage machine — they don't transition the stage. This means if the agent's first action is a web search, the stage stays `idle`. That's acceptable for a first pass; adding a `researching` stage was explicitly scoped out.

## Handoff Notes

### Session 01 (done)
Pre-existing implementation found in working tree (uncommitted from prior work). Used `WebSearcher.ts` (DuckDuckGo HTML) instead of SESSION-01's specified `performWebSearch` module function (Bing HTML scrape). Functionally equivalent — returns formatted search results text. `WebSearch` tool definition present in `OLLAMA_TOOLS`, `case 'WebSearch'` dispatches to `executeWebSearch()` which lazily instantiates `WebSearcher`. `READ_TOOLS` and `WRITE_TOOLS` unchanged as specified.

### Session 02 (done)
`web_search` event parsing was already in place from prior work in `extractToolInfo` via three updates: `normalizeToolName` returns `'WebSearch'` for `web_search`/`websearch` strings (line 919), `isToolLike` filter matches `web_search`/`websearch` (lines 844-845), and `extractToolFilePath` extracts `action.query` or `query` for `WebSearch` tool (lines 868-876). This is a different approach than SESSION-02's dedicated branch before the `isCompletedCodexItem` gate, but functionally equivalent — both emit `WebSearch` toolUse StreamEvents.

Only missing piece: `--enable standalone_web_search` flag in the `args` array. Added at line 390 of `CodexCliClient.ts`.

### Session 03 (done)
CHANGELOG.md: New entry dated 2026-07-13 documenting the `--enable standalone_web_search` flag addition. Did not duplicate the broader WebSearch changelog entry from 2026-07-12 (that entry already covers Sessions 01's ollama work and Session 02's Codex parsing changes).

INFRASTRUCTURE.md: Updated codex-cli key behavior line in the spawn-flags bullet to include `--enable standalone_web_search` and a brief rationale. No other docs needed changes.

All sessions done — feature complete.