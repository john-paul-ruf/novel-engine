# SESSION-02 — Guard Post-Stream Extraction Against Non-Document Content

> **Program:** Novel Engine
> **Feature:** query-research-failure-handling
> **Modules:** M08 (application), M01 (domain)
> **Depends on:** SESSION-01
> **Estimated effort:** 25 minutes

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M08 | application | `src/application/ChatService.ts` (`extractResponseToFiles`, ~line 655; onDone/onError hooks, ~lines 373–428) | Owns the fix |
| M08 | application | `src/application/StreamManager.ts` (onDone/onError hook wiring, ~lines 155–200) | Understand when hooks fire |
| M01 | domain | `src/domain/constants.ts` (`PHASE_OUTPUT_FILES`, ~line 108) | Add validator map alongside |

## Context

Post-stream extraction auto-saves the response buffer to a phase's output file when the
agent didn't write any files. For `query-agents`, the output file
`source/query-tracker.md` is a **structured document** parsed by
`QueryService.parseTrackerContent` (sections shaped `## [Name] — status`). Auto-saving
conversational narration into it corrupts the tracker AND permanently blocks the
"already populated" guard (`ChatService.ts:677`) from ever recovering.

SESSION-01 stops the *error-result* path from reaching `onDone`, but two holes remain:

1. The **onError fallback** (`ChatService.ts:419`) still writes whatever partial buffer
   exists — for structured phases that's always wrong.
2. Even a *successful* run that replies conversationally without using tools would
   auto-save prose into the tracker.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/domain/constants.ts` | Modify | Add `PHASE_OUTPUT_CONTENT_MARKERS` map next to `PHASE_OUTPUT_FILES` |
| `src/application/ChatService.ts` | Modify | Validate buffer against phase marker before writing in `extractResponseToFiles` |

## Implementation

### 1. Add a per-phase content marker in `src/domain/constants.ts`

Directly below `PHASE_OUTPUT_FILES` (~line 108):

```typescript
/**
 * Optional per-phase content validation for post-stream extraction.
 * If a phase has a marker regex, the response buffer must match it before
 * the auto-save fallback is allowed to write the phase's output file.
 * Prevents conversational narration from being saved into structured
 * documents (e.g. the query tracker, which is parsed section-by-section).
 */
export const PHASE_OUTPUT_CONTENT_MARKERS: Partial<Record<PipelinePhaseId, RegExp>> = {
  // Tracker sections look like: ## [Agent Name] — drafting
  'query-agents': /^## \[.+?\]\s*—\s*.+$/m,
};
```

### 2. Thread the marker through `ChatService`

In `src/application/ChatService.ts`:

- Import `PHASE_OUTPUT_CONTENT_MARKERS` alongside the existing `PHASE_OUTPUT_FILES`
  import.
- In `sendMessage`, where `phaseOutputFiles` is computed (~line 350), also compute
  `const phaseContentMarker = pipelinePhase ? PHASE_OUTPUT_CONTENT_MARKERS[pipelinePhase] : undefined;`
- Change `extractResponseToFiles` signature to accept an optional
  `contentMarker?: RegExp` parameter, and pass `phaseContentMarker` from BOTH call
  sites (onDone ~line 410, onError ~line 425).
- At the top of `extractResponseToFiles`, after the empty-buffer guard (~line 661):

```typescript
// Structured phases (e.g. query-agents) require the buffer to actually
// look like the target document. Narration such as "I'll verify a few
// more agents, then compile" must never be saved into a parsed file.
if (contentMarker && !contentMarker.test(responseBuffer)) {
  console.warn(
    '[ChatService] Post-stream extraction skipped — response does not match ' +
    `the expected format for ${outputFiles.join(', ')}`,
  );
  onEvent({
    type: 'status',
    message: 'Agent response did not contain the expected document format — nothing was auto-saved.',
  });
  return;
}
```

### 3. Do NOT change the "already populated" guard

The existing has-content check (~line 670) stays — it correctly protects follow-up
turns. With steps 1–2 in place, junk can no longer get INTO the file, so the guard no
longer locks in corruption.

## Verification

```bash
npx tsc --noEmit
```

- Grep check: both `extractResponseToFiles(` call sites pass the marker.
- Architecture compliance: M08 imports the marker map from M01 (domain) — allowed
  direction. No infrastructure imports added.
- Trace check: confirm `onError` fallback path also receives the marker.

## State Update

Update `prompts/session-program/program-023/STATE.md`: set SESSION-02 status to `done`,
completion date, and note in Handoff Notes whether any other phases in
`PHASE_OUTPUT_FILES` deserve markers (do not add them in this session).
