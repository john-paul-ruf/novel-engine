# State Tracker — Novel Engine / fix-pitch-promotion-chat

## Program
Novel Engine — `/Users/the.phoenix/WebstormProjects/novel-engine/`

## Feature
fix-pitch-promotion-chat

## Intent
Pitches developed in the Pitch Room are never promoted to books when the author asks in
chat: local-provider tool sandboxing blocks Spark's writes to the books directory, the
agent template references a Bash tool that local providers don't have, and the existing
`pitchRoom:promote` backend path has no UI trigger. Extended (user request): give
Ollama/llama-server the same tool surface as Claude CLI — Read, Write, Edit, LS, and
Bash(mkdir/cat/mv/cp/ls/find/wc/rm/rmdir).

## Sessions
6 sessions. SESSION-03 and SESSION-06 are independent; 01 → 02, 01 → 04 → 05.

## Session Status

| # | Session | Modules | Status | Completed | Notes |
|---|---------|---------|--------|-----------|-------|
| 01 | Widen ToolExecutor sandbox to books root | M11, M12 | done | 2026-07-08 | `additionalRoots: string[] = []` added to constructor; both clients pass `[this.booksDir]` |
| 02 | Provider-agnostic PITCH-ROOM.md build instructions | M04 | done | 2026-07-08 | Content-only edit; Bash now optional, failure-reporting added |
| 03 | "Promote to Book" button fallback | M10 | done | 2026-07-08 | Manual GUI smoke deferred to end-to-end check |
| 04 | BashEmulator — sandboxed coreutils module | M11 | done | 2026-07-08 | Module unreferenced until 05, compiles + barrel-exported |
| 05 | Wire Bash tool into local-provider agent loop | M11, M12 | pending | — | Requires 04; llama-server picks it up with no edits |
| 06 | Codex writable_roots sandbox fallback | M13 | pending | — | Parallel-safe; verified against codex-cli 0.27.0 |

## Dependency Graph

```
SESSION-01 ──▶ SESSION-02
SESSION-01 ──▶ SESSION-04 ──▶ SESSION-05
SESSION-03 (independent)
SESSION-06 (independent)
```

## Architecture Reference (feature-specific)

Module IDs M11–M14 are new provider modules not yet in the FORGE-CONFIG registry
(registry addition proposed below — apply when FORGE-CONFIG is next revised):

| ID | Module | Path | Owns | Imports From | Key Files |
|----|--------|------|------|-------------|-----------|
| `M11` | ollama-cli | `src/infrastructure/ollama-cli/` | Ollama chat streaming, tool schema, ToolExecutor sandbox, context compaction | `M01`, `M03` | `OllamaCodeClient.ts, ToolExecutor.ts, tools.ts` |
| `M12` | llama-server | `src/infrastructure/llama-server/` | llama.cpp server client (OpenAI-format), reuses M11 ToolExecutor | `M01`, `M03`, `M11` | `LlamaServerClient.ts` |
| `M13` | codex-cli | `src/infrastructure/codex-cli/` | Spawns `codex exec`, workspace plan (`--add-dir` detection) | `M01` | `CodexCliClient.ts` |
| `M14` | providers | `src/infrastructure/providers/` | Provider registry/routing, generic OpenAI-compatible provider | `M01` | `ProviderRegistry.ts, OpenAiCompatibleProvider.ts` |

**Chat-promotion flow (intended):**
`pitchRoomStore.sendMessage` → IPC `chat:send` → `ChatService.handleChat` (purpose
`pitch-room`) → `PitchRoomService.handleMessage` (workingDir = draft dir, system prompt =
agent + `PITCH-ROOM.md` with `{{BOOKS_PATH}}` substituted) → provider agent loop → Spark
writes `{books}/{slug}/…` → `BooksDirWatcher` → `books:changed` → `bookStore.loadBooks()`.

**Manual promotion flow (SESSION-03):**
Header button → `window.novelEngine.pitchRoom.promote(convId)` → IPC `pitchRoom:promote`
→ `FileSystemService.promotePitchToBook` → `hooks.onActiveBookChanged(slug)`.

## Scope Summary

| Module | Files Touched |
|--------|---------------|
| M11 ollama-cli | `ToolExecutor.ts`, `OllamaCodeClient.ts`, `tools.ts`, `BashEmulator.ts` (new), `index.ts` |
| M12 llama-server | `LlamaServerClient.ts` (SESSION-01 only; SESSION-05 pickup is import-only) |
| M13 codex-cli | `CodexCliClient.ts` (workspace plan only) |
| M04 agents | `agents/PITCH-ROOM.md` (content only) |
| M10 renderer | `pitchRoomStore.ts`, `PitchRoomView.tsx` |

## Design Decisions

