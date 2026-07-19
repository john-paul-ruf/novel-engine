# State Tracker — Novel Engine / exhaustive-test-coverage

## Program
Novel Engine — Electron 33 / React 18 / TypeScript 5 desktop app, Clean Architecture (5 layers).

## Feature
`exhaustive-test-coverage` — establish a Vitest test stack and build exhaustive unit/integration
coverage over every module, ending with enforced coverage thresholds.

## Intent
The app has zero automated tests. After this program: `npm test` runs a full suite covering
domain, all 11 infrastructure modules, all 26 application services, main/IPC/preload, all 26
renderer stores, and the component tree — with coverage gates wired into verification.

## Sessions
29 sessions, 6 phases: A Foundation (01) · B Domain (02) · C Infrastructure (03–12) ·
D Application (13–20) · E Main/IPC (21) · F Renderer (22–28) · G Gate (29).

## Session Status

| # | Session | Modules | Status | Completed | Notes |
|---|---------|---------|--------|-----------|-------|
| 01 | Test harness setup (Vitest + jsdom + RTL) | all | done | 2026-07-18 | Vitest 4 (not 3) — was already installed; two-project config replaces earlier single-project one |
| 02 | Domain + pure application units | M01, M08 | done | 2026-07-18 | 53 new tests; smoke test removed |
| 03 | Settings, Agents, Pandoc, Series services | M02, M04, M07, M14 | done | 2026-07-18 | 46 tests; no electron mock needed — all four take injected paths |
| 04 | DatabaseService I — schema, migrations, conversations, messages | M03 | done | 2026-07-18 | 23 tests; ABI ping-pong solved via pretest guard (see handoff) |
| 05 | DatabaseService II — usage, versions, stream sessions, word counts | M03 | done | 2026-07-18 | 31 tests; full IDatabaseService coverage confirmed |
| 06 | FileSystemService I — book CRUD, slugs, chapters | M05 | done | 2026-07-18 | 37 tests; no createChapter method exists — chapters flow through writeFile |
| 07 | FileSystemService II — covers, archive, pitches + watchers | M05 | done | 2026-07-18 | 35 tests; full FileSystemService coverage; watchers on real fs |
| 08 | claude-cli — ClaudeCodeClient + StreamSessionTracker | M06 | done | 2026-07-18 | 32 tests; fakeProcess + NDJSON fixture helpers added for S09/S11 |
| 09 | codex-cli — CodexCliClient | M11 | done | 2026-07-18 | 26 tests across args/stream/lifecycle; retry test costs ~2s wall time |
| 10 | ollama-cli I — BashEmulator, ToolExecutor, tools, contextCompactor | M12 | done | 2026-07-18 | 46 tests; extended existing ToolExecutor.test.ts; no sandbox escapes found |
| 11 | ollama-cli II — OllamaCodeClient, OllamaCliRunner, WebSearcher | M12 | done | 2026-07-18 | 29 tests; M12 fully covered; all network via fetch stubs |
| 12 | llama-server + providers | M13, M15 | done | 2026-07-18 | 32 tests; LlamaServerClient is pure HTTP/SSE (no spawn); infra layer complete |
| 13 | ChatService, StreamManager, ContextBuilder | M08 | done | 2026-07-18 | 35 tests; src/test/fakes.ts factory added for all Phase D sessions |
| 14 | PipelineService, BuildService, SourceGenerationService, ChapterValidator | M08 | done | 2026-07-18 | 32 tests; fakes.ts fs fake extended (meta/chapters/delete/cover) |
| 15 | RevisionQueueService, AdhocRevisionService | M08 | done | 2026-07-18 | 20 tests; all six session statuses asserted |
| 16 | MultiCallOrchestrator, AuditService | M08 | done | 2026-07-18 | 16 tests; sequential orchestration + write-verification pinned |
| 17 | QueryService, VersionService, FindReplaceService | M08 | done | 2026-07-18 | 30 tests; TWO QueryService parse bugs found + recorded (see handoff) |
| 18 | MotifLedgerService, HotTakeService, HelperService | M08 | done | 2026-07-18 | 19 tests, first-try green |
| 19 | Import services — ChapterDetector, ManuscriptImport, SeriesImport | M08 | done | 2026-07-18 | 20 tests; detector limitations recorded |
| 20 | PitchRoom, Dashboard, Statistics, Usage services | M08 | done | 2026-07-18 | 25 tests; Phase D complete — every src/application file now has a co-located test |
| 21 | main/IPC handlers, preload bridge, bootstrap, notifications | M09 | done | 2026-07-18 | 47 tests; 142 channels wired 1:1 with preload; composition root excluded (window:*); FORGE.MD migration no-ops on APFS (bug candidate) |
| 22 | Renderer test harness + core stores | M10 | done | 2026-07-18 | 69 tests; typed bridge mock + resetStores helpers; setActiveBook/switchBook convo-key bug candidate (see handoff) |
| 23 | Streaming stores | M10 | done | 2026-07-18 | 57 tests; session-prompt drift adapted (pipeline=cache, revision events live in a hook); autoDraft loop tested on real timers (~6s) |
| 24 | Remaining stores I | M10 | done | 2026-07-18 | 72 tests; drift adapted (fileChange=counter, palette has no recents, motif has no book-switch sub) |
| 25 | Remaining stores II | M10 | done | 2026-07-18 | 61 tests; sweep clean — all 26 store files now have co-located tests |
| 26 | Components I — shell (Layout, Sidebar, Rail, StatusBar, common) | M10 | done | 2026-07-18 | 67 tests; renderApp helper added; AppLayout mount deferred to S28 App smoke (see handoff) |
| 27 | Components II — Chat, Workbench, Manuscript, Files | M10 | done | 2026-07-18 | 197 tests / 28 files; usePhaseConversations covered via ChatPane; ThinkingBlock auto-collapse bug candidate (see handoff) |
| 28 | Components III — Library, Series, PitchRoom, Import, Settings + App smoke | M10 | pending | | |
| 29 | Coverage gate — thresholds, gap fill, CI + FORGE-CONFIG update | all | pending | | |

Status values: pending | in-progress | done | blocked | skipped

## Dependency Graph

```
S01 ─→ everything
S01 ─→ S02 … S21           (backend sessions — mutually independent, any order/parallel)
S04 ─→ S05                 (same file family: database tests share fixtures)
S06 ─→ S07                 (same service: filesystem tests share temp-dir helpers)
S10 ─→ S11                 (ollama helpers before client)
S01 ─→ S22 ─→ S23, S24, S25 (store sessions need renderer harness from S22)
S22 ─→ S26 ─→ S27, S28      (component sessions reuse store/bridge mocks)
S02…S28 ─→ S29              (gate runs last)
```

## Architecture Reference (feature-specific)

- **Module registry drift** (SESSION-01 fixes in FORGE-CONFIG): add `M12` ollama-cli
  (`src/infrastructure/ollama-cli/`), `M13` llama-server (`src/infrastructure/llama-server/`),
  `M14` series (`src/infrastructure/series/`), `M15` providers (`src/infrastructure/providers/`),
  and `M16` test (`src/test/` — shared test utilities, created by this program).
- **Vitest projects:** `node` project for `src/{domain,infrastructure,application,main,preload}`;
  `jsdom` project (with `@vitejs/plugin-react`) for `src/renderer`.
- Path aliases `@domain/*`, `@infra/*`, `@app/*` must resolve inside Vitest exactly as in Vite configs.

## Scope Summary

| Module | Touched by | New files |
|--------|-----------|-----------|
| M01 domain | S02 | co-located `*.test.ts` |
| M02 settings, M04 agents, M07 pandoc, M14 series | S03 | co-located tests |
| M03 database | S04, S05 | co-located tests |
| M05 filesystem | S06, S07 | co-located tests |
| M06 claude-cli | S08 | co-located tests + NDJSON fixtures |
| M11 codex-cli | S09 | co-located tests + JSON-event fixtures |
| M12 ollama-cli | S10, S11 | co-located tests |
| M13 llama-server, M15 providers | S12 | co-located tests |
| M08 application | S02, S13–S20 | co-located tests |
| M09 main/ipc/preload | S21 | co-located tests |
| M10 renderer | S22–S28 | co-located tests |
| M16 test (new) | S01, S22 | `src/test/` helpers, mocks, fixtures |
| tooling | S01, S29 | `vitest.config.ts`, package.json scripts, coverage config |

