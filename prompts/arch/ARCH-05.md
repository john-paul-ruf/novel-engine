# ARCH-05 — Extract AuditService from ChatService

> **Issue:** #1 (ChatService is a god object — 1,218 lines)
> **Severity:** High
> **Effort:** Medium
> **Depends on:** ARCH-03 (interfaces), ARCH-04 (StreamManager)

---

## Objective

Extract `auditChapter()`, `fixChapter()`, and `runMotifAudit()` from ChatService into a new `AuditService`. These three methods form a cohesive audit-and-fix subsystem.

---

## What Moves

| Method | Lines | Purpose |
|--------|-------|---------|
| `auditChapter()` | ~130 | Runs Verity audit agent on a single chapter |
| `fixChapter()` | ~80 | Runs Verity fix pass based on audit findings |
| `runMotifAudit()` | ~70 | Runs Lumen's phrase/motif audit across manuscript |

Total: ~280 lines out of ChatService.

---

## Implementation Steps

### 1. Define IAuditService in `src/domain/interfaces.ts`

Add an interface covering all three methods. Read the actual parameter/return types from `ChatService.ts` lines 627–940.

### 2. Create `src/application/AuditService.ts`

Dependencies: `ISettingsService`, `IAgentService`, `IClaudeClient`, `IDatabaseService`, `IFileSystemService`, `IUsageService`.

Move the full implementation of all three methods. Import constants they need (`VERITY_AUDIT_AGENT_FILE`, `VERITY_AUDIT_MODEL`, `VERITY_AUDIT_MAX_TOKENS`, `AGENT_REGISTRY`). If ARCH-01 has run, load prompt templates via `agents.loadRaw()` instead.

Use `resolveThinkingBudget` from `src/application/thinkingBudget.ts` (created in ARCH-04).

### 3. Update ChatService

- Remove all three methods
- Add `private audit: IAuditService` to constructor
- In `handleAdhocRevision()`, replace `this.runMotifAudit()` with `this.audit.runMotifAudit()`

### 4. Update IChatService interface (from ARCH-03)

Remove `auditChapter`, `fixChapter`, `runMotifAudit` — they now live on `IAuditService`.

### 5. Update handlers.ts

Add `audit: IAuditService` to the services parameter. Route audit-related IPC channels to the audit service.

### 6. Update main/index.ts

Instantiate AuditService and inject into ChatService.

---

## Verification

1. `npx tsc --noEmit` passes
2. `src/application/AuditService.ts` exists
3. `IAuditService` exists in `interfaces.ts`
4. `grep -c 'auditChapter\|fixChapter\|runMotifAudit' src/application/ChatService.ts` returns only delegation calls, not method definitions

---

## State Update

After completing this prompt, update `prompts/arch/STATE.md`:
- Set ARCH-05 status to `done`
- Set Completed date
- Note ChatService line count after extraction
