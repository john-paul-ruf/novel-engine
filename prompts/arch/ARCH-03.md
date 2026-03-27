# ARCH-03 — Add IChatService and IUsageService Interfaces

> **Issue:** #4 (UsageService and ChatService bypass the interface layer)
> **Severity:** Medium
> **Effort:** Low
> **Depends on:** Nothing
> **Should run before:** ARCH-04 through ARCH-08 (so extracted services can implement sub-interfaces)

---

## Objective

Add `IChatService` and `IUsageService` interfaces to `src/domain/interfaces.ts` so that the IPC handlers and other consumers depend on abstractions, not concrete classes. This aligns ChatService and UsageService with every other service in the architecture.

---

## Context

Currently in `src/main/ipc/handlers.ts`:

```typescript
import type { ChatService } from '@app/ChatService';
import type { UsageService } from '@app/UsageService';
```

This is a layer violation — the IPC layer imports concrete application types instead of domain interfaces. ChatService also depends on the concrete `UsageService` class directly.

---

## Implementation Steps

### 1. Read the current public APIs

Read these files carefully before writing any interfaces:
- `src/application/UsageService.ts`
- `src/application/ChatService.ts`

Extract every `public` method (or non-private method) with its exact parameter and return types.

### 2. Define IUsageService in `src/domain/interfaces.ts`

Create an interface covering all public methods of UsageService. Example shape (verify against actual code):

```typescript
export interface IUsageService {
  recordUsage(params: {
    conversationId: string;
    inputTokens: number;
    outputTokens: number;
    thinkingTokens: number;
    model: string;
  }): void;
  getUsageSummary(bookSlug?: string): UsageSummary;
  getUsageByConversation(conversationId: string): UsageRecord[];
}
```

### 3. Define IChatService in `src/domain/interfaces.ts`

Create an interface covering all public methods. Include at minimum:

- `sendMessage(params: ...): Promise<void>`
- `createConversation(params: ...): Promise<Conversation>`
- `getConversations(bookSlug: string): Promise<Conversation[]>`
- `getMessages(conversationId: string): Promise<Message[]>`
- `abortStream(conversationId: string): void`
- `getActiveStream(): ActiveStreamInfo | null`
- `getActiveStreamForBook(bookSlug: string): ActiveStreamInfo | null`
- `getLastDiagnostics(): ContextDiagnostics | null`
- `getLastChangedFiles(): string[]`
- `isCliIdle(bookSlug?: string): boolean`
- `recoverOrphanedSessions(): Promise<StreamSessionRecord[]>`
- `getRecoveredOrphans(): StreamSessionRecord[]`
- `auditChapter(params: ...): Promise<AuditResult | null>`
- `fixChapter(params: ...): Promise<void>`
- `runMotifAudit(params: ...): Promise<void>`

**Read the actual file** — do not guess at parameter types. Match every signature exactly.

### 4. Update ChatService to implement IChatService

```typescript
export class ChatService implements IChatService {
```

### 5. Update UsageService to implement IUsageService

```typescript
export class UsageService implements IUsageService {
```

### 6. Update ChatService's constructor to use IUsageService

```typescript
// Before:
import type { UsageService } from './UsageService';
constructor(..., private usage: UsageService, ...)

// After:
import type { IUsageService } from '@domain/interfaces';
constructor(..., private usage: IUsageService, ...)
```

### 7. Update handlers.ts to use interfaces

```typescript
// Before:
import type { ChatService } from '@app/ChatService';
import type { UsageService } from '@app/UsageService';

// After:
import type { IChatService, IUsageService } from '@domain/interfaces';
```

Update the `registerIpcHandlers` function signature:
```typescript
export function registerIpcHandlers(services: {
  // ...existing interfaces...
  chat: IChatService;    // was ChatService
  usage: IUsageService;  // was UsageService
  // ...
})
```

### 8. Add necessary type imports

Ensure all types referenced by the new interfaces are imported at the top of `interfaces.ts`. You may need to add: `SendMessageParams`, `ActiveStreamInfo`, `ContextDiagnostics`, `AuditResult`.

### 9. Verify composition root

`src/main/index.ts` still instantiates concrete classes and passes them to `registerIpcHandlers`. This is correct — the composition root is the one place concrete types are used. Just verify it still compiles.

---

## Verification

1. `npx tsc --noEmit` passes
2. `grep -r "import type { ChatService }" src/main/` returns zero hits
3. `grep -r "import type { UsageService }" src/main/ src/application/` returns zero hits (except the composition root importing for instantiation)
4. Both interfaces exist in `src/domain/interfaces.ts`
5. Both classes have `implements` clauses

---

## State Update

After completing this prompt, update `prompts/arch/STATE.md`:
- Set ARCH-03 status to `done`
- Set Completed date
- Note the exact public API surface captured in each interface
