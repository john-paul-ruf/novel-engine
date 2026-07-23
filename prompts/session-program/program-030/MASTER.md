# Forge Build — Novel Engine / auto-resume-max-turns

## Protocol — Each iteration:

1. Read `FORGE-CONFIG.md` (project root — registry, stack, conventions, verification)
2. Read `prompts/session-program/program-030/STATE.md` (done, pending, blocked)
3. Pick the next pending session whose dependencies are all done
4. Read `prompts/session-program/program-030/SESSION-NN.md` fully + Module Context files
5. Read every affected file before modifying it
6. Execute precisely. Follow conventions.
7. Verify — session checks + FORGE-CONFIG compliance (`npx tsc --noEmit`, `npm test`)
8. Update `prompts/session-program/program-030/STATE.md` (status, date, notes, handoff)
9. Update architecture docs if a new module or changed public API (see `AGENTS.md`)
10. Commit: `feat(auto-resume-max-turns): SESSION-NN — {title}`
11. Loop. All done → Final Report.

## Crash Recovery

- Read `prompts/session-program/program-030/STATE.md` → check in-progress/pending
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
verification results, follow-up items.

## Session Order

```
SESSION-01 (domain types — isMaxTurns + maxTurnsResume StreamEvent)
  ├── SESSION-02 (claude-cli — flag error_max_turns)     [parallel with 03]
  ├── SESSION-03 (ollama + llama-server — exit reason)   [parallel with 02]
  └── SESSION-04 (AutoTurnResumer class + wiring)
        └── SESSION-05 (renderer streamHandler + full suite)
```

SESSION-02 and SESSION-03 are independent — can be executed in either order.
SESSION-04 requires SESSION-01, SESSION-02, and SESSION-03 to be done.
SESSION-05 requires SESSION-04 to be done.

## Documentation (per AGENTS.md)

After ALL sessions are done, update:
- `CHANGELOG.md` — append entry for the entire feature
- `docs/architecture/DOMAIN.md` — new StreamEvent variants (`isMaxTurns`, `maxTurnsResume`)
- `docs/architecture/INFRASTRUCTURE.md` — provider max-turn signaling behavior
- `docs/architecture/APPLICATION.md` — new `AutoTurnResumer` service
- `docs/architecture/ARCHITECTURE.md` — updated dependency graph (new wrapper in composition root)
- `docs/architecture/RENDERER.md` — `streamHandler` new `maxTurnsResume` case (if touched)