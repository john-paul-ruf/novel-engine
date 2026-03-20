# Session 25 — Agent Tool Use: Let Agents Write Files Directly

## Context

Novel Engine Electron app. Sessions 01–24 built the complete app including agent chat, pipeline tracking, file browser, and manual save-to-file buttons on chat messages.

**The Problem:** Currently, when an agent produces output (Spark writes a pitch, Verity writes a chapter, Ghostlight writes a reader report), the content appears in the chat as plain text. The user must then click a "Save as Pitch" / "Save as Chapter Draft" / etc. button on the message bubble to persist it to disk. This is backwards.

**The Reality:** These agents are meant to be autonomous collaborators. Spark doesn't *suggest* a pitch for you to copy-paste — Spark *writes the pitch*. Verity doesn't *suggest* a chapter — Verity *writes the chapter*. The Claude Code CLI already supports full agent mode with tool use (file read/write, bash commands). We've been artificially limiting it to `--print` (text-only) mode.

**The Fix:** Drop `--print` mode. Run agents in full agent mode with the working directory set to the book root. Agents can read and write files directly. The app detects file changes after each agent interaction and updates pipeline state automatically. Manual save buttons are removed.

---

## Design

### How Agent Tool Use Works

The Claude Code CLI, when run **without** `--print`, operates in full agent mode:
- The agent can use built-in tools: `Read`, `Write`, `Edit`, `Bash`, etc.
- The CLI streams tool use events alongside text events
- The `--allowedTools` flag restricts which tools the agent can use
- The `--cwd` flag sets the working directory for file operations

### What Changes

| Before (--print mode) | After (full agent mode) |
|---|---|
| CLI runs with `--print` flag | CLI runs without `--print` |
| Agent output is text-only | Agent can read/write files + produce text |
| User clicks "Save as Pitch" button | Agent writes `source/pitch.md` directly |
| `FilePersistenceService` copies message text to disk | Agent writes to disk; app detects changes |
| No file activity during chat | File changes stream to UI in real-time |
| Agent can't see project files (only via context) | Agent can read any file in the book directory |

### Tool Restrictions

Agents should only be allowed to:
- **Read files** within the book directory
- **Write/Edit files** within the book directory
- **List directories** within the book directory

They should NOT be allowed to:
- Run bash commands (no `Bash` tool)
- Access files outside the book directory
- Make network requests
- Use any MCP tools

The `--allowedTools` flag handles this: `--allowedTools Read,Write,Edit,LS`

### Working Directory

Each agent call sets `--cwd` to the active book's root directory:
```
{userDataPath}/books/{slug}/
```

This means when Spark writes `source/pitch.md`, it resolves to:
```
{userDataPath}/books/{slug}/source/pitch.md
```

### Stream Event Mapping

Full agent mode emits additional event types beyond text/thinking:

```
// Tool use events from the CLI stream
{"type":"content_block_start","content_block":{"type":"tool_use","name":"Write","id":"toolu_xxx"}}
{"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"..."}}
{"type":"content_block_stop"}

// Tool result events
{"type":"content_block_start","content_block":{"type":"tool_result","tool_use_id":"toolu_xxx"}}
{"type":"content_block_delta","delta":{"type":"text_delta","text":"File written successfully"}}
{"type":"content_block_stop"}
```

The app needs to:
1. Detect tool use events and forward them to the UI as a new `StreamEvent` type
2. Track which files were written during the interaction
3. After the interaction completes, refresh pipeline state and file browser

---

## Task 1: Extend Stream Event Types

### Update `src/domain/types.ts`

Add new stream event variants for tool use:

