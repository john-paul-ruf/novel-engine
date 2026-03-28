# IPC — Channels, Preload Bridge, Handler Registry

> Last updated: 2026-03-28

Everything in `src/main/ipc/` and `src/preload/`. Thin adapter layer between application services and the renderer.

---

## Channels

### settings:*

| Channel | Direction | Handler | Returns |
|---------|-----------|---------|---------|
| `settings:load` | invoke | `settingsService.load()` | `AppSettings` |
| `settings:detectClaudeCli` | invoke | `settingsService.detectClaudeCli()` | `boolean` |
| `settings:update` | invoke | `settingsService.update(partial)` + syncs `nativeTheme.themeSource` | `void` |
| `settings:getAvailableModels` | invoke | Returns `AVAILABLE_MODELS` constant | `{id, label, description}[]` |
| `settings:saveAuthorProfile` | invoke | `fs.writeFile(profilePath, content)` | `void` |
| `settings:loadAuthorProfile` | invoke | `fs.readFile(profilePath)` | `string` |

### agents:*

| Channel | Direction | Handler | Returns |
|---------|-----------|---------|---------|
| `agents:list` | invoke | `agentService.loadAll()` → strips systemPrompt | `AgentMeta[]` |
| `agents:get` | invoke | `agentService.load(name)` → strips systemPrompt | `AgentMeta` |

### books:*

| Channel | Direction | Handler | Returns |
|---------|-----------|---------|---------|
| `books:list` | invoke | `fs.listBooks()` | `BookSummary[]` |
| `books:getActiveSlug` | invoke | `fs.getActiveBookSlug()` | `string` |
| `books:setActive` | invoke | `fs.setActiveBook(slug)` + triggers watcher switch | `void` |
| `books:create` | invoke | `fs.createBook(title, authorName)` + triggers watcher switch | `BookMeta` |
| `books:getMeta` | invoke | `fs.getBookMeta(slug)` | `BookMeta` |
| `books:updateMeta` | invoke | `fs.updateBookMeta(slug, partial)` + handles slug migration | `BookMeta` |
| `books:wordCount` | invoke | `fs.countWordsPerChapter(slug)` | `{slug, wordCount}[]` |
| `books:uploadCover` | invoke | `dialog.showOpenDialog()` → `fs.saveCoverImage()` | `string \| null` |
| `books:getCoverImagePath` | invoke | `fs.getCoverImageAbsolutePath(slug)` | `string \| null` |
| `books:getAbsolutePath` | invoke | `path.join(booksDir, bookSlug, relativePath)` | `string` |
| `books:archive` | invoke | `fs.archiveBook(slug)` | `void` |
| `books:unarchive` | invoke | `fs.unarchiveBook(slug)` + triggers watcher switch | `BookMeta` |
| `books:listArchived` | invoke | `fs.listArchivedBooks()` | `BookSummary[]` |

### files:*

| Channel | Direction | Handler | Returns |
|---------|-----------|---------|---------|
| `files:read` | invoke | `fs.readFile(bookSlug, path)` | `string` |
| `files:write` | invoke | `fs.writeFile(bookSlug, path, content)` + auto-snapshot via `version.snapshotContent(source='user')` | `void` |
| `files:exists` | invoke | `fs.fileExists(bookSlug, path)` | `boolean` |
| `files:listDir` | invoke | `fs.listDirectory(bookSlug, path?)` | `FileEntry[]` |
| `files:delete` | invoke | `fs.deletePath(bookSlug, relativePath)` | `void` |

### versions:*

| Channel | Direction | Handler | Returns |
|---------|-----------|---------|---------|
| `versions:getHistory` | invoke | `version.getHistory(bookSlug, filePath, limit, offset)` | `FileVersionSummary[]` |
| `versions:getVersion` | invoke | `version.getVersion(versionId)` | `FileVersion \| null` |
| `versions:getDiff` | invoke | `version.getDiff(oldVersionId, newVersionId)` | `FileDiff` |
| `versions:revert` | invoke | `version.revertToVersion(bookSlug, filePath, versionId)` + broadcasts `chat:filesChanged` | `FileVersion` |
| `versions:getCount` | invoke | `version.getVersionCount(bookSlug, filePath)` | `number` |
| `versions:snapshot` | invoke | `version.snapshotFile(bookSlug, filePath, source)` | `FileVersion \| null` |

### chat:*

