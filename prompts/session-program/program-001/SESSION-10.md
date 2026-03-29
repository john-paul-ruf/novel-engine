# SESSION-10 — Query Letter Mode + Helper Agent Improvements

> **Feature:** small-queue-intake
> **Layer(s):** M01 (constants only — no runtime changes), agents file (HELPER.md)
> **Depends on:** Nothing
> **Estimated effort:** 20 min

---

## Context

Two small content-level changes bundled together since neither requires structural code:

1. **Query letter mode:** Add Quick Actions to Quill for traditional publishing output (query letter + synopsis). No pipeline changes, no new types — just new entries in `AGENT_QUICK_ACTIONS`.

2. **Helper agent improvements:** Update `agents/HELPER.md` with better context so the helper can answer more questions about the app. Create a meta prompt for keeping `user_guide.md` up to date.

---

## Files to Read First

- `src/domain/constants.ts` — AGENT_QUICK_ACTIONS for Quill
- `agents/HELPER.md` — full file
- Any existing `user_guide.md` in the project (`grep -r "user_guide" . --include="*.md" -l` to find it)

---

## Part 1: Query Letter Quick Actions

In `src/domain/constants.ts`, find `AGENT_QUICK_ACTIONS.Quill` and add two new entries:

```ts
{
  label: 'Query Letter (Traditional)',
  prompt: `Write a professional query letter for traditional publishing submission.

A query letter is approximately 250-300 words and has three parts:
1. Hook + premise (one compelling paragraph that introduces protagonist, inciting incident, and stakes)
2. Plot summary (one paragraph: setup, conflict, midpoint, climax hint — no spoilers on resolution)
3. Brief bio + comp titles (your relevant credentials and 2-3 recent comparable titles)

Read the pitch, story bible, and voice profile for context. Write the letter in first person as the author. Output to source/query-letter.md.`,
},
{
  label: 'Synopsis (Traditional)',
  prompt: `Write a full-plot synopsis for traditional publishing.

A synopsis is 1-2 pages (400-800 words). Unlike a query letter, it does NOT withhold the ending — agents need to know the full arc.

Include:
- Protagonist introduction and core want/need
- Inciting incident
- Key turning points and midpoint
- Climax and resolution
- Protagonist's arc and change

Read the full manuscript and scene outline. Write in present tense, third person. Output to source/synopsis.md.`,
},
```

These join the existing Quill quick actions. Existing actions are unchanged.

---

## Part 2: Helper Agent Improvements

### 2a: Update agents/HELPER.md

Read the current `HELPER.md` fully. Then:

1. Add a section at the top of the system prompt (after any existing intro) that gives the Helper agent a clear map of the application structure. Include:
   - The 14-phase pipeline and what each phase does
   - The 7 creative agents and their roles
   - Where key files live (source/, chapters/, dist/)
   - Common user workflows (how to start a book, how to advance the pipeline, how to use revision queue)
   - How to interpret common error states

2. Add explicit guidance for the most common user questions:
   - "My first draft is done, what do I do?" → Mark first-draft complete, then run Ghostlight
   - "The pipeline is stuck / won't advance" → explain pending-completion state
   - "Verity didn't write the next chapter" → troubleshooting steps
   - "How do I use the revision queue?" → step-by-step

Do not make the prompt so long it becomes slow to process. Aim for comprehensive but scannable — use markdown headers inside the prompt.

### 2b: Create user_guide meta prompt

Find if a `user_guide.md` file exists (check `agents/` and `docs/`). Read it if it exists.

Create `prompts/meta/user-guide-maintenance.md`:

```markdown
# Meta Prompt: Keep user_guide.md Current

## Purpose

Run this prompt whenever significant features are added to Novel Engine to keep the user guide accurate.

## Instructions for the Agent

You are updating the Novel Engine user guide. Read the following files to understand the current state of the application:

1. `src/domain/constants.ts` — PIPELINE_PHASES, AGENT_REGISTRY, AGENT_QUICK_ACTIONS
2. `src/renderer/components/Layout/Sidebar.tsx` — current navigation structure
3. `src/renderer/stores/viewStore.ts` — available views
4. `docs/architecture/RENDERER.md` — component inventory (if it exists)
5. The existing `docs/user_guide.md` or `agents/user_guide.md`

After reading:
1. Identify any features, phases, or UI elements that are described incorrectly or missing from the guide
2. Update `docs/user_guide.md` to reflect the current state
3. Ensure the following sections exist and are accurate:
   - Getting Started (first book, onboarding)
   - The Pipeline (all 14 phases with descriptions)
   - AI Agents (all 7 + Wrangler + Helper)
   - Views (Chat, Files, Build, Pitch Room, Settings)
   - Advanced Features (revision queue, auto-draft, find & replace, motif ledger)
   - Troubleshooting

Write clean, friendly prose. Audience: non-technical authors. No jargon. Max 3000 words total.
```

---

## Architecture Compliance

- [x] `constants.ts` change is M01 (domain) — permitted: AGENT_QUICK_ACTIONS is a pure data constant with no Node.js deps
- [x] No new types or interfaces
- [x] No new IPC channels
- [x] HELPER.md is an agent prompt file, not source code — no architecture implications

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. In a Quill chat, the Quick Actions menu shows "Query Letter (Traditional)" and "Synopsis (Traditional)" entries
3. `agents/HELPER.md` is updated with the new guidance sections
4. `prompts/meta/user-guide-maintenance.md` exists and is well-formed

---

## State Update

Set SESSION-10 to `done` in STATE.md.
