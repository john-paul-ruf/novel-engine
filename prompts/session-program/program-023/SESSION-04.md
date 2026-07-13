# SESSION-04 — Surface Research Failures and Results in the Query Manager UI

> **Program:** Novel Engine
> **Feature:** query-research-failure-handling
> **Modules:** M08 (application), M09 (main/ipc), renderer
> **Depends on:** SESSION-01, SESSION-03
> **Estimated effort:** 30 minutes

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M08 | application | `src/application/QueryService.ts` (`researchTargets` ~line 192) | Detect failure, report delta |
| M09 | main/ipc | `src/main/ipc/handlers.ts` (~line 1200 `query:researchTargets`) | Rejection propagates to renderer |
| — | renderer | `src/renderer/stores/queryStore.ts` (`researchTargets` ~line 86) | Error + result state |
| — | renderer | `src/renderer/components/QueryManager/QueryManagerView.tsx`, `ResearchPanel.tsx` | Display |

## Context

Today a failed research run is invisible: `ChatService.sendMessage` catches provider
rejections and returns `{ changedFiles: [] }` (emitting only a stream `error` event);
`QueryService.researchTargets` then reloads the tracker and returns
`addedTargets: <total count>` — with two bugs:

1. **No failure signal** — the IPC promise resolves "successfully" with 0 targets, so
   `queryStore` never sets `error`, and the user is left on an unchanged screen.
2. **Wrong delta** — `addedTargets` reports the tracker's TOTAL size, not the number
   of targets the run actually added.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/application/QueryService.ts` | Modify | Capture stream `error` events; throw on failure; compute added delta |
| `src/renderer/stores/queryStore.ts` | Modify | Store `lastResearchResult`; keep error message from rejection |
| `src/renderer/components/QueryManager/QueryManagerView.tsx` | Modify | Show post-research summary banner |

## Implementation

### 1. Detect failure and compute the real delta in `QueryService.researchTargets`

Read the current method (~line 192). Restructure:

```typescript
async researchTargets(
  bookSlug: string,
  onEvent: (event: StreamEvent) => void,
): Promise<QueryResearchResult> {
  const before = await this.loadTracker(bookSlug);
  const beforeIds = new Set(before.targets.map((t) => t.id));

  const conversation = await this.chat.createConversation({
    bookSlug,
    agentName: 'Quill',
    pipelinePhase: 'query-agents',
    purpose: 'pipeline',
  });

  // ChatService swallows provider rejections and reports them only as
  // stream events — capture them here so a dead run becomes a real error.
  let streamError: string | null = null;
  const wrappedOnEvent = (event: StreamEvent) => {
    if (event.type === 'error') streamError = event.message;
    onEvent(event);
  };

  await this.chat.sendMessage({
    agentName: 'Quill',
    message: this.buildResearchPrompt(),
    conversationId: conversation.id,
    bookSlug,
    maxTurnsOverride: 40,          // from SESSION-03
    onEvent: wrappedOnEvent,
  });

  const updatedTracker = await this.loadTracker(bookSlug);
  const newTargets = updatedTracker.targets.filter((t) => !beforeIds.has(t.id));

  // A stream error with nothing added is a hard failure — surface it.
  if (streamError && newTargets.length === 0) {
    throw new Error(`Target research failed: ${streamError}`);
  }

  return {
    addedTargets: newTargets.length,
    targetNames: newTargets.map((t) => t.name),
    conversationId: conversation.id,
  };
}
```

Note: agent-written entries may lack an `- **ID:**` line; `parseTrackerContent`
generates a fresh nanoid for those, so they correctly count as new. If a stream error
occurred but SOME targets were added, return the partial result (no throw) — the UI
summary will show what landed.

### 2. Track the result in `src/renderer/stores/queryStore.ts`

- Add state: `lastResearchResult: QueryResearchResult | null` (init `null`; reset in
  `clear()` and at the start of `researchTargets`).
- In `researchTargets` success path: `set({ isResearching: false, researchBuffer: '', lastResearchResult: result });`
- In the catch: extract the real message instead of the generic string:

```typescript
const message = err instanceof Error ? err.message : 'Target research failed';
set({ isResearching: false, researchBuffer: '', error: message });
```

(IPC rejections arrive as `Error: <message>` — strip the `Error invoking remote
method 'query:researchTargets':` prefix if present with a small regex.)

### 3. Show the outcome in `QueryManagerView.tsx`

Below the existing error banner (~line 111), add a dismissible success banner:

```tsx
{lastResearchResult && !isResearching && (
  <div className="mb-4 rounded-lg border border-ne-brass/30 bg-ne-brass/10 p-3 text-sm text-ne-ink">
    Research complete — added {lastResearchResult.addedTargets} target
    {lastResearchResult.addedTargets !== 1 ? 's' : ''}
    {lastResearchResult.targetNames.length > 0 && (
      <>: {lastResearchResult.targetNames.join(', ')}</>
    )}
  </div>
)}
```

Select `lastResearchResult` from the store. Clear it when the user clicks
**Research Targets** again (already handled by the store reset in step 2). Follow the
existing banner styling conventions in the file.

### 4. Sanity-check the IPC layer

Read `src/main/ipc/handlers.ts` ~line 1200: `ipcMain.handle` already propagates a
thrown error to the renderer as a rejected promise — no change needed unless the
handler wraps errors; if it catches-and-returns, let the rejection through instead.

## Verification

```bash
npx tsc --noEmit
```

- Manual: with the corrupt/empty tracker, click **Research Targets** —
  - on failure: red error banner shows the CLI's actual error message;
  - on success: brass banner lists the newly added target names and the list refreshes.
- Architecture compliance: renderer touches backend only via the preload bridge; no new
  IPC channels.

## State Update

Update `prompts/session-program/program-023/STATE.md`: set SESSION-04 status to `done`,
completion date, Handoff Notes on any UI copy decisions. If all sessions are done,
mark the feature complete.