```typescript
export type ToolUseInfo = {
  toolName: string;        // e.g. "Write", "Read", "Edit"
  toolId: string;          // the tool_use_id from the CLI
  filePath?: string;       // resolved file path (for file operations)
  status: 'started' | 'running' | 'complete' | 'error';
};

export type StreamEvent =
  | { type: 'status'; message: string }
  | { type: 'blockStart'; blockType: StreamBlockType }
  | { type: 'thinkingDelta'; text: string }
  | { type: 'textDelta'; text: string }
  | { type: 'blockEnd'; blockType: StreamBlockType }
  | { type: 'toolUse'; tool: ToolUseInfo }            // NEW — agent is using a tool
  | { type: 'filesChanged'; paths: string[] }          // NEW — files written during this interaction
  | { type: 'done'; inputTokens: number; outputTokens: number; thinkingTokens: number }
  | { type: 'error'; message: string };
```

Also update `StreamBlockType`:

```typescript
export type StreamBlockType = 'thinking' | 'text' | 'tool_use' | 'tool_result';
```

Remove the `OutputTarget` type — it's no longer needed:

```typescript
// DELETE this type:
// export type OutputTarget = {
//   targetPath: string;
//   description: string;
//   isChapter?: boolean;
// };
```

---

## Task 2: Update ClaudeCodeClient — Full Agent Mode

### Update `src/infrastructure/claude-cli/ClaudeCodeClient.ts`

This is the core change. The `sendMessage` method drops `--print` and adds `--cwd`, `--allowedTools`, and tool use event parsing.

**Constructor changes:**

The client now needs to know the books directory to set `--cwd`:

```typescript
export class ClaudeCodeClient implements IClaudeClient {
  constructor(private booksDir: string) {}
```

**`sendMessage` changes:**

1. **Remove `--print`** from the args array
2. **Add `--cwd`** pointing to the book's root directory (new parameter)
3. **Add `--allowedTools`** to restrict tool access
4. **Parse tool use events** from the stream

**New parameter on `sendMessage`:**

Add `bookSlug?: string` to the params. When provided, the CLI runs with `--cwd` set to the book directory.

```typescript
async sendMessage(params: {
  model: string;
  systemPrompt: string;
  messages: { role: MessageRole; content: string }[];
  maxTokens: number;
  thinkingBudget?: number;
  bookSlug?: string;           // NEW — sets working directory to book root
  onEvent: (event: StreamEvent) => void;
}): Promise<void> {
  const { model, systemPrompt, messages, bookSlug, onEvent } = params;

  const conversationPrompt = this.buildConversationPrompt(messages);

  const args = [
    '--verbose',
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--model', model,
    '--system-prompt', systemPrompt,
    '--allowedTools', 'Read,Write,Edit,LS',
  ];

  // Set working directory to book root if bookSlug is provided
  const cwd = bookSlug
    ? path.join(this.booksDir, bookSlug)
    : undefined;

  // ... spawn with { cwd } option
```

**Tool use event parsing in `mapStreamEvent`:**

Add handling for tool use blocks:

```typescript
// content_block_start with type "tool_use"
if (eventType === 'content_block_start') {
  const contentBlock = event.content_block as Record<string, unknown> | undefined;
  const blockType = contentBlock?.type as string;

  if (blockType === 'tool_use') {
    const toolName = contentBlock?.name as string ?? 'unknown';
    const toolId = contentBlock?.id as string ?? '';
    setCurrentBlockType('tool_use');
    onEvent({
      type: 'toolUse',
      tool: { toolName, toolId, status: 'started' },
    });
    return;
  }

  if (blockType === 'tool_result') {
    setCurrentBlockType('tool_result');
    return;
  }

  // existing thinking/text handling...
}

// For tool_use blocks, accumulate the input JSON to extract file paths
if (eventType === 'content_block_delta') {
  const delta = event.delta as Record<string, unknown> | undefined;
  if (delta?.type === 'input_json_delta') {
    // Accumulate partial JSON for tool input
    const partialJson = delta.partial_json as string ?? '';
    appendToolInput(partialJson);
    return;
  }
  // existing text/thinking handling...
}

// On content_block_stop for tool_use, parse the accumulated input to extract file paths
if (eventType === 'content_block_stop') {
  if (currentBlockType === 'tool_use') {
    const toolInput = getToolInput();
    const filePath = extractFilePathFromToolInput(toolInput);
    if (filePath) {
      addChangedFile(filePath);
    }
    onEvent({
      type: 'toolUse',
      tool: {
        toolName: currentToolName,
        toolId: currentToolId,
        filePath,
        status: 'complete',
      },
    });
    clearToolInput();
    setCurrentBlockType(null);
    return;
  }
  // existing handling...
}
```

