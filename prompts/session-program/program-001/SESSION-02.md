# SESSION-02 — CodexCliClient Infrastructure Module

> **Program:** Novel Engine
> **Feature:** codex-cli-support
> **Modules:** M11 (new: codex-cli)
> **Depends on:** SESSION-01
> **Estimated effort:** 30 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M01 | domain | `src/domain/interfaces.ts` (IModelProvider), `src/domain/types.ts` (StreamEvent) | Interface contract to implement |
| M06 | claude-cli | `src/infrastructure/claude-cli/ClaudeCodeClient.ts`, `StreamSessionTracker.ts` | Reference implementation — same spawn+NDJSON pattern |
| M11 | codex-cli | (new) | Creating this module |

## Context

The Codex CLI (`codex exec --json`) outputs JSONL events with the envelope `{"id":"N","msg":{"type":"...","..."}}`. The first two lines are config and prompt metadata (no `id` field). We need to parse these events and map them to the existing `StreamEvent` union type that the rest of the app already consumes.

### Codex JSONL Protocol (observed)

```
{"model":"gpt-5","workdir":"/tmp","approval":"never","provider":"openai",...}   <- config line
{"prompt":"..."}                                                                 <- prompt echo
{"id":"0","msg":{"type":"task_started","model_context_window":400000}}
{"id":"0","msg":{"type":"agent_message","content":"..."}}                        <- text output
{"id":"0","msg":{"type":"agent_reasoning","content":"..."}}                      <- thinking
{"id":"0","msg":{"type":"exec_command_begin","command":"...","id":"..."}}         <- tool: shell
{"id":"0","msg":{"type":"exec_command_output_delta","output":"..."}}              <- tool output
{"id":"0","msg":{"type":"patch_apply_begin","path":"...","patch":"..."}}          <- tool: file write
{"id":"0","msg":{"type":"agent_reasoning_raw_content","content":"..."}}           <- raw CoT
{"id":"0","msg":{"type":"stream_error","message":"..."}}                         <- retryable error
{"id":"0","msg":{"type":"error","message":"..."}}                                <- fatal error
```

### Event Mapping

| Codex Event | StreamEvent |
|-------------|-------------|
| `task_started` | (internal — store context_window) |
| `agent_message` | `blockStart('text')` + `textDelta` + `blockEnd('text')` |
| `agent_reasoning` / `agent_reasoning_raw_content` | `blockStart('thinking')` + `thinkingDelta` + `blockEnd('thinking')` |
| `exec_command_begin` | `toolUse({ status: 'started', toolName: 'Bash', filePath })` |
| `exec_command_output_delta` | (buffered for diagnostics) |
| `patch_apply_begin` | `toolUse({ status: 'started', toolName: 'Edit', filePath })` + touch file |
| `stream_error` | `warning` |
| `error` | `error` |
| process exit code 0 | `done` with token estimates |

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/infrastructure/codex-cli/CodexCliClient.ts` | Create | Full IModelProvider implementation |
| `src/infrastructure/codex-cli/index.ts` | Create | Barrel export |

## Implementation

### 1. Create barrel export

Create `src/infrastructure/codex-cli/index.ts`:

```typescript
export { CodexCliClient } from './CodexCliClient';
```

### 2. Create `CodexCliClient.ts`

Follow the structural pattern of `ClaudeCodeClient.ts`. Read that file first for reference.

#### Imports and constants

```typescript
import { spawn, type ChildProcess } from 'child_process';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { nanoid } from 'nanoid';

import type { IModelProvider, IDatabaseService } from '@domain/interfaces';
import type { MessageRole, StreamEvent, ProviderCapability, ProviderId, ModelInfo } from '@domain/types';
import { CHARS_PER_TOKEN, CODEX_CLI_PROVIDER_ID } from '@domain/constants';
import { StreamSessionTracker } from '../claude-cli/StreamSessionTracker';

const execFileAsync = promisify(execFile);

const CLI_NOT_FOUND_MESSAGE =
  'Codex CLI not found. Install it from https://github.com/openai/codex';

const ABORT_KILL_GRACE_MS = 2000;
```

#### Class declaration

```typescript
export class CodexCliClient implements IModelProvider {
  readonly providerId: ProviderId = CODEX_CLI_PROVIDER_ID;
  readonly capabilities: ProviderCapability[] = [
    'text-completion', 'tool-use', 'thinking', 'streaming',
  ];

