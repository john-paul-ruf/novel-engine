# Forge Build — Novel Engine / query-manager

Add a query management system: new `query-agents` pipeline phase after `publish` that unlocks a standalone Query Manager view where authors track submission targets (agents, publishers, platforms), generate personalized AI query letters per target, and monitor the full submission lifecycle.

**Program dir:** `prompts/session-program/program-019/`
**Input:** `prompts/session-program/program-019/input-files/query-manager-spec.md`

## Protocol — Each iteration:
1. Read `FORGE-CONFIG.md` (project root — module registry, stack, conventions, verification)
2. Read `prompts/session-program/program-019/STATE.md` (done, pending, blocked)
3. Pick the next `pending` session whose dependencies are all `done`
4. Read `prompts/session-program/program-019/SESSION-NN.md` fully + its Module Context files
5. Read affected files before modifying — never edit from a stale mental model
6. Execute precisely. Follow FORGE-CONFIG conventions (naming, error handling, JSDoc)
7. Verify — session checks + `npx tsc --noEmit` (there is no test suite)
8. Update `prompts/session-program/program-019/STATE.md` (status, date, notes, handoff)
9. Update architecture docs per `AGENTS.md` if a public API changed
10. Commit: `feat(query-manager): SESSION-NN — {title}`
11. Loop. All done → Final Report.

## Crash Recovery
- Read `prompts/session-program/program-019/STATE.md` → check `in-progress`/`pending`
- Read Handoff Notes + `git status` / `git log --oneline -5`
- Partial session: complete remaining steps, or `git reset --hard HEAD` and restart
- Update STATE.md before stopping (voluntary or forced)

## Stopping Conditions
- All sessions `done` → Final Report
- Blocked → set `blocked` with the issue, skip to next eligible session if independent
- Context limit → update STATE.md + Handoff Notes first
- User input needed → set `blocked` with the specific question

## Final Report
Summary; sessions done/total; files created/modified; architecture impact (new M08 service, M01 types, M09 IPC channels, M10 view + store); verification results (`npx tsc --noEmit`); follow-ups.