**Track changed files:**

Maintain a `changedFiles: string[]` array during the stream. When the CLI completes, emit a `filesChanged` event before the `done` event:

```typescript
// In the close handler, before emitting 'done':
if (changedFiles.length > 0) {
  onEvent({ type: 'filesChanged', paths: changedFiles });
}
```

**File path extraction:**

The tool input JSON for Write/Edit contains a `file_path` field. Parse it:

```typescript
private extractFilePathFromToolInput(toolName: string, jsonStr: string): string | undefined {
  try {
    const input = JSON.parse(jsonStr);
    if (toolName === 'Write' || toolName === 'Read' || toolName === 'Edit') {
      return input.file_path as string | undefined;
    }
  } catch {
    // Partial JSON may not parse — that's fine
  }
  return undefined;
}
```

**Keep `sendOneShot` in print mode:**

The Wrangler's one-shot call should stay in `--print` mode since it only needs text output. `sendOneShot` keeps `--print` in its args.

---

## Task 3: Update IClaudeClient Interface

### Update `src/domain/interfaces.ts`

Add `bookSlug` to the `sendMessage` params:

```typescript
export interface IClaudeClient {
  sendMessage(params: {
    model: string;
    systemPrompt: string;
    messages: { role: MessageRole; content: string }[];
    maxTokens: number;
    thinkingBudget?: number;
    bookSlug?: string;           // NEW
    onEvent: (event: StreamEvent) => void;
  }): Promise<void>;

  sendOneShot(params: {
    model: string;
    systemPrompt: string;
    userMessage: string;
    maxTokens: number;
  }): Promise<string>;

  isAvailable(): Promise<boolean>;
}
```

---

## Task 4: Update ChatService — Pass bookSlug to CLI and Add File-Writing Instructions

### Update `src/application/ChatService.ts`

**Pass `bookSlug` to the CLI call:**

```typescript
await this.claude.sendMessage({
  model: appSettings.model,
  systemPrompt,
  messages: assembled.conversationMessages,
  maxTokens: appSettings.maxTokens,
  thinkingBudget,
  bookSlug,             // NEW — enables agent tool use in book directory
  onEvent: (event: StreamEvent) => {
    // ... existing accumulation logic ...

    // Forward ALL events to the caller (including toolUse and filesChanged)
    onEvent(event);
  },
});
```

**Add system prompt instructions for file writing:**

Append file-writing instructions to the agent system prompt so agents know they can (and should) write files:

```typescript
// After building the systemPrompt with project context:
const fileInstructions = this.buildFileInstructions(pipelinePhase);
if (fileInstructions) {
  systemPrompt += fileInstructions;
}
```

Add a private method:

```typescript
private buildFileInstructions(pipelinePhase: PipelinePhaseId | null): string {
  // Only add file instructions for pipeline conversations
  if (!pipelinePhase) return '';

  return `

---

## File Writing

You have direct access to read and write files in this book's directory. When the author approves your output, **write it to the appropriate file** — do not just display it in chat.

Use the Write tool to save files. All paths are relative to the book root directory.

