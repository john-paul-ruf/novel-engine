# Application — Services & Orchestration

> Last updated: 2026-03-28

Everything in `src/application/`. Business logic that orchestrates infrastructure through injected interfaces.

---

## Services

### ChatService

File: `src/application/ChatService.ts`

Dependencies: `ISettingsService`, `IAgentService`, `IDatabaseService`, `IProviderRegistry`, `IFileSystemService`, `IChapterValidator`, `IPitchRoomService`, `IHotTakeService`, `IAdhocRevisionService`, `StreamManager`, `ISeriesService`

Clean router (403 lines). Delegates special-purpose flows to sub-services. Only the default pipeline flow (context assembly + CLI call) remains inline. Uses `resolveThinkingBudget()` for CLI call configuration.

| Method | What It Does |
|--------|-------------|
| `createConversation(params)` | Creates a conversation record in the database |
| `getConversations(bookSlug)` | Lists conversations for a book |
| `getMessages(conversationId)` | Retrieves message history |
| `sendMessage(params)` | Assembles context → spawns CLI stream → saves messages → emits events. Returns `{ changedFiles: string[] }`. |
| `abortStream(conversationId)` | Kills the active CLI process for a conversation |
| `isCliIdle(bookSlug?)` | Checks if any CLI processes are running (optionally scoped to a book) |
| `getActiveStream()` | Returns `ActiveStreamInfo` for the current stream (refresh recovery) |
| `getActiveStreamForBook(bookSlug)` | Returns active stream scoped to a specific book |
| `getLastDiagnostics(conversationId?)` | Context assembly diagnostics from `diagnosticsMap` (per-conversation, max 20 entries, LRU pruning). Falls back to most recent entry when no `conversationId` given. |
| `recoverOrphanedSessions()` | Startup recovery — marks interrupted sessions |
| `getRecoveredOrphans()` | Returns sessions marked as interrupted |
| ~~`auditChapter`~~ | *Moved to AuditService (ARCH-05)* |
| ~~`fixChapter`~~ | *Moved to AuditService (ARCH-05)* |
| ~~`runMotifAudit`~~ | *Moved to AuditService (ARCH-05)* |

**Flow (sendMessage):**
1. Load agent (with phase-specific composite prompt for Verity)
2. Load settings (model, thinking budget)
3. Build context via `ContextBuilder`
4. Save user message to database
5. Spawn CLI stream via `IProviderRegistry.sendMessage`
6. Forward stream events to `onEvent` callback
7. On `done`: save assistant message, record usage, run chapter validation
8. On `error`: emit error event

**Special modes** (prompt templates loaded at runtime via `AgentService.loadRaw()`):
- `voice-setup`: Appends `VOICE-SETUP.md` to Verity's prompt
- `author-profile`: Appends `AUTHOR-PROFILE.md` to Spark's prompt (with path substitution)
- `pitch-room`: *Delegated to PitchRoomService (ARCH-06)*
- `hot-take`: *Delegated to HotTakeService (ARCH-07)*
- `adhoc-revision`: *Delegated to AdhocRevisionService (ARCH-08)*

### HotTakeService

File: `src/application/HotTakeService.ts`

Dependencies: `IAgentService`, `IProviderRegistry`, `IDatabaseService`, `IFileSystemService`, `StreamManager`

Implements: `IHotTakeService`

Handles Ghostlight "hot take" conversations. Always uses Opus (`HOT_TAKE_MODEL`). Cold-reads the full manuscript and delivers a gut reaction. No files written.

| Method | What It Does |
|--------|-------------|
| `handleMessage(params)` | Builds chapter listing, loads HOT-TAKE.md instructions, streams via Ghostlight with `trackFilesChanged: false` |

### AdhocRevisionService

File: `src/application/AdhocRevisionService.ts`

Dependencies: `IAgentService`, `IAuditService`, `IProviderRegistry`, `IDatabaseService`, `IFileSystemService`, `StreamManager`

Implements: `IAdhocRevisionService`

Handles ad hoc revision conversations with Forge. Runs a motif audit pre-step, then Forge reads the manuscript and generates project-tasks.md and revision-prompts.md.

| Method | What It Does |
|--------|-------------|
| `handleMessage(params)` | Runs motif audit (non-fatal), builds project manifest, loads ADHOC-REVISION.md, streams via Forge |

### PitchRoomService

File: `src/application/PitchRoomService.ts`

Dependencies: `IAgentService`, `IProviderRegistry`, `IDatabaseService`, `IFileSystemService`, `StreamManager`

Implements: `IPitchRoomService`

Handles pitch-room conversations with the Spark agent. Unique concerns: custom working directory, author profile loading, books path injection for scaffolding.