| Channel | Direction | Handler | Returns |
|---------|-----------|---------|---------|
| `chat:createConversation` | invoke | `chatService.createConversation(params)` | `Conversation` |
| `chat:getConversations` | invoke | `chatService.getConversations(bookSlug)` | `Conversation[]` |
| `chat:getMessages` | invoke | `chatService.getMessages(conversationId)` | `Message[]` |
| `chat:deleteConversation` | invoke | `db.deleteConversation(conversationId)` | `void` |
| `chat:send` | invoke | `chatService.sendMessage(params)` → streams events via broadcast | `void` |
| `chat:abort` | invoke | `chatService.abortStream(conversationId)` | `void` |
| `chat:isCliIdle` | invoke | `chatService.isCliIdle(bookSlug?)` | `boolean` |
| `chat:getActiveStream` | invoke | `chatService.getActiveStream()` | `ActiveStreamInfo \| null` |
| `chat:getActiveStreamForBook` | invoke | `chatService.getActiveStreamForBook(bookSlug)` | `ActiveStreamInfo \| null` |
| `chat:getOrphanedSessions` | invoke | `chatService.getRecoveredOrphans()` | `StreamSessionRecord[]` |

### pipeline:*

| Channel | Direction | Handler | Returns |
|---------|-----------|---------|---------|
| `pipeline:detect` | invoke | `pipeline.detectPhases(bookSlug)` | `PipelinePhase[]` |
| `pipeline:getActive` | invoke | `pipeline.getActivePhase(bookSlug)` | `PipelinePhase \| null` |
| `pipeline:markPhaseComplete` | invoke | `pipeline.markPhaseComplete(bookSlug, phaseId)` | `void` |
| `pipeline:completeRevision` | invoke | `pipeline.completeRevision(bookSlug)` | `void` |
| `pipeline:confirmAdvancement` | invoke | `pipeline.confirmPhaseAdvancement(bookSlug, phaseId)` | `void` |
| `pipeline:revertPhase` | invoke | `pipeline.revertPhase(bookSlug, phaseId)` | `void` |

### build:*

| Channel | Direction | Handler | Returns |
|---------|-----------|---------|---------|
| `build:run` | invoke | `build.build(bookSlug, progressCallback)` + fires OS notification | `BuildResult` |
| `build:isPandocAvailable` | invoke | `build.isPandocAvailable()` | `boolean` |
| `build:exportZip` | invoke | `dialog.showSaveDialog()` → creates ZIP of dist/ | `string \| null` |

### catalog:*

| Channel | Direction | Handler | Returns |
|---------|-----------|---------|---------|
| `catalog:exportZip` | invoke | `dialog.showSaveDialog()` → creates ZIP of entire books/ directory | `string \| null` |

### usage:*

| Channel | Direction | Handler | Returns |
|---------|-----------|---------|---------|
| `usage:summary` | invoke | `usage.getSummary(bookSlug?)` | `UsageSummary` |
| `usage:byConversation` | invoke | `usage.getByConversation(conversationId)` | `UsageRecord[]` |

### context:*

| Channel | Direction | Handler | Returns |
|---------|-----------|---------|---------|
| `context:getLastDiagnostics` | invoke | `chatService.getLastDiagnostics(conversationId?)` | `ContextDiagnostics \| null` |

### verity:*

| Channel | Direction | Handler | Returns |
|---------|-----------|---------|---------|
| `verity:auditChapter` | invoke | `chatService.auditChapter(params)` | `AuditResult \| null` |
| `verity:fixChapter` | invoke | `chatService.fixChapter(params)` | `void` |
| `verity:fixChapterWithAudit` | invoke | `chatService.fixChapter(params)` with parsed audit result | `void` |
| `verity:runMotifAudit` | invoke | `chatService.runMotifAudit(params)` | `void` |

### hot-take:*

| Channel | Direction | Handler | Returns |
|---------|-----------|---------|---------|
| `hot-take:start` | invoke | Creates Ghostlight conversation → fires `sendMessage` in background | `{ conversationId, callId }` |

### adhoc-revision:*

| Channel | Direction | Handler | Returns |
|---------|-----------|---------|---------|
| `adhoc-revision:start` | invoke | Creates Forge conversation → fires `sendMessage` in background | `{ conversationId, callId }` |

### pitches:*

| Channel | Direction | Handler | Returns |
|---------|-----------|---------|---------|
| `pitches:list` | invoke | `fs.listShelvedPitches()` | `ShelvedPitchMeta[]` |
| `pitches:read` | invoke | `fs.readShelvedPitch(slug)` | `ShelvedPitch` |
| `pitches:delete` | invoke | `fs.deleteShelvedPitch(slug)` | `void` |
| `pitches:shelve` | invoke | `fs.shelvePitch(bookSlug, logline?)` | `ShelvedPitchMeta` |
| `pitches:restore` | invoke | `fs.restorePitch(pitchSlug)` + triggers watcher switch | `BookMeta` |

