# Architecture Refactor — Master Loop

> Run this prompt to execute the architecture refactor. It reads `STATE.md`, picks the next prompt, executes it, updates state, and loops until all prompts are done.

---

## Instructions

You are executing the Novel Engine architecture refactor. This is a set of 14 encapsulated prompts that address specific architectural issues. Each prompt is self-contained with clear inputs, outputs, and verification steps.

**Your job:** Loop through the prompts in dependency order until all are `done`.

---

## Protocol

### On each iteration:

1. **Read state.** Read `prompts/arch/STATE.md` to see what's done, what's pending, and any handoff notes from previous runs.

2. **Pick the next prompt.** Select the first `pending` prompt whose dependencies are satisfied:
   - ARCH-01, ARCH-02, ARCH-10, ARCH-11, ARCH-12, ARCH-13, ARCH-14 have no dependencies — run anytime
   - ARCH-03 has no dependencies but should run before ARCH-04–08 ideally
   - ARCH-04 depends on ARCH-03
   - ARCH-05 depends on ARCH-03, ARCH-04
   - ARCH-06 depends on ARCH-03, ARCH-04
   - ARCH-07 depends on ARCH-03, ARCH-04
   - ARCH-08 depends on ARCH-03, ARCH-04, ARCH-05
   - ARCH-09 depends on ARCH-04, ARCH-05, ARCH-06, ARCH-07, ARCH-08

3. **Read the prompt.** Read `prompts/arch/ARCH-NN.md` in full.

4. **Execute it.** Follow the prompt's implementation steps precisely. Read existing code before modifying it. Create files in dependency order. Write complete, production-ready code.

5. **Verify.** Run every verification step listed in the prompt. If verification fails, fix the issue before proceeding.

6. **Update state.** Edit `prompts/arch/STATE.md`:
   - Set the prompt's status to `done`
   - Set the Completed date to today
   - Add any notes about decisions made or complications encountered
   - Update the "Last completed prompt" and "Observations" in the Handoff Notes section

7. **Update documentation.** Follow the AGENTS.md documentation protocol:
   - Append a CHANGELOG.md entry for this prompt's changes
   - Update affected architecture docs (DOMAIN.md, INFRASTRUCTURE.md, APPLICATION.md, IPC.md, RENDERER.md, ARCHITECTURE.md)

8. **Loop.** Go back to step 1. If all prompts are `done`, report completion.

---

## Execution Order (Recommended)

The optimal execution order minimizes re-reading and maximizes parallelism:

### Phase 1 — Independent cleanups (any order)
- ARCH-01 (extract prompt templates)
- ARCH-02 (extract status messages)
- ARCH-10 (document renderer imports exception)
- ARCH-11 (clean up Wrangler vestige)
- ARCH-13 (database migration system)
- ARCH-14 (standardize agent filenames)

### Phase 2 — Interface foundation
- ARCH-03 (add IChatService + IUsageService interfaces)

### Phase 3 — ChatService decomposition (order matters)
- ARCH-04 (extract StreamManager) — first, creates shared utility
- ARCH-05 (extract AuditService) — after ARCH-04
- ARCH-06 (extract PitchRoomService) — after ARCH-04
- ARCH-07 (extract HotTakeService) — after ARCH-04
- ARCH-08 (extract AdhocRevisionService) — after ARCH-04, ARCH-05

### Phase 4 — Capstone
- ARCH-09 (slim ChatService to router) — after all of Phase 3

### Phase 5 — Error handling sweep
- ARCH-12 (audit catch blocks) — last, since other prompts may add/change catches

---

## Stopping Conditions

- **All done:** All 14 prompts are `done` in STATE.md. Report final summary.
- **Blocked:** A prompt fails verification and you cannot fix it. Set status to `blocked` with notes. Skip to next eligible prompt.
- **Context limit:** If you're running low on context, update STATE.md with current progress and stop. The next run will pick up where you left off — that's what the state tracker is for.

---

## Final Report

When all prompts are done, produce a summary:

1. Total files created
2. Total files modified
3. ChatService final line count (should be under 400)
4. constants.ts final line count (should be under 300)
5. New services created and their line counts
6. Any issues encountered or deferred
