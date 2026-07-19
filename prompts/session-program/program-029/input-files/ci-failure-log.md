# Input — Windows CI Failure Log (2026-07-19)

Reported by user: "tests fail on windows box". Full suite: 3 failed | 1385 passed.

## Failure 1 — PitchRoomService.test.ts:131

```
FAIL src/application/PitchRoomService.test.ts > provider call > creates the per-conversation draft directory and uses it as workingDir
Expected: "C:\Users\RUNNER~1\AppData\Local\Temp\novel-engine-test-gchi5Q\drafts\conv-5"
Received: "C:\Users\RUNNER~1\AppData\Local\Temp\novel-engine-test-gchi5Q\drafts/conv-5"
```

Test asserts `path.join(tempDir, 'drafts', conversation.id)` (native separators) but the
fake `getPitchDraftPath` in `src/test/fakes.ts:255` builds the path with a hardcoded `/`:
`` (conversationId) => `${fake.pitchDraftBase}/${conversationId}` ``.
The real `FileSystemService.getPitchDraftPath` (line 887) uses `path.join` — the fake
diverges from the real implementation. **Fix the fake.**

## Failure 2 — ClaudeCodeClient.test.ts:182

```
FAIL src/infrastructure/claude-cli/ClaudeCodeClient.test.ts > sendMessage — spawn contract
Expected: "/fake/books/my-book"
Received: "\fake\books\my-book"
```

Production (`ClaudeCodeClient.ts:248`) correctly derives cwd via
`path.join(this.booksDir, bookSlug)`. The test hardcodes `` `${BOOKS_DIR}/my-book` ``.
**Fix the test** to expect `path.join(BOOKS_DIR, 'my-book')`.

## Failure 3 — CodexCliClient.stream.test.ts:165

```
FAIL src/infrastructure/codex-cli/CodexCliClient.stream.test.ts > tool + file-change events
- "filePath": "chapters/01/draft.md"
+ "filePath": "chapters\\01\\draft.md"
```

`CodexCliClient.normalizeWorkspacePath` (line 907–911) returns `path.relative(...)`
verbatim, which produces backslash separators on Windows. Domain `filePath` values are
book-relative display paths consumed by the renderer and used as `filesTouched` keys —
convention throughout the codebase is POSIX `/` separators. **Fix production** to
convert `path.sep` to `/` in the relative branch.

## Non-issues checked during analysis

- `src/infrastructure/ollama-cli/ToolExecutor.ts:261` — uses `path.relative` only for a
  containment check (`rel.startsWith('..')`), platform-safe. No change.
- No other `` `${BOOKS_DIR}/...` `` hardcoded-separator assertions found in tests.
