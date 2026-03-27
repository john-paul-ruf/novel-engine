# ARCH-09 — Slim ChatService to Router

> **Issue:** #1 (ChatService is a god object — 1,218 lines)
> **Severity:** High (the capstone of the decomposition)
> **Effort:** Low (most work done in ARCH-04 through ARCH-08)
> **Depends on:** ARCH-04, ARCH-05, ARCH-06, ARCH-07, ARCH-08 (all must be done)

---

## Objective

After extracting StreamManager, AuditService, PitchRoomService, HotTakeService, and AdhocRevisionService, verify that ChatService is now a clean router. Target: **under 400 lines**.

---

## What ChatService Should Contain

1. **Constructor** — accepts all injected dependencies (interfaces only)
2. **`sendMessage()`** — the router: check CLI, load settings/agent, save user message, branch by purpose to sub-services, handle default pipeline case inline
3. **`createConversation()`** — thin DB delegation
4. **`getConversations()`** — thin DB delegation
5. **`getMessages()`** — thin DB delegation
6. **`abortStream()`** — `claude.abortStream()` + `streamManager.abortStream()`
7. **`getActiveStream()`** — delegates to StreamManager
8. **`getActiveStreamForBook()`** — delegates to StreamManager
9. **`getLastDiagnostics()`** — returns cached diagnostics
10. **`getLastChangedFiles()`** — delegates to StreamManager
11. **`isCliIdle()`** — delegates to ClaudeClient
12. **`recoverOrphanedSessions()`** — startup concern
13. **`getRecoveredOrphans()`** — returns cached orphans

---

## Implementation Steps

### 1. Verify prerequisites

Read `prompts/arch/STATE.md`. If any of ARCH-04 through ARCH-08 are not `done`, stop and report.

### 2. Audit ChatService

Read the current file. Verify all extractions are complete.

### 3. Clean dead code

Remove unused imports, dead private methods, fields no longer needed.

### 4. Verify the router pattern

`sendMessage()` should be a clean branching structure with delegations.

### 5. Verify constructor uses interfaces only

No concrete class types except `StreamManager` (which is a utility, not a domain service).

### 6. Line count check

Target under 400 lines. The default pipeline flow (context assembly + CLI call) is the core responsibility and stays inline.

---

## Verification

1. `npx tsc --noEmit` passes
2. `wc -l src/application/ChatService.ts` under 400 lines
3. No `private handle*` methods remain
4. No `private activeStreams` field
5. Constructor accepts interfaces only

---

## State Update

After completing this prompt, update `prompts/arch/STATE.md`:
- Set ARCH-09 status to `done`
- Record final ChatService line count
- Note: "ChatService decomposition complete"
