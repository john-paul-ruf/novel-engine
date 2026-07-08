# Forge Build — Novel Engine / version-history-everywhere

## Protocol — Each iteration:

1. Read `FORGE-CONFIG.md` (module registry, stack, conventions, verification commands)
2. Read `prompts/session-program/program-012/STATE.md` (done, pending, blocked)
3. Pick the next pending session whose dependencies are all done
4. Read `prompts/session-program/program-012/SESSION-NN.md` fully + its Module Context files
5. Read every affected file before modifying it
6. Execute precisely. Follow conventions (`ne-*` tokens, no `dark:` variants, renderer accesses backend only via `window.novelEngine`)
7. Verify — session checks + FORGE-CONFIG compliance (`npx tsc --noEmit` minimum)
8. Update STATE.md (status, date, notes, Handoff Notes)
9. Update architecture docs only if a public API changed (none expected — M10 only)
10. Commit: `feat(version-history-everywhere): SESSION-NN — {title}`
11. Loop. All done → Final Report.

## Crash Recovery

- Read `prompts/session-program/program-012/STATE.md` → check in-progress/pending
- Read Handoff Notes + `git status` / `git log --oneline -5`
- Partial session: complete the remaining steps, or `git reset --hard HEAD` and restart the session
- Update STATE.md before stopping (voluntary or forced)

## Stopping Conditions

- All sessions done → Final Report
- Blocked → set status `blocked` with the reason, skip to the next eligible session
- Context limit → update STATE.md + Handoff Notes first
- User input needed → set `blocked` with the specific question

## Final Report

Summary, sessions done/total, files created/modified, architecture impact (expected: none —
renderer-only), verification results (`npx tsc --noEmit`, zinc-grep audit, manual pass
checklist status), follow-up items (out-of-scope zinc components logged in Handoff Notes).
