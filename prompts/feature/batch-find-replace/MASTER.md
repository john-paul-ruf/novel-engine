# Feature Build — Master Loop (batch-find-replace)

> Run this prompt to execute the feature build. It reads `STATE.md`, picks the next session, executes it, updates state, and loops until all sessions are done.

---

## Feature

**Name:** batch-find-replace
**Intent:** Allow authors to search across all chapter drafts and replace text in bulk, with per-chapter preview, selective application, and automatic version snapshots for safe revert.
**Total sessions:** 4

---

## Instructions

You are building the "batch-find-replace" feature for Novel Engine. This is a set of 4 ordered session prompts that implement the feature from domain types through to the renderer UI.

**Your job:** Execute sessions in order until all are `done`.

---

## Protocol

### On each iteration:

1. **Read state.** Read `prompts/feature/batch-find-replace/STATE.md` to see what's done, what's pending, and any handoff notes from previous runs.

2. **Pick the next session.** Select the first `pending` session whose dependencies are satisfied.

   Dependencies:
   - SESSION-01 depends on: nothing
   - SESSION-02 depends on: SESSION-01 (`done`)
   - SESSION-03 depends on: SESSION-02 (`done`)
   - SESSION-04 depends on: SESSION-03 (`done`)

3. **Read the session prompt.** Read `prompts/feature/batch-find-replace/SESSION-NN.md` in full.

4. **Read affected files.** Before modifying any file, read it completely. Check for changes from previously completed sessions in this feature.

5. **Execute it.** Follow the session's implementation steps precisely. Write complete, production-ready code. Respect all architecture rules:
   - Layer boundaries (domain imports nothing, infra imports domain, etc.)
   - Dependency injection (services depend on interfaces, not concrete classes)
   - No business logic in IPC handlers
   - Renderer only talks through `window.novelEngine`
   - All types fully specified, no `any`
   - All async operations error-handled

6. **Verify.** Run every verification step listed in the session. If verification fails, fix the issue before proceeding.

7. **Update state.** Edit `prompts/feature/batch-find-replace/STATE.md`:
   - Set the session's status to `done`
   - Set the Completed date to today
   - Add notes about decisions made or complications encountered
   - Update "Last completed session" and "Observations" in Handoff Notes

8. **Update documentation.** Follow the AGENTS.md documentation protocol:
   - Append a `CHANGELOG.md` entry for this session's changes
   - Update affected docs in `docs/architecture/`

9. **Loop.** Return to step 1 and pick the next pending session.

---

## Completion Criteria

The feature is complete when all four sessions are `done` and:

- `npx tsc --noEmit` passes with zero errors
- The "⇄ Find & Replace" button appears in the FilesView header
- The modal opens, runs a preview against real chapter data, and applies replacements
- Version history for a modified chapter shows a `user`-sourced snapshot from before the replace
- CHANGELOG.md has been updated with all four sessions' changes (or one combined entry)
- `docs/architecture/DOMAIN.md`, `docs/architecture/APPLICATION.md`, `docs/architecture/IPC.md`, and `docs/architecture/RENDERER.md` reflect the new feature

---

## Architecture Quick Reference

```
DOMAIN ← APPLICATION ← IPC/MAIN ← RENDERER

src/domain/types.ts           ← FindReplace* types
src/domain/interfaces.ts      ← IFindReplaceService
src/application/FindReplaceService.ts  ← implements IFindReplaceService
src/main/index.ts             ← instantiates FindReplaceService
src/main/ipc/handlers.ts      ← two one-liner handlers
src/preload/index.ts          ← window.novelEngine.findReplace.*
src/renderer/components/Files/FindReplaceModal.tsx  ← the UI
src/renderer/components/Files/FilesHeader.tsx       ← button
src/renderer/components/Files/FilesView.tsx         ← modal mounting
```
