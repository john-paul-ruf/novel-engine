# Crash Analysis — 2026-07-23 (program-032)

## Crash Log Summary

The crash log (same `npm start` log as program-031, re-pasted 2026-07-23) exposes
**four** new issues distinct from the OOM/disposed-renderer problems that
program-031 already fixed. Program-031's buffers + webContents guard are in
place; these issues are unrecoverable agent-loop behaviors and a renderer bug
that lets the UI repeatedly call `files:read` on draft files that do not exist
yet.

### Issue 1 — Renderer reads non-existent `chapters/NN/draft.md` (CRITICAL, ~22 errors)

```
Error occurred in handler for 'files:read': Error: File not found: chapters/24-the-water/draft.md in book "the-last-distance"
Error occurred in handler for 'files:read': Error: File not found: chapters/01-the-morning-rite/draft.md in book "the-last-distance"
Error occurred in handler for 'files:read': Error: File not found: chapters/01-first-reading/draft.md in book "the-last-distance"
```

Every iteration of auto-draft bumps the `fileChangeStore.revision` →
`useBookFile` (shared by `ManuscriptView`, `ChapterTab`, `SourcesTab`,
`ReportsTab`, `ExplorerTab`) triggers a `files:read` for the currently
selected chapter's `draft.md`. The renderer fires these even when the file
doesn't exist (chapter directory was created but draft.md hasn't been
written yet, or the chapter is empty entirely).

`useChapterList` already returns `hasDraft: boolean` for every chapter, but
`ManuscriptView` ignores it — its default selection effect picks the first
*body* chapter regardless of draft presence (`src/renderer/Manuscript/
ManuscriptView.tsx:155-162`):

```typescript
const firstBody = chapters.find((c) => c.kind === 'body');
setSelectedSlug((firstBody ?? chapters[0]).slug);
```

Once that slug is selected, `draftPath = chapters/${selectedSlug}/draft.md`
(line 169) gets passed into `useBookFile`, which calls
`window.novelEngine.files.read(bookSlug, path)` → throws → IPC logs the
`File not found` error.  Re-fires on every revision bump (every agent write).

The Chapter rail already shows an "EMPTY" badge for chapters without drafts,
so we know which chapters have content — we just need to prefer those in the
default selection.

### Issue 2 — Phantom empty Ollama turns terminate the agent loop (CRITICAL, 2 occurrences)

```
[OllamaCodeClient] Turn 5 done: thinking=123068 chars, content=0 chars, toolCalls=0, tokens=0in/0out
[OllamaCodeClient] No tool calls — agent loop complete after 5 turn(s)
[OllamaCodeClient] Stream complete: totalThinking=123740 chars, totalText=0 chars, filesTouched={}
```

The Ollama stream hit `chunk.done = true` with `eval_count: 0` and
`prompt_eval_count: 0` (the final-chunk token fields) while the model had
emitted 123K chars of *thinking* but no content and no tool calls. The
agent loop treats `toolCalls.length === 0` as natural completion
(`src/infrastructure/ollama-cli/OllamaCodeClient.ts:431-436`):

```typescript
if (turnResult.toolCalls.length === 0) {
  exitReason = 'natural';
  console.log(`[OllamaCodeClient] No tool calls — agent loop complete after ${turn + 1} turn(s)`);
  break;
}
```

A turn with **no content AND no tool calls** is *not* a natural finish —
the model simply produced no usable output (likely the Ollama server
returned a 0-token chunk after the model OOM'd on its own thinking).
The agent should retry the same turn (no message changes) up to a small
bound; only when consecutive empty turns exceed the bound should it
terminate with `isMaxTurns: true` so the outer resumer/autodraft gets a
chance to react.

### Issue 3 — Unbounded `AutoTurnResumer` resume attempts (CRITICAL)

`src/application/AutoTurnResumer.ts:34` explicitly states: *"No cap on resume
attempts — keeps going until the task finishes naturally."* The `while (true)`
loop at line 68 re-spawns with `+10` turns each attempt indefinitely.

In the log, this spirals: turn 5 phantom-completes → AutoTurnResumer sees
`isMaxTurns: true` → re-spawns with +10 turns → another phantom turn →
re-spawn → … Without the phantom detection from Issue 2, this loop never
exits because every spawn terminates immediately as "natural".

The resumer needs two guards:
1. **Hard cap on resume attempts** (`MAX_RESUME_ATTEMPTS = 5`) — after this,
   forward a `done` with `isMaxTurns: true` and a `warning` explaining the
   task consumed too many turns.
2. **No-progress guard** — track `filesTouched` across attempts. If two
   consecutive attempts produce no new partial text and no new file
   touches, abort with a warning instead of looping.

### Issue 4 — `autoDraftStore` has no time budget → drives Issues 2 & 3

`src/renderer/stores/autoDraftStore.ts:24`: `MAX_ITERATIONS = 150` is the
only safety valve. With AutoTurnResumer running 30+40+50+… turns per
iteration and the phantom-turn loop returning every attempt as natural,
the autodraft keeps saying "Drafting chapter 23…" for 45+ minutes while
the model churns without producing a new chapter.

The store needs a hard **time budget** (default 4h) that breaks the loop
with a descriptive `isPaused: true, pauseReason: "Time budget reached —
resume to continue"` so the user controls whether to continue.

Existing detection for the "no progress" case is partial — `countAfter >
countBefore` is the happy path; `!gotResponse` pauses;  but when the
response arrives with no new chapter, the loop falls to the "Verity did
prep work. Retry." branch (line 488) and just keeps retrying
indefinitely. A bounded retry counter for that case (e.g. 3 consecutive
no-progress iterations) complements the time budget.

## Fix Plan

| Session | Issue | Files |
|---------|-------|-------|
| SESSION-01 | #1 — ManuscriptView default selection skips draftless chapters | `src/renderer/components/Manuscript/ManuscriptView.tsx`, `src/renderer/components/Manuscript/ManuscriptView.test.tsx` |
| SESSION-02 | #2 — OllamaCodeClient detects phantom empty turns, retries bounded, exits as max-turns | `src/infrastructure/ollama-cli/OllamaCodeClient.ts`, `src/infrastructure/ollama-cli/OllamaCodeClient.test.ts`, `src/test/fixtures/ollama-responses.ts` |
| SESSION-03 | #3 — AutoTurnResumer caps attempts + detects no-progress loops | `src/application/AutoTurnResumer.ts`, `src/application/AutoTurnResumer.test.ts` |
| SESSION-04 | #4 — autoDraftStore time budget + no-progress retry cap | `src/renderer/stores/autoDraftStore.ts`, `src/renderer/stores/autoDraftStore.test.ts` |

## Out of scope (cosmetic, not blocking)

- `settings:load` handler race on main restart (already flagged in
  program-031 crash-analysis, intentionally unaddressed there).