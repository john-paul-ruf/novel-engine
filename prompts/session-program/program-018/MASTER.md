# Forge Build — Novel Engine / codex-stream-error-hardening

Fix the Codex CLI provider: parse the 0.27.0 event envelope, surface real stream-failure
reasons, and retry fully-empty transient stream failures.

**Program dir:** `prompts/session-program/program-018/`
**Input:** `prompts/session-program/program-018/input-files/codex-stream-error-report.md`

## Protocol — Each iteration:

1. Read `FORGE-CONFIG.md` (project root — module registry, stack, conventions, verification)
2. Read `prompts/session-program/program-018/STATE.md` (done, pending, blocked)
3. Pick the next `pending` session whose dependencies are all `done`
   (order here is strictly 01 → 02 → 03)
4. Read `prompts/session-program/program-018/SESSION-NN.md` fully + its Module Context files
5. Read affected files before modifying — `src/infrastructure/codex-cli/CodexCliClient.ts`
   changes in every session; never edit from a stale mental model
6. Execute precisely. Follow FORGE-CONFIG conventions (naming, error handling, JSDoc)
7. Verify — session checks + `npx tsc --noEmit` (there is no test suite; the desk-check
   steps in each session are mandatory)
8. Update `prompts/session-program/program-018/STATE.md` (status, date, notes, handoff)
9. Update architecture docs if a public API changed (none expected — all changes are
   internal to M11 plus two additive M01 constants)
10. Commit: `feat(codex-stream-error-hardening): SESSION-NN — {title}`
11. Loop. All done → Final Report.

## Crash Recovery

- Read `prompts/session-program/program-018/STATE.md` → check `in-progress`/`pending`
- Read Handoff Notes + `git status` / `git log --oneline -5`
- Partial session: complete the remaining steps, or `git reset --hard HEAD` and restart it
- Update STATE.md before stopping (voluntary or forced)

## Stopping Conditions

- All sessions `done` → Final Report
- Blocked (e.g. the real 0.27.0 event shapes observed at runtime contradict a session spec)
  → set `blocked` with the observed JSON lines pasted into Handoff Notes, skip to next
  eligible session if independent (none are — stop and report)
- Context limit → update STATE.md + Handoff Notes first
- User input needed → set `blocked` with the specific question

## Final Report

Summary; sessions done/total; files created/modified; architecture impact (M11 internals,
M01 additive constants); verification results (`npx tsc --noEmit` + desk-checks); follow-ups —
recommend the user also upgrade the global Codex CLI (`npm install -g @openai/codex@latest`)
so Novel Engine switches to the `--add-dir` workspace mode, and re-run the original
"expand the chapters with lore and scene expansion" task against book `open-channel`.