## Design Decisions

1. **Vitest** over Jest — Vite-native, reuses aliases/transform pipeline, first-class TS + ESM. App already builds with Vite 5.
2. **Co-located test files** (`Foo.test.ts`) — discoverable, keeps module boundaries visible; Vite entry-point bundling ignores them.
3. **Real SQLite in-memory** (`new DatabaseService(':memory:')`) instead of mocking better-sqlite3 — DatabaseService is mostly SQL; mocks would test nothing.
4. **Real temp dirs** (`fs.mkdtemp`) for FileSystemService — behavior is file I/O; mock only Electron (`app.getPath`).
5. **Mock `child_process.spawn`** with scripted fake processes + NDJSON/JSON fixtures for claude/codex/ollama clients — never spawn real CLIs.
6. **Application layer tested against hand-rolled interface fakes** (per Clean Architecture DI) — no module mocking needed.
7. **Renderer:** stores tested against a typed `window.novelEngine` mock factory; components with @testing-library/react. Component coverage = render + key interactions, not pixel testing.
8. **E2E out of scope** — a separate future program (Playwright Electron) if desired.
9. **Coverage thresholds** enforced in SESSION-29: 90% lines domain/application, 80% infrastructure/main, 70% renderer (global floor 75%). Adjust only downward with justification in STATE notes.

## Handoff Notes

_(agents append here after each session: date, session, surprises, bugs found in source, deviations)_

### 2026-07-18 — SESSION-01 (test harness)

- **Deviation: Vitest 4, not 3.** `vitest@^4.1.10` plus `test`/`test:watch` scripts and a
  single-project `vitest.config.ts` were already committed (program ollama-about-json-corruption,
  SESSION-02). Kept v4 and matched `@vitest/coverage-v8@^4`. Session prompts referencing
  Vitest 3 behavior should assume v4 (default pool is already `forks` — good for better-sqlite3).
- **Installed versions:** vitest 4.1.10, @vitest/coverage-v8 4.1.10, jsdom ^29.1.1,
  @testing-library/react ^16.3.2 (+ @testing-library/dom 10.4.1 as auto-installed peer, not in
  package.json), user-event ^14.6.1, jest-dom ^6.9.1.
- **Pre-existing test:** `src/infrastructure/ollama-cli/ToolExecutor.test.ts` (4 tests) — runs in
  the node project; SESSION-10 should extend, not duplicate it.
- **Electron mock** covers the full grepped surface: app, BrowserWindow, Notification, ipcMain,
  ipcRenderer, contextBridge, dialog, shell, nativeTheme, protocol, net. `setMockUserDataPath()`
  overrides `app.getPath('userData')`.
- **`window.novelEngine` placeholder** in setup.renderer.ts is an empty cast object — SESSION-22
  must add the real typed mock factory before store tests touch the bridge.
- **Verification note:** `npm start` boot check hit ERR_CONNECTION_REFUSED on the renderer URL —
  environmental only: another `npm start` instance was already running and held port 5173. All
  bundles built and the composition root booted; not related to test tooling.
- Alias check: `@domain/@infra/@app` identical across both vite configs + tsconfig; mirrored in
  vitest.config.ts.

### 2026-07-18 — SESSION-02 (domain + pure application units)

- `statusMessages.ts` exports take no arguments (pure random pickers) — the session's
  "unknown key → fallback" instruction didn't apply; tested extremes of `Math.random`
  (out-of-bounds guard) and rotation instead.
- Suspicious constant (not fixed): `MAX_CALL_CONTEXT_TOKENS = 250_000` but its own JSDoc claims
  it "keeps each call well within the 128K context limit", and
  `MULTI_CALL_TARGET_WORDS_PER_BATCH`'s comment calls the ceiling "125K". Comment/value drift —
  value likely raised without updating docs.
- `AVAILABLE_MODELS` is `@deprecated` and still exported (renderer SettingsView migration
  pending) — not tested, flagged as dead-export candidate.
- Pinned contracts: `TokenEstimator` values (CHARS_PER_TOKEN=4, ceil), `BUILT_IN_PROVIDER_CONFIGS[0]`
  must stay the Claude CLI config (derived primary/secondary model constants index it).

### 2026-07-18 — SESSION-03 (settings, agents, pandoc, series)

- **Injection styles (for S06/S07 reuse):** all four services take plain constructor paths —
  `SettingsService(userDataPath)`, `AgentService(agentsDir)`, `SeriesService(userDataDir)`,
  `resolvePandocPath(resourcesPath)`. NO electron mock was needed anywhere in this session;
  the electron boundary lives in the composition root.
- **child_process mock recipe** (SettingsService promisifies `execFile` at module load):
  supply `promisify.custom` in the `vi.mock('node:child_process')` factory —
  a plain `vi.fn()` breaks `const { stdout } = await execFile(...)` destructuring.
- **node:os mock recipe** (default-import consumers): return `{ ...mocked, default: mocked }`.
- Behavior pins: settings corrupted-JSON → silent defaults; AgentService matches filenames
  case-insensitively and reports the canonical registry filename; unknown .md files silently
  skipped; SeriesService silently skips corrupt manifests in listSeries.
- Minor doc drift (not fixed): AgentService.loadAll comment says "excludes Wrangler" but
  CREATIVE_AGENT_NAMES also excludes Helper.

### 2026-07-18 — SESSION-04 (database I)

- **better-sqlite3 ABI ping-pong (IMPORTANT for S05):** the module is compiled for Electron's
  ABI (130) by `npm start` (Forge "Preparing native dependencies") but Vitest needs Node's (127).
  Fix: `scripts/ensure-native-abi.js` wired as `pretest`/`pretest:watch`/`pretest:coverage` —
  constructs a `:memory:` DB (the binding loads lazily in the constructor; bare `require` is NOT
  enough) and runs `npm rebuild better-sqlite3` only on mismatch. Both `npm test` and `npm start`
  now self-heal. `pool: 'forks'` was not needed (Vitest 4 default).
- **Covered (S05 owns the complement):** createConversation, getConversation, listConversations,
  deleteConversation (incl. message cascade), updateBookSlug, saveMessage, getMessages,
  initializeSchema, runMigrations/MIGRATIONS. NOT covered: usage (recordUsage, getUsageSummary,
  getUsageByConversation), stream events (persist/batch/get/delete/prune), stream sessions
  (create/end/getActive/markInterrupted), file versions (all 8), dashboard/stats
  (getLastConversation, getUsageOverTime, getUsageByAgent, getUsageByPhase,
  recordWordCountSnapshot, getWordCountHistory), close.
- `src/test/db.ts` provides `makeDb()`, `makeConversation()`, `makeMessage()` — extend there.
- Timestamps are SQLite `datetime('now')` (1-second resolution): the ordering test sleeps
  2×1.1s; expect the db test file to take ~2.5s. Ties in `ORDER BY timestamp` fall back to
  insertion order in practice.

### 2026-07-18 — SESSION-05 (database II)

- **Every `IDatabaseService` method is now covered** (grep-verified across S04+S05 test files).
- Fixtures added to `src/test/db.ts`: `makeUsage`, `makeStreamSession`, `makeStreamEvent`,
  `makeFileVersion`.
- Aggregation notes: `getUsageByPhase` buckets NULL pipeline_phase as `'adhoc'`; by-agent/by-phase
  results are ordered by total tokens DESC; `getUsageOverTime` buckets by `date(timestamp)` (UTC).
- `deleteFileVersionsBeyondLimit` pins the newest `source='agent'` version even beyond the keep
  limit (baseline for user-edit diffs) — pinned in tests.
- `getWordCountHistory` default limit is 1000; snapshots always append (no per-day dedupe).
- Stream events/sessions accept caller-provided timestamps — `pruneStreamEvents` tested with
  a 2020 timestamp vs `new Date().toISOString()`.

