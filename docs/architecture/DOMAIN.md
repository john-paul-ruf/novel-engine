# Domain — Types, Interfaces, Constants

> Last updated: 2026-03-28

Everything in `src/domain/`. Pure TypeScript declarations — zero imports from other layers.

---

## Types

### Agent

| Type | Shape | Used By |
|------|-------|---------|
| `AgentName` | `'Spark' \| 'Verity' \| 'Ghostlight' \| 'Lumen' \| 'Sable' \| 'Forge' \| 'Quill' \| 'Wrangler'` | AgentService, ChatService, UI |
| `CreativeAgentName` | `Exclude<AgentName, 'Wrangler'>` | Pipeline, stores, quick actions |
| `AgentMeta` | `{ name, filename, role, color, thinkingBudget, maxTurns }` | AGENT_REGISTRY |
| `Agent` | `AgentMeta & { systemPrompt }` | AgentService.load() |

### Book

| Type | Shape | Used By |
|------|-------|---------|
| `BookStatus` | `'scaffolded' \| 'outlining' \| 'first-draft' \| 'revision-1' \| 'revision-2' \| 'copy-edit' \| 'final' \| 'published'` | Pipeline, BookSelector |
| `BookMeta` | `{ slug, title, author, status, created, coverImage }` | FileSystemService |
| `BookSummary` | `BookMeta & { wordCount, isActive }` | Book list UI |

### Shelved Pitches

| Type | Shape | Used By |
|------|-------|---------|
| `ShelvedPitchMeta` | `{ slug, title, logline, shelvedAt, shelvedFrom }` | ShelvedPitchesPanel |
| `ShelvedPitch` | `ShelvedPitchMeta & { content }` | Pitch restore flow |

### Chapters & Manifest

| Type | Shape | Used By |
|------|-------|---------|
| `ChapterData` | `{ slug, draft, notes }` | Context assembly |
| `FileManifestItem` | `{ path, wordCount }` | ContextBuilder |
| `ProjectManifest` | `{ meta, files, chapterCount, totalWordCount }` | Context assembly |

### Pipeline

| Type | Shape | Used By |
|------|-------|---------|
| `PipelinePhaseId` | `'pitch' \| 'scaffold' \| ... \| 'publish'` (14 values) | PipelineService, PipelineTracker |
| `PhaseStatus` | `'complete' \| 'pending-completion' \| 'active' \| 'locked'` | PipelineTracker UI |
| `PipelinePhase` | `{ id, label, agent, status, description }` | PipelineService.detectPhases() |

### Chat / Conversation

| Type | Shape | Used By |
|------|-------|---------|
| `MessageRole` | `'user' \| 'assistant'` | Messages, CLI |
| `Message` | `{ id, conversationId, role, content, thinking, timestamp }` | DatabaseService, ChatView |
| `ConversationPurpose` | `'pipeline' \| 'voice-setup' \| 'author-profile' \| 'pitch-room' \| 'hot-take' \| 'adhoc-revision'` | Conversation creation |
| `PitchDraft` | `{ conversationId, title, hasPitch, createdAt, updatedAt }` | PitchRoom UI |
| `Conversation` | `{ id, bookSlug, agentName, pipelinePhase, purpose, title, createdAt, updatedAt }` | DatabaseService, ChatView |

### Streaming

