# SESSION-01 — Surface Silent Codex CLI Exits as Errors

> **Program:** Novel Engine
> **Feature:** fix-codex-silent-exit
> **Modules:** M13 (codex-cli), M08 (application stream lifecycle), docs/changelog
> **Depends on:** none
> **Estimated effort:** 30 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M13 | codex-cli | `./src/infrastructure/codex-cli/CodexCliClient.ts` | Primary fix: process lifecycle, JSONL parsing, diagnostics |
| M06 | claude-cli | `./src/infrastructure/claude-cli/ClaudeCodeClient.ts` | Reference for stream lifecycle/error propagation |
| M08 | application | `./src/application/StreamManager.ts` | Confirm `error` events clean up sessions and reach renderer |
| M01 | domain | `./src/domain/types.ts` | Confirm `StreamEvent` shapes before reusing events |
| Docs | architecture | `./docs/architecture/INFRASTRUCTURE.md`, `./CHANGELOG.md` | Required updates after source change |

## Context

User report: Codex CLI is selected, the app starts using it, then it quits before ten seconds with no error. Current `CodexCliClient` can hide this: if the child exits with code `0` and no `turn.completed` usage event, it emits synthetic `done` even when `outputTextLength === 0`. That converts a no-output CLI exit into a successful empty assistant message.

Fix: **no assistant text + no usage + close = `error`**, not `done`. Preserve synthetic `done` only when meaningful assistant text streamed but usage was missing.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `./src/infrastructure/codex-cli/CodexCliClient.ts` | Modify | Track duration/output diagnostics; emit/reject actionable errors for silent exits and native Codex error events |
| `./docs/architecture/INFRASTRUCTURE.md` | Modify | Document Codex silent-exit diagnostics |
| `./CHANGELOG.md` | Modify | Append mandatory entry |

## Implementation

### 1. Read before editing

Read `./src/infrastructure/codex-cli/CodexCliClient.ts` fully. Make surgical changes in `sendMessage`, `processOutputLine`, and helper extraction methods.

### 2. Track bounded process diagnostics

Inside `sendMessage`, before the promise, add state:

```typescript
const startedAt = Date.now();
let parsedJsonEventCount = 0;
let nonJsonStdoutTail = '';
let lastStatusMessage = '';
let terminalErrorMessage = '';
```

Add a private helper:

```typescript
private appendTail(current: string, chunk: string, maxChars = 4000): string {
  const next = current + chunk;
  return next.length > maxChars ? next.slice(next.length - maxChars) : next;
}
```

Use it for stderr and non-JSON stdout diagnostics so errors remain bounded.

### 3. Return parse metadata from `processOutputLine`

Change `processOutputLine` to return:

```typescript
type CodexLineResult = {
  parsedJson: boolean;
  nonJsonText?: string;
  statusMessage?: string;
  errorMessage?: string;
  emittedText: boolean;
  emittedUsageDone: boolean;
};
```

Rules:

- Empty line: no parse, no text.
- Non-JSON line in `--json` mode: do **not** emit as assistant text. Return it as `nonJsonText`.
- Parsed JSON: keep existing text/status/usage extraction.
- Native Codex error JSON: close any open text block, emit `StreamEvent { type: 'error', message }`, and return `errorMessage`.

Add permissive error extraction:

```typescript
private extractError(event: Record<string, unknown>): string {
  const type = this.getString(event, 'type') ?? '';
  const level = this.getString(event, 'level') ?? '';
  const message = this.getString(event, 'message') ?? this.getString(event, 'msg');
  const error = event.error;

  if (typeof error === 'string') return error;
  if (this.isRecord(error)) {
    return this.getString(error, 'message') ?? this.getString(error, 'msg') ?? JSON.stringify(error);
  }
  if (type.toLowerCase().includes('error') || level.toLowerCase() === 'error') {
    return message ?? type;
  }
  const item = event.item;
  if (this.isRecord(item)) {
    const itemType = this.getString(item, 'type') ?? '';
    if (itemType.toLowerCase().includes('error')) {
      return this.getString(item, 'message') ?? this.getString(item, 'text') ?? itemType;
    }
  }
  return '';
}
```

Call `extractError` before `extractStatus`.

### 4. Use parse metadata while streaming

In `child.stdout.on('data')` and the final `stdoutBuffer` flush, update diagnostics:

```typescript
const result = this.processOutputLine(line, emitText, wrappedOnEvent, tracker, closeTextBlock);
if (result.parsedJson) parsedJsonEventCount += 1;
if (result.nonJsonText) nonJsonStdoutTail = this.appendTail(nonJsonStdoutTail, `${result.nonJsonText}\n`);
if (result.statusMessage) lastStatusMessage = result.statusMessage;
if (result.errorMessage) terminalErrorMessage = result.errorMessage;
```

For `stderrBuffer`, append chunks with `appendTail` instead of growing unbounded.

### 5. Convert silent close to `error`

In `child.on('close', (code, signal) => { ... })`, compute `elapsedMs`, `stderr`, and `stdoutTail`.

Add a helper to build diagnostic messages:

```typescript
private buildCodexExitMessage(params: {
  summary: string;
  code: number | null;
  signal: NodeJS.Signals | null;
  elapsedMs: number;
  workspaceMode: CodexWorkspacePlan['mode'];
  parsedJsonEventCount: number;
  lastStatusMessage: string;
  stderr: string;
  stdoutTail: string;
}): string {
  const parts = [
    params.summary,
    `exitCode=${params.code ?? 'null'}`,
    `signal=${params.signal ?? 'null'}`,
    `elapsedMs=${params.elapsedMs}`,
    `workspaceMode=${params.workspaceMode}`,
    `jsonEvents=${params.parsedJsonEventCount}`,
  ];
  if (params.lastStatusMessage) parts.push(`lastStatus=${params.lastStatusMessage}`);
  if (params.stderr) parts.push(`stderr=${params.stderr}`);
  if (params.stdoutTail) parts.push(`stdout=${params.stdoutTail}`);
  return parts.join('\n');
}
```

For `code === 0`, branch in this order:

1. If `terminalErrorMessage`: cleanup and reject. Do not emit duplicate error.
2. If `!doneEmitted && outputTextLength === 0`: emit one diagnostic `error`, cleanup, reject.
3. Else if `!doneEmitted`: keep existing synthetic `done` behavior.
4. Else cleanup and resolve.

For non-zero exits, use the same diagnostic helper instead of `stderr || Codex CLI exited with code ...`.

### 6. Preserve cleanup guarantees

Every new failure path must:

1. Emit or have already emitted `{ type: 'error', message }`.
2. Call `cleanup()` before `reject(new Error(message))`.

`StreamManager` will end the stream session and forward the error to the renderer.

### 7. Update docs required by `./AGENTS.MD`

- Append a `2026-07-08` entry to `./CHANGELOG.md`.
- Update only the Codex CLI part of `./docs/architecture/INFRASTRUCTURE.md`.
- Mention no-output success is now an error; text-without-usage still gets synthetic `done`.

## Verification

Run:

```bash
npx tsc --noEmit
```

Manual smoke:

1. Select Codex CLI as active provider.
2. Send a small chat prompt.
3. If Codex exits early, UI must show diagnostic error instead of silently ending.
4. If Codex returns text but omits usage, app may synthesize `done` and save response.

## State Update
Update `./prompts/session-program/program-015/STATE.md` with status, date, verification result, observed Codex diagnostics, and any renderer UX follow-up.
