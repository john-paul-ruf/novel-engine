# Feature Build — Master Loop (import-series)

> Run this prompt to execute the feature build. It reads `STATE.md`, picks the next session, executes it, updates state, and loops until all sessions are done.

---

## Feature

**Name:** import-series
**Intent:** Allow importing multiple manuscript files at once and grouping them as volumes in a new or existing series.
**Total sessions:** 4

---

## Instructions

You are building the "import-series" feature for Novel Engine. This is a set of 4 ordered session prompts that implement the feature from domain types through to the renderer UI.

**Your job:** Loop through the sessions in dependency order until all are `done`.

---

## Protocol

### On each iteration:

1. **Read state.** Read `prompts/feature/import-series/STATE.md` to see what's done, what's pending, and any handoff notes from previous runs.

2. **Pick the next session.** Select the first `pending` session whose dependencies are satisfied.

   Dependencies:
   - SESSION-01: Nothing
   - SESSION-02: SESSION-01
   - SESSION-03: SESSION-02
   - SESSION-04: SESSION-03

3. **Read the session prompt.** Read `prompts/feature/import-series/SESSION-NN.md` in full.

4. **Read affected files.** Before modifying any file, read it completely. Check for changes from previously completed sessions in this feature.

5. **Execute it.** Follow the session's implementation steps precisely. Write complete, production-ready code. Respect all architecture rules:
   - Layer boundaries (domain imports nothing, infra imports domain, etc.)
   - Dependency injection (services depend on interfaces, not concrete classes)
   - No business logic in IPC handlers
   - Renderer only talks through `window.novelEngine`
   - All types fully specified, no `any`
   - All async operations error-handled

6. **Verify.** Run every verification step listed in the session. If verification fails, fix the issue before proceeding.

7. **Update state.** Edit `prompts/feature/import-series/STATE.md`:
   - Set the session's status to `done`
   - Set the Completed date to today
   - Add notes about decisions made or complications encountered
   - Update "Last completed session" and "Observations" in Handoff Notes

8. **Update documentation.** Follow the AGENTS.md documentation protocol:
   - Append a CHANGELOG.md entry for this session's changes
   - Update affected architecture docs in `docs/architecture/`

9. **Continue.** Go back to step 1.

### When all sessions are done:

- Write a final summary in the Handoff Notes section of STATE.md
- Verify the full feature works end-to-end
- Run `npx tsc --noEmit` one final time

---

## Emergency Procedures

**If `tsc` fails after a session:**
Fix the type errors before proceeding. Update the session's notes in STATE.md with what went wrong.

**If a session's design doesn't fit the current codebase:**
Adapt the implementation to match reality. The session prompt is a guide, not scripture. Document deviations in the session notes.

**If you need to split a session:**
Complete the first half, mark the session as `done`, and add a note that the remaining work needs a follow-up.