| Type | Shape | Used By |
|------|-------|---------|
| `StreamBlockType` | `'thinking' \| 'text' \| 'tool_use' \| 'tool_result'` | Stream processing |
| `ToolUseInfo` | `{ toolName, toolId, filePath?, status }` | CliActivityPanel |
| `ProgressStage` | `'idle' \| 'reading' \| 'thinking' \| 'drafting' \| 'editing' \| 'reviewing' \| 'complete'` | chatStore, UI indicators |
| `FileTouchMap` | `Record<string, number>` (path → write count) | File change tracking |
| `TimestampedToolUse` | `ToolUseInfo & { startedAt, endedAt?, durationMs? }` | CLI activity panel |
| `ThinkingSummary` | `{ text, fullLengthChars }` | ThinkingBlock UI |
| `PersistedStreamEvent` | `{ id, sessionId, conversationId, sequenceNumber, eventType, payload, timestamp }` | Stream event replay |
| `StreamSessionRecord` | `{ id, conversationId, agentName, model, bookSlug, startedAt, endedAt, finalStage, filesTouched, interrupted }` | Orphan recovery |
| `StreamEventSource` | `'chat' \| 'auto-draft' \| 'hot-take' \| 'adhoc-revision' \| 'revision' \| 'audit' \| 'fix' \| 'motif-audit'` | IPC source discriminator |
| `StreamEvent` | Discriminated union (12 variants: `callStart`, `status`, `blockStart`, `thinkingDelta`, `textDelta`, `blockEnd`, `toolUse`, `filesChanged`, `done`, `progressStage`, `thinkingSummary`, `toolDuration`, `error`) | IPC streaming |
| `ActiveStreamInfo` | `{ conversationId, agentName, model, bookSlug, startedAt, sessionId, callId, progressStage, filesTouched, thinkingBuffer, textBuffer }` | Renderer refresh recovery |

### Settings

| Type | Shape | Used By |
|------|-------|---------|
| `AppSettings` | `{ hasClaudeCli, model, maxTokens, enableThinking, thinkingBudget, overrideThinkingBudget, autoCollapseThinking, enableNotifications, theme, initialized, authorName }` | SettingsService, SettingsView |

### Token Usage

| Type | Shape | Used By |
|------|-------|---------|
| `UsageRecord` | `{ conversationId, inputTokens, outputTokens, thinkingTokens, model, timestamp }` | UsageService |
| `UsageSummary` | `{ totalInputTokens, totalOutputTokens, totalThinkingTokens, conversationCount }` | SettingsView |

### Revision Queue

| Type | Shape | Used By |
|------|-------|---------|
| `RevisionSessionStatus` | `'pending' \| 'running' \| 'awaiting-approval' \| 'approved' \| 'rejected' \| 'skipped'` | RevisionQueueView |
| `ApprovalAction` | `'approve' \| 'approve-all' \| 'reject' \| 'skip' \| 'retry'` | Gate handling |
| `QueueMode` | `'manual' \| 'auto-approve' \| 'auto-skip' \| 'selective'` | Queue controls |
| `QueueStatus` | `{ planId, isRunning, activeSessionId }` | Frontend status recovery |
| `RevisionSession` | `{ id, index, title, chapters, taskNumbers, model, prompt, notes, status, conversationId, response }` | RevisionQueueView |
| `RevisionPlanPhase` | `{ number, name, taskCount, completedCount, taskNumbers? }` | Progress display |
| `RevisionPlan` | `{ id, bookSlug, sessions, totalTasks, completedTaskNumbers, phases, mode, createdAt, verificationConversationId }` | RevisionQueueService |
| `RevisionQueueEvent` | Discriminated union (10 variants: `session:status`, `session:chunk`, `session:thinking`, `session:done`, `session:gate`, `session:streamEvent`, `plan:progress`, `plan:loading-step`, `queue:done`, `error`). `session:streamEvent` includes optional `conversationId`. | Event bus |

### Verity Audit

| Type | Shape | Used By |
|------|-------|---------|
| `AuditViolationType` | `'editorial-narration' \| 'flagged-phrase' \| 'anti-pattern' \| 'voice-drift' \| 'continuity-error'` | Audit pipeline |
| `AuditViolation` | `{ type, location, quote, reason, pattern? }` | ChatService.auditChapter |
| `AuditSeverity` | `'clean' \| 'minor' \| 'moderate' \| 'heavy'` | Fix threshold |
| `AuditResult` | `{ chapter, violations, summary }` | Audit/fix flow |

### Build

| Type | Shape | Used By |
|------|-------|---------|
| `BuildFormat` | `'md' \| 'docx' \| 'epub' \| 'pdf'` | BuildService |
| `BuildResult` | `{ success, formats, wordCount }` | BuildView |

