# FIX-03 — Emit callStart for Verity audit/fix/motif-audit calls

> **Issue(s):** 2.1
> **Severity:** 🟡 Medium
> **Category:** CLI Activity Monitor
> **Effort:** Medium
> **Depends on:** Nothing

---

## Objective

Verity audit, fix, and motif-audit calls go through `AuditService` which calls `ClaudeCodeClient.sendMessage()` directly — not through `StreamManager`. The `callStart` event that creates a `CliCall` entry in the activity monitor is emitted by `StreamManager.startStream()`. Since `AuditService` bypasses `StreamManager`, no `callStart` is emitted. The `cliActivityStore` falls back to attributing events to the most recently active call with incorrect metadata ("Wrangler" as agent, "Unknown" as model).

This fix emits synthetic `callStart` events for all Verity pipeline calls so they appear correctly in the CLI Activity Monitor.

---

## Findings Addressed

| # | Issues.md Ref | Title | Severity |
|---|---------------|-------|----------|
| 1 | 2.1 | Verity audit/fix and motif audit calls may lack callStart events | 🟡 Medium |

---

## Files to Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/main/ipc/handlers.ts` | Modify | Emit `callStart` event before each audit/fix/motif-audit call |

---

## Implementation Steps

### 1. Understand the callStart event shape

Read `src/domain/types.ts` for the `StreamEvent` type. The `callStart` variant needs at minimum: `type`, `callId`, plus whatever fields the `cliActivityStore` reads to populate `CallMeta`. Read `src/renderer/stores/cliActivityStore.ts` and check the `callStart` handler to see what fields it reads.

Read `src/application/StreamManager.ts` to see how `callStart` is normally emitted (the `startStream` method) and what fields it includes.

### 2. Create an emitVerityCallStart helper near broadcastVerityEvent

Read `src/main/ipc/handlers.ts`. Near the `broadcastVerityEvent` helper (line 553), add a helper that emits a `callStart` to all windows:

```typescript
/** Emit a synthetic callStart so audit/fix calls appear in the CLI Activity Monitor. */
const emitVerityCallStart = (callId: string, conversationId: string, agentName: string = 'Verity') => {
  const callStartEvent = { type: 'callStart' as const, callId, conversationId, agentName };
  for (const w of BrowserWindow.getAllWindows()) {
    try { w.webContents.send('chat:streamEvent', callStartEvent); } catch {}
  }
};
```

### 3. Call emitVerityCallStart before each service invocation

Insert `emitVerityCallStart` before the `services.audit.*` call in each of the four handlers:

- **verity:auditChapter** (line 566): `emitVerityCallStart(callId, broadcastConversationId);`
- **verity:fixChapter** (line 577): `emitVerityCallStart(callId, conversationId);`
- **verity:fixChapterWithAudit** (line 590): `emitVerityCallStart(callId, conversationId);`
- **verity:runMotifAudit** (line 604): `emitVerityCallStart(callId, \`motif-audit-${sessionId}\`);`

### 4. Verify the callStart shape matches cliActivityStore expectations

Read `src/renderer/stores/cliActivityStore.ts` and check the `callStart` handler. Make sure the fields you emit (`type`, `callId`, `conversationId`, `agentName`) are the ones it reads. If it also reads `model`, add `model: 'unknown'` or retrieve the model from settings.

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Grep for `emitVerityCallStart` in `handlers.ts` — should appear in 4 handler blocks
3. Grep for `callStart` in `handlers.ts` — should appear in the Verity section
4. Manual test: run a Verity audit, check the CLI Activity Monitor — the call should show agent "Verity" (not "Wrangler" or "Unknown")

---

## State Update

After completing this prompt, update `prompts/arch/r002/STATE.md`:
- Set FIX-03 status to `done`
- Set Completed date
- Add notes about any complications or design decisions