### 2026-07-18 — Agent stop (context limit)

Stopped cleanly after SESSION-05. All work committed (latest: b50cd7c). **Next eligible
session: SESSION-06** (FileSystemService I — depends only on S01, done). Sessions 06–21 and 22
are all eligible in any order. Reminder for the next agent: run `npm test` first — if the app
was started since the last test run, the pretest ABI guard will rebuild better-sqlite3
(~30s, one-time). _(Resumed same day — see SESSION-06 below.)_

### 2026-07-18 — SESSION-06 (filesystem I)

- **Base-path injection (for S07):** `new FileSystemService(booksDir, userDataDir)` — plain
  constructor paths, no electron mock. Fixtures: `src/test/bookFixtures.ts` provides
  `makeLibrary(tempDir)` + `seedBook(lib, slug, opts)` (chapters, files, rawAbout/omitAbout).
- **No createChapter method exists.** Chapters are created by agents via `writeFile`; front
  matter (00-0-copyright, 00-1-dedication) is written by `createBook`. Session instructions
  adapted accordingly.
- Behavior pins: duplicate-title `createBook` silently reuses the directory (overwrites
  about.json, keeps content); slugify drops non-ASCII (`Café Überall` → `caf-berall`);
  `setActiveBook` does not validate the slug; malformed about.json books are skipped by
  listBooks but throw from getBookMeta; missing about.json triggers auto-import with
  humanized title; front matter is excluded from countWords/manifest word totals but listed
  (0 words) by countWordsPerChapter and INCLUDED by assembleManuscript if non-empty.
- **Uncovered → S07:** saveCoverImage, getCoverImageAbsolutePath, archiveBook, unarchiveBook,
  listArchivedBooks, listShelvedPitches, readShelvedPitch, deleteShelvedPitch, shelvePitch,
  restorePitch, getPitchDraftPath, listPitchDrafts, getPitchDraft, readPitchDraftContent,
  deletePitchDraft, promotePitchToBook, shelvePitchDraft, getAuthorProfilePath,
  generateCopyrightContent (direct), plus BookWatcher.ts and BooksDirWatcher.ts.

### 2026-07-18 — SESSION-07 (filesystem II)

- **Every public FileSystemService method now covered** (grep-verified S06+S07).
- **Path drift vs session/FORGE-CONFIG docs:** shelved pitches actually live in
  `books/_pitches/*.md` (not `shelved-pitches/`), pitch drafts in
  `books/__pitch-room__/drafts/{conversationId}/` (not `pitch-room/`). Tests pin the source.
  There is no author-profile read/write method — only `getAuthorProfilePath()`.
- **Watchers tested on real fs.watch** (no injection needed). Flake mitigation: macOS FSEvents
  replays pre-attach events after attach — helper `startWatching()` waits 3× debounce then
  `mockClear()`s the spy before acting. Debounce 100ms, `vi.waitFor` timeout 3s. 3 consecutive
  full-suite runs clean.
- Behavior pins: cover replace deletes old-extension file; `getCoverImageAbsolutePath` → null
  for unset OR dangling cover; archive of active book clears `active-book.json`;
  `restorePitch`/`promotePitchToBook` recreate books via `createBook` (same silent-reuse slug
  semantics as S06).

### 2026-07-18 — SESSION-08 (claude-cli)

- **fakeProcess API for S09/S11** (`src/test/fakeProcess.ts`): `makeFakeSpawn()` →
  `{ spawnMock, children, calls, lastChild(), lastCall(), waitForChild() }`.
  `FakeChildProcess` has `pushStdout/pushStderr/exit(code)/fail(err)`, captures
  `stdin.written` and `killSignals`. Clients await async setup before spawning —
  always `await fake.waitForChild()` after calling send.
- **Mock wiring:** ClaudeCodeClient imports from bare `'child_process'` (NOT `node:`) —
  mock that exact specifier. `execFile` is promisified at module load → provide
  `[promisify.custom]` in the factory (same recipe as S03). Route through a
  `vi.hoisted` holder so each test can swap implementations.
- **NDJSON shapes** (`src/test/fixtures/claude-ndjson.ts`): high-level CLI v2.1 events —
  `system/init`, `assistant{message.content[{thinking|text|tool_use}]}`,
  `user{message.content[{tool_result, tool_use_id, is_error}], tool_use_result.file.filePath}`,
  `result{subtype, is_error, result, usage{input_tokens,output_tokens}}`.
- Behavior pins: prompt via stdin as `Human:/Assistant:` transcript; system prompt via
  `--system-prompt-file` temp file; malformed NDJSON silently skipped (diagnostics only);
  exit 0 without result → synthetic `done` with zeros; error-result suppresses the second
  close-error; failed tool_result never touches files; `filesChanged` fires AFTER `done`
  (close handler); multi-turn text separated by `\n\n` deltas.
- **Flake fixed in S07 file:** BooksDirWatcher add/remove tests raced FSEvents attach under
  full-suite load — added 250ms post-start settle + 5s waitFor. Green ×3 after fix.

### 2026-07-18 — Agent stop #2 (context limit)

Stopped cleanly after SESSION-07. All work committed (latest: 6dbaa8f). Suite: 23 files,
229 tests, green ×3. **Next eligible: SESSION-08** (claude-cli — ClaudeCodeClient 808 lines +
StreamSessionTracker 279 lines). Also eligible in any order: S09–S21, S22. Mock recipes so far:
child_process via `promisify.custom` factory (S03 note), electron mock unused so far, fixtures
in `src/test/{db,bookFixtures,tempDir}.ts`.

### 2026-07-18 — SESSION-09 (codex-cli)

- **Different mock specifier than claude-cli:** CodexCliClient imports from `'node:child_process'`
  (claude-cli uses bare `'child_process'`). Same `promisify.custom` + hoisted-holder recipe.
- **Real fs required:** `buildWorkspacePlan` checks `existsSync(cwd)` and the workspace snapshot
  walks the tree — tests need real temp `booksDir/my-book` dirs (makeTempDir), unlike S08.
- Behavior pins: mid-attempt `error` StreamEvents are withheld (onAttemptEvent filter) and
  reported exactly once when the run finally settles; retry only for fully-empty transient
  failures (stream_error or clean-empty-with-json), backoff = attempt × 2s (the retry test takes
  ~2s); unknown typed events surface as `status` with the type name; config/prompt echo lines
  and non-JSON stdout are silent; `--output-last-message` file is the no-stream text fallback;
  workspace snapshot diff supplies filesChanged when Codex writes without file_change events;
  `agent_message` after deltas is skipped (deltaTextSeen); usage from `turn.completed`
  (reasoning_output_tokens → thinkingTokens), `token_count` is pending-only, `task_complete`
  terminal with pending usage.
- Parser gaps found: none blocking; `extractStatus` turns ANY unknown typed event into a status
  message (could get noisy with future CLI versions but is intentional diagnostics).
- Fixtures: `src/test/fixtures/codex-events.ts` (0.27.0 `{id,msg}` envelope via `wrap()`).

### 2026-07-18 — SESSION-10 (ollama-cli I)

- **Tool list for S11 loop tests:** Read, Write, Edit, LS, Bash, WebSearch (OLLAMA_TOOLS);
  READ_TOOLS={Read,LS}, WRITE_TOOLS={Write,Edit}. Every tool verified to have a ToolExecutor
  dispatch branch (empty-args probe → missing-arg error, never "Unknown tool").
- **No sandbox escapes found.** resolveSafe blocks relative traversal, absolute paths outside
  roots, and nested `a/../../..`; additionalRoots grant sibling access by absolute path.
- Minor parser quirk (noted, not fixed): BashEmulator `find` ignores unknown VALUE-LESS flags,
  but a valued flag's value token (e.g. `-maxdepth 1`) is treated as the start path → ENOENT.
  Small models rarely emit these; acceptable.
