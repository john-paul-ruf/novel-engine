# Session 09 — Chat Service

## Context

Novel Engine Electron app. Sessions 01–08 done. Now I need the **Chat Service** — the central orchestrator that ties everything together for a single "send message and get a streamed response" operation.

## Architecture Rule

Lives in `src/application/ChatService.ts`. Imports from `@domain` and `nanoid`. Depends on domain interfaces (injected via constructor). Does NOT import any concrete infrastructure class directly — it depends on the *interfaces*.

## Task

Create `src/application/ChatService.ts`.

### Constructor — Dependency Injection

```typescript
class ChatService {
  constructor(
    private settings: ISettingsService,
    private agents: IAgentService,
    private db: IDatabaseService,
    private fs: IFileSystemService,
    private api: IAnthropicClient,
    private contextBuilder: IContextBuilder,
  ) {}
}
```

All dependencies are injected. The main process will wire them up.

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

1. **Get the API key.** Call `this.settings.getApiKey()`. If null, emit an error event and return.

2. **Load settings.** Call `this.settings.load()` to get model, maxTokens, thinking config.

3. **Load the agent.** Call `this.agents.load(params.agentName)`. Use the agent's `thinkingBudget` from the agent metadata (not the global setting) as the default, but respect the global `enableThinking` toggle.

4. **Load book context.** Call `this.fs.loadBookContext(params.bookSlug)`.

5. **Build the context string.** Call `this.contextBuilder.build(params.agentName, bookContext)`.

6. **Assemble the system prompt.** Concatenate:
   ```
   {agent.systemPrompt}

   ---

   # Current Book Context

   {contextString}
   ```

7. **Load conversation history.** Call `this.db.getMessages(params.conversationId)`. Map to the `{ role, content }` format the API expects. Do NOT include thinking content in the history — the API ignores previous thinking blocks.

8. **Save the user message.** Call `this.db.saveMessage({ conversationId, role: 'user', content: params.message, thinking: '' })`.

9. **Call the API.** Invoke `this.api.sendMessage()` with:
   - `apiKey` from step 1
   - `model` from settings
   - `systemPrompt` from step 6
   - `messages` = history from step 7 + the new user message
   - `maxTokens` from settings
   - `thinking` = `{ type: 'enabled', budget_tokens: agent.thinkingBudget }` if thinking is enabled, otherwise `undefined`
   - `onEvent` = a wrapper around `params.onEvent` that also captures the full response

10. **Capture the response.** Inside the `onEvent` wrapper:
    - Accumulate `textDelta` events into a `responseBuffer` string
    - Accumulate `thinkingDelta` events into a `thinkingBuffer` string
    - When a `done` event arrives:
      - Save the assistant message: `this.db.saveMessage({ conversationId, role: 'assistant', content: responseBuffer, thinking: thinkingBuffer })`
      - Record usage: `this.db.recordUsage({ conversationId, inputTokens, outputTokens, thinkingTokens: event.thinkingTokens, model, estimatedCost: this.calculateCost(model, inputTokens, outputTokens) })` (The `done` event now includes `thinkingTokens` — see Session 02's `StreamEvent` type.)
    - Forward ALL events to `params.onEvent` (the caller still gets everything)

11. **Error handling.** Wrap the API call in try/catch. On error, emit `{ type: 'error', message: error.message }` via `params.onEvent`.

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

## Verification

- Compiles with `npx tsc --noEmit`
- Constructor takes 6 interface parameters (no concrete types) — note: Session 10 will add `UsageService` as a 7th dependency
- `sendMessage` follows the 11-step flow exactly
- Response and thinking are accumulated and saved after `done`
- Token usage is recorded with cost calculation
- All events are forwarded to the caller's `onEvent` callback
- No direct infrastructure imports — only `@domain`
