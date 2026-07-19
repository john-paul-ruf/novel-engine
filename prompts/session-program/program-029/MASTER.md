# Forge Build — Novel Engine / windows-path-separator-fixes

## Protocol — Each iteration:

1. Read `FORGE-CONFIG.md` (project root — registry, stack, conventions, verification)
2. Read `prompts/session-program/program-029/STATE.md` (done, pending, blocked)
3. Pick the next pending session whose dependencies are all done
4. Read `prompts/session-program/program-029/SESSION-NN.md` fully + Module Context files
5. Read every affected file before modifying it
6. Execute precisely. Follow conventions.
7. Verify — session checks + FORGE-CONFIG compliance (`npx tsc --noEmit`, `npm test`)
8. Update `prompts/session-program/program-029/STATE.md` (status, date, notes, handoff)
9. Update architecture docs if a new module or changed public API (none expected here)
10. Commit: `fix(windows-path-separator-fixes): SESSION-NN — {title}`
11. Loop. All done → Final Report.

## Crash Recovery

- Read `prompts/session-program/program-029/STATE.md` → check in-progress/pending
- Read Handoff Notes + `git status` / `git log`
- Partial session: complete remaining steps, or `git reset --hard HEAD` and restart it
- Update STATE.md before stopping (voluntary or forced)

## Stopping Conditions

- All sessions done → Final Report
- Blocked → set `blocked` in STATE.md, skip to next eligible session
- Context limit → update STATE.md + Handoff Notes, stop cleanly
- User input needed → set `blocked` with the specific question

## Final Report

Summary, sessions done/total, files created/modified, architecture impact,
verification results (including whether the Windows CI job was re-run), follow-up items.