- Behavior pins: Bash whitelist mkdir/cat/mv/cp/ls/find/wc/rm/rmdir; metacharacters | & ; < > ` $( ${ \n
  rejected pre-parse; cat caps at 100k chars ("…[truncated]"); find caps at 500 results;
  ToolExecutor tool failures return `isError:true` results (never throw); Edit enforces
  unique old_string; compactToolHistory protects head 2 + tail 4, truncates middle tool
  results >200 chars and assistant messages >2000 chars, cannot compact ≤6 messages;
  WebSearch dispatch exists but WebSearcher itself is S11's target (network-mocked there).

### 2026-07-18 — Agent stop #3 (context limit)

Stopped cleanly after SESSION-08. All work committed (latest: ed4d668). Suite: 25 files,
261 tests, green ×3. **Next eligible: SESSION-09** (codex-cli — CodexCliClient, 1205 lines).
Reuse `src/test/fakeProcess.ts` (see SESSION-08 handoff for the API and the bare-`'child_process'`
+ `promisify.custom` mock recipe). Also eligible: S10–S21, S22.

### 2026-07-18 — SESSION-11 (ollama-cli II)

- **M12 fully covered.** OllamaCodeClient talks over GLOBAL fetch (undici dispatcher option is
  cosmetic for tests) — `vi.stubGlobal('fetch', ...)` + `src/test/fixtures/ollama-responses.ts`
  (`chatResponse()` builds a ReadableStream NDJSON body; `makeOllamaFetchStub()` routes
  /api/tags, /api/show, /api/chat). Runner mocks `'node:child_process'` (promisify.custom).
- **Test simplification trick:** a non-local baseUrl (`http://ollama.test:11434`) makes
  `ensureLocalApiReady` a no-op — no /api/tags or CLI plumbing needed in most tests.
  The 4th constructor arg injects a fake OllamaCliRunner.
- **Pins:** loop guard DEFAULT_MAX_TURNS=30 (tested via maxTurns=2 param); context check runs
  from turn 2: compaction at ≥80% of window, break with status "Context limit approaching" when
  still above the 98% ceiling; num_ctx = min(model context_length from /api/show, 250k) sent per
  request; `think` enabled unless thinkingBudget===0; tool-call args arriving as JSON strings are
  normalized; content suppressed on chunks that carry tool_calls; API/network errors become
  error events and sendMessage RESOLVES (no throw) — EXCEPT ensureLocalApiReady failures, which
  REJECT before streaming; abort → graceful blockEnd + done(0,0) and resolve; usage accumulates
  across turns from prompt_eval_count/eval_count.
- WebSearcher: DuckDuckGo HTML endpoint, uddg redirect unwrap, entity/tag stripping, error
  strings (never throws), no fetch on empty query.

### 2026-07-18 — Agent stop #4 (context limit)

Stopped cleanly after SESSIONS 09+10. All committed (latest: 3e29759). Suite: 31 files,
333 tests, green. **Next eligible: SESSION-11** (ollama-cli II — OllamaCodeClient 949 lines,
OllamaCliRunner 180, WebSearcher 138). S10 handoff lists the tool set + pins; S08/S09 handoffs
carry the fakeProcess + child_process mock recipes (check which specifier OllamaCodeClient
imports — bare vs `node:` — before wiring vi.mock). WebSearcher must be network-mocked (undici
or global fetch — read the source first). Also eligible: S12–S21, S22.

### 2026-07-18 — SESSION-12 (llama-server + providers)

- **Infrastructure layer (M02–M07, M11–M15) is now fully covered.**
- **Session-prompt drift:** LlamaServerClient spawns NOTHING — it's a pure HTTP client over
  global fetch with OpenAI-compatible SSE (`/v1/chat/completions`) + tool loop identical in
  shape to OllamaCodeClient (shared ToolExecutor/compactor/OLLAMA_TOOLS). fakeProcess unused.
- New shared fixtures in `src/test/fixtures/ollama-responses.ts`: `rawStreamResponse(chunks)`
  (control exact read boundaries) and `sseBody(events)` (data:/[DONE] SSE).
- Wire-format pins: llama-server converts OLLAMA_TOOLS to OpenAI tool format; streamed
  tool-call fragments accumulate by index and finalize at [DONE]; `<think>` tag parser buffers
  partial tags across chunks (coalesces deltas — one thinkingDelta per contiguous run);
  usage from SSE `usage` else chars/4 estimate; assistant tool_calls get `call_<nanoid8>` ids
  echoed in tool results' tool_call_id. OpenAiCompatibleProvider: Bearer header only with a
  key; trailing-slash trim; token estimates always (no usage parsing); no tool use.
- ProviderRegistry pins: first registration becomes default; built-ins win model-ID collisions
  (registered last in index rebuild) and cannot be removed; immutable id/type/isBuiltIn on
  update; resolveModelSelection fallback chain requested → preferred-provider default →
  default-provider default → first enabled (reasons pinned); baseUrl changes call
  provider.setBaseUrl and fire async ollama `/api/tags` / llama `/v1/models` refreshes
  (`:latest` stripped from ollama labels; path tail as llama label).

### 2026-07-18 — Agent stop #5 (context limit)

Stopped cleanly after SESSION-11. All committed (latest: e0ff7fc). Suite: 34 files, 362 tests,
green ×3. **Next eligible: SESSION-12** (llama-server + providers — LlamaServerClient 912 lines,
OpenAiCompatibleProvider 229, ProviderRegistry 383). LlamaServerClient almost certainly reuses
the fetch-streaming pattern — the S11 fixtures (`src/test/fixtures/ollama-responses.ts` style)
and the non-local-baseUrl trick likely transfer. ProviderRegistry is DI/pure — hand-rolled fakes.
Also eligible: S13–S21, S22.

### 2026-07-18 — SESSION-13 (ChatService, StreamManager, ContextBuilder)

- **`src/test/fakes.ts` API for S14–S20:** `makeFakeSettings(overrides)` (exposes `.current`),
  `makeFakeAgents(promptsByFilename)` (registry-backed; loadComposite → `[FILE.md]` markers
  joined with `---`), `makeScriptedProvider()` (`.scriptNext(events[])` queues one script per
  sendMessage; `.setImpl()` replaces behavior; `.calls` records params), `makeFakeRegistry(provider,
  {models})` (fallback → didFallback), `makeFakeFs(files, {bookSlug})` (in-memory; `.files` Map
  keyed `slug/path`, `.writes` log, manifest derived from seeded files), `makeUsageRecorder()`,
  `makeNoopChapterValidator()`, `makeFakePitchRoom/HotTake/AdhocRevision()` (vi.fn handleMessage),
  `makeFakeSeries(biblePath)`, `makeFakeVersion(authorEdits)`. Real `:memory:` db via makeDb.
  Real StreamManager instances are cheap — construct with (db, usageRecorder.usage).
- **TRAP for S14–S20:** ChatService routes FIRST pipeline messages from Sable/Lumen/Ghostlight/
  Forge into the real MultiCallOrchestrator (constructed internally). Use Spark/Quill/Verity or
  a second message to test the normal flow; the orchestrator itself is S16.
- Pins: user message saved BEFORE availability... no — availability check precedes all writes
  (unavailable → zero DB writes); purpose routing (pitch-room/hot-take/adhoc-revision) happens
  AFTER the user message is saved; extraction fallback never overwrites populated outputs and
  respects PHASE_OUTPUT_CONTENT_MARKERS; abort saves partial text with "[Aborted by user]";
  ContextBuilder tiers by turnBudget/MAX_CONTEXT_TOKENS fraction (>40% all, >20% 8, >10% 4,
  else 2; +2-message omission note when dropping; force-keeps newest message).

### 2026-07-18 — Agent stop #6 (context limit)

Stopped cleanly after SESSION-12. All committed (latest: 671fea5). Suite: 37 files, 394 tests,
green ×2. **Infrastructure phase (C) complete — sessions 03–12 all done.** Next eligible:
**SESSION-13** (ChatService 932 + StreamManager 255 + ContextBuilder — note: ContextBuilder
lives at `src/application/ContextBuilder.ts`, NOT `context/`). Application layer tests use
hand-rolled interface fakes per Design Decision #6 — check `src/domain/interfaces.ts` for the
injected interfaces of each service. Also eligible: S14–S21, S22 (renderer harness).