Key file paths:
- \`source/pitch.md\` — the approved pitch document
- \`source/voice-profile.md\` — the voice profile
- \`source/scene-outline.md\` — the scene-by-scene outline
- \`source/story-bible.md\` — characters, world, lore
- \`source/reader-report.md\` — Ghostlight's reader report
- \`source/dev-report.md\` — Lumen's development report
- \`source/audit-report.md\` — Sable's copy-edit audit
- \`source/project-tasks.md\` — Forge's revision task breakdown
- \`source/revision-prompts.md\` — Forge's per-chapter revision prompts
- \`source/style-sheet.md\` — Sable's style consistency rules
- \`source/metadata.md\` — Quill's publication metadata
- \`chapters/NN-slug/draft.md\` — chapter prose (Verity writes these)
- \`chapters/NN-slug/notes.md\` — chapter notes
- \`about.json\` — book metadata (title, author, status, etc.)

**Important rules:**
- Always ask for explicit approval before writing/overwriting a file
- When writing a new version of an existing file, confirm with the author first
- For chapters, use the format \`chapters/NN-slug-name/draft.md\` (e.g. \`chapters/01-the-awakening/draft.md\`)
- Write complete files — never partial updates unless using the Edit tool for targeted fixes
`;
}
```

---

## Task 5: Track Changed Files in ChatService

Add a field to track changed files per interaction:

```typescript
private lastChangedFiles: string[] = [];

// In the sendMessage onEvent handler, capture filesChanged:
if (event.type === 'filesChanged') {
  this.lastChangedFiles = event.paths;
}

// Public accessor
getLastChangedFiles(): string[] {
  return this.lastChangedFiles;
}
```

---

## Task 6: Update IPC Handlers — Auto-Refresh After Chat

### Update `src/main/ipc/handlers.ts`

After `chat:send` completes, check if files changed and emit a pipeline refresh hint:

```typescript
ipcMain.handle('chat:send', async (event, params: SendMessageParams) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) throw new Error('No window found');

  await services.chat.sendMessage({
    ...params,
    onEvent: (streamEvent) => {
      win.webContents.send('chat:streamEvent', streamEvent);
    },
  });

  // If files were changed during this interaction, notify the renderer
  const changedFiles = services.chat.getLastChangedFiles();
  if (changedFiles.length > 0) {
    win.webContents.send('chat:filesChanged', changedFiles);
  }
});
```

Remove the `chat:saveToFile` handler — it's no longer needed:

```typescript
// DELETE this handler:
// ipcMain.handle('chat:saveToFile', async (_, params: { ... }) =>
//   services.filePersistence.saveAgentOutput(params as ...)
// );
```

Remove `FilePersistenceService` from the handler dependencies.

---

## Task 7: Update Preload Bridge

### Update `src/preload/index.ts`

Remove `saveToFile` from the chat namespace:

```typescript
chat: {
  // ... existing methods ...
  // DELETE: saveToFile
  // ADD: listener for file change notifications
  onFilesChanged: (callback: (paths: string[]) => void) => {
    const handler = (_: Electron.IpcRendererEvent, paths: string[]) => callback(paths);
    ipcRenderer.on('chat:filesChanged', handler);
    return () => ipcRenderer.removeListener('chat:filesChanged', handler);
  },
},
```

---

## Task 8: Update MessageBubble — Remove Save Buttons, Add Tool Activity Indicator

### Update `src/renderer/components/Chat/MessageBubble.tsx`

**Remove entirely:**
- The `SaveState` type
- The `saveStates` state
- The `chapterSlugInput` and `activeChapterTarget` state
- The `targets` useMemo (based on `AGENT_OUTPUT_TARGETS`)
- The `handleSave`, `handleChapterTargetClick`, `handleChapterSave` callbacks
- The entire save buttons JSX block (`showSaveButtons && ...`)
- The chapter slug input JSX
- Imports: `AGENT_OUTPUT_TARGETS` from constants, `usePipelineStore`

**Add: Tool activity display**

When the assistant message was produced by an interaction that used tools, show a subtle indicator of what files were written. This info comes from `filesChanged` stream events captured by the chat store.

The `MessageBubble` receives `toolActivity?: string[]` as a prop (from the chat store's `messageToolActivity` map):

```tsx
type MessageBubbleProps = {
  message: Message;
  isUser: boolean;
  toolActivity?: string[];  // file paths written during this message's generation
};
```

Below the message content, show the tool activity:

```tsx
{toolActivity && toolActivity.length > 0 && (
  <div className="mt-2 rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2">
    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
      <span>📁</span>
      <span>{toolActivity.length} file{toolActivity.length !== 1 ? 's' : ''} written</span>
    </div>
    <div className="mt-1 space-y-0.5">
      {toolActivity.map((filePath) => (
        <div key={filePath} className="text-xs text-zinc-600 font-mono">
          {filePath}
        </div>
      ))}
    </div>
  </div>
)}
```

---

## Task 9: Update ChatStore — Handle Tool Use and File Change Events

### Update `src/renderer/stores/chatStore.ts`

Add new state fields:

```typescript
toolActivity: string[];                    // file paths written during current streaming response
lastChangedFiles: string[];                // files changed in the last completed interaction
messageToolActivity: Record<string, string[]>;  // maps message IDs to files written during generation
```

In the stream event handler, add cases:

```typescript
case 'toolUse':
  if (event.tool.status === 'complete' && event.tool.filePath) {
    set((state) => ({
      toolActivity: [...state.toolActivity, event.tool.filePath!],
    }));
  }
  break;

