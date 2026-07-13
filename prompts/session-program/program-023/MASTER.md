# Forge Build — Novel Engine / query-research-failure-handling

Fixes the silent failure of Query Manager → Research Targets: turn starvation,
error-results-as-success, tracker corruption via auto-save, and missing UI feedback.

## Protocol — Each iteration:

1. Read `FORGE-CONFIG.md` (module registry, stack, conventions, verification).
2. Read `prompts/session-program/program-023/STATE.md` (done, pending, blocked).
3. Pick the next `pending` session whose dependencies are all `done`.
   Order: SESSION-01 and SESSION-03 first (independent), then SESSION-02, then SESSION-04.
4. Read `prompts/session-program/program-023/SESSION-NN.md` fully + its Module Context files.
5. Read every affected file before modifying it.
6. Execute precisely. Follow Novel Engine conventions (strict layer flow
   `DOMAIN <- INFRASTRUCTURE <- APPLICATION <- IPC/MAIN <- RENDERER`, injected
   interfaces, no reverse imports).
7. Verify — run the session's checks plus `npx tsc --noEmit`.
8. Update `prompts/session-program/program-023/STATE.md` (status, date, notes, handoff).
9. Update architecture docs only if a public API changed (SESSION-03 changes
   `IChatService.sendMessage` — note it in STATE.md Design Decisions if adjusted).
10. Commit per FORGE-CONFIG git conventions.
11. Loop. All sessions done → Final Report.

## Crash Recovery

- Read `prompts/session-program/program-023/STATE.md` → check `in-progress`/`pending`.
- Read Handoff Notes + `git status` / `git log`.
- Partial session: complete the remaining steps, or `git reset --hard HEAD` and restart it.
- Always update STATE.md before stopping (voluntary or forced).

## Stopping Conditions

- All sessions `done` → Final Report.
- Blocked → set status `blocked` with the reason, skip to next eligible session.
- Context limit → update STATE.md + Handoff Notes, stop cleanly.
- User input needed → set `blocked` with the specific question.

## Final Report

Summary; sessions done/total; files created/modified; architecture impact
(`IChatService.sendMessage` gained `maxTurnsOverride?`; new
`PHASE_OUTPUT_CONTENT_MARKERS` in domain constants); verification results
(`npx tsc --noEmit` clean, manual research-flow test); follow-ups (remind the user to
delete the corrupted `source/query-tracker.md` in the `open-channel` book before
re-testing, per STATE.md "Known Data Cleanup").