| Method | What It Does |
|--------|-------------|
| `handleMessage(params)` | Loads author profile, builds Pitch Room prompt with `{{BOOKS_PATH}}` replacement, creates draft directory, streams via Spark agent |

### AuditService

File: `src/application/AuditService.ts`

Dependencies: `ISettingsService`, `IAgentService`, `IProviderRegistry`, `IDatabaseService`, `IFileSystemService`, `IUsageService`

Implements: `IAuditService`

Owns the chapter audit/fix subsystem — three cohesive operations that were extracted from ChatService.

| Method | What It Does |
|--------|-------------|
| `auditChapter(params)` | Runs Verity audit agent on a single chapter draft. Returns parsed `AuditResult` or null. Uses Sonnet for speed/cost. |
| `fixChapter(params)` | Runs Verity fix pass using audit findings. Edits draft in-place. Uses Opus for creative judgment. |
| `runMotifAudit(params)` | Runs Lumen's phrase/motif audit (Lens 8) across the full manuscript. Updates motif-ledger.json flaggedPhrases. |

**Audit flow:**
1. Read chapter draft + voice profile + motif ledger (non-fatal if missing)
2. Load auditor prompt via `agents.loadRaw(VERITY_AUDIT_AGENT_FILE)`
3. Spawn CLI with Sonnet, 120s timeout
4. Parse JSON response → `AuditResult`

**Fix flow:**
1. Load Verity core prompt + VERITY-FIX.md template + audit JSON
2. Spawn CLI with Opus, 5min timeout
3. Verity edits the draft file in-place

### StreamManager

File: `src/application/StreamManager.ts`

Dependencies: `IDatabaseService`, `IUsageService`

Owns the `activeStreams` map and the repetitive stream lifecycle pattern used by every CLI agent call. Every stream handler in the app should use `startStream()` instead of manually managing buffers, active stream entries, and done/error cleanup.

| Method | What It Does |
|--------|-------------|
| `startStream(params, options?)` | Registers active stream, returns `{ onEvent, getResponseBuffer, getThinkingBuffer, getChangedFiles }` — caller passes `onEvent` to `claude.sendMessage()`. Changed files tracked per-stream via closure (no singleton). |
| `getActiveStream()` | Returns info about any active CLI stream, or null |
| `getActiveStreamForBook(bookSlug)` | Returns active stream for a specific book, or null |
| `cleanupAbortedStream(conversationId)` | Returns partial state for abort handling, removes active stream |
| `cleanupErroredStream(conversationId, sessionId)` | Ends session as idle, removes active stream |

**Stream lifecycle (handled by `startStream` callback):**
1. Register active stream in Map
2. Emit `callStart` event
3. Accumulate `textDelta` / `thinkingDelta` into buffers
4. Track `progressStage` and `toolDuration` on active stream
5. On `done`: save assistant message, record usage, end session, delete active stream, call optional `onDone` hook
6. On `error`: end session as idle, delete active stream
7. Forward all events to caller's `onEvent`

### resolveThinkingBudget

File: `src/application/thinkingBudget.ts`

Pure function. Resolves the effective thinking budget for a CLI call with priority: per-message override → global override (settings) → per-agent default → undefined (disabled).

### ContextBuilder

File: `src/application/ContextBuilder.ts`

Dependencies: `ISettingsService`, `IAgentService`, `IDatabaseService`, `IFileSystemService`

| Method | What It Does |
|--------|-------------|
| `buildContext(params)` | Assembles `AssembledContext` with system prompt, conversation messages, and diagnostics |

**Context assembly strategy:**
1. Load the agent's system prompt
2. Build project manifest (file listing with token estimates)
3. Apply `AGENT_READ_GUIDANCE` to determine which files to include
4. Replace `series-bible.md` placeholder with absolute path in guidance (when book is in a series)
5. Add "Series Context" block to system prompt with bible path (when applicable)
6. Append manifest section to system prompt showing available files
5. Compact conversation history using `TURN_BUDGET_THRESHOLDS`:
   - **Generous** (>40% free): keep all turns, strip old thinking blocks
   - **Moderate** (20-40%): keep last 8 turns, prepend summary
   - **Tight** (10-20%): keep last 4 turns, prepend summary
   - **Critical** (<10%): keep last 2 turns + brief recap
6. Return assembled context with diagnostics

### ChapterValidator

File: `src/application/ChapterValidator.ts`

Dependencies: `booksDir: string` (constructor)

| Method | What It Does |
|--------|-------------|
| `validateAndCorrect(bookSlug)` | Scans chapters directory, detects misplaced files, moves them to correct structure |