### 2026-07-18 — SESSION-14 (pipeline, build, source-gen, chapter validator)

- **fakes.ts extended:** makeFakeFs now also provides `deleteFile`, `getBookMeta`/`updateBookMeta`
  (mutable `.meta`), `getCoverImageAbsolutePath` (settable `.coverPath`), and
  `countWordsPerChapter` (mirrors chapterSortKey ordering, front matter = 0 words).
- **Pipeline resumability contract pinned:** completion = detection files/status AND
  user confirmation in `pipeline-state.json`; legacy books (no state file) auto-confirm all
  currently file-complete phases on first detectPhases; confirm is idempotent; revert drops the
  target + all later confirmations (revision revert also deletes the v1 archives; first-draft
  revert rolls book status back); markPhaseComplete writes ≥200-word stubs (never overwrites),
  advances status phases, and auto-confirms; second-read/second-assessment gates require live
  report word counts to DIFFER from the v1 archives.
- **Source quirks (noted, not fixed):** (1) SourceGenerationService's step-label conversation
  titles are immediately overwritten by the DB first-user-message title rule; (2) ChapterValidator
  only recognizes root files STARTING with draft/notes/chapter/section — `01-slug-draft.md` at
  chapters root is left in place (extractChapterSlug pattern 1 unreachable from that path);
  (3) BuildService's missing-draft skip branch is unreachable via the real fs contract
  (countWordsPerChapter only lists dirs, and reads then can only fail on races).
- BuildService pandoc mocked via the S03 `promisify.custom` recipe on `'node:child_process'`.

### 2026-07-18 — Agent stop #7 (context limit)

Stopped cleanly after SESSION-13. All committed (latest: 3c988cd). Suite: 40 files, 429 tests,
green ×2, no @infra imports in application tests. **Next eligible: SESSION-14** (PipelineService,
BuildService, SourceGenerationService, ChapterValidator). Start from the SESSION-13 handoff:
`src/test/fakes.ts` covers most collaborators; BuildService likely needs pandoc mocking
(execFile — see S03 recipe) and real temp dirs (bookFixtures). Also eligible: S15–S21, S22.

### 2026-07-18 — SESSION-15 (revision queue + adhoc revision)

- **Queue persistence contract pinned:** plan cache (`source/revision-plan-cache.json`) +
  session state (`source/revision-queue-state.json`, embeds parsed plan); content hash
  normalizes checkboxes/whitespace so approvals never invalidate the cache; state restore only
  applies terminal statuses (approved/rejected/skipped) — never running/awaiting-approval —
  but conversationIds are restored unconditionally; cycle transitions (audit + archived v1)
  clear cache+state; audit without archive is a hard loadPlan error.
- **Retry contract pinned:** Wrangler parse retries ×3 with maxTurns 15→20→25 (MULTI_CALL
  constants); empty response/no-JSON/0-sessions all count as failures.
- **Gate mechanics pinned:** isApprovalGate keys on the LAST paragraph containing signal words
  (approval/proceed/continue/next task/shall i/…) — final replies in tests must avoid them;
  approve/approve-all/reject/skip re-enter the loop with a follow-up user message; retry
  resets response+conversationId and leaves status 'rejected' (runnable again); auto-approve
  mode bypasses gates. runAll: FIFO by session index, pause stops between sessions,
  concurrent runAll on the same plan throws.
- Session model tier ('opus'/'sonnet') is metadata only — execution always uses settings.model.

### 2026-07-18 — Agent stop #8 (context limit)

Stopped cleanly after SESSION-14. All committed (latest: 690cd45). Suite: 44 files, 461 tests,
green. **Next eligible: SESSION-15** (RevisionQueueService, AdhocRevisionService). The S13/S14
fakes cover settings/agents/registry/fs/db collaborators; remember the S13 multi-call trap when
driving ChatService-adjacent flows. Also eligible: S16–S21, S22.

### 2026-07-18 — SESSION-16 (multi-call orchestrator + audit service)

- **Orchestration model pinned: strictly SEQUENTIAL** (no parallelism/concurrency cap — the
  session prompt's fan-out assumptions don't apply). Failure strategy: per-step retry ×3 with
  maxTurns +5/+10; after exhaustion → single error event + PARTIAL results returned (later steps
  never run; scratch files preserved for retry). Step success requires the expected
  scratch/output file to EXIST after the call ("never wrote its expected file" error otherwise) —
  test provider impls must write to the fs fake. Provider error EVENTS (never-throw providers)
  are converted to step failures via interception; intermediate `done` events are swallowed
  (exactly one done reaches the caller). Resumption skips non-synthesis steps whose file exists.
- Dynamic expansion pinned: batches = ceil(words/20k) capped 8; batch 2+ prompts get scratch
  refs renumbered (own file first, then prior); {{READ_TRACKER_FILES}}/{{BATCH_TRACKER_FILES}}/
  {{BATCH_COUNT}} substitution; read steps use the lightweight system prompt; scratch cleanup
  only after successful synthesis. fakes.ts fs fake gained listDirectory/deletePath.
- AuditService pins: audit prefers settings.secondaryModel when its provider is registered
  (VERITY_AUDIT_MAX_TOKENS cap) else primary+full maxTokens; JSON extracted from fences or
  brace-matching, malformed → null (never throws); ephemeral `audit-*`/`motif-audit-*`
  conversations satisfy the usage FK; fixChapter threads `<conversationId>-fix`; motif audit
  routes by provider id (claude-cli single call w/ Lumen maxTurns, else batch+synthesis with
  maxTurns 15 / scratch+5). Note: audit/fix use 120s/300s realtime timeout races — scripts must
  resolve well before those.

### 2026-07-18 — Agent stop #9 (context limit)

Stopped cleanly after SESSION-15. All committed (latest: e6d1af4). Suite: 47 files, 481 tests,
green. **Next eligible: SESSION-16** (MultiCallOrchestrator 805 + AuditService 772). The S15
retry pins (MULTI_CALL constants, 15→20→25 turns) apply to the orchestrator too; scripted
provider + fakes cover the collaborators. AGENT_MULTI_CALL_STEPS schemas were pinned in S02's
constants tests. Also eligible: S17–S21, S22.

### 2026-07-18 — SESSION-17 (query, version, find-replace)

- **🐛 BUG (QueryService, not fixed — needs a real fix, not behavior-preserving):**
  `extractField('query-letter')` / `extractField('response-date')` never match the serialized
  labels `- **Query Letter:**` / `- **Response Date:**` (hyphen vs space). Consequences, now
  pinned in tests: `queryLetterPath`/`responseDate` are LOST on every tracker round-trip, and
  `removeTarget`'s letter-file cleanup is dead code. Fix would be aligning extractField keys
  with fieldToLabel (e.g. `extractField(body, 'query letter')`).
- **🐛 QUIRK (QueryService, not fixed):** an EMPTY field value (`- **Contact:**\n- **Method:** …`)
  makes extractField's `\s*(.*)` swallow the NEXT line as the value. Tests avoid empty
  placeholders; agents writing empty fields will corrupt parses.
- Regex/scope semantics pinned (FindReplace): search scope = `chapters/*/draft.md` ONLY (notes
  and source/ excluded); literal mode escapes metacharacters; regex mode validates up front
  ('Invalid regular expression'); case-insensitive default; apply snapshots originals via
  versions.snapshotContent('user') BEFORE writing, skips zero-match/missing files.
- VersionService pins: sha256 dedup on snapshot; revert always writes a 'revert' version (even
  identical) and validates ownership; user-edit diffs use newVersion.id -1 sentinel vs latest
  agent baseline; chapter edit statuses cover body chapters (NN ≥ 2) only; author-edits section
  caps at 120 diff lines with a continuation note; diff totals include trailing-newline
  rewrites (diff lib behavior).

### 2026-07-18 — Agent stop #10 (context limit)

Stopped cleanly after SESSION-16. All committed (latest: 55a5720). Suite: 49 files, 497 tests,
green (first try). **Next eligible: SESSION-17** (QueryService, VersionService,
FindReplaceService). VersionService pairs with the S05 file-version db coverage; the fakes
module now covers fs listDirectory/deletePath. Also eligible: S18–S21, S22.

