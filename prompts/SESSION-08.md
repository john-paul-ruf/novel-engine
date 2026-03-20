# Session 08 — Context Wrangler

## Context

Novel Engine Electron app. Sessions 01–07 done. Now I need the **Context Wrangler** — an AI-powered context management system that makes intelligent decisions about what project files, chapters, and conversation history to include in each agent's CLI call.

The Wrangler replaces a naive static context builder with a **two-call pattern**: before every agent CLI call, a cheap/fast Wrangler call (using Sonnet) analyzes the current task, book state, and token budget, then produces a structured `WranglerPlan` (JSON). The plan is executed mechanically to assemble the final context.

This is the most architecturally significant service in the application. It determines what every agent sees.

## Architecture Rule

The main orchestrator is `src/application/ContextWrangler.ts` with supporting modules in `src/application/context/`. Imports from `@domain` only. Depends on injected interfaces (`IClaudeClient`, `IFileSystemService`, `IDatabaseService`, `IAgentService`, `ISettingsService`). Does NOT import any concrete infrastructure class directly.

## Task

Create the following files:

---

### File 1: `src/application/context/TokenEstimator.ts`

A pure utility — no dependencies except the domain constant.

```typescript
import { CHARS_PER_TOKEN } from '@domain/constants';

export class TokenEstimator {
  estimate(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }
}
```

---

### File 2: `src/application/context/ManifestBuilder.ts`

Builds the `WranglerInput` object that gets sent to the Wrangler CLI call. Reads project state and measures token counts for everything.

**Constructor:**
```typescript
constructor(
  private fs: IFileSystemService,
  private db: IDatabaseService,
  private tokenEstimator: TokenEstimator,
)
```

**Primary method:**
```typescript
async build(params: {
  agentName: AgentName;
  userMessage: string;
  bookSlug: string;
  conversationId: string;
  systemPromptTokens: number;
  thinkingBudget: number;
}): Promise<WranglerInput>
```

Steps:
1. **Load book context** via `this.fs.loadBookContext(bookSlug)` to get all file contents. Store internally for later access by `PlanExecutor`.
2. **Build `fileManifest`:** For each entry in `FILE_MANIFEST_KEYS` (from `@domain/constants`), measure the token count of the corresponding field in `BookContext`. Map keys to BookContext fields:
   - `'voiceProfile'` → `bookContext.voiceProfile`
   - `'sceneOutline'` → `bookContext.sceneOutline`
   - `'storyBible'` → `bookContext.storyBible`
   - `'pitch'` → `bookContext.pitch`
   - `'authorProfile'` → `bookContext.authorProfile`
   - `'readerReport'` → `bookContext.readerReport`
   - `'devReport'` → `bookContext.devReport`
   - `'auditReport'` → `bookContext.auditReport`
   - `'revisionPrompts'` → `bookContext.revisionPrompts`
   - `'styleSheet'` → `bookContext.styleSheet`
   - `'projectTasks'` → `bookContext.projectTasks`
   - `'metadata'` → `bookContext.metadata`
   If the field is empty string, set `tokens: 0`.
3. **Build `chapters`:** For each chapter in `bookContext.chapters`, create a `ChapterManifestEntry` with `draftTokens` and `notesTokens` measured from the chapter's `draft` and `notes` fields. Derive the chapter number from the slug prefix (e.g., `"01-the-beginning"` → number `1`).
4. **Build `conversation` manifest:** Load messages via `this.db.getMessages(conversationId)`. Store internally. Split into recent (last `WRANGLER_RECENT_TURN_COUNT` messages) and old. Measure token counts for each group. Detect if any messages have non-empty `thinking` fields.
5. **Calculate `budget`:** `totalContextWindow` = `MAX_CONTEXT_TOKENS`. `responseBuffer` = `AGENT_RESPONSE_BUFFER[agentName]`. `availableForContext` = total - systemPromptTokens - thinkingBudget - responseBuffer.
6. **Determine `bookStatus`** from `bookContext.meta.status`.
7. **Determine `pipelinePhase`** — map `BookStatus` to the closest `PipelinePhaseId`: `'scaffolded'` → `'pitch'`, `'outlining'` → `'scaffold'`, `'first-draft'` → `'first-draft'`, `'revision-1'` → `'revision'`, `'revision-2'` → `'second-read'`, `'copy-edit'` → `'copy-edit'`, `'final'` → `'build'`, `'published'` → `'publish'`.

