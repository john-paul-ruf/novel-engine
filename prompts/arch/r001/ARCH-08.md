# ARCH-08 — Extract AdhocRevisionService from ChatService

> **Issue:** #1 (ChatService is a god object — 1,218 lines)
> **Severity:** High
> **Effort:** Medium
> **Depends on:** ARCH-03 (interfaces), ARCH-04 (StreamManager), ARCH-05 (AuditService for motif audit)

---

## Objective

Extract `handleAdhocRevision()` from ChatService into a new `AdhocRevisionService`. The ad hoc revision flow has unique concerns: pre-step motif audit, Forge agent with full manuscript context, generates project-tasks.md and revision-prompts.md.

---

## What Moves

| Method | Lines | Purpose |
|--------|-------|---------|
| `handleAdhocRevision()` | ~120 | Forge generates revision plan from author's direct feedback |

---

## Implementation Steps

### 1. Define IAdhocRevisionService in `src/domain/interfaces.ts`

Single method: `handleMessage(params)`. Note this one also takes `message: string` (the author's revision instructions). Read actual parameter shape from ChatService lines 948–958.

### 2. Create `src/application/AdhocRevisionService.ts`

Dependencies: `IClaudeClient`, `IDatabaseService`, `IFileSystemService`, `IUsageService`, `IAuditService`, `StreamManager`.

Key specifics:
- Runs `audit.runMotifAudit()` as non-fatal pre-step
- Appends `ADHOC_REVISION_INSTRUCTIONS` to system prompt (or loads from file if ARCH-01 has run)
- Includes full project manifest (file listing, chapter count, word count) in system prompt
- Uses `AGENT_REGISTRY.Forge.maxTurns`

### 3. Update ChatService

- Remove `handleAdhocRevision()`
- Add `private adhocRevision: IAdhocRevisionService` to constructor
- Delegate in `sendMessage()`:
  ```typescript
  if (conversation?.purpose === 'adhoc-revision') {
    await this.adhocRevision.handleMessage({ ... });
    return;
  }
  ```

### 4. Update main/index.ts

Wire AdhocRevisionService with all its dependencies and inject into ChatService.

---

## Verification

1. `npx tsc --noEmit` passes
2. `src/application/AdhocRevisionService.ts` exists
3. `IAdhocRevisionService` exists in `interfaces.ts`
4. `grep 'handleAdhocRevision' src/application/ChatService.ts` returns zero hits

---

## State Update

After completing this prompt, update `prompts/arch/STATE.md`:
- Set ARCH-08 status to `done`
- Set Completed date
