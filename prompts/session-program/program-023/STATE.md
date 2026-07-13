# State Tracker — Novel Engine / query-research-failure-handling

## Program
Novel Engine

## Feature
query-research-failure-handling

## Intent
Fix the Query Manager "Research Targets" flow: the Quill research run is killed at
8 turns (`error_max_turns`), the error result is mistaken for success, partial
narration is auto-saved into `source/query-tracker.md` (corrupting it and blocking
recovery), and the failure is never surfaced in the UI.

## Sessions
4 sessions. Input: `input-files/bug-report.md` (screenshots + console log analysis,
2026-07-12).

## Session Status

| # | Session | Modules | Status | Completed | Notes |
|---|---------|---------|--------|-----------|-------|
| 01 | Treat error `result` events as errors in ClaudeCodeClient | M06 | done | 2026-07-12 | Tracker flag (`hasErrorResult`) + guard at top of `result` branch; close handler skips duplicate error event |
| 02 | Guard post-stream extraction against non-document content | M08, M01 | done | 2026-07-12 | `PHASE_OUTPUT_CONTENT_MARKERS` (query-agents only); marker threaded to both extraction call sites |
| 03 | Per-call maxTurns override; research gets 40 turns | M01, M08 | done | 2026-07-12 | `maxTurnsOverride?` on `IChatService.sendMessage`; research=40, fillTargetField=16, generateQueryLetter=16 |
| 04 | Surface research failures/results in Query Manager UI | M08, M09, renderer | done | 2026-07-12 | Before/after ID delta; throw on error+zero-added; `lastResearchResult` banner in view; IPC handler unchanged (already propagates) |

## Dependency Graph

```
SESSION-01 ──► SESSION-02
     │
     └───────► SESSION-04 ◄─── SESSION-03
```

- SESSION-01 and SESSION-03 have no dependencies (parallel-safe; different files).
- SESSION-02 depends on SESSION-01 (extraction guard assumes error results no longer
  emit `done`).
- SESSION-04 depends on SESSION-01 (reliable error events) and SESSION-03
  (`maxTurnsOverride` param it passes).

## Architecture Reference (feature-specific)

- Full config: `FORGE-CONFIG.md` (project root).
- Stream event flow: `ClaudeCodeClient.processStreamEvent` (M06) → `StreamManager`
  hooks (M08) → `ChatService` onDone/onError → post-stream extraction →
  `IFileSystemService` (M05).
- Query flow: renderer `queryStore` → preload bridge → `ipcMain.handle('query:researchTargets')`
  (M09) → `QueryService` (M08) → `ChatService` (M08).
- Layer rule: `DOMAIN <- INFRASTRUCTURE <- APPLICATION <- IPC/MAIN <- RENDERER`.

## Scope Summary

| Module | Files touched |
|--------|---------------|
| M01 domain | `src/domain/interfaces.ts`, `src/domain/constants.ts` |
| M06 claude-cli | `src/infrastructure/claude-cli/ClaudeCodeClient.ts`, `StreamSessionTracker.ts` |
| M08 application | `src/application/ChatService.ts`, `src/application/QueryService.ts` |
| M09 main/ipc | `src/main/ipc/handlers.ts` (read/verify only) |
| renderer | `src/renderer/stores/queryStore.ts`, `src/renderer/components/QueryManager/QueryManagerView.tsx` |

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Per-call `maxTurnsOverride` instead of raising `AGENT_REGISTRY.Quill.maxTurns` | Quill also serves the `publish` phase and free chat; only research needs 40 turns. Registry stays conservative. |
| Error results emit `error`, never `done` | The CLI's `result` event carries `is_error`/`subtype`; the close handler (exit≠0) remains the promise-rejection authority. Prevents onDone extraction from firing on failed runs. |
| Per-phase content-marker regex for extraction (`PHASE_OUTPUT_CONTENT_MARKERS`) | `query-tracker.md` is a parsed, structured document; auto-saving prose corrupts it and the "already populated" guard then locks the corruption in. Generic mechanism, one phase registered now. |
| `addedTargets` = before/after ID delta | Previous code reported total tracker size; delta is what the user actually cares about and enables the partial-success path. |
| Throw only when stream errored AND nothing was added | Partial research (some targets landed before an error) is worth keeping and showing. |