Runs after every CLI interaction to fix agent file placement errors.

### PipelineService

File: `src/application/PipelineService.ts`

Dependencies: `IFileSystemService`

| Method | What It Does |
|--------|-------------|
| `detectPhases(bookSlug)` | Checks file existence → returns all 14 phases with statuses |
| `getActivePhase(bookSlug)` | Returns the first phase that is not 'complete' |
| `getAgentForPhase(phaseId)` | Looks up agent from `PIPELINE_PHASES` |
| `markPhaseComplete(bookSlug, phaseId)` | Advances book status for status-dependent phases |
| `confirmPhaseAdvancement(bookSlug, phaseId)` | Transitions 'pending-completion' → 'complete' via `pipeline-state.json` |
| `completeRevision(bookSlug)` | Archives reader-report.md → reader-report-v1.md (and dev-report) |
| `revertPhase(bookSlug, phaseId)` | Removes phase + all subsequent from confirmed list, undoes side-effects |

**Phase detection:**
- File-existence phases: check if the gating file exists
- Status-dependent phases (`first-draft`, `mechanical-fixes`): check book status in `about.json`
- Archive-dependent phases (`revision`): check for versioned archive files
- `pending-completion`: detection files exist but not yet confirmed in `pipeline-state.json`
- Confirmed phases stored in `{bookDir}/pipeline-state.json`

**Revert side-effects:**
- `first-draft`: reverts book status to 'first-draft'
- `mechanical-fixes`: reverts book status to 'copy-edit'
- `revision`: removes archived v1 report files

### BuildService

File: `src/application/BuildService.ts`

Dependencies: `IFileSystemService`, `pandocPath: string`, `booksDir: string`

| Method | What It Does |
|--------|-------------|
| `build(bookSlug, onProgress)` | Concatenates chapters → writes output.md → runs Pandoc for DOCX/EPUB/PDF |
| `isPandocAvailable()` | Checks if Pandoc binary exists and is executable |

**Build flow:**
1. Read all chapters in order from `chapters/` directory
2. Concatenate into `dist/output.md` with chapter headings
3. Run Pandoc for each requested format (DOCX, EPUB, PDF)
4. Report progress via callback
5. Return `BuildResult` with paths and any errors

### UsageService

File: `src/application/UsageService.ts`

Dependencies: `IDatabaseService`

| Method | What It Does |
|--------|-------------|
| `getSummary(bookSlug?)` | Aggregated token usage (optionally scoped to book) |
| `getByConversation(conversationId)` | Usage records for a single conversation |
| `recordUsage(record)` | Delegates to `IDatabaseService.recordUsage` |

### RevisionQueueService

File: `src/application/RevisionQueueService.ts`

Dependencies: `IFileSystemService`, `IProviderRegistry`, `IAgentService`, `IDatabaseService`, `ISettingsService`

| Method | What It Does |
|--------|-------------|
| `loadPlan(bookSlug)` | Reads revision-prompts.md + project-tasks.md → sends to Wrangler for parsing → returns `RevisionPlan` |
| `clearCache(bookSlug)` | Removes cached parse from disk |
| `runSession(planId, sessionId)` | Sends session prompt to Verity, streams response, fires events |
| `runAll(planId, selectedIds?)` | Runs all pending sessions sequentially (respects mode and pause) |
| `respondToGate(planId, sessionId, action, message?)` | Author decision at approval gate |
| `approveSession(planId, sessionId)` | Marks tasks as `[x]` in project-tasks.md |
| `rejectSession(planId, sessionId)` | Resets session to `pending` for re-run |
| `skipSession(planId, sessionId)` | Marks as `skipped`, tasks stay `[ ]` |
| `pause(planId)` | Sets pause flag — queue stops after current session |
| `setMode(planId, mode)` | Changes queue execution mode |
| `getPlan(planId)` | Returns in-memory plan |
| `getQueueStatus(bookSlug)` | Returns live running state for frontend recovery |
| `startVerification(planId)` | Creates Forge conversation for post-revision verification |
| `onEvent(callback)` | Subscribes to revision queue events |

**Plan parsing:**
Uses Wrangler model (Sonnet) with `WRANGLER-PARSE.md` (loaded via `AgentService.loadRaw()`) to parse Forge's markdown output into structured JSON. Caches the parsed result on disk.

**Queue modes:**
- `manual`: pause after every session for approval
- `auto-approve`: approve and continue automatically
- `auto-skip`: skip all sessions (for testing)
- `selective`: only run selected sessions

### MotifLedgerService

File: `src/application/MotifLedgerService.ts`

Dependencies: `IFileSystemService`, `IProviderRegistry`

