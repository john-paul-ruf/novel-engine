# State Tracker — Novel Engine / ollama-about-json-corruption

## Program
Novel Engine — Electron 33 / React 18 / TypeScript 5 desktop app, Clean Architecture (5 layers).

## Feature
`ollama-about-json-corruption` — fix the `ToolExecutor.extractStringValue` bug that strips JSON file
contents to their first string value when Ollama-backed agents write to JSON files such as `about.json`,
add a `.json`-file guard in `executeWrite` as defense in depth, and tighten the `SPARK_METADATA_PROMPT`
that exposed the bug.

## Intent
After this program: any Ollama- or llama-server-backed agent that emits a `Write` tool call whose `content`
is the byte-exact JSON string of a `.json` file will write the full object verbatim — never the first inner
string, never `{...}` placeholders. Claude CLI and Codex CLI remain unaffected (they don't go through
`ToolExecutor`). `about.json` is the canonical test target; the fix protects every JSON file in the book
directory.

## Sessions

3 sessions, ordered by dependency. SESSION-01 is the root fix; SESSION-02 adds the guard and locks the
behavior in with a Vitest regression test; SESSION-03 tightens the renderer prompt as defense in depth.

## Session Status

| # | Session | Modules | Status | Completed | Notes |
|---|---------|---------|--------|-----------|-------|
| 01 | Stop ToolExecutor from parsing Write content as JSON | M07 | done | 2026-07-18 | `raw` flag added to `requireString`/`extractStringValue`; only the Write `content` call site sets it |
| 02 | JSON-file guard + regression test | M07, (M12) | done | 2026-07-18 | `.json` guard in `executeWrite`; 4 regression tests; fresh minimal Vitest harness installed |
| 03 | Tighten the SPARK_METADATA_PROMPT | M10 | done | 2026-07-18 | Prompt replaced with constrained JSON-output rules; `useOpenSpark` untouched |

Status values: pending | in-progress | done | blocked | skipped

## Dependency Graph

```
S01 ─→ S02        (S02's test asserts the S01 fix)
S01 ─→ S03        (S03 reinforces the S01 fix at the prompt layer, no source dependency)
                    S03 may run in parallel with S02 once S01 is done
```

## Architecture Reference

The fix touches one infrastructure module (`M07 ollama-cli`) and one renderer file.

| ID | Module | Affected | Why |
|----|--------|----------|-----|
| M07 | `src/infrastructure/ollama-cli/ToolExecutor.ts` | S01, S02 | `extractStringValue` + `executeWrite` |
| M07 | `src/infrastructure/llama-server/LlamaServerClient.ts` | (transitive) | Imports `ToolExecutor` from `../ollama-cli/`; single fix covers both |
| M10 | `src/renderer/components/Files/AboutJsonViewer.tsx` | S03 | `SPARK_METADATA_PROMPT` constant only |

No new modules. No IPC channels. No new stores. No new agent prompt files.

## Scope Summary (indexed by ID)

- **M07 ollama-cli** — the bug and the fix live here. Two source files (`ToolExecutor.ts`, new `ToolExecutor.test.ts`).
- **M10 renderer** — one prompt string in one component file. No behavior change in UI plumbing.

## Design Decisions

### 1. Fix at `extractStringValue`, not at the caller's call site

**Choice:** Add a `raw: boolean` flag to `requireString` / `extractStringValue` and pass `raw=true` only at the `executeWrite` `content` extraction. Leave `executeRead`/`executeLS`/`executeBash`/`executeEdit` on the existing recursive-unwrap path.

**Rationale:** The recursive parse-and-extract path is correct for path-like and command-like arguments — small/medium Ollama models frequently wrap them in nested objects, and unwrapping recovers the call. The bug is specific to *file-payload* fields where the string is the byte-exact file content. A flag at the boundary is smaller and safer than re-architecting `extractStringValue`, and it keeps the recovery path for malformed args intact.

### 2. Add a `.json` file guard in `executeWrite`, even after the source fix

**Choice:** In `executeWrite`, when the target path ends in `.json`, validate the extracted content parses as JSON. If not, AND the raw `args.content` (preserved as-is) parses as JSON, restore the raw string and emit a warning in `ToolResult.content`.