### 2026-07-18 — SESSION-18 (motif ledger, hot take, helper)

- **Output-parsing formats pinned:** MotifLedger load chain = parse → repairJson (missing commas
  between pretty-printed objects, trailing commas, BOM) → EMPTY_LEDGER fallback; non-canonical
  shapes (associatedCharacters / entries.system / object firstAppearance / plant-payoff
  foreshadows / numeric chapters) trigger CLI normalization (maxTurns 1, fence-stripped reply,
  persisted on success) with best-effort local mapping on failure; normalization callback fires
  started→done (or started→error→done). Unknown flaggedPhrase categories coerce to 'crutch';
  missing ids are generated.
- HotTake pins: routes by provider id (same pattern as motif audit); single-call uses chat
  history or the synthetic "Read the full manuscript…" message, trackFilesChanged false;
  multi-call batches (20k words/batch) with prior-tracker threading, intermediate done/error
  interception (errors → status warnings), synthesis maxTurns = scratch+3, chat-only output,
  scratch cleanup only after synthesis; batch failure aborts before synthesis.
- Helper pins: single persistent conversation under HELPER_SLUG/purpose 'helper'; system prompt =
  agent prompt + USER_GUIDE.md from userDataPath (REAL node:fs read — temp dir in tests) with a
  degraded placeholder fallback; workingDir = active book dir else userDataPath; Helper
  maxTurns 5. fakes.ts fs fake gained activeBookSlug/getActiveBookSlug/setActiveBook.

### 2026-07-18 — Agent stop #11 (context limit)

Stopped cleanly after SESSION-17. All committed (latest: 5e25033). Suite: 52 files, 527 tests,
green. **Next eligible: SESSION-18** (MotifLedgerService, HotTakeService, HelperService).
HotTake/Helper follow the AdhocRevisionService handler shape (S15 test is the template);
QueryService S17 handoff has TWO recorded parse bugs worth a follow-up fix ticket.
Also eligible: S19–S21, S22.

### 2026-07-18 — SESSION-19 (import services)

- **Detector limitations recorded (candidate bugs, pinned in tests):**
  (1) CHAPTER_PATTERN matches ANY line starting "Chapter N …" — mid-prose sentences like
  "Chapter 3 was her favorite…" become false splits (the `.*?` tail is unanchored);
  (2) the heading strategy counts EVERY #/## line, so title-page headings become chapter 1;
  (3) all content before the first split is silently dropped from every chapter.
- Pins: strategy priority chapter-pattern (≥3) → headings (≥3) → single-chapter fallback
  (always ambiguous); bold-strip + section capitalization + italic-subtitle attachment
  ("Prologue — Before the Storm"); Part headings split; CRLF safe; ambiguity on >5× uneven
  chapter sizes. Import commit: `NN-slugified-title/draft.md` (fallback 'untitled'), status →
  first-draft after write; DOCX converts via pandoc argv `-f docx -t markdown --wrap=none`.
  Series import: name detection common-title-prefix → common parent dir → 'Imported Series';
  commit sorts by volumeNumber, links after each import, and a failing volume N aborts leaving
  volumes 1..N-1 imported+linked (partial state pinned).
- fakes.ts fs fake gained `createBook` (mutates `.meta`, slugifies title).

### 2026-07-18 — Agent stop #12 (context limit)

Stopped cleanly after SESSION-18. All committed (latest: 0a53c4a). Suite: 55 files, 546 tests,
green (first try). **Next eligible: SESSION-19** (ChapterDetector, ManuscriptImportService,
SeriesImportService — check `src/application/import/` for locations). Then S20 finishes
Phase D; S21 (main/IPC) and S22 (renderer harness — gates S23–S28) remain the big unlocks.
Also eligible: S20, S21, S22.

### 2026-07-18 — SESSION-20 (pitch room, dashboard, statistics, usage)

- **Application layer (Phase D) COMPLETE.** Completeness sweep clean: every non-index
  `src/application/**/*.ts` (incl. `context/TokenEstimator`, `import/ChapterDetector`,
  `thinkingBudget.ts`) has a co-located test.
- **Session-prompt drift (adapted, no code changes):** StatisticsService has no streak/velocity
  math — it's db aggregation + cost estimate; UsageService has no date-range params; PitchRoom
  has no app-level shelving/promotion (a source comment pins that Spark scaffolds books directly
  via CLI — shelving lives in FileSystemService, covered by S07).
- **fakes.ts fs fake extended:** settable `authorProfilePath` (getAuthorProfilePath),
  `pitchDraftBase` (getPitchDraftPath → `base/{conversationId}`), `recentFiles` (getRecentFiles).
- Pins: cost estimate uses the FIRST MODEL_PRICING entry (opus 15/75), thinking billed at output
  rate, rounded to cents; dashboard task regex needs the bullet at line start (indented
  checkboxes ignored), `[x]` case-insensitive; daysInProgress floors and clamps ≥0; PitchRoom
  mkdirs the draft dir on REAL fs (tests must point `pitchDraftBase` at a temp dir) and reads
  the author profile via real node:fs (whitespace-only profile skipped); event order pinned
  status → callStart → status → provider events.

### 2026-07-18 — SESSION-21 (main/IPC, preload, bootstrap, notifications)

- **Channel completeness is self-maintaining:** handlers.test.ts regex-extracts every
  `ipcRenderer.invoke('…')` from the preload SOURCE at test time and asserts a 1:1 match with
  registered `ipcMain.handle` channels (142 registered / 143 invoked; the delta is
  `window:isMaximized`). Verified the trip-wire by temporarily commenting `usage:summary`
  (failed as expected, restored). **Exceptions documented in the test:** `window:isMaximized`
  (handle) + `window:minimize/maximize/close` (`ipcMain.on`) live in `src/main/index.ts` —
  the composition root is EXCLUDED from unit coverage (Electron-launch only). No orphaned
  channels found.
- **🐛 Bug candidate (bootstrap, not fixed):** the `ensureAgents` rename migration
  (`FORGE.MD→FORGE.md`, `Quill.md→QUILL.md`) is case-only, so on case-insensitive filesystems
  (macOS APFS default, NTFS) `access(newPath)` matches the old file and the migration silently
  no-ops. Test probes fs case-sensitivity and pins both behaviors.
- **Mock/recipe notes:** electron mock's `Notification` now tracks `static instances` (clear in
  beforeEach). Handlers tests use a Proxy-based `auto()` recording fake (every method a memoized
  `vi.fn(async () => undefined)` — promise default keeps the many `.catch()`/`.then()` chains
  alive); only `revisionQueue.onEvent` runs at registration time. Preload test walks the whole
  api: every non-`on*` method must route EXACTLY one invoke/send; every `on*` unsubscribe must
  removeListener exactly what it registered.
- Pins: chat:send preserves renderer callId, tags events {callId, conversationId, source:'chat'},
  notifies complete-with-book-title vs error (mutually exclusive), snapshots changed files as
  'agent' + records word-count snapshot; files:write auto-snapshots as 'user' and survives
  snapshot failure; books:updateMeta migrates db slug + refires hook only on slug change;
  revision onEvent re-tags stream events with callId `rev:{sessionId}`; notifications gate on
  enabled && supported && unfocused, error bodies truncate at 117+'…'.

### 2026-07-18 — Agent stop #14 (context limit)

Stopped cleanly after SESSIONS 20+21. All committed (latest: 1791244). Suite: 66 files,
638 tests, green ×2; `npx tsc --noEmit` clean. **Phases D (application) and E (main/IPC) are
COMPLETE — sessions 02–21 all done.** Next eligible: **SESSION-22** (renderer test harness +
core stores) — it gates S23–S28. Key inputs for S22: the `window.novelEngine` placeholder in
`src/test/setup.renderer.ts` is an empty cast object (S01 note) — S22 must build the real typed
mock factory; the full bridge surface (30 namespaces, every method + subscription shape) is
pinned in `src/preload/index.test.ts` — mirror it. After S22: S23–S28 in any order, then the
S29 gate.