### File System

| Type | Shape | Used By |
|------|-------|---------|
| `FileEntry` | `{ name, path, isDirectory, children? }` | FileTree, FileBrowser |

### Version Control

| Type | Shape | Used By |
|------|-------|---------|
| `FileVersionSource` | `'user' \| 'agent' \| 'revert'` | VersionService, IPC handlers |
| `FileVersion` | `{ id, bookSlug, filePath, content, contentHash, byteSize, source, createdAt }` | VersionService, DatabaseService |
| `FileVersionSummary` | `Omit<FileVersion, 'content'>` | Version history UI |
| `DiffLineType` | `'add' \| 'remove' \| 'context'` | DiffViewer |
| `DiffLine` | `{ type, content, oldLineNumber?, newLineNumber? }` | DiffViewer |
| `DiffHunk` | `{ oldStart, oldLines, newStart, newLines, lines }` | DiffViewer |
| `FileDiff` | `{ oldVersion, newVersion, hunks, totalAdditions, totalDeletions }` | DiffViewer, VersionHistoryPanel |

### IPC Parameters

| Type | Shape | Used By |
|------|-------|---------|
| `SendMessageParams` | `{ agentName, message, conversationId, bookSlug, thinkingBudgetOverride?, callId? }` | chat:send handler |

### Context Assembly

| Type | Shape | Used By |
|------|-------|---------|
| `AssembledContext` | `{ systemPrompt, conversationMessages, diagnostics }` | ChatService |
| `ContextDiagnostics` | `{ filesAvailable, conversationTurnsSent, conversationTurnsDropped, manifestTokenEstimate }` | Debug UI |

### Motif Ledger

| Type | Shape | Used By |
|------|-------|---------|
| `MotifSystem` | `{ id, name, description, components, arcTrajectory }` | MotifLedgerView |
| `MotifEntry` | `{ id, character, phrase, description, systemId, firstAppearance, occurrences, notes }` | EntriesTab |
| `StructuralDevice` | `{ id, name, deviceType, description, pattern, chapters, notes }` | StructuralTab |
| `ForeshadowStatus` | `'planted' \| 'paid-off' \| 'abandoned'` | ForeshadowTab |
| `ForeshadowEntry` | `{ id, description, plantedIn, expectedPayoff, expectedPayoffIn, status, notes }` | ForeshadowTab |
| `MinorCharacterMotif` | `{ id, character, motifs, notes }` | MinorCharactersTab |
| `FlaggedPhraseCategory` | `'retired' \| 'limited' \| 'crutch' \| 'anti-pattern'` | FlaggedPhrasesTab |
| `FlaggedPhrase` | `{ id, phrase, category, alternatives, limit?, limitChapters?, notes }` | FlaggedPhrasesTab |
| `LedgerAuditRecord` | `{ id, chapterSlug, auditedAt, entriesAdded, entriesUpdated, notes }` | AuditLogTab |
| `MotifLedger` | `{ systems, entries, structuralDevices, foreshadows, minorCharacters, flaggedPhrases, auditLog }` | MotifLedgerService |

---

## Interfaces

### ISettingsService

Implemented by: `SettingsService` (`src/infrastructure/settings/`)

| Method | Signature | Returns |
|--------|-----------|---------|
| `load` | `() => Promise<AppSettings>` | Cached settings merged with defaults |
| `detectClaudeCli` | `() => Promise<boolean>` | Runs `claude --version` |
| `update` | `(partial: Partial<AppSettings>) => Promise<void>` | Writes + invalidates cache |

### IAgentService

Implemented by: `AgentService` (`src/infrastructure/agents/`)

| Method | Signature | Returns |
|--------|-----------|---------|
| `loadAll` | `() => Promise<Agent[]>` | All agents with system prompts |
| `load` | `(name: AgentName) => Promise<Agent>` | Single agent |
| `loadComposite` | `(baseFilename: string, supplements: string[]) => Promise<string>` | Concatenated prompt string |
| `loadRaw` | `(filename: string) => Promise<string>` | Raw file contents |

