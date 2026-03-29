# Forge Build — Novel Engine / dashboards-and-revision-modal

> Execute this prompt to build. Reads STATE.md, picks the next session, executes it, updates state, loops until done.

---

## Program

**Name:** Novel Engine
**Root:** /Users/the.phoenix/WebstormProjects/novel-engine/
**Feature:** dashboards-and-revision-modal
**Intent:** Add a Book Overview Dashboard (landing screen on book switch), a Writing Statistics Dashboard (charts, cost tracking, word count history), and convert the Revision Queue from a full-page view to a floating non-blocking modal.
**Sessions:** 7

---

## Protocol

### Each iteration:

1. **Read config.** Read `/Users/the.phoenix/WebstormProjects/novel-engine/FORGE-CONFIG.md` — specifically the Module Registry and the stack/conventions/verification sections. Note which module IDs this feature touches (listed in STATE.md Scope Summary) but don't read all module files yet — read them per-session in step 4.

2. **Read state.** Read `prompts/session-program/program-004/STATE.md`. Check what's done, pending, blocked.

3. **Pick next session.** First `pending` session whose dependencies are all `done`.

   Dependencies:
   - SESSION-01: Nothing
   - SESSION-02: SESSION-01
   - SESSION-03: SESSION-01, SESSION-02
   - SESSION-04: SESSION-03
   - SESSION-05: SESSION-01, SESSION-02
   - SESSION-06: SESSION-04, SESSION-05
   - SESSION-07: SESSION-04

4. **Read the session prompt.** Read `prompts/session-program/program-004/SESSION-NN.md` in full. Read the Module Context table — for each listed module ID, read its key files listed. This is the only architecture reading needed per session.

5. **Read affected files.** Before modifying any file, read it completely. Check for changes from prior sessions.

6. **Execute.** Follow implementation steps precisely. Write complete, production-ready code. Respect all conventions from FORGE-CONFIG.md and architecture documented in STATE.md.

7. **Verify.** Run every verification step listed in the session, plus all architecture compliance checks and custom rules from FORGE-CONFIG.md. If verification fails, fix before proceeding.

8. **Update state.** Edit `prompts/session-program/program-004/STATE.md`:
   - Set session status to `done`
   - Set Completed date
   - Add notes about decisions or complications
   - Update Handoff Notes

9. **Update architecture.** If this session created a new module or changed a module's public API:
   - **New module:** Add a row to the Module Registry in `FORGE-CONFIG.md`.
   - **Changed public API:** Note the change in STATE.md handoff notes.
   - **No changes to module boundaries or public API:** Skip this step.

10. **Commit.** If git is initialized:
    ```bash
    git add -A && git commit -m "feat(dashboards-and-revision-modal): SESSION-NN — {title}"
    ```

11. **Loop.** Return to step 1. If all sessions are `done`, produce Final Report.

---

## Crash Recovery

If the agent stops mid-session (context limit, error, crash):

1. Next run reads STATE.md — incomplete sessions show as `in-progress` or `pending`
2. Read Handoff Notes for context
3. Check `git status` and `git log --oneline -5` to see committed state
4. If last session was partial:
   - Read the session prompt for remaining steps
   - Check which files from the file table exist and look correct
   - Complete remaining steps, then verify
   - If partial state is broken: `git reset --hard HEAD` and restart the session
5. Update STATE.md and continue

### Handoff Protocol

Before stopping (voluntary or forced):

1. Update STATE.md with current progress
2. Write Handoff Notes:
   - Current session and step
   - In-flight decisions or partial work
   - What the next agent should do first
3. If mid-session, set status to `in-progress` (not `done`)

---

## Execution Order

**Phase 1 — Foundation (sequential)**
1. SESSION-01 — Domain types, interfaces, constants

**Phase 2 — Database (sequential)**
2. SESSION-02 — Schema migration + query implementations

**Phase 3 — Backend services (can parallelize Track A and Track B)**

Track A (Dashboard):
3. SESSION-03 — DashboardService + FileSystem.getRecentFiles + IPC + Preload
4. SESSION-04 — Dashboard View UI + viewStore/bookStore/Sidebar changes

Track B (Statistics):
5. SESSION-05 — StatisticsService + IPC + Preload
6. SESSION-06 — Statistics View UI + recharts installation + viewStore/Sidebar changes

**Caution:** If running Track A and B in parallel, SESSION-04 and SESSION-06 both modify `viewStore.ts`, `AppLayout.tsx`, and `Sidebar.tsx`. The second one to run must merge with changes from the first. Recommended: run SESSION-04 first, then SESSION-06.

**Phase 4 — Modal refactor (after Phase 3 Track A)**
7. SESSION-07 — Revision Queue Modal refactor (removes `'revision-queue'` from ViewId)

---

## Stopping Conditions

- **All done:** All sessions `done`. Produce Final Report.
- **Blocked:** Session fails verification unfixably. Set `blocked` with notes. Skip to next eligible session if one exists.
- **Context limit:** Update STATE.md + Handoff Notes. Next run resumes.
- **User input needed:** Set `blocked` with the question. User answers, next run continues.

---

## Final Report

When all sessions are done:

1. **Summary** — What was built, 2-3 sentences
2. **Sessions** — {done}/{total}, any blocked/skipped with reasons
3. **Files created** — count + list
4. **Files modified** — count + list
5. **Architecture impact** — New modules, types, APIs, schemas, configs
6. **Verification** — How to manually verify end-to-end
7. **Follow-up** — Deferred work, known limitations, future improvements
