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
| 09 | codex-cli — CodexCliClient | M11 | pending | | |
| 10 | ollama-cli I — BashEmulator, ToolExecutor, tools, contextCompactor | M12 | pending | | |
| 11 | ollama-cli II — OllamaCodeClient, OllamaCliRunner, WebSearcher | M12 | pending | | |
| 12 | llama-server + providers | M13, M15 | pending | | |
| 13 | ChatService, StreamManager, ContextBuilder | M08 | pending | | |
| 14 | PipelineService, BuildService, SourceGenerationService, ChapterValidator | M08 | pending | | |
| 15 | RevisionQueueService, AdhocRevisionService | M08 | pending | | |
| 16 | MultiCallOrchestrator, AuditService | M08 | pending | | |
| 17 | QueryService, VersionService, FindReplaceService | M08 | pending | | |
| 18 | MotifLedgerService, HotTakeService, HelperService | M08 | pending | | |
| 19 | Import services — ChapterDetector, ManuscriptImport, SeriesImport | M08 | pending | | |
| 20 | PitchRoom, Dashboard, Statistics, Usage services | M08 | pending | | |
| 21 | main/IPC handlers, preload bridge, bootstrap, notifications | M09 | pending | | |
| 22 | Renderer test harness + core stores | M10 | pending | | |
| 23 | Streaming stores | M10 | pending | | |
| 24 | Remaining stores I | M10 | pending | | |
| 25 | Remaining stores II | M10 | pending | | |
| 26 | Components I — shell (Layout, Sidebar, Rail, StatusBar, common) | M10 | pending | | |
| 27 | Components II — Chat, Workbench, Manuscript, Files | M10 | pending | | |
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
