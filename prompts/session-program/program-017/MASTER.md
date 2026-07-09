# Forge Build — Novel Engine / codex-file-only-completion

## Protocol — Each iteration

1. Read `./FORGE-CONFIG.md` for stack, module registry, conventions, and verification.
2. Read `./prompts/session-program/program-017/STATE.md` for status and dependency order.
3. Pick the next pending session whose dependencies are all done.
4. Read that `./prompts/session-program/program-017/SESSION-NN.md` fully.
5. Read every file listed in **Files to Create/Modify** before editing.
6. Implement exactly what the session asks. Keep changes surgical.
7. Verify with session checks plus `npx tsc --noEmit`.
8. Update `./prompts/session-program/program-017/STATE.md` with status, date, notes, and handoff.
9. Update affected architecture docs only.
10. Append mandatory `./CHANGELOG.md` entry for the session.
11. Commit using `fix(codex-file-only-completion): SESSION-NN — {title}` if committing is part of the run.

## Crash Recovery

- Read `./prompts/session-program/program-017/STATE.md`.
- Check `git status` and recent commit log.
- If a session is partially complete, finish it or reset only that session's changes and restart.
- Record recovery notes in **Handoff Notes** before stopping.

## Stopping Conditions

- All sessions done → final report.
- Blocked → set session status to `blocked` with a concrete question.
- Context limit → update `./prompts/session-program/program-017/STATE.md` with exact handoff.
- Verification failure → fix or mark blocked with logs.

## Final Report

Include summary, sessions done/total, files modified, architecture impact, verification results, and follow-up risks.