### 2026-07-18 — SESSION-22 (renderer harness + core stores)

- **Harness API for S23–S28 (`src/test/novelEngineMock.ts`):**
  `installNovelEngineMock(overrides?)` → typed `NovelEngineMock` — the FULL 30-namespace
  bridge, every method a `vi.fn()`. Obvious-empty methods resolve ([], null, '', false, 0,
  void); complex-object methods (import.preview, revision.loadPlan, motifLedger.load,
  dashboard.getData, statistics.get, query.loadTracker, findReplace.*, series CRUD, …)
  REJECT with a "no sensible empty default" error until overridden — override or
  `mockResolvedValue` before exercising them. Push events: `mock.emit(channel, ...args)`
  and `mock.listenerCount(channel)`; channels = books:changed, import:generationProgress,
  chat:streamEvent, chat:filesChanged, build:progress, revision:event,
  motifLedger:normalizing, window:maximizeChange, query:onStream. Fixture factories
  exported: makeAppSettings/BookMeta/BookSummary/Conversation/Message/AgentMeta/
  ActiveStreamInfo/UsageRecord. Stream events are emitted with enrichment fields inline:
  `mock.emit('chat:streamEvent', { type: 'textDelta', text, callId, conversationId?, source? })`.
- **`src/test/resetStores.ts`:** `resetStoresBeforeEach(...stores)` — call at test-file
  module scope; snapshots pristine state immediately and registers a beforeEach that
  `localStorage.clear()`s and full-replace-restores each store. Register stores with
  cross-store SUBSCRIPTIONS (workspaceStore) LAST so restore-triggered subscriptions
  can't dirty them.
- **Typing gotcha:** preload `on*` cleanups without an explicit annotation return
  `Electron.IpcRenderer` (chained removeListener) — the mock's subscribe returns
  `() => Electron.IpcRenderer` to satisfy both shapes.
- **🐛 Bug candidate (not fixed, pinned in chatStore.test.ts):** `setActiveBook` sets
  `bookStore.activeSlug` BEFORE `switchBook`, so switchBook's "departing book" save writes
  the old conversation id under the NEW book's localStorage key — clobbering the new book's
  saved spot (membership guard then falls back to "most recent") and never saving the
  departing book's. Per-book conversation restore is effectively broken whenever a
  conversation is active at switch time.
- **Session-prompt drift (adapted):** viewStore has no guards and persists via zustand
  `persist` middleware (localStorage `novel-engine-view`, v6 migrate tested through
  `useViewStore.persist`), not the bridge; settingsStore.update is confirmed-only (bridge
  update → reload), NOT optimistic — pinned.
- chatStore recovery poll (2s interval, module-level timer): afterEach must call
  `destroyStreamListener()` to clear it; the poll-completion test uses
  `vi.useFakeTimers()` + `advanceTimersByTimeAsync`.

### 2026-07-18 — SESSION-23 (streaming stores)

- **Session-prompt drift (adapted):** pipelineStore is a per-book CACHE over bridge CRUD
  (no phase-progress events); revisionQueueStore has NO event subscription — revision
  events are consumed by `src/renderer/hooks/useRevisionQueueEvents.ts` (cover it in the
  component sessions, S26–S28); cliActivityStore is the "activity feed" (per-call entry
  log, cap 500/call, completed-call cap 10).
- **Pins worth knowing:** streamHandler blockEnd is a no-op; unknown event types silently
  ignored; `rev:`-prefixed callIds only skipped when `source` is absent. cliActivity
  pruning runs ONLY inside callStart (a completed 11th call survives until the next
  spawn); events without callId fall back to the newest ACTIVE call; a status event with
  zero calls creates a synthetic 'Wrangler' `_default` call. revisionQueue: pause/setMode
  are optimistic (state first, bridge after); a run finishing after `planId` changed
  leaves state untouched (incl. isRunning=true — pinned). autoDraft: audit runs per new
  chapter (fix only on moderate/heavy), stop() aborts via chat.abort, finally clears
  stopRequested.
- **Module-level state gotchas:** revisionQueueStore's per-book cache + autoDraft/cliActivity
  recovery-poll timers live OUTSIDE the store — resetStores does NOT clear them. Tests use
  unique book slugs per switchToBook test and fake timers + poll-self-clear for recovery.
- **autoDraftStore runs on real timers** (fixed 300/400/600 ms delays in the loop) — the
  file takes ~6s wall time; loop scenarios script `books.wordCount` / `chat.getMessages`
  with mockResolvedValueOnce queues (see file for the per-iteration call order).
- **Event-shape fixtures:** enriched stream events are built inline
  (`{ type, …, callId, conversationId?, source? }` — see streamHandler/chatStore tests);
  cliActivity tests show the callStart shape. Component tests (S26–S28) can copy these
  patterns; no separate fixture module was needed.

### 2026-07-18 — SESSION-24 (remaining stores I)

- **Session-prompt drift (adapted, pinned):** fileChangeStore is a bare monotonic counter
  (no per-book filtering/dedupe — chatStore decides when to bump); paletteStore has no
  recent-commands and `enabled()` is advisory metadata (visibleItems does NOT filter by
  it — pinned); motifLedgerStore has no book-switch subscription (views call `load`);
  pitchRoom draft save/shelve live in FileSystemService/PitchRoomService (S07/S20), the
  store only reads draft status + promotes.
- **Modal-chat family pattern:** helper/modalChat/pitchRoom all use
  `alwaysCheckConversationId: true` (strict conversation guard pinned in each).
  Listener re-registration differs: helper/modalChat REPLACE on re-init; pitchRoom KEEPS
  the first registration (early-return) — pinned. modalChat's deferred close
  (`_closeRequested` honored by done AND error handlers) pinned.
- Pins: importStore removeChapter folds content into the previous chapter (first chapter's
  content is discarded, last chapter unremovable), merge/remove reindex `index`;
  startImport falls back to settings.authorName then '' and 'Untitled'; dashboardStore
  discards stale results via the loadedSlug guard; motif removeSystem detaches entries'
  systemId; palette group order Actions→Phases→Chapters→Books→Navigate, providers pull
  live from pipeline/book stores.
- paletteStore's built-in registrations happen at module import — the resetStores snapshot
  includes them, so tests see the Actions/Navigate baseline.

### 2026-07-18 — SESSION-25 (remaining stores II — store layer COMPLETE)

- **Completeness sweep clean:** every non-test file in `src/renderer/stores/` (25 stores +
  streamHandler) now has a co-located test. No stores were added since program generation.
- **Session-prompt drift (adapted):** providerStore "selection persistence" =
  setDefault → providers reload + settingsStore reload (pinned); queryStore is the
  query-MANAGER (agents/publishers tracker + letters), not saved queries; statisticsStore
  has no time ranges — only the per-book filter (explicit slug > stored filter > all);
  tourStore has no step progression (steps live in tour components) — it tracks
  active/completed tours hydrated from settings; versionStore has no confirmation state.
- Pins: queryStore strips the Electron IPC prefix from research rejections
  (`Error invoking remote method '…': Error: X` → `X`); query stream deltas route by
  isGenerating/isResearching flags; seriesImport toggleVolumeSkip/move renumber only
  non-skipped volumes, commit falls back to `Volume N` titles and no-ops when all skipped;
  versionStore diffs against the next-OLDER version (newest-first list; oldest → null);
  tour completeTour keeps local completion even when settings persistence fails.

### 2026-07-18 — Agent stop #15 (context limit)

Stopped cleanly after SESSIONS 22+23+24+25 (one run). All committed (latest: 9e5840f).
Suite: 89 files, 897 tests, green; shuffle-stable; `npx tsc --noEmit` clean.
**Store layer (S22–S25) COMPLETE — 26/26 store files tested.** Next eligible:
**SESSION-26** (Components I — shell: Layout, Sidebar, Rail, StatusBar, common) — it gates
S27/S28. Key inputs for S26–S28: `installNovelEngineMock` + `resetStoresBeforeEach`
(S22 handoff), enriched-event emit patterns (S23 handoff), and the per-store pins above.
Components render with @testing-library/react in the jsdom project; remember the
chatStore/cliActivity recovery-poll cleanup (destroyStreamListener in afterEach) when a
component wires stream listeners. Then S29 (coverage gate) closes the program.