**Accessor methods** (used by PlanExecutor after build):
```typescript
getBookContext(): BookContext    // returns the loaded book context
getMessages(): Message[]        // returns the loaded conversation messages
```

---

### File 3: `src/application/context/PlanExecutor.ts`

Executes a `WranglerPlan` by loading/summarizing files and compacting conversation history. This is the mechanical step — no AI decisions, just following the plan (except for summarization calls, which use cheap CLI calls).

**Constructor:**
```typescript
constructor(
  private claude: IClaudeClient,
  private tokenEstimator: TokenEstimator,
)
```

**Primary method:**
```typescript
async execute(params: {
  plan: WranglerPlan;
  bookContext: BookContext;
  messages: Message[];
}): Promise<AssembledContext>
```

Steps:

1. **Book metadata block** (always first):
   ```
   ## Active Book
   ```json
   { "slug": "...", "title": "...", "author": "...", "status": "..." }
   ```
   ```

2. **Process file includes:** For each entry in `plan.files.include`, look up content from `bookContext` using the key-to-field mapping. Format as:
   ```
   ## {Human-Readable Label}
   {content}
   ```
   Use a `keyToLabel()` helper: `'voiceProfile'` → `"Voice Profile"`, `'sceneOutline'` → `"Scene Outline"`, etc.

3. **Process file summarizations:** For each entry in `plan.files.summarize`:
   - Look up the full content from `bookContext`
   - Call `this.claude.sendOneShot()`:
     - Model: `WRANGLER_MODEL`
     - System prompt: `"You are a document summarizer for a novel-writing tool. Summarize the following document to approximately {targetTokens} tokens. Focus on: {focus}. Output the summary only — no commentary, no meta-discussion."`
     - User message: the full file content
     - Max tokens: `SUMMARIZATION_MAX_TOKENS`
   - Format as: `## {Label} (summarized)\n{summary}`

4. **Process chapters:** For each entry in `plan.chapters.include`:
   - Find the chapter in `bookContext.chapters` by matching slug
   - Format based on directives:
     ```
     ## Chapter {number}: {slug}
     ### Draft
     {draft content}
     ```
     If `includeNotes` is true and notes exist:
     ```
     ### Notes
     {notes content}
     ```

5. **Process conversation:** Apply `plan.conversation.strategy`:

   **`'keep-all'`:**
   - Map all messages to `{ role, content }`.
   - For messages older than `dropThinkingOlderThan` turns from the end, do NOT include thinking content (thinking is stripped by default — only the `content` field is sent, not `thinking`).

   **`'summarize-old'`:**
   - Separate messages into old (all except last `keepRecentTurns`) and recent (last `keepRecentTurns`).
   - Concatenate old messages into a summary prompt: each message as `"{role}: {content}"` separated by newlines.
   - Call `this.claude.sendOneShot()`:
     - Model: `WRANGLER_MODEL`
     - System prompt: `"Summarize this conversation history for context continuity. Preserve: {summaryFocus}. Be concise — 2-4 paragraphs maximum. Output the summary only."`
     - User message: the concatenated old messages
     - Max tokens: `SUMMARIZATION_MAX_TOKENS`
   - Build the final message array:
     ```typescript
     [
       { role: 'user', content: `[Conversation recap]\n${summary}` },
       { role: 'assistant', content: 'Understood. I have the context from our previous conversation.' },
       ...recentMessages.map(m => ({ role: m.role, content: m.content }))
     ]
     ```

   **`'keep-recent-only'`:**
   - Same as `'summarize-old'` but with a shorter summary (system prompt says "2-3 sentences maximum").
   - Only keep last `keepRecentTurns` messages.