### IDatabaseService

Implemented by: `DatabaseService` (`src/infrastructure/database/`)

| Method | Signature | Returns |
|--------|-----------|---------|
| `createConversation` | `(conv) => Conversation` | Created conversation |
| `getConversation` | `(id) => Conversation \| null` | Conversation or null |
| `listConversations` | `(bookSlug) => Conversation[]` | Conversations for book |
| `deleteConversation` | `(id) => void` | — |
| `saveMessage` | `(msg) => Message` | Saved message with ID |
| `getMessages` | `(conversationId) => Message[]` | Ordered messages |
| `recordUsage` | `(record) => void` | — |
| `getUsageSummary` | `(bookSlug?) => UsageSummary` | Aggregated usage |
| `getUsageByConversation` | `(conversationId) => UsageRecord[]` | Usage records |
| `updateBookSlug` | `(oldSlug, newSlug) => void` | Migrates conversation references |
| `persistStreamEvent` | `(event) => void` | — |
| `persistStreamEventBatch` | `(events) => void` | Transaction-wrapped bulk insert |
| `getStreamEvents` | `(sessionId) => PersistedStreamEvent[]` | Ordered events |
| `deleteStreamEvents` | `(sessionId) => void` | — |
| `pruneStreamEvents` | `(olderThanDays) => void` | Deletes old events |
| `createStreamSession` | `(session) => void` | — |
| `endStreamSession` | `(sessionId, finalStage, filesTouched) => void` | Marks session ended |
| `getActiveStreamSessions` | `() => StreamSessionRecord[]` | Sessions with null endedAt |
| `markSessionInterrupted` | `(sessionId, lastStage) => void` | Marks as orphaned |
| `insertFileVersion` | `(params: { bookSlug, filePath, content, contentHash, byteSize, source }) => FileVersion` | Insert and return new version |
| `getFileVersion` | `(id) => FileVersion \| null` | Full version with content |
| `getLatestFileVersion` | `(bookSlug, filePath) => FileVersionSummary \| null` | Most recent version (no content) |
| `listFileVersions` | `(bookSlug, filePath, limit, offset) => FileVersionSummary[]` | Paginated version list |
| `countFileVersions` | `(bookSlug, filePath) => number` | Total versions for a file |
| `deleteFileVersionsBeyondLimit` | `(bookSlug, filePath, keepCount) => number` | Prune old versions |
| `getVersionedFilePaths` | `(bookSlug) => string[]` | Distinct tracked file paths |
| `close` | `() => void` | Closes DB connection |

### IFileSystemService

Implemented by: `FileSystemService` (`src/infrastructure/filesystem/`)