### 2026-07-18 — SESSION-26 (components I — shell)

- **`renderApp` API for S27/S28 (`src/test/renderWithState.tsx`):**
  `renderApp(ui, { stores?, bridge? })` → RTL utils + `bridge` (the installed
  `NovelEngineMock`). `stores` is `[store, partialState]` pairs applied via merging
  setState after the bridge mock installs; `bridge` forwards to
  `installNovelEngineMock(overrides)`. Still call `resetStoresBeforeEach(...)` at
  module scope as before.
- **Harness fix (`src/test/setup.renderer.ts`):** added explicit RTL `cleanup()` in a
  global-setup `afterEach` — RTL auto-cleanup never ran because vitest runs without
  `globals: true`, so rendered trees leaked across tests ("found multiple elements").
  This applies suite-wide now; store tests are unaffected (nothing rendered).
- **Import-depth gotcha:** component dirs are 3 levels deep — test helpers import as
  `../../../test/...` (stores use `../../test/...`).
- **jsdom recipes:** GuidedTourOverlay.test.tsx carries guarded stubs for
  `Element.prototype.scrollIntoView` + `ResizeObserver`. `window.location.reload` is
  unforgeable in jsdom (spy impossible) — ErrorBoundary's Reload is asserted as
  click-does-not-throw. jsdom prints ErrorBoundary-caught render errors to stderr
  (expected noise). Tooltip tests drive hover state via real `element.focus()/blur()`
  (React's delegated onFocus doesn't fire from `fireEvent.focus`); tooltip visibility
  is fake-timer driven (300ms enter / 100ms exit).
- **Deviation (deferred, not skipped): no AppLayout.test.tsx.** AppLayout is the whole
  app composition — mounting it mounts all 8 views + global modals/managers, which is
  exactly S28's "App smoke" item. Testing it here would duplicate S28 and need every
  view's bridge surface stubbed. S28 must cover: shell regions render, only the
  active view is visible (`hidden` class per ViewContent), ⌘K PaletteManager keybind,
  TourManager hydration.
- **No `data-testid` added to source; zero source changes.** Coverage: common/ (Icon,
  agentColors, ProseViewer + useBookFile, Tooltip, VersionHistoryModal,
  GuidedTourOverlay), Layout/ (TitleBar, ResizeHandle), Sidebar/ (ImportChoiceModal,
  PitchPreviewModal), Rail/ (IconRail), StatusBar/ (StatusBar, ActivityDrawer),
  ErrorBoundary/. VersionHistoryModal renders the real VersionHistoryPanel +
  versionStore against default bridge resolvers ([] history) — deeper Files/ panel
  behavior stays with S27.
- Behavior pins: IconRail `needsBook` items are `aria-disabled` + click-inert without
  an active book; TitleBar breadcrumb = view label in Library, `Book / View` elsewhere,
  phase label in workspace; word count hidden in Library/no-book; window controls
  render on non-mac UA (jsdom) and maximize label flips on `window:maximizeChange`;
  StatusBar sums session tokens across calls (1.5K formatting) and returns to Idle
  after `done`; ActivityDrawer honors persisted height, drag-up grows (direction
  'up'), double-click resets to 208 and persists.

### 2026-07-18 — Agent stop #16 (context limit)

Stopped cleanly after SESSION-26. All committed (latest: 0a46a4d). Suite: 106 files,
964 tests, green ×2; `npx tsc --noEmit` clean. **Next eligible: SESSION-27**
(Components II — Chat 8 files, Workbench 6 + companion/, Manuscript 3, Files 7;
~5.6k source lines — plan on reading each file before testing, and consider splitting
the run if context is tight). Key inputs: the S26 handoff directly above (renderApp
API, RTL-cleanup fix, ../../../test/ import depth, jsdom stub recipes), S22–S25 store
pins, and the S23 note that `useRevisionQueueEvents` (hook) is owed coverage by the
component sessions. Note VersionHistoryPanel/DiffViewer already get shallow coverage
via S26's VersionHistoryModal test — S27 owns their real behavior. After S27: S28
(includes the deferred AppLayout smoke), then the S29 gate.

### 2026-07-18 — SESSION-27 (components II — Chat, Workbench, Manuscript, Files)

- **28 test files, 197 tests; zero source changes.** Coverage: Chat/ (8), Workbench/ (5 +
  companion/ 4), Manuscript/ (3), Files/ (7), plus `useRevisionQueueEvents` (hook owed from
  S23). `usePhaseConversations.ts` has no own test file — it is a hook fully exercised
  through ChatPane.test.tsx (filter/sort, workspace-only auto-activate, create) — the one
  sweep exception.
- **🐛 Bug candidate (ThinkingBlock, not fixed — pinned in ThinkingBlock.test.tsx):** the
  1.5s auto-collapse-after-streaming timer is scheduled and immediately cancelled —
  `setWasStreaming(false)` in the sibling effect re-renders, the dep change runs the
  collapse effect's cleanup, and `clearTimeout` fires before the timer can. In-place
  auto-collapse never happens; blocks only appear collapsed because the streaming block
  unmounts and MessageBubble mounts a fresh collapsed one. Fix would be decoupling the
  timer from the `wasStreaming` dep (e.g. track prev-streaming in a ref).
- **jsdom recipes for S28:** IntersectionObserver needs a guarded class stub (MessageList,
  ManuscriptView); scrollIntoView stub as in S26. Action-override seeding
  (`stores: [[useChatStore, { sendMessage: vi.fn() }]]`) works cleanly with resetStores —
  restored next test. cliActivity agentBusy is easiest driven via
  `handleStreamEvent({type:'callStart', …})` (see ManuscriptView.test.tsx) + afterEach
  `destroyListener()`.
- Pins worth knowing: ChatInput quick-action popover mounts slider lazily; QuickActions
  saved-prompt save/delete round-trips through settingsStore.update → bridge
  settings.update+load; SplitPane persists ratio/collapse under
  `novel-engine:workbench-split*`; ExplorerTab preview-back returns to the SAME directory;
  ChapterRail back-matter add writes `chapters/z{N}-{slug}/draft.md` (next zN from max);
  ManuscriptView tracked-edit UI keys off `chapters/(\d+)-…/draft.md` with NN ≥ 2 (chapter
  01 is untracked); FileEditor auto-saves dirty content via the bridge on unmount unless
  disabled; VersionHistoryPanel diffs selected vs next-OLDER version (`getDiff(prevId, id)`).
- Timezone gotcha: AboutJsonViewer renders `created` via toLocaleDateString — tests must
  tolerate ±1 day (regex), never assert an exact local date from a UTC ISO string.
- Suite after S27: 134 files, 1161 tests, green ×2; `npx tsc --noEmit` clean.

### 2026-07-18 — Agent stop #17 (context limit)

Stopped cleanly after SESSION-27. All committed (latest: 831c224). Suite: 134 files,
1161 tests, green ×2; `npx tsc --noEmit` clean. **Next eligible: SESSION-28**
(Components III — Library, Series, PitchRoom, Import, Settings + the App smoke deferred
from S26; see the S26 handoff for exactly what the smoke must cover). Key inputs: the
S27 handoff directly above (jsdom stubs, action-override seeding, cliActivity recipe),
renderApp/installNovelEngineMock (S22/S26). After S28 only the S29 coverage gate remains.

### 2026-07-18 — Agent stop #13 (context limit)

Stopped cleanly after SESSION-19. All committed (latest: 8b045f5). Suite: 58 files, 566 tests,
green. **Next eligible: SESSION-20** (PitchRoomService, DashboardService, StatisticsService,
UsageService) — the LAST Phase D session. Dashboard/Statistics/Usage are thin db/fs aggregators
(S05 covered the SQL side); PitchRoomService follows the S15/S18 handler shape and uses
`fs.getPitchDraftPath` (S07 pins). After S20: S21 (main/IPC) and S22 (renderer harness).