### pitchRoom:*

| Channel | Direction | Handler | Returns |
|---------|-----------|---------|---------|
| `pitchRoom:listDrafts` | invoke | `fs.listPitchDrafts()` | `PitchDraft[]` |
| `pitchRoom:getDraft` | invoke | `fs.getPitchDraft(convId)` | `PitchDraft \| null` |
| `pitchRoom:readContent` | invoke | `fs.readPitchDraftContent(convId)` | `string` |
| `pitchRoom:promote` | invoke | `fs.promotePitchToBook(convId)` + triggers watcher switch | `BookMeta` |
| `pitchRoom:shelve` | invoke | `fs.shelvePitchDraft(convId, logline?)` | `ShelvedPitchMeta` |
| `pitchRoom:discard` | invoke | `fs.deletePitchDraft(convId)` + `db.deleteConversation(convId)` | `void` |

### revision:*

| Channel | Direction | Handler | Returns |
|---------|-----------|---------|---------|
| `revision:loadPlan` | invoke | `revisionQueue.loadPlan(bookSlug)` | `RevisionPlan` |
| `revision:clearCache` | invoke | `revisionQueue.clearCache(bookSlug)` | `void` |
| `revision:runSession` | invoke | `revisionQueue.runSession(planId, sessionId)` | `void` |
| `revision:runAll` | invoke | `revisionQueue.runAll(planId, selectedIds?)` | `void` |
| `revision:respondToGate` | invoke | `revisionQueue.respondToGate(planId, sessionId, action, message?)` | `void` |
| `revision:approveSession` | invoke | `revisionQueue.approveSession(planId, sessionId)` | `void` |
| `revision:rejectSession` | invoke | `revisionQueue.rejectSession(planId, sessionId)` | `void` |
| `revision:skipSession` | invoke | `revisionQueue.skipSession(planId, sessionId)` | `void` |
| `revision:pause` | invoke | `revisionQueue.pause(planId)` | `void` |
| `revision:setMode` | invoke | `revisionQueue.setMode(planId, mode)` | `void` |
| `revision:getPlan` | invoke | `revisionQueue.getPlan(planId)` | `RevisionPlan \| null` |
| `revision:getQueueStatus` | invoke | `revisionQueue.getQueueStatus(bookSlug)` | `QueueStatus` |
| `revision:startVerification` | invoke | `revisionQueue.startVerification(planId)` | `string` |

### motifLedger:*

| Channel | Direction | Handler | Returns |
|---------|-----------|---------|---------|
| `motifLedger:load` | invoke | `motifLedger.load(bookSlug)` | `MotifLedger` |
| `motifLedger:save` | invoke | `motifLedger.save(bookSlug, ledger)` | `void` |
| `motifLedger:getUnauditedChapters` | invoke | `motifLedger.getUnauditedChapters(bookSlug)` | `string[]` |

### shell:*

| Channel | Direction | Handler | Returns |
|---------|-----------|---------|---------|
| `shell:openExternal` | invoke | `shell.openExternal(url)` | `void` |
| `shell:openPath` | invoke | `shell.openPath(absolutePath)` | `string` |

### window:*

| Channel | Direction | Handler | Returns |
|---------|-----------|---------|---------|
| `window:minimize` | send (fire-and-forget) | `win.minimize()` | — |
| `window:maximize` | send (fire-and-forget) | `win.isMaximized() ? unmaximize() : maximize()` | — |
| `window:close` | send (fire-and-forget) | `win.close()` | — |
| `window:isMaximized` | invoke | `win.isMaximized()` | `boolean` |

---

## Push Events

Events from main → renderer (not request/response).

| Event | Payload | Emitter |
|-------|---------|---------|
| `chat:streamEvent` | `StreamEvent & { callId, conversationId, source?: StreamEventSource }` | ChatService during CLI streaming — broadcast to all windows. `source` discriminates origin (`'chat'`, `'auto-draft'`, `'hot-take'`, `'adhoc-revision'`, `'revision'`, `'audit'`, `'fix'`, `'motif-audit'`). |
| `chat:filesChanged` | `string[], bookSlug?` | BookWatcher on file change, or post-sendMessage |
| `books:changed` | (none) | BooksDirWatcher on folder add/remove |
| `build:progress` | `string` | BuildService during Pandoc execution |
| `revision:event` | `RevisionQueueEvent` | RevisionQueueService during queue processing |
| `window:maximized` | (none) | Main window maximize event |
| `window:unmaximized` | (none) | Main window unmaximize event |

