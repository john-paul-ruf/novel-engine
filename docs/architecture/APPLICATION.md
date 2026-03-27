# Application — Services & Orchestration

> Last updated: 2026-03-27

Everything in `src/application/`. Business logic that orchestrates infrastructure through injected interfaces.

---

## Services

### ChatService

File: `src/application/ChatService.ts`

Dependencies: `ISettingsService`, `IAgentService`, `IDatabaseService`, `IClaudeClient`, `IFileSystemService`, `UsageService`, `ChapterValidator`

| Method | What It Does |
|--------|-------------|
| `createConversation(params)` | Creates a conversation record in the database |
| `getConversations(bookSlug)` | Lists conversations for a book |
| `getMessages(conversationId)` | Retrieves message history |
| `sendMessage(params)` | Assembles context → spawns CLI stream → saves messages → emits events |
| `abortStream(conversationId)` | Kills the active CLI process for a conversation |
| `isCliIdle(bookSlug?)` | Checks if any CLI processes are running (optionally scoped to a book) |
| `getActiveStream()` | Returns `ActiveStreamInfo` for the current stream (refresh recovery) |
| `getActiveStreamForBook(bookSlug)` | Returns active stream scoped to a specific book |
| `getLastChangedFiles()` | Files modified during the last CLI interaction |
| `getLastDiagnostics()` | Context assembly diagnostics from last call |
| `recoverOrphanedSessions()` | Startup recovery — marks interrupted sessions |
| `getRecoveredOrphans()` | Returns sessions marked as interrupted |
| `auditChapter(params)` | Runs Verity audit agent on a single chapter |
| `fixChapter(params)` | Runs Verity fix pass using audit findings |
| `runPhraseAudit(params)` | Runs Lumen phrase audit (Lens 8) |

**Flow (sendMessage):**
1. Load agent (with phase-specific composite prompt for Verity)
2. Load settings (model, thinking budget)
3. Build context via `ContextBuilder`
4. Save user message to database
5. Spawn CLI stream via `IClaudeClient.sendMessage`
6. Forward stream events to `onEvent` callback
7. On `done`: save assistant message, record usage, run chapter validation
8. On `error`: emit error event

**Special modes:**
- `voice-setup`: Appends `VOICE_SETUP_INSTRUCTIONS` to Verity's prompt
- `author-profile`: Appends `AUTHOR_PROFILE_INSTRUCTIONS` to Spark's prompt
- `pitch-room`: Appends `buildPitchRoomInstructions(booksPath)` to Spark's prompt, sets working dir to pitch draft path
- `hot-take`: Uses `HOT_TAKE_INSTRUCTIONS` with `HOT_TAKE_MODEL` (Opus)
- `adhoc-revision`: Appends `ADHOC_REVISION_INSTRUCTIONS` to Forge's prompt

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
4. Append manifest section to system prompt showing available files
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

Dependencies: `IFileSystemService`, `IClaudeClient`, `IAgentService`, `IDatabaseService`, `ISettingsService`

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
Uses Wrangler model (Sonnet) with `WRANGLER_SESSION_PARSE_PROMPT` to parse Forge's markdown output into structured JSON. Caches the parsed result on disk.

**Queue modes:**
- `manual`: pause after every session for approval
- `auto-approve`: approve and continue automatically
- `auto-skip`: skip all sessions (for testing)
- `selective`: only run selected sessions

### MotifLedgerService

File: `src/application/MotifLedgerService.ts`

Dependencies: `IFileSystemService`

| Method | What It Does |
|--------|-------------|
| `load(bookSlug)` | Reads `source/motif-ledger.json`, returns `MotifLedger` |
| `save(bookSlug, ledger)` | Writes `source/motif-ledger.json` |
| `getUnauditedChapters(bookSlug)` | Compares chapter list against audit log |

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