  private _available: boolean | null = null;
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private processBookMap: Map<string, string> = new Map();

  constructor(
    private booksDir: string,
    private db: IDatabaseService,
  ) {}
}
```

#### `isAvailable()` — check via `codex --version`

```typescript
async isAvailable(): Promise<boolean> {
  if (this._available !== null) return this._available;
  try {
    await execFileAsync('codex', ['--version']);
    this._available = true;
    return true;
  } catch {
    this._available = false;
    return false;
  }
}

invalidateAvailabilityCache(): void {
  this._available = null;
}
```

#### Process tracking (same as ClaudeCodeClient)

```typescript
hasActiveProcesses(): boolean {
  return this.activeProcesses.size > 0;
}

hasActiveProcessesForBook(bookSlug: string): boolean {
  for (const slug of this.processBookMap.values()) {
    if (slug === bookSlug) return true;
  }
  return false;
}

abortStream(conversationId: string): void {
  const child = this.activeProcesses.get(conversationId);
  if (!child) return;
  this.activeProcesses.delete(conversationId);
  child.kill('SIGTERM');
  const forceKillTimer = setTimeout(() => {
    try { if (!child.killed) child.kill('SIGKILL'); } catch { /* */ }
  }, ABORT_KILL_GRACE_MS);
  child.once('close', () => clearTimeout(forceKillTimer));
}
```

#### Static model discovery

```typescript
/**
 * Read the Codex CLI's cached model list from ~/.codex/models_cache.json.
 * Returns ModelInfo[] suitable for ProviderConfig.models.
 */
