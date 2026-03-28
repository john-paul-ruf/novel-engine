# SESSION-01 — Domain: Helper Agent Types, Interface, and Constants

> **Feature:** helper-agent
> **Layer(s):** Domain
> **Depends on:** Nothing
> **Estimated effort:** 15 min

---

## Context

Novel Engine currently has 7 creative agents and a Wrangler utility agent. This session introduces a new "Helper" agent — a non-creative, app-wide assistant that helps users understand the software. Unlike creative agents, the Helper is not tied to any book or pipeline phase. It runs in a floating modal chat and uses the comprehensive user guide as its knowledge base.

This is the first session of the helper-agent feature. No prior work exists. We're adding domain-level types, updating constants, and declaring the service interface.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/domain/types.ts` | Modify | Add `'Helper'` to `AgentName`, update `CreativeAgentName`, add `'helper'` to `ConversationPurpose` |
| `src/domain/constants.ts` | Modify | Add `HELPER` entry to `AGENT_REGISTRY`, add `HELPER_SLUG` constant |
| `src/domain/interfaces.ts` | Modify | Add `IHelperService` interface |

---

## Implementation

### 1. Update `AgentName` and `CreativeAgentName`

Read `src/domain/types.ts`.

Add `'Helper'` to the `AgentName` union type:

```typescript
export type AgentName = 'Spark' | 'Verity' | 'Ghostlight' | 'Lumen' | 'Sable' | 'Forge' | 'Quill' | 'Wrangler' | 'Helper';
```

Update `CreativeAgentName` to exclude both `Wrangler` and `Helper`:

```typescript
export type CreativeAgentName = Exclude<AgentName, 'Wrangler' | 'Helper'>;
```

### 2. Add `'helper'` to `ConversationPurpose`

In `src/domain/types.ts`, update the `ConversationPurpose` union:

```typescript
export type ConversationPurpose = 'pipeline' | 'voice-setup' | 'author-profile' | 'pitch-room' | 'hot-take' | 'adhoc-revision' | 'helper';
```

### 3. Add Helper to `AGENT_REGISTRY`

Read `src/domain/constants.ts`.

Add the Helper entry to `AGENT_REGISTRY`:

```typescript
Helper: { filename: 'HELPER.md', role: 'Help & FAQ', color: '#3B82F6', thinkingBudget: 2000, maxTurns: 5 },
```

The Helper uses:
- Blue-500 color (`#3B82F6`) — matches the interactive element accent color
- Low thinking budget (2000) — it's answering FAQ questions, not creative work
- Low max turns (5) — it shouldn't need many tool round-trips

### 4. Add `HELPER_SLUG` constant

Add a reserved slug constant below the existing `PITCH_ROOM_SLUG`:

```typescript
/** Reserved book slug used for Helper agent conversations. */
export const HELPER_SLUG = '__helper__';
```

### 5. Add `IHelperService` interface

Read `src/domain/interfaces.ts`.

Add the `IHelperService` interface. The helper service manages a single persistent conversation per user (not per book). It loads the user guide as context and delegates to the CLI.

```typescript
export interface IHelperService {
  /**
   * Send a message to the helper agent.
   *
   * Creates a conversation on first use. Subsequent messages reuse the
   * same conversation. The helper's system prompt includes the full
   * user guide so it can answer questions about the application.
   *
   * Working directory: the active book's directory if one exists,
   * otherwise the userData root. This lets the helper reference book
   * files when relevant.
   */
  sendMessage(params: {
    message: string;
    conversationId: string;
    onEvent: (event: StreamEvent) => void;
    sessionId?: string;
    callId?: string;
  }): Promise<void>;

  /**
   * Get or create the persistent helper conversation.
   * Returns the existing conversation if one exists, otherwise creates a new one.
   */
  getOrCreateConversation(): Promise<Conversation>;

  /**
   * Get all messages in the helper conversation.
   */
  getMessages(conversationId: string): Promise<Message[]>;

  /**
   * Abort the active helper stream. No-op if nothing is active.
   */
  abortStream(conversationId: string): void;

  /**
   * Delete the helper conversation and start fresh.
   */
  resetConversation(): Promise<void>;
}
```

Make sure to add `StreamEvent`, `Conversation`, and `Message` to the imports at the top of `interfaces.ts` if they aren't already imported.

---

## Architecture Compliance

- [x] Domain files import from nothing (types.ts still has zero imports, constants.ts imports only from `./types`, interfaces.ts imports only from `./types`)
- [x] No infrastructure, application, or renderer concerns in domain
- [x] All new types are fully specified, no `any`
- [x] `IHelperService` depends only on domain types

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `AgentName` includes `'Helper'`
3. `CreativeAgentName` excludes `'Helper'`
4. `AGENT_REGISTRY` has a `Helper` entry
5. `IHelperService` is exported from `interfaces.ts`

---

## State Update

After completing this session, update `prompts/feature/helper-agent/STATE.md`:
- Set SESSION-01 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
