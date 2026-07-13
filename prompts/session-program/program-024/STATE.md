# State Tracker — Novel Engine / query-tracker-parse-resilience

## Program
Novel Engine — Electron 33 / React 18 / TypeScript 5, Clean Architecture (see FORGE-CONFIG.md)

## Feature
query-tracker-parse-resilience

## Intent
Make the query-agents pipeline resilient to LLM format drift: lenient tracker parsing,
hardened prompts, reliable file-write tracking, and no silent failures or data loss.
(Bug diagnosis: `input-files/bug-report.md`.)

## Sessions
4

## Session Status

| # | Session | Modules | Status | Completed | Notes |
|---|---------|---------|--------|-----------|-------|
| 01 | Lenient tracker parsing + content marker | M08, M01 | done | 2026-07-12 | Regex exactly as specced; no deviations |
| 02 | Harden research & field-fill prompts | M08 | done | 2026-07-12 | Both prompts hardened; generate prompt needed no change |
| 03 | Reliable filesTouched tracking (Claude CLI) | M06 | done | 2026-07-12 | Map-based tool resolution; manual live-run check deferred to Final Report |
| 04 | Surface silent failures + clobber guard | M08, M01 | pending | | |

(Status: pending | in-progress | done | blocked | skipped)

## Dependency Graph

```
SESSION-01 ──► SESSION-04
SESSION-02 (independent)
SESSION-03 (independent)
```

01, 02, 03 may run in any order (or the same iteration picks them sequentially).
04 requires 01 done — its clobber guard relies on the lenient parser so that
bracket-less-but-valid files are not misclassified as unparseable.

## Architecture Reference (feature-specific)

- Parsing/serialization of `source/query-tracker.md` lives ONLY in
  `src/application/QueryService.ts` (M08). Canonical heading: `## [Name] — status`.
- `PHASE_OUTPUT_CONTENT_MARKERS` in `src/domain/constants.ts` (M01) must stay
  regex-compatible with `QueryService.SECTION_HEADING` — sync via comments, no imports
  (M01 imports from nothing).
- `filesTouched` is populated only inside provider clients (M06/M11 etc.) via
  `StreamSessionTracker.touchFile`; `ChatService` (M08) consumes it from the done event.

## Scope Summary

| Module | Files Touched |
|--------|---------------|
| M01 domain | `src/domain/constants.ts` (S01), `src/domain/types.ts` (S04) |
| M06 claude-cli | `src/infrastructure/claude-cli/ClaudeCodeClient.ts`, `StreamSessionTracker.ts` (S03) |
| M08 application | `src/application/QueryService.ts` (S01, S02, S04) |
| M10 renderer | possible ~15-line warning surfacing (S04, optional) |

## Design Decisions

1. **Lenient read, strict write.** Parser accepts optional brackets and `-`/`–`/`—`
   separators; `serializeTracker` keeps emitting canonical form. Rationale: LLM output
   drifts; round-tripping through the app self-heals files.
2. **Prompt shows a filled-in example, not a placeholder.** `[Target Name]` invites
   bracket-dropping; a concrete `## [Jane Doe] — drafting` with an explicit
   "brackets are literal" note does not.
3. **Touch files on tool RESULT, keyed by tool_use_id.** Recording at tool start would
   count failed writes; a `toolId → meta` map fixes the parallel-tool single-slot bug.
4. **Warn, don't throw, on changed-but-unparsed tracker.** The research output exists
   on disk and is user-recoverable; throwing would misreport the research as failed.
5. **Archive-before-clobber instead of blocking saves.** Guard must never make the UI
   unable to save; unparseable content is preserved to `query-tracker-unparsed-*.md`.

## Handoff Notes

_(Agents append here after each session: what was done, deviations, gotchas for the next session.)_

- 2026-07-12 (Forge): The affected book `open-channel` was manually recovered — its
  tracker headings were re-bracketed via sed; backup at `/tmp/query-tracker.backup.md`.
  Do not treat that book as a repro case for the pre-fix bug.
- 2026-07-12 (Mu, S01): Lenient parsing landed. `QueryService.SECTION_HEADING`
  (private static) is the single source for both the global scan and per-section
  header match in `parseTrackerContent`; `serializeTracker` unchanged (strict write).
  `PHASE_OUTPUT_CONTENT_MARKERS['query-agents']` loosened to the same shape (regex
  duplicated in M01 by necessity — sync comments in both files). Spot-checked all 6
  specced heading cases plus parenthesized names and hyphenated names — all pass.
  `npx tsc --noEmit` clean. SESSION-04's clobber guard can now rely on this parser.
- 2026-07-12 (Mu, S02): `buildResearchPrompt` now shows the specced Jane Doe worked
  example with the brackets-are-literal note and correct/wrong contrast line.
  `buildFieldFillPrompt` DID need the same treatment (its `[new value]` template was
  the same placeholder trap) — added a `fieldExamples` map for concrete per-field
  example lines plus a byte-identical / single-bullet edit contract referencing the
  `## [<name>] — <status>` heading. `buildGeneratePrompt` references no tracker
  syntax — unchanged. No bracket-placeholder strings remain (grep-verified); tsc clean.
- 2026-07-12 (Mu, S03): `StreamSessionTracker` gained additive `registerTool`/
  `resolveTool` (toolId → {toolName, filePath} map); `currentToolName/Id` slots kept
  for the raw-streaming path and as fallback. `ClaudeCodeClient` registers at
  tool_use and resolves by `tool_use_id` at tool_result; file path prefers
  `tool_use_result.file.filePath` metadata, falls back to the path captured from
  tool input. `is_error === true` on a tool_result block skips touchFile but still
  emits the toolUse complete event. **is_error NOT verified against live CLI
  NDJSON** — it is the Anthropic API tool_result schema field and the CLI mirrors
  API message shapes; if a CLI version omits it, behavior degrades to touching on
  every result (pre-session behavior, no worse). Other providers (codex-cli,
  ollama-cli, llama-server) confirmed unaffected: constructor unchanged, new
  methods additive, grep shows no other callers. Manual §V2 live-run check
  (no `[ChatService] Post-stream extraction:` when a file was written) deferred
  to the Final Report — needs an interactive `npm start` + Claude CLI run.