| Method | Signature | Returns |
|--------|-----------|---------|
| `getBooksPath` | `() => string` | Absolute books directory path |
| `listBooks` | `() => Promise<BookSummary[]>` | All books with word counts |
| `getActiveBookSlug` | `() => Promise<string>` | Current active book slug |
| `setActiveBook` | `(slug) => Promise<void>` | Writes active-book.json |
| `createBook` | `(title, author?) => Promise<BookMeta>` | Creates book directory |
| `getBookMeta` | `(slug) => Promise<BookMeta>` | Reads about.json |
| `updateBookMeta` | `(slug, partial) => Promise<BookMeta>` | Updates about.json |
| `getProjectManifest` | `(slug) => Promise<ProjectManifest>` | File listing with word counts |
| `readFile` | `(bookSlug, relativePath) => Promise<string>` | File contents |
| `writeFile` | `(bookSlug, relativePath, content) => Promise<void>` | — |
| `deleteFile` | `(bookSlug, relativePath) => Promise<void>` | — |
| `deletePath` | `(bookSlug, relativePath) => Promise<void>` | Recursive delete |
| `renameFile` | `(bookSlug, oldPath, newPath) => Promise<void>` | — |
| `fileExists` | `(bookSlug, relativePath) => Promise<boolean>` | — |
| `listDirectory` | `(bookSlug, relativePath?) => Promise<FileEntry[]>` | Directory tree |
| `countWords` | `(bookSlug) => Promise<number>` | Total manuscript words |
| `countWordsPerChapter` | `(bookSlug) => Promise<{slug, wordCount}[]>` | Per-chapter counts |
| `saveCoverImage` | `(bookSlug, sourcePath) => Promise<string>` | Relative path to saved image |
| `getCoverImageAbsolutePath` | `(bookSlug) => Promise<string \| null>` | Absolute path or null |
| `archiveBook` | `(slug) => Promise<void>` | Moves to _archived/ |
| `unarchiveBook` | `(slug) => Promise<BookMeta>` | Restores from _archived/ |
| `listArchivedBooks` | `() => Promise<BookSummary[]>` | Archived books |
| `reconcileBookSlugs` | `() => Promise<{oldSlug, newSlug}[]>` | Renames mismatched folders |
| `getAuthorProfilePath` | `() => string` | Absolute path |
| `listShelvedPitches` | `() => Promise<ShelvedPitchMeta[]>` | All shelved pitches |
| `readShelvedPitch` | `(slug) => Promise<ShelvedPitch>` | Full pitch content |
| `deleteShelvedPitch` | `(slug) => Promise<void>` | — |
| `shelvePitch` | `(bookSlug, logline?) => Promise<ShelvedPitchMeta>` | Shelves from book |
| `restorePitch` | `(pitchSlug) => Promise<BookMeta>` | Creates book from pitch |
| `listPitchDrafts` | `() => Promise<PitchDraft[]>` | Pitch Room drafts |
| `getPitchDraft` | `(conversationId) => Promise<PitchDraft \| null>` | Single draft |
| `readPitchDraftContent` | `(conversationId) => Promise<string>` | Draft content |
| `deletePitchDraft` | `(conversationId) => Promise<void>` | — |
| `promotePitchToBook` | `(conversationId) => Promise<BookMeta>` | Creates book from draft |
| `shelvePitchDraft` | `(conversationId, logline?) => Promise<ShelvedPitchMeta>` | Shelves pitch room draft |
| `getPitchDraftPath` | `(conversationId) => string` | Absolute path for Spark working dir |

### IClaudeClient

Implemented by: `ClaudeCodeClient` (`src/infrastructure/claude-cli/`)

| Method | Signature | Returns |
|--------|-----------|---------|
| `sendMessage` | `(params) => Promise<{ changedFiles: string[] }>` | Streams events via onEvent callback; returns changed files |
| `abortStream` | `(conversationId) => void` | SIGTERM then SIGKILL |
| `isAvailable` | `() => Promise<boolean>` | CLI accessible check |
| `invalidateAvailabilityCache` | `() => void` | Forces re-check |
| `hasActiveProcesses` | `() => boolean` | Any CLI running |
| `hasActiveProcessesForBook` | `(bookSlug) => boolean` | CLI running for specific book |

### IPipelineService

Implemented by: `PipelineService` (`src/application/`)

| Method | Signature | Returns |
|--------|-----------|---------|
| `detectPhases` | `(bookSlug) => Promise<PipelinePhase[]>` | All 14 phases with statuses |
| `getActivePhase` | `(bookSlug) => Promise<PipelinePhase \| null>` | First non-complete phase |
| `getAgentForPhase` | `(phaseId) => AgentName \| null` | Agent assignment |
| `markPhaseComplete` | `(bookSlug, phaseId) => Promise<void>` | Advances book status |
| `confirmPhaseAdvancement` | `(bookSlug, phaseId) => Promise<void>` | Confirms pending-completion |
| `completeRevision` | `(bookSlug) => Promise<void>` | Archives revision reports |
| `revertPhase` | `(bookSlug, phaseId) => Promise<void>` | Rolls back phase + subsequent |

### IBuildService

