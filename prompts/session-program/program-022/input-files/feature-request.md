# Feature Request: Web Search for All CLI Providers — Query Manager Support

## Problem

The Query Manager (`src/application/Quill/researchTargets` and `fillTargetField`) instructs Quill to use "WebSearch" to research literary agents and publishers. Today only the **Claude Code CLI** has `WebSearch` in its `--allowedTools` list. The other three providers — **Codex CLI**, **Ollama**, and **llama-server** — cannot perform web searches, so when the user selects any of them and triggers target research, the agent silently cannot complete the task.

We need every provider that supports tool-use to offer web search so Quill's research flow works regardless of which provider is active.

## Current State (verified)

| Provider | File | Tool mechanism | Web search? |
|----------|------|----------------|-------------|
| Claude CLI | `src/infrastructure/claude-cli/ClaudeCodeClient.ts:233` | `--allowedTools` flag: `Read,Write,Edit,LS,WebSearch,Bash(...)` | **Yes** (already has `WebSearch`) |
| Codex CLI | `src/infrastructure/codex-cli/CodexCliClient.ts:387` | `codex exec --sandbox workspace-write` (CLI-managed tools) | **No** (CLI has a `--search` flag as of CLI v0.143+ for interactive use and a feature `standalone_web_search` for `exec`; confirmed `--enable standalone_web_search` enables a `web_search` tool with JSON events) |
| Ollama | `src/infrastructure/ollama-cli/OllamaCodeClient.ts` + `tools.ts` + `ToolExecutor.ts` | Custom OpenAI-style function-calling tools executed by `ToolExecutor` (`Read, Write, Edit, LS, Bash`) | **No** |
| llama-server | `src/infrastructure/llama-server/LlamaServerClient.ts` (shares `ToolExecutor` + `OLLAMA_TOOLS` from `ollama-cli/`) | Same `OLLAMA_TOOLS` via `ToolExecutor` | **No** |

## Requirements

1. **Codex CLI**: pass `--enable standalone_web_search` so the CLI offers its native `web_search` tool to the model. Parse resulting `web_search` JSON events so the UI shows the search happening (tool-use style).
2. **Ollama + llama-server**: add a `WebSearch` tool definition to the shared `OLLAMA_TOOLS` array. Implement the actual search using a **free / no-API-key backend** — scrape DuckDuckGo HTML results (or fall back to Bing HTML if DDG shows an anomaly/CAPTCHA).
3. The Query Manager (`Quill` agent) prompts already instruct the model to use `WebSearch`, so no agent prompt changes are required for Claude CLI. For Ollama/llama-server the tool name must be `WebSearch` to match the prompt.
4. UI should show a tool-use event when web search runs (same `toolUse` StreamEvent used for Read/Write), so progress is visible.
5. No new IPC channels, no new stores, no UI components — purely infrastructure wiring.

## Scope (in)

- `src/infrastructure/codex-cli/CodexCliClient.ts` — add `--enable standalone_web_search` arg, parse `web_search` JSON events into tool-use stream events
- `src/infrastructure/ollama-cli/tools.ts` — add `WebSearch` tool definition
- `src/infrastructure/ollama-cli/ToolExecutor.ts` — add `WebSearch` case that performs an HTTP search and returns results
- Shared by llama-server automatically (it imports `OLLAMA_TOOLS` and `ToolExecutor` from `ollama-cli/`)
- Progress stage inference in `StreamSessionTracker` (already classifies unknown tools as no-op; no change needed unless we want a "researching" stage — out of scope)
- Docs: `docs/architecture/INFRASTRUCTURE.md` (new tool), `CHANGELOG.md` entry

## Scope (out)

- Adding a paid search API key flow (Tavily / Brave / Google CSE)
- Adding a "searching" progress stage — keep existing `reading` stage
- Renderer changes — the existing `toolUse` event surface is sufficient
- Changes to `QueryService` or the Quill agent prompt — they already reference `WebSearch`

## Constraints

- Must work offline-of-API-keys: the free DuckDuckGo HTML scrape must be the default, no user configuration required.
- DuckDuckGo now shows an anomaly/CAPTCHA challenge from `html.duckduckgo.com/html/` and `lite.duckduckgo.com/lite/` for direct curl requests from this server. The implementation must fall back to Bing HTML (`https://www.bing.com/search?q=...`) which is scrape-friendly, OR use the DuckDuckGo Instant Answer API (`https://api.duckduckgo.com/?q=...&format=json&no_html=1`) for abstract summaries (limited but works).
- Keep the tool name `WebSearch` so existing Quill prompts work unchanged for all providers.
- No new dependencies — use Node's built-in `fetch`.
- Rate limiting: the ToolExecutor should cap concurrent searches and strip results to a reasonable length (≤ 4KB per result, ≤ 10 results).

## Codex CLI capabilities (verified)

- `codex --version` → `codex-cli 0.143.0`
- `codex --help` mentions `--search` as an interactive-mode flag. `codex exec --help` does NOT have `--search`, but supports `--enable <FEATURE>` which sets `features.<name>=true`.
- `codex features list` shows feature `standalone_web_search` as `under development  false` — enabling it activates a native `web_search` tool.
- Test: `echo "Search for X" | codex exec --enable standalone_web_search --json -s workspace-write --skip-git-repo-check -` → emits:
  - `{"type":"item.started","item":{"type":"web_search","id":"call_...","query":"","action":{"type":"other"}}}`
  - `{"type":"item.completed","item":{"type":"web_search","id":"call_...","query":"OpenAI GPT-5 release date","action":{"type":"search","query":"..."}}}`
  - followed by `agent_message` with the answer including source URLs.
- Codex's existing `extractToolInfo` will not match `web_search` items (it filters to `read/write/edit/ls`-like names), so we need to add explicit handling for `type === 'web_search'` to emit a `toolUse` StreamEvent.

## Acceptance

- All four providers can complete `QueryService.researchTargets()` and `fillTargetField()` successfully (agent gets search results back in-context and uses them to write to `source/query-tracker.md`).
- `npm run lint` (tsc --noEmit) passes.
- No new user-facing configuration required.