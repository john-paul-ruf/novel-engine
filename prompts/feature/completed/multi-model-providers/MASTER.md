# Feature Build — Master Loop (multi-model-providers)

> Run this prompt to execute the feature build. It reads `STATE.md`, picks the next session, executes it, updates state, and loops until all sessions are done.

---

## Feature

**Name:** multi-model-providers
**Intent:** Abstract the AI backend from Claude CLI into a pluggable provider architecture supporting multiple model backends (Claude CLI primary, BYOK, self-hosted).
**Total sessions:** 7

---

## Instructions

You are building the "multi-model-providers" feature for Novel Engine. This is a set of 7 ordered session prompts that implement the feature from domain types through to the renderer UI.

**Your job:** Loop through the sessions in dependency order until all are `done`.

---

## Protocol

### On each iteration:

1. **Read state.** Read `prompts/feature/multi-model-providers/STATE.md` to see what's done, what's pending, and any handoff notes from previous runs.

2. **Pick the next session.** Select the first `pending` session whose dependencies are satisfied.

   Dependencies:
   - SESSION-01: Nothing
   - SESSION-02: SESSION-01
   - SESSION-03: SESSION-01 (can parallel with 02, 04)
   - SESSION-04: SESSION-01 (can parallel with 02, 03)
   - SESSION-05: SESSION-02, SESSION-03, SESSION-04
   - SESSION-06: SESSION-05
   - SESSION-07: SESSION-06

3. **Read the session prompt.** Read `prompts/feature/multi-model-providers/SESSION-NN.md` in full.

4. **Read affected files.** Before modifying any file, read it completely. Check for changes from previously completed sessions in this feature.

5. **Execute it.** Follow the session's implementation steps precisely. Write complete, production-ready code. Respect all architecture rules:
   - Layer boundaries (domain imports nothing, infra imports domain, etc.)
   - Dependency injection (services depend on interfaces, not concrete classes)
   - No business logic in IPC handlers
   - Renderer only talks through `window.novelEngine`
   - All types fully specified, no `any`
   - All async operations error-handled

6. **Verify.** Run every verification step listed in the session. If verification fails, fix the issue before proceeding.

7. **Update state.** Edit `prompts/feature/multi-model-providers/STATE.md`:
   - Set the session's status to `done`
   - Set the Completed date to today
   - Add notes about decisions made or complications encountered
   - Update "Last completed session" and "Observations" in Handoff Notes

8. **Update documentation.** Follow the AGENTS.md documentation protocol:
   - Append a CHANGELOG.md entry for this session's changes
   - Update affected architecture docs
   - Only update docs affected by THIS session

9. **Commit.** Stage and commit the session's changes:
   ```bash
   git add -A && git commit -m "feat(multi-model-providers): SESSION-NN — {short title}"
   ```

10. **Loop.** Go back to step 1. If all sessions are `done`, report completion.

---

## Crash Recovery

If the agent stops mid-session:

1. Next run reads `STATE.md` — incomplete sessions show as `in-progress` or `pending`
2. Read Handoff Notes for context
3. Check `git status` and `git log --oneline -5`
4. If partially completed: read the session prompt, check which files exist, complete remaining steps
5. Update STATE.md and continue

### Handoff Protocol

Before stopping:
1. Update `STATE.md` with current progress
2. Write detailed Handoff Notes
3. If mid-session, set status to `in-progress`

---

## Execution Order

**Phase 1 — Domain Foundation**
- SESSION-01: Domain types, interfaces, constants

**Phase 2 — Infrastructure (parallelizable)**
- SESSION-02: ClaudeCodeClient implements IModelProvider
- SESSION-03: ProviderRegistry
- SESSION-04: OpenAiCompatibleProvider

**Phase 3 — Wiring**
- SESSION-05: Service migration + composition root

**Phase 4 — Interface**
- SESSION-06: IPC channels + preload bridge
- SESSION-07: Renderer provider settings UI

---

## Stopping Conditions

- **All done:** All 7 sessions are `done`. Report final summary.
- **Blocked:** Set status to `blocked` with notes. Skip to next eligible session.
- **Context limit:** Update STATE.md with Handoff Notes. Next run continues.
- **User input needed:** Set to `blocked` with the question in notes.

---

## Final Report

When all sessions are done, produce:

1. **Summary:** What was built
2. **Sessions completed:** 7/7
3. **Files created/modified:** counts and lists
4. **Architecture impact:** new types, services, IPC channels, stores, components
5. **Testing notes:** How to verify end-to-end
6. **Follow-up work:** OpenCode CLI provider, model auto-discovery, API key encryption
