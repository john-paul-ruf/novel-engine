# State Tracker — Novel Engine / windows-path-separator-fixes

## Program
Novel Engine

## Feature
windows-path-separator-fixes

## Intent
Make the test suite green on Windows by fixing three path-separator bugs: two
platform-naive test assertions/fakes and one production leak of native separators
into domain-facing book-relative paths.

## Sessions
1 total

## Session Status

| # | Session | Modules | Status | Completed | Notes |
|---|---------|---------|--------|-----------|-------|
| 01 | Fix Windows path-separator failures (3 tests) | M16, M06, M11 | done | 2026-07-19 | All 3 planned files changed: `src/test/fakes.ts`, `src/infrastructure/claude-cli/ClaudeCodeClient.test.ts`, `src/infrastructure/codex-cli/CodexCliClient.ts` |

(Status: pending | in-progress | done | blocked | skipped)

## Dependency Graph

SESSION-01 has no dependencies.

## Architecture Reference (feature-specific)

- **Path convention** (established by this feature):
  - Absolute filesystem paths → native separators via `path.join` / `path.resolve`.
  - Book-relative display/domain paths (e.g. `StreamEvent` `filePath`, `filesTouched`
    keys, `filesChanged` paths) → POSIX `/` separators, regardless of platform.
- Test fakes in `src/test/fakes.ts` (M16) must mirror the path behavior of the real
  services they stand in for (`FileSystemService.getPitchDraftPath` uses `path.join`).
- Full architecture config: `FORGE-CONFIG.md` (project root).

## Scope Summary

| Module | Files | Change |
|--------|-------|--------|
| M16 test | `src/test/fakes.ts` | Fake path built with `path.join` instead of `/` concat |
| M06 claude-cli | `src/infrastructure/claude-cli/ClaudeCodeClient.test.ts` | Platform-aware cwd assertion |
| M11 codex-cli | `src/infrastructure/codex-cli/CodexCliClient.ts` | `normalizeWorkspacePath` emits POSIX separators |

## Design Decisions

1. **Fix the fake, not the test, for Failure 1** — the test assertion
   (`path.join(tempDir, 'drafts', id)`) matches the real `FileSystemService`
   contract; the fake diverged. Aligning the fake keeps fakes faithful to
   production behavior.
2. **Fix the test, not production, for Failure 2** — `cwd` is a real path handed
   to `spawn`; native separators via `path.join` are correct on every platform.
   The hardcoded `/` in the assertion was the bug.
3. **Fix production, not the test, for Failure 3** — book-relative `filePath`
   values are domain/display data (UI rendering, `filesTouched` map keys). POSIX
   `/` is the codebase-wide convention; leaking `\` on Windows would also break
   cross-platform consistency of stored/streamed data, not just this test.
4. **`ToolExecutor.resolveSafe` left untouched** — its `path.relative` use is a
   containment check only; platform-safe as written.

## Handoff Notes

### SESSION-01 (2026-07-19)

**Built:** All three fixes exactly as specified — fake `getPitchDraftPath` now uses
`path.join` (fakes.ts also gained a `node:path` import); `ClaudeCodeClient.test.ts`
cwd assertion uses `path.join(BOOKS_DIR, 'my-book')` (the `--add-dir ${BOOKS_DIR}`
assertion at line 181 was left untouched, per the session); `normalizeWorkspacePath`
in `CodexCliClient.ts` converts `path.sep` → `/` on the success branch only.

**Verification:** `npx tsc --noEmit` clean; targeted tests 37/37; full suite
1388/1388 green on macOS (fixes are POSIX no-ops as expected).

**Windows CI: NOT re-run — pending external verification.** The repo has only
`.github/workflows/release.yml`; no re-runnable Windows test job was available
from this (macOS) box. Someone with the Windows CI box should confirm 1388/1388.

**Environment note (not a code issue):** the local `better-sqlite3` native binding
was compiled against a mismatched Node ABI (NODE_MODULE_VERSION 130 vs 127), which
made every DB-backed test fail before this session touched anything. Fixed via
`npm rebuild better-sqlite3`. If tests suddenly fail wholesale after a Node/Electron
switch, rebuild again.
