# SESSION-02 — ClaudeCodeClient Implements IModelProvider

> **Feature:** multi-model-providers
> **Layer(s):** Infrastructure
> **Depends on:** SESSION-01
> **Estimated effort:** 15 min

---

## Context

SESSION-01 added the `IModelProvider` interface to the domain layer. The existing `ClaudeCodeClient` already has method signatures that match `IModelProvider` exactly — it just doesn't declare the interface conformance or expose `providerId` / `capabilities`.

This session makes `ClaudeCodeClient` implement `IModelProvider` in addition to its existing `IClaudeClient` implementation. This is a non-breaking, additive change — all existing code that depends on `IClaudeClient` continues to work.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/infrastructure/claude-cli/ClaudeCodeClient.ts` | Modify | Add `IModelProvider` implementation, expose `providerId` and `capabilities` properties |

---

## Implementation

### 1. Update ClaudeCodeClient to Implement IModelProvider

Read `src/infrastructure/claude-cli/ClaudeCodeClient.ts`.

Update the import to include `IModelProvider`:

```typescript
import type { IClaudeClient, IModelProvider, IDatabaseService } from '@domain/interfaces';
```

Add imports for the new types:

```typescript
import type { MessageRole, StreamEvent, ProviderCapability, ProviderId } from '@domain/types';
import { CLAUDE_CLI_PROVIDER_ID } from '@domain/constants';
```

Update the class declaration to implement both interfaces:

```typescript
export class ClaudeCodeClient implements IClaudeClient, IModelProvider {
```

Add the `IModelProvider` required properties at the top of the class body (before `private _available`):

```typescript
  readonly providerId: ProviderId = CLAUDE_CLI_PROVIDER_ID;

  readonly capabilities: ProviderCapability[] = [
    'text-completion',
    'tool-use',
    'thinking',
    'streaming',
  ];
```

No other changes are needed — `sendMessage`, `abortStream`, `isAvailable`, `invalidateAvailabilityCache`, `hasActiveProcesses`, and `hasActiveProcessesForBook` already match the `IModelProvider` method signatures exactly.

---

## Architecture Compliance

- [x] Domain files import from nothing
- [x] Infrastructure imports only from domain + external packages
- [x] Application imports only from domain interfaces (not affected)
- [x] IPC handlers are one-liner delegations (not affected)
- [x] Renderer accesses backend only through `window.novelEngine` (not affected)
- [x] No `any` types
- [x] No behavioral changes — purely additive interface conformance

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `ClaudeCodeClient` satisfies both `IClaudeClient` and `IModelProvider`
3. `new ClaudeCodeClient(booksDir, db).providerId === 'claude-cli'`
4. `new ClaudeCodeClient(booksDir, db).capabilities` includes `'tool-use'`
5. All existing code that depends on `IClaudeClient` continues to compile

---

## State Update

After completing this session, update `prompts/feature/multi-model-providers/STATE.md`:
- Set SESSION-02 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
