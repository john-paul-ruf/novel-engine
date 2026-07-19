# SESSION-01 — Fix Windows path-separator failures (3 tests)

> **Program:** Novel Engine
> **Feature:** windows-path-separator-fixes
> **Modules:** M16 (test), M06 (claude-cli), M11 (codex-cli)
> **Depends on:** none
> **Estimated effort:** 15 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M16 | test | `src/test/fakes.ts` | Fake `getPitchDraftPath` builds paths with hardcoded `/` |
| M06 | claude-cli | `src/infrastructure/claude-cli/ClaudeCodeClient.test.ts` | Test hardcodes `/` in expected cwd |
| M11 | codex-cli | `src/infrastructure/codex-cli/CodexCliClient.ts` | `normalizeWorkspacePath` emits `\` separators on Windows |

## Context

The full suite passes on macOS/Linux but fails on the Windows CI box with 3
path-separator failures (see `input-files/ci-failure-log.md`). Two are test-side bugs
(assertions/fakes hardcode `/` where the code under test correctly uses native
`path.join`), one is a production bug (`CodexCliClient` leaks native separators into
domain-facing book-relative `filePath` values, which are POSIX-`/` by convention —
they key `filesTouched` maps and render in the UI).

Guiding rule: **absolute filesystem paths use native separators (`path.join`);
book-relative display paths use POSIX `/`.**

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/test/fakes.ts` | Modify | `getPitchDraftPath` fake uses `path.join`; add `node:path` import |
| `src/infrastructure/claude-cli/ClaudeCodeClient.test.ts` | Modify | cwd assertion uses `path.join`; add `node:path` import |
| `src/infrastructure/codex-cli/CodexCliClient.ts` | Modify | `normalizeWorkspacePath` converts `path.sep` → `/` |

## Implementation

### 1. Align the FakeFileSystem draft path with the real implementation (src/test/fakes.ts)

Read `src/test/fakes.ts`. It currently has no `node:path` import (only `vitest` +
type imports at the top). Add:

```typescript
import path from 'node:path';
```

At line ~255, change:

```typescript
getPitchDraftPath: (conversationId: string) => `${fake.pitchDraftBase}/${conversationId}`,
```

to:

```typescript
getPitchDraftPath: (conversationId: string) => path.join(fake.pitchDraftBase, conversationId),
```

Also update the doc comment at line ~198 (`` `${pitchDraftBase}/${conversationId}` ``)
to say `path.join(pitchDraftBase, conversationId)`. This matches the real
`FileSystemService.getPitchDraftPath` (`src/infrastructure/filesystem/FileSystemService.ts:887`),
which uses `path.join`.

### 2. Platform-aware cwd assertion (src/infrastructure/claude-cli/ClaudeCodeClient.test.ts)

Read the file. It has no `node:path` import. Add:

```typescript
import path from 'node:path';
```

At line 182, change:

```typescript
expect(options.cwd).toBe(`${BOOKS_DIR}/my-book`);
```

to:

```typescript
expect(options.cwd).toBe(path.join(BOOKS_DIR, 'my-book'));
```

Do NOT change line 180 (`--add-dir ${BOOKS_DIR}`) — `BOOKS_DIR` is passed through
verbatim by production code, so that assertion is platform-safe.

### 3. POSIX-normalize relative workspace paths (src/infrastructure/codex-cli/CodexCliClient.ts)

Read `normalizeWorkspacePath` (lines 907–911):

```typescript
private normalizeWorkspacePath(filePath: string, workspaceCwd: string): string {
  if (!path.isAbsolute(filePath)) return filePath;
  const relativePath = path.relative(workspaceCwd, filePath);
  return relativePath && !relativePath.startsWith('..') ? relativePath : filePath;
}
```

Change the success branch to emit POSIX separators (book-relative display path
convention), leaving the fallthrough (absolute path outside the workspace) untouched:

```typescript
private normalizeWorkspacePath(filePath: string, workspaceCwd: string): string {
  if (!path.isAbsolute(filePath)) return filePath;
  const relativePath = path.relative(workspaceCwd, filePath);
  if (!relativePath || relativePath.startsWith('..')) return filePath;
  // Book-relative paths are display/domain values — always POSIX separators
  return relativePath.split(path.sep).join('/');
}
```

Update the method's JSDoc (if present) to note the POSIX guarantee.

## Verification

1. `npx tsc --noEmit` — clean.
2. Targeted tests:
   ```bash
   npx vitest run src/application/PitchRoomService.test.ts src/infrastructure/claude-cli/ClaudeCodeClient.test.ts src/infrastructure/codex-cli/CodexCliClient.stream.test.ts
   ```
3. `npm test` — full suite green (must stay green on macOS; the three fixes are
   no-ops on POSIX since `path.sep === '/'`).
4. Architecture compliance: no layer boundaries crossed (test util + infra-internal
   changes only), no `any`, no new modules.
5. If a Windows box/CI is available, re-run the Windows job to confirm 1388/1388.

## State Update

Update `prompts/session-program/program-029/STATE.md`:
- SESSION-01 status → `done`, completion date, note which of the three files changed.
- Handoff note: confirm whether Windows CI was re-run or is pending external verification.