| Method | What It Does |
|--------|-------------|
| `load(bookSlug)` | Reads `source/motif-ledger.json`, repairs malformed JSON. If the data uses a non-canonical schema, normalizes via a CLI call (Sonnet) then saves the canonical version back to disk. Returns `MotifLedger`. |
| `save(bookSlug, ledger)` | Writes `source/motif-ledger.json` |
| `getUnauditedChapters(bookSlug)` | Compares chapter list against audit log |
| `setNormalizationCallback(cb)` | Registers a callback to receive `'started'`/`'done'`/`'error'` events during CLI normalization. Used by the composition root to broadcast to the renderer. |

**JSON repair:** Agents frequently produce JSON with minor syntax errors. `load()` first attempts a standard `JSON.parse()`. On failure, it runs `repairJson()` which operates line-by-line, only fixing lines that are purely structural (lone `}` or `]`): inserting missing commas between adjacent objects and removing trailing commas. Never touches string content.

**Schema normalization (CLI):** Agents write the motif ledger with arbitrary field names, nested objects where flat strings are expected, and missing fields. `isCanonicalShape()` checks the first entry in `systems`, `entries`, `foreshadows`, and `structuralDevices` for known non-canonical patterns (e.g. `associatedCharacters` on systems, object-typed `firstAppearance` on entries, `plant`/`payoff` on foreshadows). If non-canonical, `normalizeViaCli()` sends the raw JSON to a Sonnet CLI call with a structured prompt containing the full target schema and field mapping rules. The CLI returns canonical JSON which is parsed, validated, saved back to disk (so normalization only fires once per malformed file), and returned to the caller. If CLI normalization fails, falls back to a best-effort `parseLedgerFromCanonical()` which fills missing fields with defaults.

**Normalization callback:** The composition root (`src/main/index.ts`) registers a callback via `setNormalizationCallback()` that broadcasts `motifLedger:normalizing` events to all renderer windows. The `MotifLedgerView` subscribes to these events and shows a spinner during normalization.

### VersionService

File: `src/application/VersionService.ts`

Dependencies: `IDatabaseService`, `IFileSystemService`

| Method | What It Does |
|--------|-------------|
| `snapshotFile(bookSlug, filePath, source)` | Reads file from disk, hashes, dedup-checks, stores if changed |
| `snapshotContent(bookSlug, filePath, content, source)` | Same as above but from in-memory content |
| `getHistory(bookSlug, filePath, limit?, offset?)` | Returns paginated version summaries, newest first |
| `getVersion(versionId)` | Returns full version with content |
| `getDiff(oldVersionId, newVersionId)` | Computes structured diff using `diff.structuredPatch()` |
| `revertToVersion(bookSlug, filePath, versionId)` | Writes historical content to disk + creates "revert" snapshot |
| `getVersionCount(bookSlug, filePath)` | Returns total version count |
| `pruneVersions(bookSlug, keepCount?)` | Deletes old versions beyond retention limit (default 50) |

**Key behaviors:**
- Only versions `.md` and `.json` files (`isVersionable()` check)
- SHA-256 dedup: skips snapshot when content hash matches latest version
- Exception: `revertToVersion()` always creates a snapshot for auditability
- Diff uses `diff.structuredPatch()` with 3 lines of context, producing `DiffHunk[]` with per-line numbering

### ManuscriptImportService

File: `src/application/ManuscriptImportService.ts`

Dependencies: `IFileSystemService`, `pandocPath: string`

| Method | What It Does |
|--------|-------------|
| `preview(filePath)` | Reads file, converts DOCX via Pandoc if needed, runs chapter detection, returns `ImportPreview` |
| `commit(config)` | Creates book via `IFileSystemService.createBook()`, writes each chapter as `chapters/{slug}/draft.md`, updates status to `first-draft` |

**Key behaviors:**
- Accepts `.md`, `.markdown`, `.txt` (as markdown) and `.docx` files
- DOCX conversion uses bundled Pandoc binary (`pandoc -f docx -t markdown --wrap=none`)
- Imports `child_process` and `fs` directly (same exception as BuildService)
- Chapter slugs: `{NN}-{slugified-title}` (e.g., `01-the-beginning`)

### ChapterDetector

File: `src/application/import/ChapterDetector.ts`

Pure utility — no class, no dependencies. Exports three functions.

| Function | What It Does |
|----------|-------------|
| `detectChapters(markdown)` | Detects chapter boundaries by heading patterns (≥3 matches), "Chapter N" patterns (≥3 matches), or fallback single-chapter |
| `detectTitle(markdown)` | Extracts title from first `# Heading` |
| `detectAuthor(markdown)` | Extracts author from "by Author" or "Author: Name" patterns |