---

## Preload Bridge Shape

Exposed as `window.novelEngine` via `contextBridge.exposeInMainWorld`:

```typescript
window.novelEngine: {
  settings: {
    load(): Promise<AppSettings>
    detectClaudeCli(): Promise<boolean>
    update(partial: Partial<AppSettings>): Promise<void>
    saveAuthorProfile(content: string): Promise<void>
    loadAuthorProfile(): Promise<string>
  }

  agents: {
    list(): Promise<AgentMeta[]>
    get(name: AgentName): Promise<AgentMeta>
  }

  books: {
    list(): Promise<BookSummary[]>
    getActiveSlug(): Promise<string>
    setActive(slug: string): Promise<void>
    create(title: string): Promise<BookMeta>
    getMeta(slug: string): Promise<BookMeta>
    updateMeta(slug: string, partial: Partial<BookMeta>): Promise<BookMeta>
    wordCount(slug: string): Promise<{slug: string, wordCount: number}[]>
    uploadCover(bookSlug: string): Promise<string | null>
    getCoverImagePath(bookSlug: string): Promise<string | null>
    getAbsolutePath(bookSlug: string, relativePath: string): Promise<string>
    archive(slug: string): Promise<void>
    unarchive(slug: string): Promise<BookMeta>
    listArchived(): Promise<BookSummary[]>
    onChanged(callback: () => void): () => void   // returns cleanup fn
  }

  files: {
    read(bookSlug: string, path: string): Promise<string>
    write(bookSlug: string, path: string, content: string): Promise<void>
    exists(bookSlug: string, path: string): Promise<boolean>
    listDir(bookSlug: string, path?: string): Promise<FileEntry[]>
    delete(bookSlug: string, relativePath: string): Promise<void>
  }

  versions: {
    getHistory(bookSlug: string, filePath: string, limit?: number, offset?: number): Promise<FileVersionSummary[]>
    getVersion(versionId: number): Promise<FileVersion | null>
    getDiff(oldVersionId: number | null, newVersionId: number): Promise<FileDiff>
    revert(bookSlug: string, filePath: string, versionId: number): Promise<FileVersion>
    getCount(bookSlug: string, filePath: string): Promise<number>
    snapshot(bookSlug: string, filePath: string, source: FileVersionSource): Promise<FileVersion | null>
  }

  chat: {
    createConversation(params): Promise<Conversation>
    getConversations(bookSlug: string): Promise<Conversation[]>
    getMessages(conversationId: string): Promise<Message[]>
    deleteConversation(conversationId: string): Promise<void>
    send(params: SendMessageParams): Promise<void>
    abort(conversationId: string): Promise<void>
    isCliIdle(bookSlug?: string): Promise<boolean>
    getActiveStream(): Promise<ActiveStreamInfo | null>
    getActiveStreamForBook(bookSlug: string): Promise<ActiveStreamInfo | null>
    getOrphanedSessions(): Promise<StreamSessionRecord[]>
    onStreamEvent(callback): () => void            // returns cleanup fn
    onFilesChanged(callback): () => void           // returns cleanup fn
  }

  pipeline: {
    detect(bookSlug: string): Promise<PipelinePhase[]>
    getActive(bookSlug: string): Promise<PipelinePhase | null>
    markPhaseComplete(bookSlug: string, phaseId: PipelinePhaseId): Promise<void>
    completeRevision(bookSlug: string): Promise<void>
    confirmAdvancement(bookSlug: string, phaseId: PipelinePhaseId): Promise<void>
    revertPhase(bookSlug: string, phaseId: PipelinePhaseId): Promise<void>
  }

  build: {
    run(bookSlug: string): Promise<BuildResult>
    isPandocAvailable(): Promise<boolean>
    onProgress(callback): () => void               // returns cleanup fn
    exportZip(bookSlug: string): Promise<string | null>
  }

  catalog: {
    exportZip(): Promise<string | null>
  }

  pitches: {
    list(): Promise<ShelvedPitchMeta[]>
    read(slug: string): Promise<ShelvedPitch>
    delete(slug: string): Promise<void>
    shelve(bookSlug: string, logline?: string): Promise<ShelvedPitchMeta>
    restore(pitchSlug: string): Promise<BookMeta>
  }

  pitchRoom: {
    listDrafts(): Promise<PitchDraft[]>
    getDraft(conversationId: string): Promise<PitchDraft | null>
    readContent(conversationId: string): Promise<string>
    promote(conversationId: string): Promise<BookMeta>
    shelve(conversationId: string, logline?: string): Promise<ShelvedPitchMeta>
    discard(conversationId: string): Promise<void>
  }

  verity: {
    auditChapter(bookSlug, chapterSlug, opts?): Promise<AuditResult | null>
    fixChapter(bookSlug, chapterSlug, conversationId, auditResult?, callId?): Promise<void>
    runMotifAudit(bookSlug: string, callId?: string): Promise<void>
  }

  hotTake: {
    start(bookSlug: string): Promise<{conversationId, callId}>
  }

  adhocRevision: {
    start(bookSlug, description): Promise<{conversationId, callId}>
  }

  usage: {
    summary(bookSlug?: string): Promise<UsageSummary>
    byConversation(conversationId: string): Promise<UsageRecord[]>
  }

  revision: {
    loadPlan(bookSlug: string): Promise<RevisionPlan>
    clearCache(bookSlug: string): Promise<void>
    runSession(planId, sessionId): Promise<void>
    runAll(planId, selectedIds?): Promise<void>
    respondToGate(planId, sessionId, action, message?): Promise<void>
    approveSession(planId, sessionId): Promise<void>
    rejectSession(planId, sessionId): Promise<void>
    skipSession(planId, sessionId): Promise<void>
    pause(planId): Promise<void>
    setMode(planId, mode): Promise<void>
    getPlan(planId): Promise<RevisionPlan | null>
    getQueueStatus(bookSlug): Promise<QueueStatus>
    startVerification(planId): Promise<string>
    onEvent(callback): () => void                  // returns cleanup fn
  }

  motifLedger: {
    load(bookSlug: string): Promise<MotifLedger>
    save(bookSlug: string, ledger: MotifLedger): Promise<void>
    getUnauditedChapters(bookSlug: string): Promise<string[]>
  }

  context: {
    getLastDiagnostics(conversationId?: string): Promise<ContextDiagnostics | null>
  }

  shell: {
    openPath(absolutePath: string): Promise<string>
    openExternal(url: string): Promise<void>
  }

  window: {
    minimize(): void
    maximize(): void
    close(): void
    isMaximized(): Promise<boolean>
    onMaximizeChange(callback): () => void         // returns cleanup fn
  }

  models: {
    getAvailable(): Promise<{id, label, description}[]>
  }
}
```

