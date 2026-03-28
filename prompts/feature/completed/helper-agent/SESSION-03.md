# SESSION-03 — Application: HelperService Implementation

> **Feature:** helper-agent
> **Layer(s):** Application
> **Depends on:** SESSION-01, SESSION-02
> **Estimated effort:** 20 min

---

## Context

SESSION-01 added the domain types (`IHelperService`, `HELPER_SLUG`, Helper in `AgentName` / `AGENT_REGISTRY`). SESSION-02 created the agent prompt file (`agents/HELPER.md`) and comprehensive user guide (`docs/USER_GUIDE.md`). This session implements the `HelperService` — the application-layer service that orchestrates helper conversations.

The helper is architecturally simple compared to `ChatService`:
- No context wrangling (the user guide IS the context)
- No pipeline awareness
- No file watching or chapter validation
- Single persistent conversation (not per-book)
- Read-only tool permissions (the helper should never modify files)

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/application/HelperService.ts` | Create | Implements `IHelperService` — loads agent + user guide, manages helper conversation, delegates to CLI |

---

## Implementation

### 1. Create `src/application/HelperService.ts`

Read these files first to understand patterns:
- `src/domain/interfaces.ts` — the `IHelperService` contract
- `src/domain/types.ts` — types used
- `src/domain/constants.ts` — `HELPER_SLUG`, `AGENT_REGISTRY`
- `src/application/PitchRoomService.ts` — similar pattern (non-pipeline chat service)
- `src/application/HotTakeService.ts` — another similar pattern

The service depends on interfaces only (constructor injection):

```typescript
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type {
  IHelperService,
  IAgentService,
  ISettingsService,
  IDatabaseService,
  IFileSystemService,
  IProviderRegistry,
} from '@domain/interfaces';
import type { Conversation, Message, StreamEvent } from '@domain/types';
import { HELPER_SLUG } from '@domain/constants';
import { nanoid } from 'nanoid';
```

#### Constructor

```typescript
export class HelperService implements IHelperService {
  private userDataPath: string;

  constructor(
    private settings: ISettingsService,
    private agents: IAgentService,
    private db: IDatabaseService,
    private fs: IFileSystemService,
    private providerRegistry: IProviderRegistry,
    userDataPath: string,
  ) {
    this.userDataPath = userDataPath;
  }
}
```

The `userDataPath` is needed to locate the `USER_GUIDE.md` file at runtime.

#### `getOrCreateConversation()`

Look for an existing conversation with `bookSlug === HELPER_SLUG` and `purpose === 'helper'`. If found, return it. Otherwise create a new one.

```typescript
async getOrCreateConversation(): Promise<Conversation> {
  const conversations = this.db.listConversations(HELPER_SLUG);
  const existing = conversations.find(c => c.purpose === 'helper');
  if (existing) return existing;

  return this.db.createConversation({
    id: nanoid(),
    bookSlug: HELPER_SLUG,
    agentName: 'Helper',
    pipelinePhase: null,
    purpose: 'helper',
    title: 'Help & FAQ',
  });
}
```

#### `getMessages(conversationId)`

Simple delegation:

```typescript
async getMessages(conversationId: string): Promise<Message[]> {
  return this.db.getMessages(conversationId);
}
```

#### `sendMessage(params)`

The core method. Loads the helper agent prompt, reads the user guide from disk, concatenates them into a system prompt, loads conversation history, and sends via the provider registry.

```typescript
async sendMessage(params: {
  message: string;
  conversationId: string;
  onEvent: (event: StreamEvent) => void;
  sessionId?: string;
  callId?: string;
}): Promise<void> {
  const { message, conversationId, onEvent, sessionId, callId } = params;

  // 1. Save the user message
  this.db.saveMessage({
    conversationId,
    role: 'user',
    content: message,
    thinking: '',
  });

  // 2. Load the agent prompt
  const agent = await this.agents.load('Helper');

  // 3. Load the user guide
  let userGuide = '';
  try {
    const guidePath = path.join(this.userDataPath, 'USER_GUIDE.md');
    userGuide = await readFile(guidePath, 'utf-8');
  } catch {
    // Guide not found — helper works without it (degraded)
    userGuide = '(User guide not available. Answer based on your general knowledge of the application.)';
  }

  // 4. Build system prompt: agent instructions + user guide
  const systemPrompt = agent.systemPrompt + '\n\n' + userGuide;

  // 5. Load conversation history
  const messages = this.db.getMessages(conversationId);
  const conversationMessages = messages.map(m => ({
    role: m.role,
    content: m.content,
  }));

  // 6. Get settings for model config
  const appSettings = await this.settings.load();

  // 7. Determine working directory — use active book if one exists, else userData
  let workingDir = this.userDataPath;
  try {
    const activeSlug = await this.fs.getActiveBookSlug();
    if (activeSlug && activeSlug !== HELPER_SLUG) {
      const booksPath = this.fs.getBooksPath();
      workingDir = path.join(booksPath, activeSlug);
    }
  } catch {
    // No active book — use userData
  }

  // 8. Accumulate response for saving
  let responseText = '';
  let thinkingText = '';

  // 9. Send via provider registry
  await this.providerRegistry.sendMessage({
    model: appSettings.model,
    systemPrompt,
    messages: conversationMessages,
    maxTokens: appSettings.maxTokens,
    thinkingBudget: appSettings.enableThinking ? 2000 : undefined,
    maxTurns: 5,
    workingDir,
    sessionId,
    conversationId,
    onEvent: (event: StreamEvent) => {
      // Accumulate response text
      if (event.type === 'textDelta') {
        responseText += event.text;
      } else if (event.type === 'thinkingDelta') {
        thinkingText += event.text;
      } else if (event.type === 'done') {
        // Save assistant response
        this.db.saveMessage({
          conversationId,
          role: 'assistant',
          content: responseText,
          thinking: thinkingText,
        });
      }
      // Forward all events to the caller
      onEvent(event);
    },
  });
}
```

Note: Import `path` from `node:path` and `readFile` from `node:fs/promises` at the top of the file. These are needed for reading the user guide. This is acceptable because the application layer CAN import Node.js builtins for file I/O (same pattern as `BuildService` which imports `child_process`).

#### `abortStream(conversationId)`

Delegate to the provider registry:

```typescript
abortStream(conversationId: string): void {
  this.providerRegistry.abortStream(conversationId);
}
```

#### `resetConversation()`

Delete the existing helper conversation:

```typescript
async resetConversation(): Promise<void> {
  const conversations = this.db.listConversations(HELPER_SLUG);
  const existing = conversations.find(c => c.purpose === 'helper');
  if (existing) {
    this.db.deleteConversation(existing.id);
  }
}
```

---

## Architecture Compliance

- [x] Application imports only from domain interfaces (not concrete classes)
- [x] Dependencies injected via constructor
- [x] No direct imports from infrastructure modules
- [x] Node.js builtins (`path`, `fs/promises`) imported for file I/O — acceptable per BuildService precedent
- [x] All async operations have error handling
- [x] No `any` types
- [x] All methods from `IHelperService` implemented

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `HelperService` implements every method declared in `IHelperService`
3. No imports from `@infra/*` — only `@domain/*`, `nanoid`, and Node.js builtins
4. Constructor takes interfaces, not concrete classes

---

## State Update

After completing this session, update `prompts/feature/helper-agent/STATE.md`:
- Set SESSION-03 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