case 'filesChanged':
  set({ lastChangedFiles: event.paths });
  break;
```

When streaming completes (`done` event), associate the tool activity with the message and reset:

```typescript
case 'done':
  // ... existing message save logic ...
  const currentToolActivity = get().toolActivity;
  set((state) => ({
    // ... existing state updates ...
    messageToolActivity: currentToolActivity.length > 0
      ? { ...state.messageToolActivity, [newMessageId]: currentToolActivity }
      : state.messageToolActivity,
    toolActivity: [],
    lastChangedFiles: [],
  }));
  break;
```

---

## Task 10: Auto-Refresh Pipeline on File Changes

Register a listener for `chat:filesChanged` that triggers pipeline refresh:

```typescript
// In the chat store init or a dedicated setup function:
const cleanupFilesChanged = window.novelEngine.chat.onFilesChanged((_paths) => {
  // Refresh pipeline state when agent writes files
  const { activeSlug } = useBookStore.getState();
  if (activeSlug) {
    usePipelineStore.getState().loadPipeline(activeSlug);
  }
});
```

Ensure cleanup on store teardown.

---

## Task 11: Remove AGENT_OUTPUT_TARGETS and FilePersistenceService

### Update `src/domain/constants.ts`

Remove the `AGENT_OUTPUT_TARGETS` constant and its comment block entirely.

### Delete `src/application/FilePersistenceService.ts`

This service is no longer needed — agents write their own files.

### Update `src/application/index.ts`

Remove `FilePersistenceService` from the barrel export.

### Update `src/main/index.ts` (composition root)

- Remove `FilePersistenceService` instantiation and injection
- Update `ClaudeCodeClient` constructor to receive `booksDir`:

```typescript
const claude = new ClaudeCodeClient(booksDir);
```

- Remove `filePersistence` from the services object passed to `registerIpcHandlers`

---

## Task 12: Update Agent System Prompts for File Writing Awareness

### Update `agents/SPARK.md`

Add to the Build Mode section:

```markdown
### File Writing

You have direct access to the book directory via the Write tool. When the author approves a pitch and says "go":

1. Create `about.json` with the book metadata
2. Write `source/pitch.md` with the full pitch document
3. Write `source/voice-profile.md` with the seeded template
4. Write `source/story-bible.md` with the seeded characters
5. Write `source/scene-outline.md` with the empty template