---

## Handler Registration

`registerIpcHandlers(services, paths, hooks)` in `src/main/ipc/handlers.ts`:

- **services**: all service instances (settings, agents, db, fs, chat, pipeline, build, usage, revisionQueue, motifLedger, notifications)
- **paths**: `{ userDataPath, booksDir }`
- **hooks**: `{ onActiveBookChanged(slug) }` — triggers BookWatcher switch

Revision queue events are forwarded to renderer via `revisionQueue.onEvent()` listener registered at the bottom of `registerIpcHandlers`. Also forwards `session:streamEvent` sub-events to `chat:streamEvent` channel with `rev:` prefixed callId, `conversationId` (falls back to `sessionId` if absent), and `source: 'revision'`.

All broadcast sites inject a `source: StreamEventSource` discriminator into stream events so the renderer can filter by origin without fragile string-prefix conventions. The `rev:` prefix on callId is retained for backwards compatibility but `source` is the primary routing signal.

Verity pipeline handlers (`verity:auditChapter`, `verity:fixChapter`, `verity:fixChapterWithAudit`, `verity:runMotifAudit`) emit synthetic `callStart` events via `emitVerityCallStart()` so audit/fix calls appear correctly in the CLI Activity Monitor.

---

## Main Process Extras

### NotificationManager

File: `src/main/notifications.ts`

Fires OS-level notifications (Electron `Notification` API) when:
1. Agent call completes (if window unfocused + notifications enabled)
2. Agent call errors
3. Revision session completes
4. Revision queue finishes
5. Build completes

Clicking a notification brings the window to front.

### Bootstrap

File: `src/main/bootstrap.ts`

First-run initialization:
1. Creates `books/` and `custom-agents/` directories
2. Copies bundled agent `.md` files (non-destructive via `COPYFILE_EXCL`)
3. Creates template `author-profile.md`
4. Creates `active-book.json`
5. Writes `.initialized` flag

`ensureAgents` runs on every startup to recover missing agent files.

### Custom Protocol

`novel-asset://` scheme registered for serving local files to renderer:
- `novel-asset://cover/{bookSlug}` — serves book cover images from disk
