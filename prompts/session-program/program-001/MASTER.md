# Feature Build — Master Loop (small-queue-intake)

> Run this prompt to execute the intake build. It reads STATE.md, picks the next session, executes it, updates state, and loops until all sessions are done.

---

## Feature

**Name:** small-queue-intake
**Intent:** Address the full backlog of small feature requests — 14 items ranging from layout bugs to new views. One ordered program that processes everything.
**Total sessions:** 13

---

## Instructions

You are building the "small-queue-intake" feature for Novel Engine. This is a set of 13 ordered session prompts that implement the full small-queue backlog.

**Your job:** Execute sessions in order until all are `done`.

---

## Protocol

### On each iteration:

1. **Read state.** Read `prompts/session-program/program-001/STATE.md` to see what is done, what is pending, and any handoff notes from previous runs.

2. **Pick the next session.** Select the first `pending` session whose dependencies are satisfied (see STATE.md dependency list).

3. **Read the session prompt.** Read `prompts/session-program/program-001/SESSION-NN.md` in full.

4. **Read affected files.** Before modifying any file, read it completely. Check the current state of every file the session touches. Never modify without reading first.

5. **Execute it.** Follow the session implementation steps precisely. Write complete, production-ready code. Respect all architecture rules from FORGE-CONFIG.md.

6. **Verify.** Run every verification step listed in the session. If verification fails, fix the issue before proceeding.

7. **Update state.** Edit `prompts/session-program/program-001/STATE.md`:
   - Set the session status to `done`
   - Set Completed date to today
   - Add notes about decisions made or complications encountered
   - Update "Last completed session" and "Observations" in Handoff Notes

8. **Update documentation.** Follow the AGENTS.md documentation protocol:
   - Append a `CHANGELOG.md` entry for this session changes
   - Update affected docs in `docs/architecture/`

9. **Loop.** Return to step 1 and pick the next pending session.

---

## Completion Criteria

The feature is complete when all 13 sessions are `done` and:

- `npx tsc --noEmit` passes with zero errors
- All listed bugs are resolved
- New UI features are visible and functional
- CHANGELOG.md has entries for all sessions
- Affected `docs/architecture/` files are current

---

## Architecture Quick Reference

```
DOMAIN (M01) <- INFRASTRUCTURE (M02-M07) <- APPLICATION (M08) <- IPC/MAIN (M09) <- RENDERER (M10)

src/domain/types.ts           <- All shared types
src/domain/interfaces.ts      <- Service contracts (ports)
src/domain/constants.ts       <- AGENT_REGISTRY, PIPELINE_PHASES, defaults, Quick Actions
src/main/ipc/handlers.ts      <- Thin adapter: one-liner delegations
src/preload/index.ts          <- window.novelEngine bridge
src/renderer/                 <- React UI, Zustand stores, components
```

## Source Origins

| Session | Feature Request File |
|---------|---------------------|
| 01 | bug-misc-html-formating-issues.md |
| 02 | done-confirm-box.md + bug-onboard-guide-issues.md |
| 03 | book-dropdown-is-messy.md |
| 04 | change-request-hot-take-ad-hoc-revisions.md |
| 05 | change-request-motif-ledger.md |
| 06 | bug-archive-series.md |
| 07 | setting-orgainze.md |
| 08 | saved-prompt-library.md |
| 09 | about-json-editor-in-files-view.md |
| 10 | query-letter-mode.md + enhancement-help-docs-repo-file.md |
| 11 | chapter-deep-dive.md (backend) |
| 12 | chapter-deep-dive.md (UI) |
| 13 | reading-mode.md |