Always confirm each file as you write it. The author can see file activity in real-time.
```

No other agent prompts need changes — the generic file-writing instructions from Task 4 cover all agents.

---

## Summary of Changes by File

| File | Change |
|------|--------|
| `src/domain/types.ts` | Add `ToolUseInfo` type, add `toolUse` and `filesChanged` to `StreamEvent`, extend `StreamBlockType`, remove `OutputTarget` |
| `src/domain/interfaces.ts` | Add `bookSlug` param to `IClaudeClient.sendMessage` |
| `src/domain/constants.ts` | Remove `AGENT_OUTPUT_TARGETS` constant |
| `src/infrastructure/claude-cli/ClaudeCodeClient.ts` | Drop `--print`, add `--cwd`/`--allowedTools`, parse tool use events, track changed files, accept `booksDir` in constructor |
| `src/application/ChatService.ts` | Pass `bookSlug` to CLI, add file-writing system prompt instructions, track changed files |
| `src/application/FilePersistenceService.ts` | **DELETE** |
| `src/application/index.ts` | Remove `FilePersistenceService` export |
| `src/main/index.ts` | Remove `FilePersistenceService`, update `ClaudeCodeClient` constructor, emit `chat:filesChanged` |
| `src/main/ipc/handlers.ts` | Remove `chat:saveToFile` handler, add post-chat file change notification, remove `FilePersistenceService` dependency |
| `src/preload/index.ts` | Remove `saveToFile`, add `onFilesChanged` listener |
| `src/renderer/components/Chat/MessageBubble.tsx` | Remove all save button logic, add tool activity indicator |
| `src/renderer/stores/chatStore.ts` | Handle `toolUse` and `filesChanged` events, track `messageToolActivity`, auto-refresh pipeline |
| `agents/SPARK.md` | Add file-writing instructions to Build Mode section |

---

## Architecture Notes

- **Layer boundaries preserved.** The CLI client (infrastructure) gains tool-use parsing. ChatService (application) gains file-writing instructions. Renderer removes save logic and adds tool activity display.
- **No new IPC channels.** We repurpose the existing `chat:streamEvent` channel to carry tool use events and add a `chat:filesChanged` notification.
- **Backward compatible with Wrangler.** The Wrangler's `sendOneShot` still uses `--print` mode — it doesn't need tool use.
- **Security maintained.** `--allowedTools Read,Write,Edit,LS` restricts agents to file operations only. `--cwd` scopes file access to the book directory. The CLI's own sandboxing prevents path traversal.
- **Pipeline detection is automatic.** When Spark writes `source/pitch.md`, the pipeline detects the pitch phase as complete on the next refresh — no manual save button needed.

---

## Verification

1. **Spark pitch flow:**
   - Start a new conversation with Spark on the pitch phase
   - Develop a pitch through conversation
   - Tell Spark "save the pitch" or "let's go, scaffold it"
   - Spark writes `source/pitch.md`, `about.json`, and seeded templates directly
   - The UI shows tool activity: "📁 4 files written" with the file paths
   - Pipeline automatically detects pitch phase as complete
   - No "Save as Pitch" button appears anywhere

2. **Tool activity in chat:**
   - When an agent writes a file, the message bubble shows a subtle file activity indicator
   - The indicator lists the files that were written

3. **Pipeline auto-refresh:**
   - After any agent writes files, the pipeline tracker updates automatically
   - No manual refresh or button click needed

4. **No save buttons:**
   - Message bubbles for assistant messages show NO save buttons
   - The `AGENT_OUTPUT_TARGETS` constant is gone
   - The `FilePersistenceService` is gone
   - The `chat:saveToFile` IPC channel is gone

5. **Wrangler unaffected:**
   - The Wrangler's `sendOneShot` still works in `--print` mode
   - Context assembly is unaffected

6. **Compilation:**
   - `npx tsc --noEmit` passes
   - No references to `OutputTarget`, `AGENT_OUTPUT_TARGETS`, `FilePersistenceService`, or `saveToFile` remain
