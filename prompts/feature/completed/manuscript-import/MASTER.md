# Feature Build — Master Loop (manuscript-import)

> Run this prompt to execute the feature build. It reads `STATE.md`, picks the next session, executes it, updates state, and loops until all sessions are done.

---

## Feature

**Name:** manuscript-import
**Intent:** Import an existing manuscript (Markdown or DOCX file) into Novel Engine, split it into chapters, set up the full book structure, and optionally generate source documents via AI.
**Total sessions:** 6

---

## Instructions

You are building the "manuscript-import" feature for Novel Engine. This is a set of 6 ordered session prompts that implement the feature from domain types through to the renderer UI, including multi-agent source document generation.

**Your job:** Loop through the sessions in dependency order until all are `done`.

---

## Protocol

### On each iteration:

1. **Read state.** Read `prompts/feature/manuscript-import/STATE.md` to see what's done, what's pending, and any handoff notes from previous runs.

2. **Pick the next session.** Select the first `pending` session whose dependencies are satisfied.

   Dependencies:
   - SESSION-01: Nothing
   - SESSION-02: SESSION-01
   - SESSION-03: SESSION-02
   - SESSION-04: SESSION-03
   - SESSION-05: SESSION-04
   - SESSION-06: SESSION-05

3. **Read the session prompt.** Read `prompts/feature/manuscript-import/SESSION-NN.md` in full.

4. **Read affected files.** Before modifying any file, read it completely. Check for changes from previously completed sessions in this feature.

5. **Execute it.** Follow the session's implementation steps precisely. Write complete, production-ready code. Respect all architecture rules:
   - Layer boundaries (domain imports nothing, infra imports domain, etc.)
   - Dependency injection (services depend on interfaces, not concrete classes)
   - No business logic in IPC handlers
   - Renderer only talks through `window.novelEngine`
   - All types fully specified, no `any`
   - All async operations error-handled

6. **Verify.** Run every verification step listed in the session. If verification fails, fix the issue before proceeding.

7. **Update state.** Edit `prompts/feature/manuscript-import/STATE.md`:
   - Set the session's status to `done`
   - Set the Completed date to today
   - Add notes about decisions made or complications encountered
   - Update "Last completed session" and "Observations" in Handoff Notes

8. **Update documentation.** Follow the AGENTS.md documentation protocol:
   - Append a CHANGELOG.md entry for this session's changes
   - Update affected docs in `docs/architecture/`

### Stop conditions:

- All 6 sessions are `done` → report feature complete
- A session fails verification and cannot be fixed → mark as `blocked`, report the issue
- A session's dependencies are `blocked` → mark as `blocked`

---

## Architecture Reminders

- **Domain** (`src/domain/`): Pure types. Zero imports. Everything depends on this.
- **Infrastructure** (`src/infrastructure/`): Implements domain interfaces. Isolated modules.
- **Application** (`src/application/`): Orchestrates infrastructure through injected interfaces.
- **Main/IPC** (`src/main/`, `src/preload/`): Composition root + thin IPC adapters.
- **Renderer** (`src/renderer/`): React + Zustand. Talks to backend only through preload bridge.

Import direction: `DOMAIN ← INFRASTRUCTURE ← APPLICATION ← IPC/MAIN ← RENDERER`

---

## Key Files to Reference

| File | Why |
|------|-----|
| `src/domain/types.ts` | All shared type definitions |
| `src/domain/interfaces.ts` | Service contracts |
| `src/main/index.ts` | Composition root — where services are instantiated |
| `src/main/ipc/handlers.ts` | IPC channel registry |
| `src/preload/index.ts` | Preload bridge — renderer's API surface |
| `src/application/BuildService.ts` | Pattern for Pandoc + child_process usage |
| `src/infrastructure/filesystem/FileSystemService.ts` | Book creation, file I/O patterns |
| `src/renderer/components/Sidebar/BookSelector.tsx` | Where the Import button goes |
| `src/renderer/stores/bookStore.ts` | Book state management patterns |
| `src/application/RevisionQueueService.ts` | Pattern for sequential agent calls via IProviderRegistry |
| `src/application/ContextBuilder.ts` | Context assembly for agent CLI calls |
