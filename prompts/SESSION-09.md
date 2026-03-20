# Session 09 — Chat Service

## Context

Novel Engine Electron app. Sessions 01–08 done. Now I need the **Chat Service** — the central orchestrator that ties everything together for a single "send message and get a streamed response" operation. It uses the **Context Wrangler** (Session 08) to intelligently assemble context before each agent call.

## Architecture Rule

Lives in `src/application/ChatService.ts`. Imports from `@domain` and `nanoid` (v3, CJS — use `import { nanoid } from 'nanoid'`). Depends on domain interfaces (injected via constructor). Does NOT import any concrete infrastructure class directly — it depends on the *interfaces*.

## Task

Create `src/application/ChatService.ts`.

### Constructor — Dependency Injection

```typescript
class ChatService {
  private lastDiagnostics: ContextDiagnostics | null = null;

  constructor(
    private settings: ISettingsService,
    private agents: IAgentService,
    private db: IDatabaseService,
    private claude: IClaudeClient,
    private contextWrangler: IContextWrangler,
  ) {}
}
```

All dependencies are injected. The main process will wire them up.

**Note:** Unlike the previous design, `ChatService` no longer takes `IFileSystemService` or loads book context directly. The `ContextWrangler` handles all context assembly internally — it has its own `IFileSystemService` and `IDatabaseService` references.

### Primary Method: `sendMessage`

```typescript
async sendMessage(params: {
  agentName: AgentName;
  message: string;
  conversationId: string;
  bookSlug: string;
  onEvent: (event: StreamEvent) => void;
}): Promise<void>
```

**Step-by-step flow:**

1. **Check Claude CLI availability.** Call `this.claude.isAvailable()`. If false, emit an error event with message "Claude Code CLI not found or not authenticated. Run `claude login` to set up." and return.

2. **Load settings.** Call `this.settings.load()` to get model, maxTokens, thinking config.

3. **Load the agent.** Call `this.agents.load(params.agentName)`. Use the agent's `thinkingBudget` from the agent metadata (not the global setting) as the default, but respect the global `enableThinking` toggle.

4. **Save the user message FIRST.** Call `this.db.saveMessage({ conversationId: params.conversationId, role: 'user', content: params.message, thinking: '' })`. We save before assembling context so the Wrangler can see the full conversation including this message.

5. **Assemble context via the Wrangler.** Call:
   ```typescript
   const assembled = await this.contextWrangler.assemble({
     agentName: params.agentName,
     userMessage: params.message,
     conversationId: params.conversationId,
     bookSlug: params.bookSlug,
   });
   ```
   This runs the full two-call pattern: manifest → Wrangler CLI → parse plan → execute plan. It returns:
   - `projectContext`: formatted string of all project files and chapters
   - `conversationMessages`: compacted conversation history as `{ role, content }[]`
   - `diagnostics`: full breakdown of what was included/excluded and why

6. **Store diagnostics.** Save `assembled.diagnostics` to `this.lastDiagnostics` so the IPC layer can expose it to the UI.

7. **Assemble the system prompt.** Concatenate:
   ```
   {agent.systemPrompt}

   ---

   # Current Book Context

   {assembled.projectContext}
   ```

8. **Call the Claude CLI.** Invoke `this.claude.sendMessage()` with:
   - `model` from settings
   - `systemPrompt` from step 7
   - `messages` = `assembled.conversationMessages` (already includes the new user message and any compacted history)
   - `maxTokens` from settings
   - `thinkingBudget` = `agent.thinkingBudget` if thinking is enabled, otherwise `undefined`
   - `onEvent` = a wrapper around `params.onEvent` that also captures the full response

9. **Capture the response.** Inside the `onEvent` wrapper:
    - Accumulate `textDelta` events into a `responseBuffer` string
    - Accumulate `thinkingDelta` events into a `thinkingBuffer` string
    - When a `done` event arrives:
      - Save the assistant message: `this.db.saveMessage({ conversationId, role: 'assistant', content: responseBuffer, thinking: thinkingBuffer })`
      - Record usage: `this.db.recordUsage({ conversationId, inputTokens, outputTokens, thinkingTokens: event.thinkingTokens, model, estimatedCost: this.calculateCost(model, inputTokens, outputTokens) })`
    - Forward ALL events to `params.onEvent` (the caller still gets everything)

10. **Error handling.** Wrap the entire flow (steps 5–9) in try/catch. On error, emit `{ type: 'error', message: error.message }` via `params.onEvent`.

### Helper Method: `calculateCost`

```typescript
private calculateCost(model: string, inputTokens: number, outputTokens: number): number
```

Use `MODEL_PRICING` from `@domain/constants`. Return the cost in dollars.

### Helper Method: `createConversation`

```typescript
async createConversation(params: {
  bookSlug: string;
  agentName: AgentName;
  pipelinePhase: PipelinePhaseId | null;
}): Promise<Conversation>
```

Delegates to `this.db.createConversation()` with a generated ID (use `nanoid()`), the provided params, and an empty title (title gets set on first message by the DB service).

### Helper Method: `getConversations`

```typescript
async getConversations(bookSlug: string): Promise<Conversation[]>
```

Delegates to `this.db.listConversations(bookSlug)`.

### Helper Method: `getMessages`

```typescript
async getMessages(conversationId: string): Promise<Message[]>
```

Delegates to `this.db.getMessages(conversationId)`.

### Helper Method: `getLastDiagnostics`

```typescript
getLastDiagnostics(): ContextDiagnostics | null
```

Returns the `ContextDiagnostics` from the most recent `sendMessage` call. Used by the IPC layer to expose context diagnostics to the UI.

## Verification

- Compiles with `npx tsc --noEmit`
- Constructor takes 5 interface parameters: `ISettingsService`, `IAgentService`, `IDatabaseService`, `IClaudeClient`, `IContextWrangler`
- `sendMessage` uses `contextWrangler.assemble()` instead of manually loading book context
- The user message is saved to the DB BEFORE calling the Wrangler (so the Wrangler sees the full conversation)
- Response and thinking are accumulated and saved after `done`
- Token usage is recorded with cost calculation
- All events are forwarded to the caller's `onEvent` callback
- `getLastDiagnostics()` returns context assembly diagnostics
- No direct infrastructure imports — only `@domain`