1. **Widen the sandbox instead of passing a bookSlug** — pitch-room drafts live *inside*
   the books dir; granting the books root as an additional allowed root gives local
   providers exact parity with Claude CLI's `--add-dir {booksDir}` and keeps
   `PitchRoomService` provider-agnostic.
2. **`additionalRoots: string[]` (not a single `booksDir` param)** — future-proof for
   series dir or userData additions without another signature change.
3. **Keep chat-driven scaffolding AND add a manual button** — the model path is the
   designed UX but inherently unreliable on small local models; the button is the
   deterministic guarantee. Both converge on the same on-disk book layout.
4. **`path.relative`-based boundary check** — fixes the `startsWith` sibling-prefix hole
   (`books/foo` root admitting `books/foo-evil`) while touching the same function.
5. **No auto-switch on watcher events** — auto-switching the active book on any directory
   change is risky (imports, syncs); only the explicit button promotes-and-switches.
6. **Bash parity via emulation, not a real shell** — the nine whitelisted commands
   (mirroring `ClaudeCodeClient` `--allowedTools`) are implemented with Node `fs` APIs:
   cross-platform (Windows lacks coreutils), zero shell-injection surface, and every path
   argument passes through the SESSION-01 `resolveSafe` sandbox. Pipes/redirection/chaining
   are rejected with model-readable errors.
7. **`Bash` stays out of the static `WRITE_TOOLS` set** — write-ness is per-command
   (`mkdir` vs `cat`), so it is reported dynamically via `ToolResult.isWrite`; the
   pre-execution progress-stage inference misclassifying `Bash` as `reading` is an accepted
   cosmetic trade-off.
8. **Codex needs no app-defined tools** — it ships native shell/file tools; only its
   sandbox needed widening. On Codex CLIs without `--add-dir` (0.27.0 installed), inject
   `-c 'sandbox_workspace_write.writable_roots=["{booksDir}"]'` — empirically verified via
   `codex debug seatbelt` (2026-07-08): blocked without override, allowed with it, cwd
   still writable. `--add-dir` remains preferred when the probe detects it.

## Handoff Notes

*(agents append after each session)*

### SESSION-01 (2026-07-08)

- `ToolExecutor` constructor is now `(bookDir: string, additionalRoots: string[] = [])` —
  future tool work (SESSION-04/05 BashEmulator) must route every path through the updated
  `resolveSafe`, which checks the working dir plus all additional roots via `path.relative`
  (sibling-prefix hole fixed).
- `OllamaCodeClient` and `LlamaServerClient` both pass `[this.booksDir]`; no other call
  sites exist (`grep "new ToolExecutor"` verified).
- `npx tsc --noEmit` clean.

### SESSION-02 (2026-07-08)

- `agents/PITCH-ROOM.md` now assumes Write-creates-parents semantics (Bash/mkdir optional
  only) and no longer claims the app auto-switches to the new book; Spark is instructed to
  report Write failures and point at the "Promote to Book" button (added in SESSION-03).
- Session prompt said the `{{BOOKS_PATH}}` count was 4; the actual pre-edit count was 6 —
  unchanged by the edit, which is the real invariant. No placeholders touched.

### SESSION-03 (2026-07-08)

- `pitchRoomStore` gained `hasPitch`/`isPromoting` state and
  `refreshDraftStatus`/`promoteActivePitch` actions; refresh runs after
  `setActiveConversation`, both `ensureConversation` branches, and stream `onDone`.
- Header button in `PitchRoomView` promotes then `loadBooks()` + `setActiveBook(slug)`
  (which navigates to workspace).
- Chat promotion (01/02) and the button coexist: if Spark scaffolds directly, the draft
  keeps its `pitch.md` and the button remains until the draft is shelved/discarded —
  acceptable; future UX polish could hide it once a matching book exists.
- Manual smoke (button appears after Spark writes `source/pitch.md`, promote → book active,
  draft leaves the rail) still needs a human `npm start` pass.

### SESSION-04 (2026-07-08)

- New `src/infrastructure/ollama-cli/BashEmulator.ts`. Public surface for SESSION-05:
  `new BashEmulator(resolvePath)` + `run(command): Promise<BashResult>` where
  `BashResult = { output: string; isWrite: boolean; filePath?: string }`.
- Every `run()` failure throws `Error` with a model-readable message. Key strings:
  `Unsupported shell syntax: "{seq}". …` (metacharacters), `Unterminated quote in command`,
  `Empty command`, `Command not allowed: "{cmd}". Allowed: mkdir, cat, mv, cp, ls, find,
  wc, rm, rmdir`, and per-command usage hints (`mv requires: mv <source> <dest>` etc.).
- Deviation from prompt sketch: no module-level `WRITE_COMMANDS` set — each command
  returns its `isWrite` literal directly (the set would have been dead code). SESSION-05
  must use `BashResult.isWrite` dynamically (per Design Decision 7), never a static set.
- `filePath` is reported as originally given (dest for `mv`/`cp`, last path otherwise).