**Rationale:** Defense in depth. The source fix (S01) prevents today's known failure mode; the guard (S02) protects every JSON file in the book directory against any future extractor regression. The cost is one `JSON.parse` per `.json` Write — negligible. The guard is conservative: it never blocks a non-JSON file, never restores the raw string unless the raw string itself parses, and always surfaces the action in the tool result message so the renderer shows it.

### 3. Tighten `SPARK_METADATA_PROMPT`, do not move `about.json` writes out of Spark's hands

**Choice:** Rewrite the prompt to require valid JSON output, name the five preserved canonical fields, and forbid prose wrapping. Keep Spark as the writer.

**Rationale:** Moving the metadata write into Novel Engine itself (the "agent only returns the fields, app does the merge" approach) would require a new IPC round-trip, a new JSON-merge path, and would break the pitch-room flow that lets Spark freely enrich book metadata. The prompt tightening is one string replacement and achieves the same constraint at the model layer. The ToolExecutor guard (S02) is the real last line of defense; the prompt is the first.

### 4. Allow SESSION-03 to run independent of SESSION-02

**Choice:** S03 depends on S01 only loosely; the renderer change is defense in depth and ships value even if S02 has not run.

**Rationale:** S03 touches only one renderer string. S02 may take longer because of the Vitest install decision. Decoupling S03 from S02 means S03 can land first if it's quick, and S02 follows at its own pace.

### 5. Don't touch Claude CLI or Codex CLI

**Choice:** Leave them untouched.

**Rationale:** Neither provider routes tool-call arguments through Novel Engine code. Claude CLI's `ToolExecutor` is the CLI itself; the model's file payload goes straight from the model to disk inside the CLI's sandbox. Same for Codex. The fix is M07-only. Verified via `src/infrastructure/claude-cli/ClaudeCodeClient.ts` (no `ToolExecutor` import) and `src/infrastructure/codex-cli/CodexCliClient.ts` (no `ToolExecutor` import).

## Handoff Notes

Agents write here after each session.