## Known Data Cleanup (manual, outside sessions)

The reporter's book `open-channel` has a corrupted
`source/query-tracker.md` (contains agent narration). Delete it before re-testing:

```
rm "~/Library/Application Support/Novel Engine/books/open-channel/source/query-tracker.md"
```

## Handoff Notes

(Agents: append notes here after each session — status, deviations, follow-ups.)

### SESSION-01 (done, 2026-07-12)
- Implemented exactly per session prompt: error-result guard at the top of the
  `result` branch in `ClaudeCodeClient.processStreamEvent`; emits a single
  `error` StreamEvent (never `textDelta`/`done`) when `is_error === true` or
  `subtype !== 'success'`.
- `StreamSessionTracker` gained `hasErrorResult` flag with
  `markErrorResult()` / `getHasErrorResult()` (follows existing getter/marker
  naming).
- Close handler (`code !== 0`) still logs diagnostics and rejects the promise,
  but skips the second `error` event when the tracker flag is set.
- Naming deviation (trivial): inside the guard the local is `errorResultText`
  instead of `resultText` to avoid shadowing the success-path `resultText`
  declared just below.
- `npx tsc --noEmit` clean. `doneEmitted` stays false on error results, so the
  code-0 synthetic-done fallback is unaffected (it only runs when `code === 0`).

### SESSION-03 (done, 2026-07-12)
- `IChatService.sendMessage` gained optional `maxTurnsOverride?: number`
  (implemented exactly as planned — no adjustment to the design decision).
- `ChatService.sendMessage` applies `params.maxTurnsOverride ?? agent.maxTurns`
  at the provider call.
- Turn budgets: `researchTargets`=40, `fillTargetField`=16,
  `generateQueryLetter`=16. `AGENT_REGISTRY.Quill.maxTurns` untouched (still 8).
- `ChatService` is the sole `IChatService` implementer (grep-verified); optional
  param is non-breaking. `npx tsc --noEmit` clean.

### SESSION-02 (done, 2026-07-12)
- Added `PHASE_OUTPUT_CONTENT_MARKERS` in `src/domain/constants.ts` directly
  below `PHASE_OUTPUT_FILES`, with one entry: `query-agents`
  (`/^## \[.+?\]\s*—\s*.+$/m`).
- `extractResponseToFiles` gained optional `contentMarker?: RegExp`; buffer
  must match before any write. Both call sites (onDone extraction and onError
  fallback) pass `phaseContentMarker`. "Already populated" guard untouched.
- Marker candidates for future sessions (NOT added): `revision-plan-1/2`
  (`project-tasks.md`/`revision-prompts.md` are consumed as task lists) and
  `publish` (`metadata.md` has expected key/value structure). All other phase
  outputs are free-form prose reports — auto-saving narration there is
  acceptable.
- `npx tsc --noEmit` clean.

### SESSION-04 (done, 2026-07-12) — FEATURE COMPLETE
- `QueryService.researchTargets`: snapshots tracker IDs before the run, wraps
  `onEvent` to capture stream `error` events, throws
  `Target research failed: <stream error>` only when an error occurred AND
  zero targets were added; returns the real added delta (`newTargets`) and
  only the new names. Partial success returns normally (per Design Decisions).
- `queryStore`: new `lastResearchResult` state (reset on research start and in
  `clear()`); catch now surfaces the real rejection message, stripping
  Electron's `Error invoking remote method '...':` prefix.
- `QueryManagerView`: brass summary banner below the error banner —
  "Research complete — added N target(s): names". Cleared automatically when
  research restarts (store reset); no explicit dismiss button (session's
  snippet is the authority; it self-clears on the next run).
- IPC `query:researchTargets` handler verified — no catch-wrapping, rejection
  reaches the renderer as-is. No changes needed.
- `npx tsc --noEmit` clean. All 4 sessions done.
