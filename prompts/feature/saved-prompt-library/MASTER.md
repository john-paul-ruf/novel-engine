# Feature Build — Master Loop (saved-prompt-library)

> Run this prompt to execute the feature build. It reads `STATE.md`, picks the next session, executes it, updates state, and loops until all sessions are done.

---

## Feature

**Name:** saved-prompt-library
**Intent:** A user-managed bank of reusable prompts accessible from the Quick Actions dropdown, persisted globally in userData as a JSON file.
**Total sessions:** 3

---

## Instructions

You are building the "saved-prompt-library" feature for Novel Engine. This is a set of 3 ordered session prompts that implement the feature from domain types through to the renderer UI.

**Your job:** Loop through the sessions in dependency order until all are `done`.

---

## Protocol

### On each iteration:

1. **Read state.** Read `prompts/feature/saved-prompt-library/STATE.md` to see what's done, what's pending, and any handoff notes from previous runs.

2. **Pick the next session.** Select the first `pending` session whose dependencies are satisfied.

   Dependencies:
   - SESSION-01: no dependencies
   - SESSION-02: depends on SESSION-01
   - SESSION-03: depends on SESSION-02

3. **Read the session prompt.** Read `prompts/feature/saved-prompt-library/SESSION-NN.md` in full.

4. **Read affected files.** Before modifying any file, read it completely. Check for changes from previously completed sessions in this feature.

5. **Execute it.** Follow the session's implementation steps precisely. Write complete, production-ready code. Respect all architecture rules:
   - Layer boundaries (domain imports nothing, infra imports domain, etc.)
   - Dependency injection (services depend on interfaces, not concrete classes)
   - No business logic in IPC handlers
   - Renderer only talks through `window.novelEngine`
   - All types fully specified, no `any`
   - All async operations error-handled

6. **Verify.** Run every verification step listed in the session. If verification fails, fix the issue before proceeding.

7. **Update state.** Edit `prompts/feature/saved-prompt-library/STATE.md`:
   - Set the session's status to `done`
   - Set the Completed date to today
   - Add notes about decisions made or complications encountered
   - Update "Last completed session" and "Observations" in Handoff Notes

8. **Update documentation.** Follow the AGENTS.md documentation protocol:
   - Append a `CHANGELOG.md` entry for this session's changes
   - Update affected `docs/architecture/` docs:
     - SESSION-01 → `DOMAIN.md`, `INFRASTRUCTURE.md`, `ARCHITECTURE.md`
     - SESSION-02 → `IPC.md`, `ARCHITECTURE.md`
     - SESSION-03 → `RENDERER.md`

9. **Loop.** If all sessions are `done`, stop and report the feature complete. Otherwise, go to step 1.

---

## Quick Reference

| Session | Key files touched |
|---------|-------------------|
| SESSION-01 | `src/domain/types.ts`, `src/domain/interfaces.ts`, `src/infrastructure/saved-prompts/` |
| SESSION-02 | `src/main/ipc/handlers.ts`, `src/preload/index.ts`, `src/main/index.ts` |
| SESSION-03 | `src/renderer/stores/savedPromptsStore.ts`, `src/renderer/components/Chat/QuickActions.tsx`, `src/renderer/components/Chat/SavedPromptEditor.tsx` |
