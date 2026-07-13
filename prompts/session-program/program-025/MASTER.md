# Forge Build — Novel Engine / deployment-prep

Execute the full pre-deployment pipeline in strict sequential order: release notes → README → website.
Source: `prompts/meta/deployment-prep.md` (copied to `prompts/session-program/program-025/input-files/`).

## Protocol — Each iteration:
1. Read `FORGE-CONFIG.md` (project root) — module registry, stack, conventions, verification.
2. Read `prompts/session-program/program-025/STATE.md` — what is done, pending, blocked.
3. Pick the next `pending` session whose dependencies are all `done`
   (strict sequential chain: 01 → 02 → 03 → 04 → 05 — no parallelism).
4. Read `prompts/session-program/program-025/SESSION-NN.md` fully, plus every file in
   its Module Context table and the corresponding sub-prompt in `input-files/`.
5. Read each affected file before modifying it.
6. Execute precisely. Follow the sub-prompt's steps — do not skip or shortcut.
7. Verify — session-specific checks. No `npx tsc --noEmit` needed (no source changes).
   Verification is content-accuracy: every claim verified against actual source code.
8. Update `prompts/session-program/program-025/STATE.md`: status, date, notes, Handoff Notes.
9. No architecture docs updates needed (this program is docs/website only).
10. Commit: `docs(deployment-prep): SESSION-NN — {title}`.
11. Between phases, brief the user (version, highlights, features added/removed) but keep
    moving unless there are breaking changes requiring discussion.
12. Loop. When all 5 sessions are done → produce the Phase Summary Report (SESSION-05 §4).

## Sub-Prompt Reference

Each session executes a sub-prompt from `prompts/meta/` (copied to `input-files/`):

| Session | Sub-Prompt | What It Produces |
|---------|-----------|-----------------|
| 01 | `release-notes.md` | `RELEASE_NOTES.md` + `docs/releases/vX.Y.Z-RELEASE_NOTES.md` |
| 02 | `readme-deep-update.md` | Updated `README.md` |
| 03 | `update-website.md` §3.1, §3.3 | Updated `docs/index.html` + `docs/architecture.html` |
| 04 | `update-website.md` §3.2, §3.4 | Updated `docs/changelog.html` + verified `docs/evaluation.html` |
| 05 | `update-website.md` §3.5, §3.6 | Updated `docs/press.html` + `docs/contact.html` + Phase Summary Report |

## Rules (from deployment-prep.md)

1. **Execute phases in order.** Never start S02 before S01 is complete. Never start S03 before S02 is complete.
2. **Each session follows its sub-prompt fully.** Don't skip steps within a session.
3. **Don't fabricate.** Every claim in every output must be verified against source code.
4. **Carry context forward.** Information from S01 (version, changes) feeds S02 (README) feeds S03–S05 (website).
5. **Report, don't block.** Brief the user between phases but keep moving unless there's a genuine decision point.
6. **Respect the sub-prompts.** This program orchestrates — it doesn't override.

## Crash Recovery

- Read `prompts/session-program/program-025/STATE.md` → check `in-progress`/`pending`.
- Read Handoff Notes + `git status` / `git log --oneline -5`.
- Partial session: complete the remaining steps, or `git reset --hard HEAD` and restart
  that session cleanly.
- Always update STATE.md before stopping, voluntary or forced.

## Stopping Conditions

- All sessions `done` → Final Report (Phase Summary Report from SESSION-05 §4).
- Session blocked → set `blocked` with the question in Notes, skip to next eligible
  (but since this is a strict chain, blocking one blocks all downstream).
- Context limit approaching → update STATE.md + Handoff Notes, stop.
- User input needed → set `blocked` with a specific question.

## Final Report

Produce the Phase Summary Report (format in SESSION-05 §4) covering:
- Release Notes (Phase 1): version, changes, file
- README (Phase 2): features added/removed, sections updated, file
- Website (Phase 3): pages updated, new content, files
- Ready to Ship checklist