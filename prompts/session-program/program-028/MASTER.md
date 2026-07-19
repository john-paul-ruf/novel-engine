# Forge Build — Novel Engine / chapter-detector-heuristics

> Program directory: `prompts/session-program/program-028/`
> 2 sessions. SESSION-01 is the source fix and test flip on `ChapterDetector.ts`. SESSION-02
> re-counts the downstream `ManuscriptImportService.test.ts` assertion, updates `CHANGELOG.md`
> and `docs/architecture/APPLICATION.md` per AGENTS.md, and re-runs the full suite for green.
> SESSION-02 depends on SESSION-01.

## Protocol — Each iteration

1. Read `FORGE-CONFIG.md` (module registry, stack, conventions, verification commands).
2. Read `prompts/session-program/program-028/STATE.md` — what is done, pending, blocked.
3. Pick the next `pending` session whose dependencies are all `done`.
   - SESSION-01 has no dependencies.
   - SESSION-02 requires SESSION-01 `done`.
4. Read `prompts/session-program/program-028/SESSION-NN.md` in full — including Module Context,
   Files to Create/Modify, Implementation, Verification, State Update.
5. Read every file listed under Module Context before making any change. For modifications, read
   the function/section cited in the prompt BEFORE editing it.
6. Execute the session precisely. Follow FORGE-CONFIG conventions (no `any`, no `@ts-ignore`,
   architecture boundaries).
7. Verify — both the session-specific checks in SESSION-NN.md AND the global commands
   (`npx tsc --noEmit`, `npm test`, `npm run test:coverage`).
8. Update `prompts/session-program/program-028/STATE.md` (status `done`, today's date, brief
   notes; append a Handoff Notes entry with surprises, bugs, deviations).
9. Per **AGENTS.md** (project instructions, always loaded): update documentation before
   reporting a session done — at minimum `CHANGELOG.md` gets an entry every session that changes
   code, and affected `docs/architecture/*.md` files get touched only for the layers actually
   changed. SESSION-02 carries the docs pass; SESSION-01 may leave docs to SESSION-02 because
   no public API changed (internal heuristic only) — but SESSION-01 must still append a
   CHANGELOG entry.
10. Commit (format from FORGE-CONFIG): `feat(chapter-detector-heuristics): SESSION-NN — {title}`.
11. Loop. All done → Final Report.

## Crash Recovery

- Read `prompts/session-program/program-028/STATE.md` → check in-progress/pending.
- Read Handoff Notes + `git status` + `git log -5` to see what landed.
- Partial session: complete the remaining tasks, OR `git reset --hard HEAD` and restart the
  session from the top. Either way, update STATE.md before stopping.
- If the suite is red after SESSION-01 because a regression test was missed, prefer adding the
  missing test over weakening assertions — the three flipped tests are the contract.

## Stopping Conditions

- **All done → Final Report.** Summarize: sessions done/total, files modified, behavior delta,
  verification result, follow-ups (none expected).
- **Blocked → set blocked, skip to next eligible.** Record the blocker in STATE notes and
  Handoff Notes. SESSION-02 cannot run until SESSION-01 is `done`.
- **Context limit → update STATE.md + Handoff Notes** with where you stopped (file/section).
  Partial edits are safe to keep if `npx tsc --noEmit` still passes; otherwise `git stash`.
- **User input needed → set blocked with the question** in Handoff Notes.

## Final Report

When both sessions are `done`, post a short summary in the chat:
- Sessions done: 2/2.
- Files modified: list each with a one-line "what changed".
- Behavior delta: the three heuristic fixes in plain English.
- Verification: `npx tsc --noEmit` clean; `npm test` green (file count, test count);
  `npm run test:coverage` passes enforced thresholds (global L/S/F/B numbers).
- Architecture impact: none — no new module, no IPC change, no type change. Downstream consumers
  (ManuscriptImportService, importStore, ImportWizard, ChapterPreviewList, preload/handlers)
  unchanged.
- Follow-ups: none expected. If SESSION-02 found additional flipped tests outside the import
  subsystem, record them in Handoff Notes and create a follow-up ticket (do NOT fix them in this
  program — out of scope).