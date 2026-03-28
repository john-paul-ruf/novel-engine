# Feature Build — Master Loop (catalog-export)

> Run this prompt to execute the feature build. It reads `STATE.md`, picks the next session, executes it, updates state, and loops until all sessions are done.

---

## Feature

**Name:** catalog-export
**Intent:** Export all books as a single ZIP archive from the Settings view.
**Total sessions:** 2

---

## Instructions

You are building the "catalog-export" feature for Novel Engine. This is a set of 2 ordered session prompts that implement the feature from IPC wiring through to the renderer UI.

**Your job:** Loop through the sessions in dependency order until all are `done`.

---

## Protocol

### On each iteration:

1. **Read state.** Read `prompts/feature/catalog-export/STATE.md` to see what's done, what's pending, and any handoff notes from previous runs.

2. **Pick the next session.** Select the first `pending` session whose dependencies are satisfied.

   Dependencies:
   - SESSION-01: None
   - SESSION-02: SESSION-01

3. **Read the session prompt.** Read `prompts/feature/catalog-export/SESSION-NN.md` in full.

4. **Read affected files.** Before modifying any file, read it completely. Check for changes from previously completed sessions in this feature.

5. **Execute it.** Follow the session's implementation steps precisely. Write complete, production-ready code. Respect all architecture rules:
   - Layer boundaries (domain imports nothing, infra imports domain, etc.)
   - Dependency injection (services depend on interfaces, not concrete classes)
   - No business logic in IPC handlers
   - Renderer only talks through `window.novelEngine`
   - All types fully specified, no `any`
   - All async operations error-handled

6. **Verify.** Run every verification step listed in the session. If verification fails, fix the issue before proceeding.

7. **Update state.** Edit `prompts/feature/catalog-export/STATE.md`:
   - Set the session's status to `done`
   - Set the Completed date to today
   - Add notes about decisions made or complications encountered
   - Update "Last completed session" and "Observations" in Handoff Notes

8. **Update documentation.** Follow the AGENTS.md documentation protocol:
   - Append a CHANGELOG.md entry for this session's changes
   - Update affected architecture docs (`docs/architecture/IPC.md` for SESSION-01, `docs/architecture/RENDERER.md` for SESSION-02)

### On completion:

When all sessions show `done` in STATE.md, report the feature as complete with a summary of what was built.
