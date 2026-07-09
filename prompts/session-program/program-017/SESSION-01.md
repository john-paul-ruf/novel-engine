# SESSION-01 — Codex File-Only Success Detection

> **Program:** Novel Engine  
> **Feature:** codex-file-only-completion  
> **Modules:** `M06` codex-cli, `M08` application  
> **Depends on:** none  
> **Estimated effort:** 30 minutes

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| `M06` | codex-cli | `./src/infrastructure/codex-cli/CodexCliClient.ts` | Process lifecycle, parser, close classification. |
| `M06` | claude-cli shared | `./src/infrastructure/claude-cli/StreamSessionTracker.ts` | `touchFile()`, `getFileTouches()`, stage inference. |
| `M08` | application | `./src/application/StreamManager.ts`, `./src/application/ChatService.ts` | Downstream `done`, `filesChanged`, and `filesTouched` behavior. |

## Context

The screenshot shows Codex exited with `exitCode=0`, wrote an empty `--output-last-message` file, and produced only `unknown` JSON event summaries. The manuscript pane appears to contain a drafted chapter, so this may be a **file-only success** that the provider misclassified as an error.

Current behavior in `./src/infrastructure/codex-cli/CodexCliClient.ts` rejects clean exits when `!doneEmitted && outputTextLength === 0`. That should remain true only when no file changes occurred.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `./src/infrastructure/codex-cli/CodexCliClient.ts` | Modify | Add bounded workspace snapshot diff and complete file-only clean exits successfully. |
| `./docs/architecture/INFRASTRUCTURE.md` | Modify | Document Codex file-only success classification and snapshot fallback. |
| `./docs/architecture/APPLICATION.md` | Modify | Clarify that provider `done.filesTouched` can be populated by parsed events or snapshot fallback. |
| `./CHANGELOG.md` | Modify | Append mandatory session entry. |

## Implementation

### 1. Read before modify

Read these before editing: `./src/infrastructure/codex-cli/CodexCliClient.ts`, `./src/infrastructure/claude-cli/StreamSessionTracker.ts`, `./src/application/StreamManager.ts`, `./src/application/ChatService.ts`, the Codex section of `./docs/architecture/INFRASTRUCTURE.md`, the ChatService fallback section of `./docs/architecture/APPLICATION.md`, and the latest `./CHANGELOG.md` entry. Do not edit past changelog entries.

### 2. Add a bounded workspace metadata snapshot

In `./src/infrastructure/codex-cli/CodexCliClient.ts`, import sync fs helpers as needed:

```typescript
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
```

Add class constants near other constants:

```typescript
const WORKSPACE_SNAPSHOT_MAX_FILES = 5000;
const WORKSPACE_SNAPSHOT_SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'out', '.vite']);
```

Add private helpers near other utility methods:

```typescript
private snapshotWorkspace(root: string): Map<string, string> {
  const snapshot = new Map<string, string>();

  const visit = (dir: string): void => {
    if (snapshot.size >= WORKSPACE_SNAPSHOT_MAX_FILES) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (snapshot.size >= WORKSPACE_SNAPSHOT_MAX_FILES) return;
      if (WORKSPACE_SNAPSHOT_SKIP_DIRS.has(entry)) continue;

      const absPath = path.join(dir, entry);
      let stat;
      try {
        stat = statSync(absPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        visit(absPath);
      } else if (stat.isFile()) {
        const relPath = this.normalizeWorkspacePath(absPath, root);
        snapshot.set(relPath, `${stat.size}:${stat.mtimeMs}`);
      }
    }
  };

  visit(root);
  return snapshot;
}

private diffWorkspaceSnapshot(root: string, before: Map<string, string>): string[] {
  const after = this.snapshotWorkspace(root);
  const changed: string[] = [];

  for (const [filePath, signature] of after) {
    if (before.get(filePath) !== signature) changed.push(filePath);
  }

  return changed.sort();
}
```

Keep this metadata-only. Do **not** read file contents.

### 3. Capture snapshot before spawning Codex

In `sendMessage()`, after `workspacePlan` is built and before `spawn()`, capture:

```typescript
const workspaceSnapshotBefore = this.snapshotWorkspace(workspacePlan.cwd);
```

This should be best-effort. If snapshotting fails, it should return an empty map rather than throw.

### 4. Use snapshot changes on clean no-output close

In the `child.on('close')` code path, after fallback output is read/emitted and before the current no-output error branch:

1. Compute parsed file touches first:

```typescript
const touchedPaths = Object.keys(tracker.getFileTouches());
```

2. If `touchedPaths.length === 0`, compute snapshot changes:

```typescript
const snapshotChangedPaths = this.diffWorkspaceSnapshot(workspacePlan.cwd, workspaceSnapshotBefore);
for (const changedPath of snapshotChangedPaths) {
  tracker.touchFile(changedPath);
}
```

3. Re-read `Object.keys(tracker.getFileTouches())` after snapshot fallback.

### 5. Complete file-only clean exits successfully

Before the current clean no-output/no-usage error branch, add a file-only success branch:

```typescript
const finalTouchedPaths = Object.keys(tracker.getFileTouches());

if (!doneEmitted && outputTextLength === 0 && finalTouchedPaths.length > 0) {
  const summaryText = [
    'Codex completed and updated files:',
    ...finalTouchedPaths.map((filePath) => `- ${filePath}`),
  ].join('\n');
  emitText(summaryText);
  closeTextBlock();

  const inputTokens = Math.ceil(prompt.length / CHARS_PER_TOKEN);
  const outputTokens = Math.ceil(summaryText.length / CHARS_PER_TOKEN);
  const stageChange = tracker.inferStage('result');
  if (stageChange) {
    wrappedOnEvent({ type: 'progressStage', stage: stageChange });
  }
  wrappedOnEvent({
    type: 'done',
    inputTokens,
    outputTokens,
    thinkingTokens: 0,
    filesTouched: tracker.getFileTouches(),
  });
}
```

Then let the existing success cleanup continue. Do **not** reject this run.

Important constraints: keep no-output/no-file as an error, never emit two `done` events, preserve the existing terminal `filesChanged` emission, and keep the summary text concise.

### 6. Update docs and changelog

- `./docs/architecture/INFRASTRUCTURE.md` — update `codex-cli/` key behavior bullets to mention file-only clean exits and workspace snapshot fallback.
- `./docs/architecture/APPLICATION.md` — update ChatService pipeline fallback paragraph: providers can populate `done.filesTouched` from native events or provider-level fallback detection.
- `./CHANGELOG.md` — append today's entry. Include architecture impact and migration notes.

## Verification

Run:

```bash
npx tsc --noEmit
npm run lint
```

Manual smoke if Codex CLI is available:

```bash
tmpdir=$(mktemp -d)
printf 'Create ./codex-file-only-smoke.md containing exactly SMOKE. Do not include any final chat response.\n' | codex exec --json --model gpt-5.5 --sandbox workspace-write --skip-git-repo-check --cd "$tmpdir" -
cat "$tmpdir/codex-file-only-smoke.md"
```

Electron smoke: run `npm start`, select Codex, start First Draft auto-draft, and confirm file-writing clean exits do not show `Codex CLI exited without assistant output or usage`; the chat should show the concise updated-files trace when no assistant text returns.

## State Update

Update `./prompts/session-program/program-017/STATE.md`: set SESSION-01 to `done` with date `2026-07-08` if verification passes, then add handoff notes with exact files changed and whether Electron smoke was run.