**Ambiguity detection:** Set `ambiguous = true` if <3 chapters in a >10K word doc, or if any chapter is >5× the smallest, or if using fallback.

### SeriesImportService

File: `src/application/SeriesImportService.ts`

Dependencies: `IManuscriptImportService`, `ISeriesService`

| Method | What It Does |
|--------|-------------|
| `preview(filePaths)` | Previews each file via `IManuscriptImportService.preview()`, wraps as `SeriesImportVolume[]`, detects common series name |
| `commit(config)` | Creates/resolves series, imports each volume sequentially via `IManuscriptImportService.commit()`, links to series via `ISeriesService.addVolume()` |

**Key behaviors:**
- Series name detection: longest-common-prefix of detected titles → strip trailing noise (Book/Vol/numbers) → fallback to common parent directory → "Imported Series"
- Sequential import: books created one at a time to avoid filesystem contention
- No rollback on partial failure: previously imported books remain if a later one fails
- Volumes sorted by `volumeNumber` before import to ensure correct series ordering

### SourceGenerationService

File: `src/application/SourceGenerationService.ts`

Dependencies: `ISettingsService`, `IAgentService`, `IDatabaseService`, `IFileSystemService`, `IProviderRegistry`

| Method | What It Does |
|--------|-------------|
| `generate(params)` | Runs 4 sequential agent calls with per-step progress events |

**Steps:**
1. **Spark** → `source/pitch.md`
2. **Verity** → `source/scene-outline.md` + `source/story-bible.md`
3. **Verity** → `source/voice-profile.md`
4. **Verity** → `source/motif-ledger.json`

Each step creates its own conversation. Step errors are caught and reported without aborting remaining steps.

### HelperService

File: `src/application/HelperService.ts`

Dependencies: `ISettingsService`, `IAgentService`, `IDatabaseService`, `IFileSystemService`, `IProviderRegistry`, `StreamManager`

| Method | What It Does |
|--------|-------------|
| `getOrCreateConversation()` | Returns existing helper conversation or creates one with `HELPER_SLUG` |
| `getMessages(conversationId)` | Delegates to `IDatabaseService.getMessages()` |
| `sendMessage(params)` | Loads agent + user guide → builds system prompt → streams via provider registry |
| `abortStream(conversationId)` | Delegates to `IProviderRegistry.abortStream()` |
| `resetConversation()` | Deletes the existing helper conversation |

Key behaviors:
- Single persistent conversation per app (not per book) using `HELPER_SLUG = '__helper__'`
- System prompt = HELPER.md agent prompt + USER_GUIDE.md content (read from userData)
- Working directory = active book dir if one exists, else userData root
- Uses `StreamManager` for accumulation/saving/usage recording (same pattern as PitchRoomService)
- No context wrangling, no pipeline awareness, no file watching

### FindReplaceService

File: `src/application/FindReplaceService.ts`

Dependencies: `IFileSystemService`, `IVersionService`

| Method | What It Does |
|--------|-------------|
| `preview(bookSlug, searchTerm, options)` | Lists `chapters/` subdirs → reads each `draft.md` → collects match locations (cap 20/file) → returns sorted preview |
| `apply(params)` | For each selected file: reads content → snapshots (source='user') → replaces all matches → writes updated content |

Key behaviors:
- `buildRegex()` module-level helper: escapes metacharacters in literal mode; validates pattern in regex mode; always uses `g` flag
- `regex.lastIndex` is reset to `0` before every reuse of the same RegExp object
- Zero-length match guard increments `lastIndex` to prevent infinite loops
- Files missing between preview and apply are silently skipped (not counted in result)
- No AI calls, no database writes, no Electron APIs

---

## Context Assembly

### Token Estimator

File: `src/application/context/TokenEstimator.ts`

Pure utility. Estimates token count from character count using `CHARS_PER_TOKEN` constant (4 chars ≈ 1 token).

### Read Guidance

Per-agent rules from `AGENT_READ_GUIDANCE` in constants:
- `alwaysRead`: files always included in context
- `readIfRelevant`: files included when they exist
- `neverRead`: files explicitly excluded

### Conversation Compaction

Dynamic turn budget based on remaining context window:

| Budget Level | Free Window | Turns Kept | Treatment |
|-------------|-------------|------------|-----------|
| Generous | >40% | All | Strip old thinking blocks |
| Moderate | 20-40% | 8 recent | Prepend summary note |
| Tight | 10-20% | 4 recent | Prepend summary note |
| Critical | <10% | 2 (current) | Brief recap only |
