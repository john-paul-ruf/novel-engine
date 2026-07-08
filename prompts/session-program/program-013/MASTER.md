# Forge Build — Novel Engine / deployment-prep

> Pre-release documentation pipeline: release notes → README deep update → website rebuild.
> Program directory: `prompts/session-program/program-013/`

## Protocol — Each iteration:

1. Read `FORGE-CONFIG.md` (repo root) — stack, conventions, verification commands
2. Read `prompts/session-program/program-013/STATE.md` — what's done, pending, blocked
3. Pick the next `pending` session whose dependencies are all `done`
   - Order: 01 → 02 → 03 → 04 → then 05/06/07 (any order) → 08
4. Read `prompts/session-program/program-013/SESSION-NN.md` fully, plus its Module Context files
5. Read every affected file before modifying it
6. Execute precisely. The sub-prompts in `prompts/session-program/program-013/input-files/` are authoritative for detailed instructions — the session file orchestrates and gates.
7. Verify — run the session's checklist plus the relevant sub-prompt's own verification
8. Honor the session's **Completion Gate**: brief the user, but only pause for approval on genuine decision points (breaking changes)
9. Update `prompts/session-program/program-013/STATE.md` — status, date, notes, Handoff Notes
10. Commit: `feat(deployment-prep): SESSION-NN — {title}`
11. Loop. All sessions done → Final Report.

## Feature-Specific Rules

- **Strict phase order** (deployment-prep.md Rule 1): never start Phase 2 (02–03) before 01 is done; never start Phase 3 (04–08) before 03 is done.
- **Never fabricate.** Every claim in RELEASE_NOTES.md, README.md, and the website must be verified against source.
- **Never modify** `src/`, `docs/architecture/*.md`, or `docs/og-image.png`.
- **SESSION-04 before SESSION-05, always** — the old `docs/index.html` evaluation content must be migrated before the landing page overwrites it.
- **Zero commits since last tag** in SESSION-01 → mark all sessions `skipped`, report "Nothing to release", stop.
- **Carry context forward** via STATE.md Handoff Notes: version/changes (Phase 1) feed the README (Phase 2) feed the website (Phase 3).

## Crash Recovery

- Read `prompts/session-program/program-013/STATE.md` → find `in-progress` / `pending`
- Read Handoff Notes + `git status` / `git log`
- Partial session: complete the remaining checklist items, or `git reset --hard HEAD` and restart the session
- Special case: if `docs/index.html` was already replaced but `evaluation.html` is missing/incomplete, recover the original from git history (`git show <SESSION-04-parent>:docs/index.html`) before proceeding
- Always update STATE.md before stopping (voluntary or forced)

## Stopping Conditions

- All sessions `done` → Final Report (SESSION-08 produces the Deployment Prep summary)
- Blocked → set `blocked` with the reason, skip to the next eligible session (only 05/06/07 can skip around each other; phases cannot be skipped)
- Context limit approaching → update STATE.md + Handoff Notes, stop cleanly
- User input needed (e.g., breaking-change discussion in SESSION-01) → set `blocked` with the question

## Final Report

Deliver the **Deployment Prep — Complete** report from SESSION-08 (template in `input-files/deployment-prep.md`), plus: sessions done/total, files created/modified, verification results, and the Ready to Ship checklist (review RELEASE_NOTES.md, review README diff, preview `docs/index.html`, `git tag vX.Y.Z`, `git push origin main --tags`).
