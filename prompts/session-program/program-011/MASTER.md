# Forge Build — Novel Engine / tracked-chapter-editing

> Let the user edit Verity-authored chapter drafts, with every change tracked and
> surfaced to the AI. 6 sessions. Program dir:
> `prompts/session-program/program-011/`

## Protocol — Each iteration:

1. Read `FORGE-CONFIG.md` (module registry, stack, conventions, verification commands).
2. Read `prompts/session-program/program-011/STATE.md` (done, pending, blocked, handoff notes).
3. Pick the next **pending** session whose dependencies are all **done**
   (order: 01 → 02 → 05 → 03 → 04 → 06; 05 may run any time after 01).
4. Read `prompts/session-program/program-011/SESSION-NN.md` fully, plus every file in its
   Module Context table.
5. Read affected source files before modifying them.
6. Execute precisely. Follow FORGE-CONFIG conventions (naming, layering, error handling,
   `import type` rules, bridge-only renderer access).
7. Verify — run the session's Verification block plus FORGE-CONFIG compliance checks
   (`npx tsc --noEmit` minimum).
8. Update STATE.md: status, completion date, notes, Handoff Notes entry.
9. Update architecture docs if a public API changed (new `IVersionService` methods →
   note in FORGE-CONFIG Module Registry key-files column if needed).
10. Commit: `feat(tracked-chapter-editing): SESSION-NN — {title}`.
11. Loop. All sessions done → Final Report.

## Crash Recovery

- Read STATE.md → find `in-progress` or first eligible `pending` session.
- Read Handoff Notes + `git status` / `git log --oneline -5`.
- Partial session: finish the remaining steps if the diff is coherent; otherwise
  `git reset --hard HEAD` and restart the session.
- Always update STATE.md before stopping (voluntary or forced).

## Stopping Conditions

- **All done** → Final Report.
- **Blocked** → set session status `blocked` with reason, skip to next eligible session.
- **Context limit** → update STATE.md + Handoff Notes, stop cleanly.
- **User input needed** → set `blocked` with the specific question.

## Final Report

Summary; sessions done/total; files created/modified; architecture impact (new
`IVersionService`/`IDatabaseService` surface, ContextBuilder param, composition-root
reorder); verification results (`npx tsc --noEmit`, manual flows from SESSION-03/04/05/06);
follow-up candidates (e.g. extend tracked editing to `source/` files, per-hunk selective
discard, edit annotations the user can attach for Verity).
