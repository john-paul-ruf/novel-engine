# Forge Build — Novel Engine / fix-codex-silent-exit

Fix: Codex CLI provider quits quickly with no visible error when used in Novel Engine.

Input source: `./prompts/session-program/program-015/input-files/bug-report.md`.

## Protocol — Each iteration

1. Read `./FORGE-CONFIG.md` for registry, stack, conventions, and verification commands.
2. Read `./prompts/session-program/program-015/STATE.md`.
3. Pick the next pending session whose dependencies are done.
4. Read `./prompts/session-program/program-015/SESSION-01.md` fully.
5. Read every affected source/doc file before modifying it.
6. Execute the session precisely. Follow layer boundaries and existing error-handling conventions.
7. Verify with `npx tsc --noEmit` plus the session smoke checks.
8. Update `./prompts/session-program/program-015/STATE.md` with status, date, verification, and handoff notes.
9. Update `./docs/architecture/INFRASTRUCTURE.md` and append `./CHANGELOG.md` per `./AGENTS.MD`.
10. Commit: `fix(fix-codex-silent-exit): SESSION-01 — Surface Silent Codex CLI Exits as Errors`.
11. All done → Final Report.

## Crash Recovery

- Read `./prompts/session-program/program-015/STATE.md` and inspect any `in-progress` session.
- Check `git status` and `git log --oneline -5`.
- If partial work exists, either complete the remaining SESSION-01 steps or reset to HEAD and restart.
- Update `./prompts/session-program/program-015/STATE.md` before stopping.

## Stopping Conditions

- SESSION-01 done → Final Report.
- Blocked → set SESSION-01 to `blocked` in `./prompts/session-program/program-015/STATE.md` with the specific blocker and question.
- Context limit → write handoff notes in `./prompts/session-program/program-015/STATE.md`.

## Final Report

Include:

- Summary of source changes.
- Files created/modified.
- Whether early Codex exits now produce a visible diagnostic error.
- Verification output for `npx tsc --noEmit`.
- Any follow-up needed for renderer error display.
