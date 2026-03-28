# Intake — Parse Documents into Feature Session Prompts

> **Purpose:** Read one or more attached documents (feature specs, research notes, design docs, bug reports, RFCs, or raw ideas), analyze them against the current codebase, decompose the work into ordered session prompts, and generate a complete feature build-out directory with a master loop, state tracker, and per-session prompts.
>
> **Input:** Any number of `.md` documents attached to the conversation context alongside this prompt.
> **Output:** `prompts/feature/{feature-name}/` containing numbered `SESSION-NN.md` prompts, `MASTER.md`, and `STATE.md`

---

## Prerequisites

- At least one document is attached alongside this prompt.
- If no documents are attached, STOP and ask the user: "What feature or change do you want me to build? Attach a document or describe it here."

---

## Step 1 — Read and Understand All Attached Documents

Read every attached document in full. For each, determine:

| Field | What to Extract |
|-------|----------------|
| **Type** | Feature spec, research, design doc, bug report, RFC, raw idea, conversation log, external API docs |
| **Core Intent** | What is being requested or proposed — one sentence |
| **Scope** | What parts of the application are affected (domain, infra, application, IPC, renderer, agents, new subsystem) |
| **Constraints** | Explicit requirements, performance targets, compatibility needs, "must not" rules |
| **Ambiguities** | Anything unclear, contradictory, or underspecified |
| **Dependencies** | External packages, APIs, or system capabilities required |
| **Risk Areas** | Parts that could conflict with existing architecture or require careful migration |

If multiple documents are attached, synthesize them into a single coherent feature understanding. Note contradictions between documents.

---

## Step 2 — Ask Clarifying Questions (If Needed)

**STOP and ask the user** if any of the following are true:

- The core intent is ambiguous — you can't write a one-sentence summary of what to build
- The documents contradict each other on a material point
- The scope is unclear — you can't determine which architectural layers are affected
- A critical design decision is left open with no clear "cleaner option"
- The feature requires a technology not in the current stack and no alternative is obvious
- The feature would require breaking changes to existing interfaces and the migration path isn't clear

Format questions as a numbered list. Be specific about what you need decided. Offer your recommendation for each.

**If everything is clear, proceed without asking.** Don't ask about things you can resolve with architectural judgment.

---

## Step 3 — Research the Current Codebase

Before designing sessions, understand what exists:

### 3a. Read the Domain Layer

Read these files to understand current types, interfaces, and constants:

- `src/domain/types.ts`
- `src/domain/interfaces.ts`
- `src/domain/constants.ts`

### 3b. Read Affected Layers

Based on the scope identified in Step 1, read the files that will be touched:

- **Infrastructure:** Read the relevant `src/infrastructure/*/index.ts` barrel exports and key implementation files
- **Application:** Read affected service files in `src/application/`
- **IPC:** Read `src/main/ipc/handlers.ts` and `src/preload/index.ts`
- **Main:** Read `src/main/index.ts` (composition root)
- **Renderer:** Read affected stores in `src/renderer/stores/` and key components

### 3c. Check for Conflicts

Identify:

- Types or interfaces that need modification vs. extension
- Services that need new methods vs. new services entirely
- IPC channels that need adding
- Stores that need new state/actions
- Components that need modification vs. new components
- Database schema changes (migrations required?)

### 3d. Read Architecture Docs

Read the relevant docs in `docs/architecture/` to ensure your plan aligns with documented patterns.

---

## Step 4 — Determine the Feature Name

Derive a kebab-case feature name from the core intent. This becomes the directory name.

```
Examples:
  "Add collaborative editing" → collaborative-editing
  "Implement chapter reordering" → chapter-reordering
  "Add export to Google Docs" → google-docs-export
  "Fix pipeline phase regression" → pipeline-phase-fix
```

Store this as `F_DIR` for the rest of the prompt (e.g., `prompts/feature/chapter-reordering`).

---

## Step 5 — Decompose into Sessions

Break the feature into **ordered, self-contained sessions**. Each session:

- Produces a specific set of files that compile and pass `npx tsc --noEmit`
- Has clear inputs (what must exist before it runs) and outputs (what it creates)
- Follows the Clean Architecture layer boundaries
- Can be executed by an agent in a single context window (~30 min of work max)
- Ends with a verification step

### Decomposition Rules

#### 5a. Follow the Layer Dependency Order

Sessions that create domain types come before sessions that implement infrastructure. Infrastructure before application. Application before IPC. IPC before renderer.

```
Typical session flow:
  1. Domain changes (types, interfaces, constants)
  2. Infrastructure additions/modifications
  3. Application service logic
  4. IPC wiring + preload bridge
  5. Renderer stores
  6. Renderer components/views
  7. Integration + polish
```

Not every feature needs all layers. A renderer-only change might be 2-3 sessions.

#### 5b. One Concern per Session

Each session addresses one logical unit of work. Don't bundle unrelated changes. But DO group tightly coupled changes that would break the build if split.

#### 5c. Each Session Must Compile

After every session, `npx tsc --noEmit` must pass. This means:

- If you add an interface method, the session that adds it also updates all implementations (or the implementations come in a later session that provides stubs/throws in between)
- If you add a type, every file that uses it gets updated in the same session or a later one
- No session leaves dangling imports or missing implementations

#### 5d. Keep Sessions Under 200 Lines of Instructions

If a session is getting too long, split it. Prefer more smaller sessions over fewer large ones.

#### 5e. Identify Dependencies Between Sessions

Most sessions depend on the previous one. But parallel sessions are fine when they touch different subsystems. Mark dependencies explicitly.

---

## Step 6 — Generate Session Prompts

Create `{F_DIR}/SESSION-NN.md` for each session. Follow this template:

````markdown
# SESSION-NN — {Short descriptive title}

> **Feature:** {feature-name}
> **Layer(s):** Domain / Infrastructure / Application / IPC / Renderer
> **Depends on:** {SESSION-XX or "Nothing"}
> **Estimated effort:** {10 / 15 / 20 / 25 / 30 min}

---

## Context

{1-2 paragraphs. What has been built so far in this feature (reference previous sessions). What this session adds and why it's needed. Enough context for an agent starting fresh to understand the state of things.}

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/path/to/file.ts` | Create / Modify | {specific description} |

---

## Implementation

### 1. {First task title}

{Detailed instructions. Start with "Read `file.ts`" before any modification. Show code patterns, type signatures, method bodies. Be specific about imports and which layer they come from.}

### 2. {Second task title}

{Continue...}

---

## Architecture Compliance

- [ ] Domain files import from nothing
- [ ] Infrastructure imports only from domain + external packages
- [ ] Application imports only from domain interfaces (not concrete classes)
- [ ] IPC handlers are one-liner delegations
- [ ] Renderer accesses backend only through `window.novelEngine`
- [ ] All new IPC channels are namespaced (`domain:action`)
- [ ] All async operations have error handling
- [ ] No `any` types (or narrowed immediately if unavoidable)

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. {Specific behavioral verification}
3. {Additional checks as needed}

---

## State Update

After completing this session, update `{F_DIR}/STATE.md`:
- Set SESSION-NN status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
````

### Session Prompt Quality Rules

- **Read before writing.** Every implementation step must reference reading the target file first.
- **Be surgical.** For modifications, cite the specific method/section to change. Show before/after when non-obvious.
- **Show the pattern.** Include actual code for new types, interfaces, method signatures, and non-trivial logic.
- **Respect DI.** New services depend on interfaces. The composition root session wires concrete classes.
- **Wire everything.** If you add a service, a later session must add IPC handlers, preload bridge methods, and store actions. Don't leave features unwired.
- **No TODOs.** Each session must contain enough information for an agent to execute without asking questions.
- **Changelog is mandatory.** Every session ends with a changelog update per AGENTS.md protocol.

---

## Step 7 — Generate STATE.md

Create `{F_DIR}/STATE.md`:

````markdown
# Feature Build — State Tracker ({feature-name})

> Generated from intake documents on {today's date}.
> This file tracks progress across all session prompts.
> Updated by the agent at the end of each session execution.

---

## Feature

**Name:** {feature-name}
**Intent:** {one-sentence summary}
**Source documents:** {list of attached document names}
**Sessions generated:** {count}

---

## Status Key

- `pending` — Not started
- `in-progress` — Started but not verified
- `done` — Completed and verified
- `blocked` — Cannot proceed (see notes)
- `skipped` — Intentionally skipped (see notes)

---

## Session Status

| # | Session | Layer(s) | Status | Completed | Notes |
|---|---------|----------|--------|-----------|-------|
| 1 | SESSION-01 — {title} | {layers} | pending | | |
| 2 | SESSION-02 — {title} | {layers} | pending | | |
{...repeat for all sessions}

---

## Dependency Graph

```
{Mermaid or ASCII dependency tree showing which sessions depend on which}
```

- {Prose explanation of parallelism and ordering constraints}

---

## Scope Summary

### Domain Changes
- {New/modified types}
- {New/modified interfaces}
- {New/modified constants}

### Infrastructure Changes
- {New/modified modules}

### Application Changes
- {New/modified services}

### IPC Changes
- {New/modified channels}
- {New/modified preload bridge methods}

### Renderer Changes
- {New/modified stores}
- {New/modified components}

### Database Changes
- {Schema migrations, if any}

---

## Design Decisions

> Document decisions made during intake decomposition that the executing agent should know about.

| Decision | Rationale |
|----------|-----------|
| {e.g., "New service vs. extending ChatService"} | {e.g., "Separate service — ChatService is already at 400 lines and this concern is orthogonal"} |

---

## Handoff Notes

> Agents write freeform notes here after each session to communicate context to the next run.

### Last completed session: (none yet)

### Observations:

### Warnings:
````

---

## Step 8 — Generate MASTER.md

Create `{F_DIR}/MASTER.md`:

````markdown
# Feature Build — Master Loop ({feature-name})

> Run this prompt to execute the feature build. It reads `STATE.md`, picks the next session, executes it, updates state, and loops until all sessions are done.

---

## Feature

**Name:** {feature-name}
**Intent:** {one-sentence summary}
**Total sessions:** {count}

---

## Instructions

You are building the "{feature-name}" feature for Novel Engine. This is a set of {N} ordered session prompts that implement the feature from domain types through to the renderer UI.

**Your job:** Loop through the sessions in dependency order until all are `done`.

---

## Protocol

### On each iteration:

1. **Read state.** Read `{F_DIR}/STATE.md` to see what's done, what's pending, and any handoff notes from previous runs.

2. **Pick the next session.** Select the first `pending` session whose dependencies are satisfied.

   Dependencies:
   {List each session's dependencies}

3. **Read the session prompt.** Read `{F_DIR}/SESSION-NN.md` in full.

4. **Read affected files.** Before modifying any file, read it completely. Check for changes from previously completed sessions in this feature.

5. **Execute it.** Follow the session's implementation steps precisely. Write complete, production-ready code. Respect all architecture rules:
   - Layer boundaries (domain imports nothing, infra imports domain, etc.)
   - Dependency injection (services depend on interfaces, not concrete classes)
   - No business logic in IPC handlers
   - Renderer only talks through `window.novelEngine`
   - All types fully specified, no `any`
   - All async operations error-handled

6. **Verify.** Run every verification step listed in the session. If verification fails, fix the issue before proceeding.

7. **Update state.** Edit `{F_DIR}/STATE.md`:
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
   git add -A && git commit -m "feat({feature-name}): SESSION-NN — {short title}"
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

{Phase groupings showing which sessions can run in parallel and which are sequential}

---

## Stopping Conditions

- **All done:** All {N} sessions are `done` in STATE.md. Report final summary.
- **Blocked:** A session fails verification and you cannot fix it. Set status to `blocked` with notes. Skip to next eligible session if one exists.
- **Context limit:** Update STATE.md with current progress and Handoff Notes. The next run picks up where you left off.
- **User input needed:** If a session requires a design decision not covered in the prompt, set status to `blocked` with the question in notes. The user will answer and the next run continues.

---

## Final Report

When all sessions are done, produce:

1. **Summary:** What was built, in 2-3 sentences
2. **Sessions completed:** {N}/{N}
3. **Sessions blocked/skipped:** {count} (with reasons)
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
````

---

## Step 9 — Summary Report

After generating all files, output:

```
## Intake Complete

**Feature:** {feature-name}
**Directory:** prompts/feature/{feature-name}/
**Sessions generated:** {count}

### Sessions

| # | File | Title | Layer(s) | Depends On | Est. |
|---|------|-------|----------|------------|------|
| 1 | SESSION-01.md | ... | ... | ... | ... |
{...}

### Scope Impact

- **Domain:** {summary of type/interface/constant changes}
- **Infrastructure:** {summary of new/modified modules}
- **Application:** {summary of new/modified services}
- **IPC:** {summary of new channels}
- **Renderer:** {summary of new stores/components}
- **Database:** {schema changes or "No changes"}

### Design Decisions Made

{Numbered list of key decisions and rationale}

### Estimated Total Effort

{Sum of session estimates} ({count} sessions)

### Next Step

Run `prompts/feature/{feature-name}/MASTER.md` to begin building.
```

---

## Edge Cases

- **Vague single-paragraph input:** Still decompose. Even a vague idea becomes: (1) domain types, (2) a service, (3) IPC wiring, (4) UI. Ask questions only if the core intent is truly ambiguous.
- **Tiny change (1-2 files):** Generate a single SESSION-01.md. Still create MASTER.md and STATE.md — consistency matters.
- **Huge feature (15+ sessions):** Consider splitting into phases within the feature directory. Use `SESSION-01` through `SESSION-NN` but group them in the MASTER.md execution order with phase headers.
- **Feature that only touches renderer:** Skip domain/infra/IPC sessions. Start at the store layer.
- **Feature that only touches infrastructure:** Include domain type changes and IPC wiring but skip renderer sessions.
- **Feature requires new npm package:** First session installs it and configures Vite/Forge if needed.
- **Feature requires database migration:** First infrastructure session creates the migration in `src/infrastructure/database/migrations/`.
- **Documents describe multiple unrelated features:** Ask the user which to build first, or split into separate intake runs — one feature per `prompts/feature/` directory.
- **Feature conflicts with existing architecture:** Document the conflict in STATE.md Design Decisions. Propose the architecturally cleaner resolution. If it requires refactoring existing code, add prep sessions before the feature sessions.
- **Research docs with no clear feature:** Synthesize the research into a feature proposal. Present it to the user for approval before generating sessions.
- **Already partially built:** If files from a previous attempt exist, read them. Incorporate working code into the session plan — don't rebuild what works.

---

## What This Prompt Does NOT Do

- It does **not** execute the sessions. It only generates the prompts.
- It does **not** modify any source code.
- It does **not** update CHANGELOG.md or architecture docs (that happens during execution).
- It does **not** install packages or run build commands.
- It does **not** make irreversible decisions without asking when the input is genuinely ambiguous.