6. **Build diagnostics:** Construct the `ContextDiagnostics` object tracking:
   - `filesIncluded`: keys of all included files
   - `filesExcluded`: keys of all excluded files (from `plan.files.exclude`)
   - `filesSummarized`: keys of all summarized files
   - `chapterStrategy`: from the plan
   - `chaptersIncluded`: chapter numbers from the plan
   - `chaptersExcluded`: range description from the plan
   - `conversationStrategy`: from the plan
   - `conversationTurnsSent`: count of messages in the final array
   - `conversationTurnsDropped`: original count minus sent count
   - `wranglerReasoning`: from `plan.reasoning`
   - `totalTokensUsed` and `budgetRemaining`: estimated from the assembled content

7. **Join project context:** Combine all file sections and chapter sections with `\n\n---\n\n` separators.

Return `{ projectContext, conversationMessages, diagnostics }`.

---

### File 4: `src/application/ContextWrangler.ts`

The main orchestrator. Implements `IContextWrangler` from `@domain/interfaces`.

**Constructor:**
```typescript
constructor(
  private settings: ISettingsService,
  private agents: IAgentService,
  private db: IDatabaseService,
  private fs: IFileSystemService,
  private claude: IClaudeClient,
)
```

Internally creates a `TokenEstimator` instance and stores it.

**`estimateTokens(text: string): number`**
Delegates to `this.tokenEstimator.estimate()`.

**`assemble()` — primary method:**
```typescript
async assemble(params: {
  agentName: AgentName;
  userMessage: string;
  conversationId: string;
  bookSlug: string;
}): Promise<AssembledContext>
```

Full flow:

1. **Load the agent** via `this.agents.load(params.agentName)` to get the system prompt and thinking budget.
2. **Load settings** via `this.settings.load()` to get model and thinking config.
3. **Calculate system prompt tokens** via `this.tokenEstimator.estimate(agent.systemPrompt)`.
4. **Determine thinking budget**: agent's `thinkingBudget` if `settings.enableThinking` is true, else `0`.
5. **Build the manifest:**
   ```typescript
   const manifestBuilder = new ManifestBuilder(this.fs, this.db, this.tokenEstimator);
   const wranglerInput = await manifestBuilder.build({
     agentName: params.agentName,
     userMessage: params.userMessage,
     bookSlug: params.bookSlug,
     conversationId: params.conversationId,
     systemPromptTokens,
     thinkingBudget,
   });
   ```
6. **Load the Wrangler agent prompt** via `this.agents.load('Wrangler')`.
   - **Note:** `'Wrangler'` IS in the `AgentName` union type (defined in Session 02), so no cast is needed. The `AgentService.load()` method matches by filename from `AGENT_REGISTRY` with case-insensitive matching.
   - If loading fails (agent file missing), fall back directly to `buildFallbackPlan()`.
7. **Call the Wrangler CLI:**
   ```typescript
   const planJson = await this.claude.sendOneShot({
     model: WRANGLER_MODEL,
     systemPrompt: wranglerAgent.systemPrompt,
     userMessage: JSON.stringify(wranglerInput),
     maxTokens: WRANGLER_MAX_TOKENS,
   });
   ```
8. **Parse the response** as `WranglerPlan`:
   ```typescript
   let plan: WranglerPlan;
   try {
     plan = JSON.parse(planJson) as WranglerPlan;
   } catch {
     console.warn('Wrangler returned invalid JSON, using fallback plan');
     plan = this.buildFallbackPlan(wranglerInput);
   }
   ```
9. **Validate the plan** — check that `plan.files`, `plan.chapters`, and `plan.conversation` all exist. If any are missing, use the fallback.
10. **Execute the plan:**
    ```typescript
    const executor = new PlanExecutor(this.claude, this.tokenEstimator);
    return executor.execute({
      plan,
      bookContext: manifestBuilder.getBookContext(),
      messages: manifestBuilder.getMessages(),
    });
    ```
11. **Error handling:** Wrap the entire assemble flow in try/catch. If anything fails, log the error and attempt the fallback plan. If even the fallback fails, throw with a descriptive message.

**`buildFallbackPlan()` — static rules fallback:**
```typescript
private buildFallbackPlan(input: WranglerInput): WranglerPlan
```

If the Wrangler CLI call fails or returns unparseable JSON, build a safe plan using hardcoded rules:

**File rules by agent:**
- **Spark**: include `authorProfile` only
- **Verity**: include `voiceProfile`, `pitch`, `sceneOutline`, `storyBible`, `authorProfile`, `revisionPrompts` (if they exist)
- **Ghostlight**: include nothing (cold read — only chapters)
- **Lumen**: include `readerReport`, `sceneOutline`, `storyBible`, `pitch`
- **Sable**: include `styleSheet`, `storyBible`
- **Forge**: include `devReport`, `readerReport`, `auditReport`, `sceneOutline`
- **Quill**: include `authorProfile`, `storyBible`

**Chapter rules by agent:**
- **Spark, Forge, Quill**: `strategy: 'none'`, no chapters
- **Verity**: `strategy: 'sliding-window'`, last 3 chapters, draft + notes
- **Ghostlight**: `strategy: 'full-read'`, all chapters, draft only
- **Lumen**: `strategy: 'full-read'`, all chapters, draft + notes
- **Sable**: `strategy: 'full-read'`, all chapters, draft only

**Conversation rules:**
- If total conversation turns ≤ 20: `strategy: 'keep-all'`
- If > 20: `strategy: 'keep-recent-only'`, keep last 6 turns

Set `reasoning: "Fallback plan — Wrangler call failed or returned invalid response"`.

This ensures the app **always works** even if the Wrangler has issues, at the cost of potentially including more context than necessary.

---

## Required Changes to Other Sessions

### SESSION-02 (Domain Layer) — already updated:
- `AgentName` type needs `'Wrangler'` added: `'Spark' | 'Verity' | 'Ghostlight' | 'Lumen' | 'Sable' | 'Forge' | 'Quill' | 'Wrangler'`
- `IContextBuilder` replaced with `IContextWrangler`
- All `WranglerPlan`, `WranglerInput`, `AssembledContext`, `ContextDiagnostics` types added
- Wrangler constants added (`WRANGLER_MODEL`, `WRANGLER_MAX_TOKENS`, etc.)
- `IClaudeClient` extended with `sendOneShot()` method

### SESSION-05 (Agent Loader):
- `AgentService.loadAll()` should still sort by pipeline order and exclude the Wrangler from the returned list (it's infrastructure, not creative). However, `AgentService.load('Wrangler')` must work — it should find `WRANGLER.md` by filename.

### SESSION-07 (Claude CLI Client):
- `ClaudeCodeClient` needs to implement `sendOneShot()` — a non-streaming call that returns the full text response as a string. Implementation: spawn `claude` with `--output-format json` (not `stream-json`), collect all stdout, parse the result JSON, return the text content.

### SESSION-09 (Chat Service):
- `ChatService` constructor replaces `IContextBuilder` with `IContextWrangler`.
- The `sendMessage` flow changes: instead of calling `this.fs.loadBookContext()` + `this.contextBuilder.build()`, call `this.contextWrangler.assemble()` which handles everything.
- The system prompt assembly now uses the `projectContext` from `AssembledContext`.
- The conversation messages come from `AssembledContext.conversationMessages` instead of raw DB messages.

### SESSION-12 (Composition Root):
- Instantiate `ContextWrangler` instead of `ContextBuilder` and inject it into `ChatService`.

### SESSION-11 (IPC):
- Add an IPC channel `'context:getDiagnostics'` that exposes the last `ContextDiagnostics` (stored by ChatService after each send). This lets the UI show what context was assembled.

---

## Verification

- All four files compile with `npx tsc --noEmit`
- `ContextWrangler` implements `IContextWrangler`
- All imports are from `@domain` only — no infrastructure imports
- The two-call pattern is clear: build manifest → call Wrangler CLI → parse plan → execute plan → return assembled context
- Fallback plan exists and covers all 7 creative agents
- Summarization uses `sendOneShot` with the `WRANGLER_MODEL` (cheap)
- Conversation compaction handles all three strategies (`keep-all`, `summarize-old`, `keep-recent-only`)
- `ContextDiagnostics` tracks everything for the UI to display
- The Wrangler agent file `WRANGLER.md` exists in `agents/`
