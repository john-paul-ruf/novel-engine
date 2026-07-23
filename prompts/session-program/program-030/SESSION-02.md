# SESSION-02 — Claude CLI: flag `error_max_turns` with `isMaxTurns`

> **Program:** Novel Engine
> **Feature:** auto-resume-max-turns
> **Modules:** M06 (claude-cli)
> **Depends on:** SESSION-01
> **Estimated effort:** 15 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M06 | claude-cli | `src/infrastructure/claude-cli/ClaudeCodeClient.ts` | `processStreamEvent` handles `result` events — where `error_max_turns` is detected |
| M06 | claude-cli | `src/infrastructure/claude-cli/ClaudeCodeClient.test.ts` | Existing test for `error_max_turns` at line ~295 needs updating |
| M01 | domain | `src/domain/types.ts` | Confirm `isMaxTurns` on `error` StreamEvent (added in SESSION-01) |

## Context

`ClaudeCodeClient.processStreamEvent` (line ~465) handles the CLI's `result`
event. When the subtype is `error_max_turns`, it emits an `error` StreamEvent:

```typescript
const isErrorResult =
  event.is_error === true || (subtype !== undefined && subtype !== 'success');
if (isErrorResult) {
  tracker.markErrorResult();
  const errorResultText = typeof event.result === 'string' ? event.result.trim() : '';
  const message = errorResultText
    ? `Claude CLI run failed (${subtype ?? 'error'}): ${errorResultText}`
    : `Claude CLI run failed (${subtype ?? 'error'})`;
  onEvent({ type: 'error', message });
  return;
}
```

We need to set `isMaxTurns: true` when the subtype is specifically `error_max_turns`
so the `AutoTurnResumer` (SESSION-04) can distinguish this from genuine errors
(CLI crashes, network failures, etc.) and auto-resume.

The process close handler (line ~383) also emits a generic `error` when the CLI
exits non-zero — but that path is suppressed when `tracker.getHasErrorResult()`
returns true (line ~405). So the only `error` event for max-turns comes from
the `result` event handler above.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/infrastructure/claude-cli/ClaudeCodeClient.ts` | Modify | Set `isMaxTurns: true` on the error event when `subtype === 'error_max_turns'` |
| `src/infrastructure/claude-cli/ClaudeCodeClient.test.ts` | Modify | Update existing `error_max_turns` test to assert `isMaxTurns: true` |

## Implementation

### 1. Read `src/infrastructure/claude-cli/ClaudeCodeClient.ts` lines 465–486

Locate the `processStreamEvent` method, specifically the `if (eventType === 'result')`
block and the `isErrorResult` branch.

### 2. Add `isMaxTurns` to the error event

Change the error emission (currently line ~484):

```typescript
onEvent({ type: 'error', message });
```

to:

```typescript
onEvent({ type: 'error', message, isMaxTurns: subtype === 'error_max_turns' });
```

This sets `isMaxTurns: true` only for the max-turns subtype. Other error
subtypes (`error_during_execution`, etc.) get `isMaxTurns: false` (the default
when the subtype doesn't match).

### 3. Update the existing test

Read `src/infrastructure/claude-cli/ClaudeCodeClient.test.ts`. Find the test
at line ~295:

```typescript
it('an error result (e.g. error_max_turns) emits one rich error and suppresses the generic close error', async () => {
```

This test uses `resultEvent({ subtype: 'error_max_turns', isError: true, result: 'Ran out of turns' })`.
After the change, the emitted error event should have `isMaxTurns: true`.

Read the assertions in this test (find where it checks the error event). Add
an assertion that the error event has `isMaxTurns: true`:

```typescript
expect(errorEvent).toMatchObject({ type: 'error', isMaxTurns: true });
```

If the test captures events in an array (e.g. `events`), adapt the assertion to
match the existing pattern. The key check is that the error event for
`error_max_turns` carries `isMaxTurns: true`.

Also add a quick check that a non-max-turns error (e.g. `error_during_execution`)
does NOT set `isMaxTurns`. If there's no existing test for that subtype, add one:

```typescript
it('a non-max-turns error result does not set isMaxTurns', async () => {
  const promise = send();
  const child = await fake.waitForChild();

  child.pushStdout(
    ndjson([resultEvent({ subtype: 'error_during_execution', isError: true, result: 'Something broke' })]),
  );
  child.pushStdout(null as any); // end stdout

  const events = await promise; // or however events are collected
  const errorEvent = events.find(e => e.type === 'error');
  expect(errorEvent).toBeDefined();
  expect(errorEvent).toMatchObject({ type: 'error', isMaxTurns: false });
});
```

Adapt the above to match the test file's existing helper patterns (`send()`,
`fake.waitForChild()`, `ndjson()`, `resultEvent()`).

## Verification

1. `npx tsc --noEmit` — clean.
2. Run the Claude CLI tests:
   ```bash
   npx vitest run src/infrastructure/claude-cli/ClaudeCodeClient.test.ts
   ```
3. Confirm the `error_max_turns` test asserts `isMaxTurns: true` on the error event.
4. Confirm a `error_during_execution` test asserts `isMaxTurns` is falsy.

## State Update

Update `prompts/session-program/program-030/STATE.md`:
- SESSION-02 status → `done`, completion date
- Handoff note: confirm `isMaxTurns: true` is set for `error_max_turns` subtype
  and NOT set for other error subtypes. Tests pass.