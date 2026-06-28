# Forge Build — Novel Engine / codex-cli-support

## Protocol — Each iteration:
1. Read FORGE-CONFIG.md (registry, stack, conventions, verification)
2. Read STATE.md (done, pending, blocked)
3. Pick next pending session whose dependencies are all done
4. Read SESSION-NN.md fully + Module Context files
5. Read affected files before modifying
6. Execute precisely. Follow conventions.
7. Verify — session checks + FORGE-CONFIG compliance
8. Update STATE.md (status, date, notes, handoff)
9. Update architecture if new module or changed public API
10. Commit (format from FORGE-CONFIG)
11. Loop. All done → Final Report.

## Crash Recovery
- Read STATE.md → check in-progress/pending
- Read Handoff Notes + git status/log
- Partial session: complete remaining or git reset --hard HEAD and restart
- Update STATE.md before stopping (voluntary or forced)

## Stopping Conditions
- All done → Final Report
- Blocked → set blocked, skip to next eligible
- Context limit → update STATE.md + Handoff Notes
- User input needed → set blocked with question

## Final Report
Summary, sessions done/total, files created/modified, architecture impact, verification, follow-up