Implemented by: `BuildService` (`src/application/`)

| Method | Signature | Returns |
|--------|-----------|---------|
| `build` | `(bookSlug, onProgress) => Promise<BuildResult>` | Build output paths |
| `isPandocAvailable` | `() => Promise<boolean>` | Pandoc binary check |

### IRevisionQueueService

Implemented by: `RevisionQueueService` (`src/application/`)

| Method | Signature | Returns |
|--------|-----------|---------|
| `loadPlan` | `(bookSlug) => Promise<RevisionPlan>` | Parsed revision plan |
| `clearCache` | `(bookSlug) => Promise<void>` | Forces re-parse |
| `runSession` | `(planId, sessionId) => Promise<void>` | Executes one session |
| `runAll` | `(planId, selectedSessionIds?) => Promise<void>` | Runs all pending sessions |
| `respondToGate` | `(planId, sessionId, action, message?) => void` | Author decision |
| `approveSession` | `(planId, sessionId) => Promise<void>` | Marks tasks done |
| `rejectSession` | `(planId, sessionId) => Promise<void>` | Allows re-run |
| `skipSession` | `(planId, sessionId) => Promise<void>` | Tasks stay incomplete |
| `pause` | `(planId) => void` | Stops after current session |
| `setMode` | `(planId, mode) => void` | Changes queue mode |
| `getPlan` | `(planId) => RevisionPlan \| null` | In-memory plan |
| `getQueueStatus` | `(bookSlug) => QueueStatus` | Live running status |
| `startVerification` | `(planId) => Promise<string>` | Returns conversation ID |
| `onEvent` | `(callback) => () => void` | Event subscription with cleanup |

### IMotifLedgerService

Implemented by: `MotifLedgerService` (`src/application/`)

| Method | Signature | Returns |
|--------|-----------|---------|
| `load` | `(bookSlug) => Promise<MotifLedger>` | Ledger from JSON file |
| `save` | `(bookSlug, ledger) => Promise<void>` | Writes JSON file |
| `getUnauditedChapters` | `(bookSlug) => Promise<string[]>` | Chapters missing audit |

### IChapterValidator

Implemented by: `ChapterValidator` (`src/application/`)

| Method | Signature | Returns |
|--------|-----------|---------|
| `validateAndCorrect` | `(bookSlug) => Promise<string[]>` | List of corrected file paths |

### IUsageService

Implemented by: `UsageService` (`src/application/`)

| Method | Signature | Returns |
|--------|-----------|---------|
| `recordUsage` | `(params: { conversationId, inputTokens, outputTokens, thinkingTokens, model }) => void` | Records token usage |
| `getSummary` | `(bookSlug?) => UsageSummary` | Aggregated usage stats |
| `getByConversation` | `(conversationId) => UsageRecord[]` | Usage records for a conversation |

### IChatService

Implemented by: `ChatService` (`src/application/`)

| Method | Signature | Returns |
|--------|-----------|---------|
| `sendMessage` | `(params: { agentName, message, conversationId, bookSlug, thinkingBudgetOverride?, callId?, onEvent }) => Promise<{ changedFiles: string[] }>` | Streams agent response; returns changed files |
| `createConversation` | `(params: { bookSlug, agentName, pipelinePhase, purpose? }) => Promise<Conversation>` | New conversation |
| `getConversations` | `(bookSlug) => Promise<Conversation[]>` | Conversations for a book |
| `getMessages` | `(conversationId) => Promise<Message[]>` | Messages in a conversation |
| `abortStream` | `(conversationId) => void` | Kill active CLI stream |
| `getActiveStream` | `() => ActiveStreamInfo \| null` | First active stream |
| `getActiveStreamForBook` | `(bookSlug) => ActiveStreamInfo \| null` | Active stream for a book |
| `getLastDiagnostics` | `(conversationId?) => ContextDiagnostics \| null` | Context diagnostics keyed by conversationId |
| `isCliIdle` | `(bookSlug?) => boolean` | Whether CLI has no active processes |
| `recoverOrphanedSessions` | `() => Promise<StreamSessionRecord[]>` | Recover interrupted sessions |
| `getRecoveredOrphans` | `() => StreamSessionRecord[]` | Cached recovered orphans |
| `auditChapter` | `(params: { bookSlug, chapterSlug, conversationId?, onEvent? }) => Promise<AuditResult \| null>` | Run audit pass |
| `fixChapter` | `(params: { bookSlug, chapterSlug, auditResult, conversationId, sessionId, onEvent }) => Promise<void>` | Run fix pass |
| `runMotifAudit` | `(params: { bookSlug, appSettings, onEvent, sessionId }) => Promise<void>` | Run motif/phrase audit |