### After SESSION-01
- The `raw` flag is in place. `requireString` signature changed from variadic (`...fallbackKeys`) to positional (`fallbackKeys: string[] = [], raw = false`); all six call sites updated to the array form. `extractStringValue(value, raw = false)` skips the JSON-parse-and-descend path when `raw` is true.
- Only `executeWrite`'s `content` extraction passes `raw = true`. `executeEdit`/`executeRead`/`executeLS`/`executeBash`/`executeWebSearch` remain on the recursive-unwrap path, per Design Decision 1.
- Both helpers are private; grep confirmed no callers outside `ToolExecutor.ts`, so llama-server picks up the fix transitively with no changes.
- `npx tsc --noEmit` passes. Manual Ollama reproduction not re-run (ephemeral harness at `/tmp/ne-ollama-test/` — SESSION-02's regression test will lock the behavior in).
- SESSION-02 can now add the `.json` guard in `executeWrite` and the co-located regression test.

### After SESSION-02
- **Vitest installed fresh** (`vitest@^4.1.10`, devDependency) — program-026's harness had NOT shipped (its SESSION-01 is still `pending`). Added `test`/`test:watch` scripts to `package.json` and a minimal `vitest.config.ts` (node environment, `src/**/*.test.ts`, `@domain`/`@infra`/`@app` aliases). **Program-026 maintainers:** merge carefully — extend this config rather than duplicating it; do not clobber the `test` script.
- Guard added to `executeWrite`: for `.json` targets whose extracted content fails `JSON.parse`, it restores the first JSON-shaped string among the raw `content`/`text`/`data` args if that string parses; otherwise it writes as extracted and surfaces a warning.
- **Deviation from the session snippet:** the snippet computed `rawContentArg = args.content ?? args.text ?? args.data`, but in Test B `args.content` is the mangled string, so the restore branch could never fire and Test B could not pass (post-S01 extraction returns strings verbatim, so extracted ≡ raw for that expression). Implemented instead as "first JSON-shaped string among content/text/data" — same conservative behavior, and it makes the guard reachable/testable. Test B passes.
- **New `executeWrite` warning contract:** `ToolResult.content` may now carry a "restored raw argument" or "non-JSON content" warning for `.json` targets. UI surfaces showing tool results display this verbatim — desired behavior.
- All 4 tests pass (`npm test -- src/infrastructure/ollama-cli/ToolExecutor.test.ts`); `npx tsc --noEmit` clean.
- Note: `vitest.config.ts` and `ToolExecutor.test.ts` existed as empty 0-byte files before this session (IDE scaffolding); they were filled in, not newly created.
- SESSION-03 can proceed (renderer-only, independent of the guard).

### After SESSION-03
- `SPARK_METADATA_PROMPT` replaced with the constrained version from SESSION-03.md verbatim: requires valid JSON output (no prose/fences/comments), pins the five canonical fields (`title`, `author`, `status`, `created`, `coverImage`), forbids value changes to the first four, names the exact Write argument shape (`file_path="about.json"`, full JSON object as `content`), and caps speculative enrichment.
- `useOpenSpark` and all plumbing unchanged. Prompt remains module-private (not exported); grep confirmed no other importers.
- No renderer snapshot suite exists (program-026 has not shipped), so no snapshot updates were needed.
- `npx tsc --noEmit` clean; full `npm test` green (4/4).

## Crash Recovery

- Read this STATE.md → find any `in-progress` row.
- Read the matching SESSION-NN.md fully.
- Read `git status` and `git log --oneline -5` to see how far the agent got.
- If a session is half-done: complete the remaining files, OR `git reset --hard HEAD` and restart the session. Update STATE.md before stopping either way.
- S01 and S02 modify the same file (`ToolExecutor.ts`) — never run them in parallel.

## Final Report

**Summary** — Ollama-backed agents writing JSON files (canonically `about.json`) had their `Write` content silently reduced to the file's first string value: `ToolExecutor.extractStringValue` treated the properly-escaped JSON payload as a wrapped argument, parsed it, and walked to the first inner string. This program fixed the extractor (a `raw` flag makes the Write `content` field bypass the recursive JSON-unwrap while path-like fields keep their malformed-arg recovery), added a conservative `.json`-target guard in `executeWrite` that restores a JSON-shaped raw argument when extraction produces non-parsing content (surfacing a warning in the tool result), and tightened `SPARK_METADATA_PROMPT` to require valid JSON output and pin the canonical metadata fields. llama-server gains both engine-side layers transitively via the shared `ToolExecutor`; Claude CLI and Codex CLI were never affected.

**Sessions done/total** — 3/3.

**Files modified** — `src/infrastructure/ollama-cli/ToolExecutor.ts`, `src/renderer/components/Files/AboutJsonViewer.tsx`, `package.json` (test scripts + vitest devDependency).

**Files created** — `src/infrastructure/ollama-cli/ToolExecutor.test.ts`, `vitest.config.ts` (program-026's harness had not shipped; both existed as empty 0-byte placeholder files and were filled in).

**Architecture impact** — Single M07 fix; one M10 renderer string. No new modules, IPC channels, or stores. llama-server covered transitively via the shared `ToolExecutor` import. New contract: `executeWrite`'s `ToolResult.content` may carry a "restored raw argument" / "non-JSON content" warning for `.json` targets.

**Verification** — `npx tsc --noEmit` passes; `npm test -- src/infrastructure/ollama-cli/ToolExecutor.test.ts` all green (4/4: JSON regression, guard restore, non-JSON happy path, nested-path recovery).

**Regression status** — Test A in `ToolExecutor.test.ts` replays the exact corrupt-case payload from REPRODUCTION_NOTES.md (`content` = escaped JSON of the full about.json object) and asserts the full object lands on disk — the bare-title corruption signature no longer reproduces. The live-Ollama harness (`/tmp/ne-ollama-test/spark-metadata.mjs`, ephemeral) was not re-run; the unit test locks in the same payload deterministically.

**Follow-ups** —
- Program-026's broader Vitest harness: when it ships, extend this program's minimal `vitest.config.ts` (node env, `src/**/*.test.ts`, path aliases) rather than duplicating; the `test`/`test:watch` scripts already exist.
- SESSION-02 deviation to fold back into any future spec: the guard's raw-argument candidate is the first JSON-shaped string among `content`/`text`/`data` (the session's `args.content ?? args.text ?? args.data` expression could never fire the restore branch post-S01 and failed its own Test B).
- Consider whether `Edit`'s `old_string`/`new_string` should also get `raw=true` (separate session if needed).
- Broader audit of other agents that `Write` .json files — likely zero per current agent prompts.