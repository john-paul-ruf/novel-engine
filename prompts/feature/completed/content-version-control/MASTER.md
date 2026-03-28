# Feature Build — Master Loop (content-version-control)

> Run this prompt to execute the feature build. It reads `STATE.md`, picks the next session, executes it, updates state, and loops until all sessions are done.

---

## Feature

**Name:** content-version-control
**Intent:** Add version history, human-readable diffs, and revert capability for all `.md` and `.json` files surfaced in the UI.
**Total sessions:** 7

---

## Instructions

You are building the "content-version-control" feature for Novel Engine. This is a set of 7 ordered session prompts that implement the feature from domain types through to the renderer UI.

**Your job:** Loop through the sessions in dependency order until all are `done`.

---

## Protocol

### On each iteration:

1. **Read state.** Read `prompts/feature/content-version-control/STATE.md` to see what's done, what's pending, and any handoff notes from previous runs.

2. **Pick the next session.** Select the first `pending` session whose dependencies are satisfied.

   Dependencies:
   - SESSION-01: Nothing
   - SESSION-02: SESSION-01
   - SESSION-03: SESSION-02
   - SESSION-04: SESSION-03
   - SESSION-05: SESSION-04
   - SESSION-06: SESSION-05
   - SESSION-07: SESSION-06

3. **Read the session prompt.** Read `prompts/feature/content-version-control/SESSION-NN.md` in full.

4. **Read affected files.** Before modifying any file, read it completely. Check for changes from previously completed sessions in this feature.

5. **Execute it.** Follow the session's implementation steps precisely. Write complete, production-ready code. Respect all architecture rules:
   - Layer boundaries (domain imports nothing, infra imports domain, etc.)
   - Dependency injection (services depend on interfaces, not concrete classes)
   - No business logic in IPC handlers
   - Renderer only talks through `window.novelEngine`
   - All types fully specified, no `any`
   - All async operations error-handled

6. **Verify.** Run every verification step listed in the session. If verification fails, fix the issue before proceeding.

7. **Update state.** Edit `prompts/feature/content-version-control/STATE.md`:
   - Set the session's status to `done`
   - Set the Completed date to today
   - Add notes about decisions made or complications encountered
   - Update "Last completed session" and "Observations" in Handoff Notes

8. **Update documentation.** Follow the AGENTS.md documentation protocol:
   - Append a CHANGELOG.md entry for this session's changes
   - Update affected architecture docs (DOMAIN.md, INFRASTRUCTURE.md, APPLICATION.md, IPC.md, RENDERER.md, ARCHITECTURE.md)
   - Only update docs affected by THIS session — don't touch unrelated docs

9. **Commit.** Stage and commit the session's changes:
   ```bash
   git add -A && git commit -m "feat(content-version-control): SESSION-NN — {short title}"
   ```

10. **Loop.** Go back to step 1. If all sessions are `done`, report completion.

---

## Crash Recovery

If the agent stops mid-session (context limit, error, crash):

1. The next run reads `STATE.md` — incomplete sessions show as `in-progress` or `pending`
2. Read the Handoff Notes for context about what was happening
3. Check `git status` and `git log --oneline -5` to see what was committed
4. If the last session was partially completed:
   - Read the session prompt to understand what's left
   - Check which files from the "Files to Create/Modify" table exist and look correct
   - Complete the remaining steps, then run verification
   - If the partial state is broken, `git reset --hard HEAD` and restart the session
5. Update STATE.md and continue the loop

### Handoff Protocol

Before stopping (whether voluntarily or due to context limits):

1. Update `STATE.md` with current progress
2. Write detailed Handoff Notes:
   - What session you were on
   - Which step you completed
   - Any in-flight decisions or partial work
   - What the next agent should do first
3. If mid-session, set status to `in-progress` (not `done`)

---

## Execution Order

**Phase 1 — Backend Foundation (Sessions 1-3)**
- SESSION-01: Domain types and `IVersionService` interface
- SESSION-02: Database migration and `DatabaseService` extensions
- SESSION-03: `VersionService` implementation + `diff` package install

**Phase 2 — Wiring (Session 4)**
- SESSION-04: IPC handlers, preload bridge, composition root, auto-snapshot hooks

**Phase 3 — UI (Sessions 5-7)**
- SESSION-05: Zustand store + `DiffViewer` component
- SESSION-06: `VersionHistoryPanel` component
- SESSION-07: Integration into `FileEditor`, `FilesView`, `SourcePanel`, `ChaptersPanel`, `AgentOutputPanel`

---

## Stopping Conditions

- **All done:** All 7 sessions are `done` in STATE.md. Report final summary.
- **Blocked:** A session fails verification and you cannot fix it. Set status to `blocked` with notes. Skip to next eligible session if one exists.
- **Context limit:** Update STATE.md with current progress and Handoff Notes. The next run picks up where you left off.
- **User input needed:** If a session requires a design decision not covered in the prompt, set status to `blocked` with the question in notes. The user will answer and the next run continues.

---

## Final Report

When all sessions are done, produce:

1. **Summary:** What was built, in 2-3 sentences
2. **Sessions completed:** 7/7
3. **Sessions blocked/skipped:** 0 (with reasons)
4. **Files created:** {count} — {list}
5. **Files modified:** {count} — {list}
6. **Architecture impact:**
   - New types/interfaces
   - New services
   - New IPC channels
   - New stores/components
   - Schema changes
7. **Testing notes:** How to manually verify the feature works end-to-end
8. **Follow-up work:** Anything deferred or out of scope that should be addressed later
