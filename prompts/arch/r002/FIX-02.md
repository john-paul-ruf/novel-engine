# FIX-02 — Inject conversationId in revision event forwarding

> **Issue(s):** 1.2
> **Severity:** 🟡 Medium
> **Category:** Chat Bleed
> **Effort:** Low
> **Depends on:** Nothing

---

## Objective

When revision queue stream events are forwarded from `session:streamEvent` to `chat:streamEvent` in `handlers.ts` (line 693), the handler spreads `event.event` (a raw `StreamEvent`) and adds `callId: \`rev:${event.sessionId}\``. However, it does NOT inject `conversationId`. The `cliActivityStore` creates `CliCall` entries with an empty `conversationId` for revision sessions (`event.conversationId ?? ''`), which means abort via the activity monitor fails since `chat:abort` requires a valid `conversationId`.

This fix adds `conversationId` to the forwarded revision stream events.

---

## Findings Addressed

| # | Issues.md Ref | Title | Severity |
|---|---------------|-------|----------|
| 1 | 1.2 | Revision event forwarding strips conversationId | 🟡 Medium |

---

## Files to Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/domain/types.ts` | Modify | Add `conversationId` to the `session:streamEvent` variant of `RevisionQueueEvent` |
| `src/application/RevisionQueueService.ts` | Modify | Include `conversationId` when emitting `session:streamEvent` |
| `src/main/ipc/handlers.ts` | Modify | Forward `conversationId` in the revision event bridge |

---

## Implementation Steps

### 1. Check the RevisionQueueEvent type

Read `src/domain/types.ts`. The `session:streamEvent` variant (line 322) is:
```typescript
| { type: 'session:streamEvent'; sessionId: string; event: StreamEvent }
```

Add an optional `conversationId` field:
```typescript
| { type: 'session:streamEvent'; sessionId: string; event: StreamEvent; conversationId?: string }
```

### 2. Include conversationId when emitting session:streamEvent

Read `src/application/RevisionQueueService.ts`. Find where `session:streamEvent` is emitted. The `conversationId` used for each revision session should be available — it's created when the session starts (the service creates a conversation for each revision session). Pass it through:

```typescript
this.emit({ type: 'session:streamEvent', sessionId, event: streamEvent, conversationId });
```

### 3. Forward conversationId in handlers.ts

Read `src/main/ipc/handlers.ts` line 691-694. Update the forwarded event:

**Before:**
```typescript
if (event.type === 'session:streamEvent') {
  win.webContents.send('chat:streamEvent', { ...event.event, callId: `rev:${event.sessionId}` });
}
```

**After:**
```typescript
if (event.type === 'session:streamEvent') {
  win.webContents.send('chat:streamEvent', {
    ...event.event,
    callId: `rev:${event.sessionId}`,
    conversationId: event.conversationId ?? event.sessionId,
  });
}
```

The fallback to `event.sessionId` ensures old events without `conversationId` still produce a non-empty identifier for the activity monitor.

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Grep for `session:streamEvent` in `handlers.ts` — the forwarded event must include `conversationId`
3. Grep for `session:streamEvent` in `RevisionQueueService.ts` — all emissions must include `conversationId`

---

## State Update

After completing this prompt, update `prompts/arch/r002/STATE.md`:
- Set FIX-02 status to `done`
- Set Completed date
- Add notes about any complications or design decisions
