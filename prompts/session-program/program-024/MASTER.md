# Forge Build — Novel Engine / query-tracker-parse-resilience

Fix the query-agents "no results" failure chain: lenient tracker parsing, hardened
prompts, reliable filesTouched tracking, and silent-failure/data-loss guards.
Diagnosis and evidence: `prompts/session-program/program-024/input-files/bug-report.md`.

## Protocol — Each iteration:

1. Read `FORGE-CONFIG.md` (project root) — module registry, stack, conventions, verification.
2. Read `prompts/session-program/program-024/STATE.md` — what is done, pending, blocked.
3. Pick the next `pending` session whose dependencies are all `done`
   (01/02/03 are independent; 04 requires 01).
4. Read `prompts/session-program/program-024/SESSION-NN.md` fully, plus every file in
   its Module Context table.
5. Read each affected source file before modifying it.
6. Execute precisely. Follow FORGE-CONFIG conventions (naming, error handling, path
   aliases, no `any`).
7. Verify — session-specific checks plus `npx tsc --noEmit`.
8. Update `prompts/session-program/program-024/STATE.md`: status, date, notes, Handoff Notes.
9. Update architecture docs only if a public API changed (none expected in this program).
10. Commit: `feat(query-tracker-parse-resilience): SESSION-NN — {title}`.
11. Loop. When all sessions are done → Final Report.

## Crash Recovery

- Read `prompts/session-program/program-024/STATE.md` → check `in-progress`/`pending`.
- Read Handoff Notes + `git status` / `git log --oneline -5`.
- Partial session: complete the remaining steps, or `git reset --hard HEAD` and restart
  that session cleanly.
- Always update STATE.md before stopping, voluntary or forced.

## Stopping Conditions

- All sessions `done` → Final Report.
- Session blocked (e.g. CLI NDJSON lacks `tool_use_id` on tool_result) → set `blocked`
  with the question in Notes, move to the next eligible session.
- Context limit approaching → update STATE.md + Handoff Notes, stop.
- User input needed → set `blocked` with a specific question.

## Final Report

Produce: summary of the fix chain, sessions done/total, files created/modified per
module ID, verification results (`npx tsc --noEmit` + the manual checks from
SESSION-03 §V2 and SESSION-04 §V2), and follow-ups (e.g. deferred renderer surfacing
from SESSION-04, other pipeline phases that could adopt content markers).
