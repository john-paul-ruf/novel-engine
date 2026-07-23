# SESSION-05 — Renderer: handle `maxTurnsResume` event + full suite

> **Program:** Novel Engine
> **Feature:** auto-resume-max-turns
> **Modules:** M10 (renderer), M16 (test)
> **Depends on:** SESSION-04
> **Estimated effort:** 20 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M10 | renderer | `src/renderer/stores/streamHandler.ts` | Shared event handler — add `maxTurnsResume` case |
| M10 | renderer | `src/renderer/stores/streamHandler.test.ts` | Test the new event dispatch |
| M10 | renderer | `src/renderer/stores/chatStore.ts` (or cliActivityStore) | Where `onStatus`/`onWarning` are wired — the resume notification should surface as a status/warning |

## Context

The `streamHandler.ts` switch dispatches StreamEvents to store-specific
callbacks. A new `maxTurnsResume` variant was added to `StreamEvent` in
SESSION-01. The switch has no default case, so unknown events silently
fall through — no TS error. But the user should SEE that a resume is
happening.

The `maxTurnsResume` event carries `attempt` and `newMaxTurns`. We add it
to the `StreamHandlerConfig` as an optional callback and wire it to display
a status message in the UI.

The `AutoTurnResumer` (SESSION-04) also emits a `warning` event alongside
`maxTurnsResume`, so the existing `onWarning` handler already shows the
resume notification in the UI. The `maxTurnsResume` handler is additive —
stores that want to track resume count or show a different UI affordance
can use it; stores that don't will just show the `warning` message.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/renderer/stores/streamHandler.ts` | Modify | Add `onMaxTurnsResume?` to config + switch case |
| `src/renderer/stores/streamHandler.test.ts` | Modify | Add test for `maxTurnsResume` dispatch |

## Implementation

### 1. Read `src/renderer/stores/streamHandler.ts`

The `StreamHandlerConfig` interface (line ~16) defines optional callbacks.
The switch (line ~97) dispatches events. Add the new handler.

### 2. Add `onMaxTurnsResume` to `StreamHandlerConfig`

In the `StreamHandlerConfig` interface, after `onMultiCallProgress?` (line ~47),
add:

```typescript
  onMaxTurnsResume?: (attempt: number, newMaxTurns: number) => void;
```

### 3. Add the switch case

In the switch statement, after the `multiCallProgress` case (line ~142),
add:

```typescript
      case 'maxTurnsResume':
        config.onMaxTurnsResume?.(event.attempt, event.newMaxTurns);
        break;
```

### 4. Wire in stores (optional — minimal)

The `warning` event emitted by `AutoTurnResumer` already triggers `onWarning`
in stores that have it. The `onMaxTurnsResume` callback is optional — stores
that want richer UI (e.g., showing "Resume attempt 2/∞" in the activity panel)
can wire it later. For now, the `warning` message is sufficient.

If `chatStore` or `cliActivityStore` have an `onWarning` handler, the resume
notification will appear automatically via the `warning` event. No additional
wiring is needed for the basic feature.

### 5. Update `streamHandler.test.ts`

Read `src/renderer/stores/streamHandler.test.ts`. Add a test:

```typescript
it('dispatches maxTurnsResume to onMaxTurnsResume', () => {
  const onMaxTurnsResume = vi.fn();
  const handler = createStreamHandler({
    ...defaultConfig,
    onMaxTurnsResume,
  });

  handler({ type: 'maxTurnsResume', attempt: 2, newMaxTurns: 50 } as StreamEvent);

  expect(onMaxTurnsResume).toHaveBeenCalledWith(2, 50);
});
```

Adapt `defaultConfig` to match the existing test setup pattern in the file.
The key assertion: the `maxTurnsResume` event calls `onMaxTurnsResume` with
`attempt` and `newMaxTurns`.

## Verification

1. `npx tsc --noEmit` — clean.

2. Run the streamHandler tests:
   ```bash
   npx vitest run src/renderer/stores/streamHandler.test.ts
   ```

3. Run the full test suite:
   ```bash
   npm test
   ```
   This is the critical gate — all tests must pass. The AutoTurnResumer wrapper
   is transparent to all services; if any service test breaks, it indicates a
   wiring issue in the composition root.

4. Architecture compliance:
   - `streamHandler.ts` change is renderer-only
   - No new imports needed — `maxTurnsResume` is already in the `StreamEvent` union
   - The handler is optional (`?`) — no store is forced to implement it

## State Update

Update `prompts/session-program/program-030/STATE.md`:
- SESSION-05 status → `done`, completion date
- Handoff note: confirm `maxTurnsResume` handler added to streamHandler,
  test passes, full suite green. Feature is complete.
- Update all session statuses and write final summary.