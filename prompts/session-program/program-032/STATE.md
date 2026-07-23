# State Tracker — Novel Engine / fix-phantom-turns-renderer-reads

## Program
Novel Engine — Electron + React 18 + TypeScript 5 + Zustand + Ollama CLI provider

## Feature
fix-phantom-turns-renderer-reads

## Intent
Fix four issues found in the 2026-07-23 crash log that program-031 did NOT
address: (1) renderer repeatedly reading draft.md for chapters without drafts,
(2) Ollama phantom empty turns terminating the agent loop as "natural", (3)
AutoTurnResumer unbounded resume attempts, (4) autoDraftStore no time budget /
no-progress retry cap.

## Sessions

| # | Session | Modules | Status | Completed | Notes |
|---|---------|---------|--------|-----------|-------|
| 01 | ManuscriptView default selection skips draftless chapters | M10 | done | 2026-07-23 | All tests green; no API change |
| 02 | OllamaCodeClient detects phantom empty turns, retries bounded | M12 | done | 2026-07-23 | 2 new tests, all Ollama tests green |
| 03 | AutoTurnResumer caps attempts + detects no-progress loops | M08 | pending | | |
| 04 | autoDraftStore time budget + no-progress retry cap | M10 | pending | | |

## Dependency Graph

```
SESSION-01 (renderer — independent)
    └──────────────────────────────────┐
SESSION-02 (OllamaCodeClient — independent)
    └── SESSION-03 (AutoTurnResumer — depends on SESSION-02's exit reason)
        └── SESSION-04 (autoDraftStore — depends on SESSION-03's hard cap)
```

- **SESSION-01** and **SESSION-02** are fully independent — touch different
  layers (renderer vs ollama-cli infra).
- **SESSION-03** depends on SESSION-02 because the resumer's no-progress guard
  must consume the new `isMaxTurns: true` exit reason from the phantom-turn
  detection. SESSION-02 must land first so the resumer has something to react
  to without re-implementing phantom detection.
- **SESSION-04** depends on SESSION-03 because the autodraft's time budget
  interacts with the resumer's bounded attempts — together they bound total
  work. SESSION-03's hard cap is the inner bound; the autodraft time budget
  is the outer bound.

## Architecture Reference

- **M10** (`src/renderer/components/Manuscript/ManuscriptView.tsx:155-162`) —
  default chapter selection picks first body chapter regardless of
  `hasDraft` → repeatedly reads `chapters/{slug}/draft.md` that doesn't
  exist. `ChapterInfo` (from ChapterRail.tsx:11-20) already provides
  `hasDraft: boolean`.
- **M10** (`src/renderer/components/common/ProseViewer.tsx:65-109`) —
  `useBookFile` unconditionally calls `window.novelEngine.files.read`; the
  IPC method throws on missing file and the renderer only catches per-call
  (shows error). The ManuscriptView change in SESSION-01 avoids triggering
  this by never selecting a draftless chapter as default.
- **M12** (`src/infrastructure/ollama-cli/OllamaCodeClient.ts:431-436`) —
  `toolCalls.length === 0` treated as natural completion regardless of
  `contentText.length === 0` and token counts of zero. Need to detect
  phantom empty turns and retry the same turn up to
  `MAX_CONSECUTIVE_EMPTY_TURNS` (3) before exiting as max-turns.
- **M08** (`src/application/AutoTurnResumer.ts:34,68-184`) — `while (true)`
  loop with no attempt cap. Need `MAX_RESUME_ATTEMPTS = 5` plus
  no-progress guard (no new files touched AND no new partial text across 2
  consecutive attempts → stop).
- **M10** (`src/renderer/stores/autoDraftStore.ts:24,287-492`) —
  `MAX_ITERATIONS = 150` is iteration cap, no time budget. The "Verity did
  prep work. Retry." branch at line 488 retries indefinitely. Need
  `MAX_AUTO_DRAFT_DURATION_MS = 4h` and `MAX_NO_PROGRESS_RETRIES = 3`.

## Scope Summary

| ID | Module | Files Affected |
|----|--------|---------------|
| M10 | renderer | `src/renderer/components/Manuscript/ManuscriptView.tsx`, `src/renderer/components/Manuscript/ManuscriptView.test.tsx` |
| M12 | ollama-cli | `src/infrastructure/ollama-cli/OllamaCodeClient.ts`, `src/infrastructure/ollama-cli/OllamaCodeClient.test.ts`, `src/test/fixtures/ollama-responses.ts` |
| M08 | application | `src/application/AutoTurnResumer.ts`, `src/application/AutoTurnResumer.test.ts` |
| M10 | renderer/stores | `src/renderer/stores/autoDraftStore.ts`, `src/renderer/stores/autoDraftStore.test.ts` |

