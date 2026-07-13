# SESSION-02 — Harden the Research & Field-Fill Prompts

> **Program:** Novel Engine
> **Feature:** query-tracker-parse-resilience
> **Modules:** M08 (application)
> **Depends on:** none (parallel-safe with SESSION-01)
> **Estimated effort:** 15 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M08 | application | `src/application/QueryService.ts` | Owns `buildResearchPrompt` / `buildFieldFillPrompt` |

## Context

The research prompt shows the tracker entry template as `## [Target Name] — drafting`.
The model read `[Target Name]` as *placeholder syntax* and dropped the brackets when
writing real entries — which broke parsing (see `input-files/bug-report.md`). Even with
SESSION-01's lenient parser, the prompt should steer the model toward the canonical
format: lenient parsing is the safety net, not the contract.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/application/QueryService.ts` | Modify | Concrete-example format blocks in both prompt builders |

## Implementation

### 1. Fix `buildResearchPrompt` (~line 390)

Read the method first. Replace the format template block (currently starting
`## [Target Name] — drafting`) with a **concrete worked example** plus an explicit
brackets-are-literal instruction. Replace from `Append new entries...` through the
end of the template with:

```text
Append new entries to any existing content in source/query-tracker.md. Do not remove
existing targets.

Each entry MUST follow this exact format. The square brackets around the name are
LITERAL characters that must appear in the heading, and the separator is an em dash
(—) surrounded by spaces. Example entry for a fictional agent "Jane Doe":

## [Jane Doe] — drafting
- **Type:** agent
- **Contact:** jane@exampleliterary.com
- **Method:** email
- **ID:** QT-001
- **Submitted:**
- **Response Date:**
- **Query Letter:**
- **Personalization:** Seeks near-future SF with voice-driven protagonists; this book's premise fits her MSWL item on surveillance culture.
- **Notes:** Query + first 10 pages in email body.
- **Link:** https://examplemswl.com/jane-doe

Write the real agent's name in place of "Jane Doe", KEEPING the square brackets:
correct: `## [Cortney Radocaj] — drafting` / wrong: `## Cortney Radocaj — drafting`.
```

Keep the rest of the method (research instructions, WebSearch guidance, 5–10 target
goal, closing line) unchanged.

### 2. Fix `buildFieldFillPrompt` (~line 426)

Read the method fully (it continues past line 445: "Write the updated value using the
same markdown format"). If its format example uses bracket-placeholder style or shows a
bare field template, apply the same treatment: one concrete literal example line, e.g.

```text
- **Contact:** submissions@agencyname.com
```

and an instruction that the update must ONLY touch that one bullet line for the named
target's section (heading `## [<name>] — <status>`), leaving the heading and all other
fields byte-identical.

### 3. Check `buildGeneratePrompt` (~line 370)

Read it. It writes to `source/query-letters/<slug>.md` (free-form prose, not parsed) —
no format contract needed. Only change it if it references tracker-entry syntax.

## Verification

1. `npx tsc --noEmit` — clean.
2. Manual read-through of both rendered prompts (temporarily `console.log` them or
   inspect string literals): the word "placeholder" trap is gone — every example shows
   a *filled-in* name with brackets retained, and the correct/wrong contrast line is present.
3. Architecture compliance: changes confined to M08 string builders; no new imports.

## State Update

Update `prompts/session-program/program-024/STATE.md`: set SESSION-02 to `done`, add
completion date, note in Handoff Notes whether `buildFieldFillPrompt`/`buildGeneratePrompt`
needed changes.