static async fetchAvailableModels(): Promise<ModelInfo[]> {
  try {
    const cachePath = path.join(os.homedir(), '.codex', 'models_cache.json');
    const raw = await fs.readFile(cachePath, 'utf-8');
    const data = JSON.parse(raw) as {
      models: Array<{
        slug: string;
        display_name: string;
        description: string;
        context_window?: number;
        supported_reasoning_levels?: Array<{ effort: string }>;
      }>;
    };

    return data.models
      .filter(m => m.slug && m.display_name)
      .map(m => ({
        id: m.slug,
        label: m.display_name,
        description: m.description ?? '',
        providerId: CODEX_CLI_PROVIDER_ID,
        contextWindow: m.context_window,
        supportsThinking: (m.supported_reasoning_levels?.length ?? 0) > 0,
        supportsToolUse: true,
      }));
  } catch {
    return [];
  }
}
```

#### `sendMessage()` — main method

Build the CLI args:

```typescript
async sendMessage(params: {
  model: string;
  systemPrompt: string;
  messages: { role: MessageRole; content: string }[];
  maxTokens: number;
  thinkingBudget?: number;
  maxTurns?: number;
  bookSlug?: string;
  workingDir?: string;
  sessionId?: string;
  conversationId?: string;
  onEvent: (event: StreamEvent) => void;
}): Promise<void> {
  const { model, systemPrompt, messages, bookSlug, workingDir } = params;
  const sessionId = params.sessionId || nanoid();
  const conversationId = params.conversationId ?? '';
  const tracker = new StreamSessionTracker(sessionId);
  let doneEmitted = false;

  const conversationPrompt = this.buildConversationPrompt(systemPrompt, messages);

  const cwd = workingDir ?? (bookSlug ? path.join(this.booksDir, bookSlug) : this.booksDir);

  const args = [
    'exec',
    '--json',
    '--full-auto',
    '--skip-git-repo-check',
    '--model', model,
    '-C', cwd,
    '-', // read prompt from stdin
  ];

  if (params.thinkingBudget && params.thinkingBudget > 0) {
    args.push('-c', 'reasoning_effort="high"');
  }
```

Then follow the **exact same spawn pattern** as `ClaudeCodeClient.sendMessage()`:
- Same `wrappedOnEvent` with batch persistence (copy from ClaudeCodeClient lines 136-189)
- `spawn('codex', args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env }, cwd })`
- Track child in `activeProcesses` and `processBookMap`
- Write `conversationPrompt` to `child.stdin`, then `child.stdin.end()`
- Handle stdin EPIPE (same pattern)
- Buffer stdout by newline, parse each line:
  - Try `JSON.parse(line)` — if it has `id` and `msg` fields, call `this.processCodexEvent(parsed.msg, tracker, wrappedOnEvent)`
  - If no `id` field (config/prompt metadata lines), skip
  - If parse fails, save to diagnostics array
- On `child.close`: flush batch, emit `filesChanged` if any touched, emit synthetic `done` if code 0 and no done yet, or emit error if code != 0
- Clean up `activeProcesses` and `processBookMap`

#### Event processor

```typescript
private processCodexEvent(
  msg: Record<string, unknown>,
  tracker: StreamSessionTracker,
  onEvent: (event: StreamEvent) => void,
): void {
  const eventType = msg.type as string;

  if (eventType === 'task_started') return;

  if (eventType === 'agent_message') {
    const content = msg.content as string ?? '';
    if (!content) return;
    const needsSep = tracker.getHasEmittedText();
    tracker.setCurrentBlockType('text');
    tracker.markTextEmitted();
    onEvent({ type: 'blockStart', blockType: 'text' });
    if (needsSep) onEvent({ type: 'textDelta', text: '\n\n' });
    onEvent({ type: 'textDelta', text: content });
    onEvent({ type: 'blockEnd', blockType: 'text' });
    tracker.setCurrentBlockType(null);
    return;
  }

  if (eventType === 'agent_reasoning' || eventType === 'agent_reasoning_raw_content') {
    const content = msg.content as string ?? '';
    if (!content) return;
    tracker.setCurrentBlockType('thinking');
    onEvent({ type: 'blockStart', blockType: 'thinking' });
    tracker.appendThinkingBuffer(content);
    onEvent({ type: 'thinkingDelta', text: content });
    onEvent({ type: 'blockEnd', blockType: 'thinking' });
    const summary = tracker.extractThinkingSummary();
    if (summary) onEvent({ type: 'thinkingSummary', summary });
    tracker.resetThinkingBuffer();
    tracker.setCurrentBlockType(null);
    return;
  }

  if (eventType === 'exec_command_begin') {
    const toolId = (msg.id as string) ?? nanoid();
    tracker.startTool(toolId);
    onEvent({
      type: 'toolUse',
      tool: { toolName: 'Bash', toolId, filePath: undefined, status: 'started' },
    });
    const stage = tracker.inferStage('toolUse', 'Bash', undefined);
    if (stage) onEvent({ type: 'progressStage', stage });
    tracker.setCurrentToolName('Bash');
    tracker.setCurrentToolId(toolId);
    return;
  }

  if (eventType === 'patch_apply_begin') {
    const filePath = msg.path as string ?? '';
    const toolId = nanoid();
    tracker.startTool(toolId);
    if (filePath) tracker.touchFile(filePath);
    onEvent({
      type: 'toolUse',
      tool: { toolName: 'Edit', toolId, filePath, status: 'started' },
    });
    const stage = tracker.inferStage('toolUse', 'Edit', filePath);
    if (stage) onEvent({ type: 'progressStage', stage });
    const toolInfo = { toolName: 'Edit', toolId, filePath, status: 'complete' as const };
    onEvent({ type: 'toolUse', tool: toolInfo });
    const timestamped = tracker.endTool(toolInfo);
    onEvent({ type: 'toolDuration', tool: timestamped });
    return;
  }

  if (eventType === 'stream_error') {
    onEvent({ type: 'warning', message: msg.message as string ?? 'Stream error' });
    return;
  }

  if (eventType === 'error') {
    onEvent({ type: 'error', message: msg.message as string ?? 'Codex CLI error' });
    return;
  }
}
```

#### Conversation prompt builder

```typescript
private buildConversationPrompt(
  systemPrompt: string,
  messages: { role: MessageRole; content: string }[],
): string {
  const parts: string[] = [];
  if (systemPrompt) {
    parts.push(`<system>\n${systemPrompt}\n</system>`);
  }
  for (const msg of messages) {
    if (msg.role === 'user') {
      parts.push(msg.content);
    } else if (msg.role === 'assistant') {
      parts.push(`<previous_response>\n${msg.content}\n</previous_response>`);
    }
  }
  return parts.join('\n\n');
}
```

## Verification

```bash
npx tsc --noEmit
```

Verify:
- `CodexCliClient` compiles and implements `IModelProvider` fully
- `StreamSessionTracker` import from `../claude-cli/` resolves (it's already exported)
- No `any` types
- All async operations have error handling

## State Update

Set SESSION-02 status to `done`. Note: CodexCliClient created, not yet registered in app.