## Design Decisions

1. **Prefer chapters with drafts in ManuscriptView default selection** — the
   list effect at `ManuscriptView.tsx:155-162` rewrites the default to:
   first body chapter *with* `hasDraft === true`; fall back to first body
   chapter; fall back to first chapter overall. The selection is a *visual*
   default — clicking a draftless chapter in the rail still selects it (and
   that's intentional; the rail shows "EMPTY" badge). Rationale: eliminates
   the repeated `files:read` IPC noise for non-existent drafts while preserving
   the user's ability to navigate anywhere.

2. **Phantom empty turn = contentText.length === 0 AND toolCalls.length === 0**
   — at the point where the loop currently breaks as "natural"
   (`OllamaCodeClient.ts:431-436`), add a counter:
   `consecutiveEmptyTurns`. On empty turn: increment, emit a `warning` event,
   retry the same `turn` index (decrement `turn` or use `continue` with a
   bounded retry). When `consecutiveEmptyTurns >= MAX_CONSECUTIVE_EMPTY_TURNS`
   (3), set `exitReason = 'max-turns'` and break — the outer AutoTurnResumer
   gets `isMaxTurns: true` and can react. Rationale: 0-token responses are
   server/model failures, not user-meaningful "done"; bounded retry gives the
   model a chance to recover without risking infinite loops.

3. **MAX_RESUME_ATTEMPTS = 5 in AutoTurnResumer** — hard cap after which the
   resumer emits one merged `done` with `isMaxTurns: true` and the caller
   stops. Plus a no-progress guard: track `filesTouched` and `partialText`
   length across attempts; if two consecutive attempts produce neither new
   text nor new files, abort with a `warning` event and `done` (isMaxTurns:
   true). Rationale: even with phantom-turn detection, large-context prompts
   can genuinely need more turns; 5 attempts × (30+40+50+60+70)=250 total
   turns × ~30s each = ~2h, plenty for a chapter draft. No-progress guard
   catches "always phantom" pathologies without attempting 5 times.

4. **autoDraftStore time budget = 4h, no-progress retry cap = 3 iterations**
   (SESSON-04):
   - `MAX_AUTO_DRAFT_DURATION_MS = 4 * 60 * 60 * 1000`. Captured at `start`,
     checked at the top of each iteration; if exceeded, pause with reason
     `"Time budget reached (#hh:mm) — resume to continue or stop"`.
   - `MAX_NO_PROGRESS_RETRIES = 3`. Counter for consecutive iterations where
     `countAfter === countBefore` AND the response wasn't `DRAFT_COMPLETE`.
     After hitting the cap, pause with reason
     `"Verity produced no new chapter after N attempts — the model may be
     stuck. Resume to retry or stop."`.
   Rationale: the existing `gotResponse`/`!gotResponse` pause already covers
   hard CLI failure; this covers the soft stall (response arrives, does
   nothing useful) — the exact pattern in the log. Time budget is the outer
   safety for the *whole* run, complementing the iteration cap and the
   resumer cap.

## Handoff Notes

### SESSION-01 (done 2026-07-23)
ManuscriptView's default-selection effect now prefers chapters with
`hasDraft === true`. Eliminates the repeated `files:read → File not found`
IPC errors during auto-draft. Added regression test. No public API change;
no architecture impact; unrelated to SESSION-02's OllamaCodeClient work.

### SESSION-02 (done 2026-07-23)
Added `MAX_CONSECUTIVE_EMPTY_TURNS = 3` detection to OllamaCodeClient's
agent loop. A phantom empty turn (0 content + 0 tool calls) now emits a
`warning` event and retries the same turn index up to 3 times via
`turn--; continue`. Exceeding the bound sets `exitReason = 'max-turns'`,
so the `done` event carries `isMaxTurns: true`. The natural-finish branch
(contentText > 0) is unchanged. Added two tests: retry-then-success and
triple-phantom. No public API change — the new behavior flows through the
existing `isMaxTurns` field in the `done` event. SESSION-03
(AutoTurnResumer) can now rely on `isMaxTurns: true` being set for
phantom-induced exits.