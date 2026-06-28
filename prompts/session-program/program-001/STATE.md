# State Tracker — Novel Engine / codex-cli-support

## Program
**Name:** Novel Engine
**Feature:** codex-cli-support
**Intent:** Add OpenAI Codex CLI as a full model provider with tool-use, auto-detected models, settings UI, and CLI detection.

## Sessions: 6

## Session Status

| # | Session | Modules | Status | Completed | Notes |
|---|---------|---------|--------|-----------|-------|
| 01 | Domain types & constants | M01 | pending | — | Provider ID, type, config, detection flag |
| 02 | CodexCliClient infrastructure | M01, new M11 | pending | — | Core provider implementation |
| 03 | Settings detection | M02 | pending | — | detectCodexCli() method |
| 04 | Composition root registration | M09 | pending | — | Wire into main/index.ts |
| 05 | Renderer settings UI | M10 | pending | — | Provider card in settings panel |
| 06 | Integration verification | all | pending | — | End-to-end type check + manual test |

## Dependency Graph

```
SESSION-01 (domain types)
    ├── SESSION-02 (infrastructure client) ─┐
    ├── SESSION-03 (settings detection)     ├── SESSION-04 (composition root) ── SESSION-05 (UI) ── SESSION-06 (verify)
    └────────────────────────────────────────┘
```

## Architecture Reference

New module:
- `M11` — codex-cli (`src/infrastructure/codex-cli/`) — Spawns `codex exec --json` process, parses JSONL stream, maps events to `StreamEvent`

## Scope Summary

| Module | Impact |
|--------|--------|
| M01 (domain) | Add `CODEX_CLI_PROVIDER_ID`, `hasCodexCli` to AppSettings, provider config |
| M02 (settings) | Add `detectCodexCli()` method |
| M11 (codex-cli) | New module — `CodexCliClient.ts`, `index.ts` |
| M09 (main/ipc) | Register CodexCliClient in composition root |
| M10 (renderer) | Add Codex provider card in settings UI |

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Use `codex exec --json --full-auto` | Non-interactive JSONL streaming, no approval prompts needed |
| Parse `~/.codex/models_cache.json` for model discovery | Codex CLI caches available models locally; same pattern as Ollama's runtime model listing |
| Map Codex events to existing `StreamEvent` union | No domain type changes needed beyond provider registration |
| `--skip-git-repo-check` flag always | Book directories are not git repos |
| Prompt via stdin with `-` | Same pattern as Claude CLI — avoids arg length limits |
| Support `OPENAI_API_KEY` env passthrough | Codex supports both ChatGPT auth and API key auth |

## Handoff Notes
(agents write here after each session)