### IVersionService

Implemented by: `VersionService` (`src/application/`)

| Method | Signature | Returns |
|--------|-----------|---------|
| `snapshotFile` | `(bookSlug, filePath, source) => Promise<FileVersion \| null>` | New version or null (dedup) |
| `snapshotContent` | `(bookSlug, filePath, content, source) => Promise<FileVersion \| null>` | New version or null (dedup) |
| `getHistory` | `(bookSlug, filePath, limit?, offset?) => Promise<FileVersionSummary[]>` | Newest-first summaries |
| `getVersion` | `(versionId) => Promise<FileVersion \| null>` | Full version with content |
| `getDiff` | `(oldVersionId, newVersionId) => Promise<FileDiff>` | Structured diff |
| `revertToVersion` | `(bookSlug, filePath, versionId) => Promise<FileVersion>` | New revert snapshot |
| `getVersionCount` | `(bookSlug, filePath) => Promise<number>` | Total version count |
| `pruneVersions` | `(bookSlug, keepCount?) => Promise<number>` | Number deleted |

---

## Constants

### AGENT_REGISTRY

`Record<AgentName, Omit<AgentMeta, 'name'>>` — metadata for all 8 agents.

| Agent | Filename | Role | Color | Thinking Budget | Max Turns |
|-------|----------|------|-------|----------------|-----------|
| Spark | SPARK.md | Story Pitch | #F59E0B | 4000 | 5 |
| Verity | VERITY-CORE.md | Ghostwriter | #8B5CF6 | 10000 | 30 |
| Ghostlight | GHOSTLIGHT.md | First Reader | #06B6D4 | 6000 | 15 |
| Lumen | LUMEN.md | Developmental Editor | #10B981 | 16000 | 15 |
| Sable | SABLE.md | Copy Editor | #EF4444 | 4000 | 20 |
| Forge | FORGE.md | Task Master | #F97316 | 8000 | 10 |
| Quill | QUILL.md | Publisher | #6366F1 | 4000 | 8 |
| Wrangler | WRANGLER.md | Revision Plan Parser | #71717A | 4000 | 3 |

### PIPELINE_PHASES

14-phase pipeline in order. See [Application](./APPLICATION.md) for detection logic.

### AGENT_READ_GUIDANCE

`Record<CreativeAgentName, ReadGuidance>` — per-agent file access rules (alwaysRead, readIfRelevant, neverRead).

### AGENT_QUICK_ACTIONS

`Record<CreativeAgentName, QuickAction[]>` — pre-built prompt suggestions per agent.

### Context Budget Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `CHARS_PER_TOKEN` | 4 | Token estimation ratio |
| `MAX_CONTEXT_TOKENS` | 200,000 | Opus context window |
| `CONTEXT_RESERVE_TOKENS` | 14,000 | Response + system prompt overhead |
| `TURN_BUDGET_THRESHOLDS` | `{ generous: 0.40, moderate: 0.20, tight: 0.10 }` | Conversation compaction triggers |
| `TURN_KEEP_COUNTS` | `{ moderate: 8, tight: 4, critical: 2 }` | Turns kept per compaction level |

### Other Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `PITCH_ROOM_SLUG` | `'__pitch-room__'` | Reserved book slug for pitch room |
| `CREATIVE_AGENT_NAMES` | 7-element array | UI agent lists (excludes Wrangler) |
| `WRANGLER_MODEL` | `'claude-sonnet-4-20250514'` | Model for plan parsing |
| `AGENT_RESPONSE_BUFFER` | `Record<AgentName, number>` | Per-agent expected response sizes |
| `DEFAULT_SETTINGS` | `AppSettings` | Default values for all settings |
| `AVAILABLE_MODELS` | 2-element array | Opus 4 and Sonnet 4 |
| `FILE_MANIFEST_KEYS` | 13-element array | Canonical file paths for context |
| `VERITY_PHASE_FILES` | Partial record | Maps pipeline phases to Verity sub-prompt filenames |
| `VERITY_AUDIT_MODEL` | `'claude-sonnet-4-20250514'` | Model for audit pass |
| `VERITY_AUDIT_FIX_THRESHOLD` | `'moderate'` | Severity threshold for auto-fix |
| `MOTIF_AUDIT_CADENCE` | 3 | Run motif/phrase audit every N chapters |

### Prompt Templates (Extracted to Agent Files)

Prompt templates formerly in constants.ts have been extracted to `agents/*.md` files, loaded at runtime via `AgentService.loadRaw()`:

| Agent File | Purpose | Loaded By |
|-----------|---------|-----------|
| `VOICE-SETUP.md` | Voice profile interview | ChatService |
| `AUTHOR-PROFILE.md` | Author profile creation | ChatService |
| `PITCH-ROOM.md` | Pitch room brainstorming (uses `{{BOOKS_PATH}}` placeholder) | ChatService |
| `HOT-TAKE.md` | Informal manuscript assessment | ChatService |
| `MOTIF-AUDIT.md` | Scoped phrase & motif audit (Lens 8) | ChatService |
| `ADHOC-REVISION.md` | Direct feedback revision mode | ChatService |
| `REVISION-VERIFICATION.md` | Post-revision verification | ChatService |
| `VERITY-FIX.md` | Audit fix pass (audit JSON appended at runtime) | ChatService |
| `WRANGLER-PARSE.md` | Revision plan JSON parsing | RevisionQueueService |

### Status Message Pools — `src/domain/statusMessages.ts`

Extracted to a separate file. Zero imports — pure functions over static arrays.

- `randomPreparingStatus()` — 45+ messages for context preparation phase
- `randomWaitingStatus()` — 45+ messages for waiting phase
- `randomRespondingStatus()` — 45+ messages for response streaming phase
- `randomPitchRoomFlavor()` — 16 messages for Pitch Room empty state

---

## Pipeline Phases Table

| Phase ID | Label | Agent | Complete When |
|----------|-------|-------|---------------|
| `pitch` | Story Pitch | Spark | `source/pitch.md` exists |
| `scaffold` | Story Scaffold | Verity | `source/scene-outline.md` exists |
| `first-draft` | First Draft | Verity | Chapters exist with >1000 total words + book status advanced |
| `first-read` | First Read | Ghostlight | `source/reader-report.md` exists |
| `first-assessment` | Structural Assessment | Lumen | `source/dev-report.md` exists |
| `revision-plan-1` | Revision Plan | Forge | `source/project-tasks.md` exists |
| `revision` | Revision | Verity | `source/reader-report-v1.md` exists (archived) |
| `second-read` | Second Read | Ghostlight | Both `reader-report.md` AND `reader-report-v1.md` exist |
| `second-assessment` | Second Assessment | Lumen | `source/dev-report-v1.md` exists |
| `copy-edit` | Copy Edit | Sable | `source/audit-report.md` exists |
| `revision-plan-2` | Fix Planning | Forge | `source/revision-prompts.md` AND `source/audit-report.md` exist |
| `mechanical-fixes` | Mechanical Fixes | Verity | `audit-report.md` exists AND book status >= 'copy-edit' |
| `build` | Build | (none) | `dist/output.md` exists |
| `publish` | Publish & Audit | Quill | `source/metadata.md` exists |
