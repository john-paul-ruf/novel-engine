# Renderer — Stores, Components, Views

> Last updated: 2026-03-28

Everything in `src/renderer/`. React + Zustand UI layer. Talks to backend only through `window.novelEngine`.

> **Value Import Exception:** Pure data constants and pure functions from `@domain/constants` and `@domain/statusMessages` may be imported as values (not just types). See [ARCHITECTURE.md](./ARCHITECTURE.md) for criteria.

---

## Stores

### settingsStore

File: `stores/settingsStore.ts`

| Field | Type | Purpose |
|-------|------|---------|
| `settings` | `AppSettings \| null` | Current app settings |
| `loading` | `boolean` | True during initial load |

| Action | What It Does |
|--------|-------------|
| `load()` | Calls `window.novelEngine.settings.load()` |
| `update(partial)` | Calls bridge, then reloads |

### bookStore

File: `stores/bookStore.ts`

| Field | Type | Purpose |
|-------|------|---------|
| `books` | `BookSummary[]` | All active books |
| `activeSlug` | `string` | Currently selected book slug |

| Action | What It Does |
|--------|-------------|
| `load()` | Fetches book list + active slug from bridge |
| `setActive(slug)` | Calls bridge, updates local state |
| `create(title)` | Creates book via bridge, sets as active |

### seriesStore

File: `stores/seriesStore.ts`

| Field | Type | Purpose |
|-------|------|---------|
| `seriesList` | `SeriesSummary[]` | All series with summary data |
| `activeSeries` | `SeriesMeta \| null` | Currently selected series for management |
| `bibleContent` | `string` | Series bible markdown content |
| `bibleDirty` | `boolean` | Whether bible editor has unsaved changes |
| `isModalOpen` | `boolean` | Series management modal visibility |
| `modalMode` | `'list' \| 'create' \| 'edit' \| 'bible'` | Current modal view mode |
| `loading` | `boolean` | Async operation in progress |
| `error` | `string \| null` | Last error message |

| Action | What It Does |
|--------|-------------|
| `loadSeries()` | Fetches series list from bridge |
| `createSeries(name, desc?)` | Creates series, refreshes list |
| `updateSeries(slug, partial)` | Updates name/description |
| `deleteSeries(slug)` | Deletes series, clears if active |
| `selectSeries(slug)` | Loads full series + bible |
| `addVolume(bookSlug, vol?)` | Adds book to active series |
| `removeVolume(bookSlug)` | Removes book from active series |
| `reorderVolumes(slugs)` | Reorders volumes |
| `setBibleContent(content)` | Local edit (marks dirty) |
| `saveBible()` | Persists bible to disk |
| `openModal(mode?)` | Opens series management modal |
| `closeModal()` | Closes modal |

### chatStore

File: `stores/chatStore.ts`

| Field | Type | Purpose |
|-------|------|---------|
| `conversations` | `Conversation[]` | Conversations for active book |
| `activeConversation` | `Conversation \| null` | Currently open conversation |
| `messages` | `Message[]` | Messages for active conversation |
| `isStreaming` | `boolean` | True during CLI stream |
| `_streamOrigin` | `'self' \| 'external' \| null` | Discriminates user-initiated (`'self'`) vs background (`'external'`) streams. `switchBook()` only aborts `'self'` streams, preserving background auto-draft/revision streams. Reset to `null` at all 10 terminal points. |
| `streamBuffer` | `string` | Accumulating response text |
| `thinkingBuffer` | `string` | Accumulating thinking text |
| `progressStage` | `ProgressStage` | Tool-use stage inferred from stream |

| Action | What It Does |
|--------|-------------|
| `loadConversations(bookSlug)` | Fetches conversation list from DB |
| `createConversation(agent, book, phase)` | Creates and opens new conversation |
| `sendMessage(content)` | Sends via bridge, attaches stream listener |
| `abortStream()` | Kills active CLI process |

### providerStore

File: `stores/providerStore.ts`

| Field | Type | Purpose |
|-------|------|---------|
| `providers` | `ProviderConfig[]` | All configured providers |
| `statuses` | `Record<ProviderId, ProviderStatus>` | Cached status per provider |
| `loading` | `boolean` | True during load |

| Action | What It Does |
|--------|-------------|
| `load()` | Calls `window.novelEngine.providers.list()` |
| `addProvider(config)` | Adds via bridge, reloads |
| `updateProvider(id, partial)` | Updates via bridge, reloads |
| `removeProvider(id)` | Removes via bridge, reloads |
| `checkStatus(id)` | Tests connectivity, caches result |
| `setDefault(id)` | Sets active provider via bridge |

### pipelineStore

File: `stores/pipelineStore.ts`

| Field | Type | Purpose |
|-------|------|---------|
| `phases` | `PipelinePhase[]` | All 14 phases with statuses |

| Action | What It Does |
|--------|-------------|
| `detect(bookSlug)` | Calls `pipeline.detect()` via bridge |
| `markComplete(bookSlug, phaseId)` | Advances phase via bridge |
| `confirmAdvancement(bookSlug, phaseId)` | Confirms pending-completion |
| `revertPhase(bookSlug, phaseId)` | Rolls back phase |

### viewStore

File: `stores/viewStore.ts`

| Field | Type | Purpose |
|-------|------|---------|
| `currentView` | `ViewId` | Active view identifier |
| `payload` | `ViewPayload` | View-specific parameters (filePath, conversationId, etc.) |

| Action | What It Does |
|--------|-------------|
| `navigate(view, payload?)` | Sets current view and payload, infers file view mode |

Persisted to localStorage via Zustand `persist` middleware.

### versionStore

File: `stores/versionStore.ts`

| Field | Type | Purpose |
|-------|------|---------|
| `activeBookSlug` | `string` | Current book being viewed |
| `activeFilePath` | `string` | Current file being viewed |
| `versions` | `FileVersionSummary[]` | Paginated version list (newest first) |
| `totalCount` | `number` | Total versions for this file |
| `isLoading` | `boolean` | Loading state |
| `selectedVersionId` | `number \| null` | Currently selected version |
| `diff` | `FileDiff \| null` | Computed diff for selected version |
| `isDiffLoading` | `boolean` | Diff computation loading state |
| `error` | `string \| null` | Error message |

| Action | What It Does |
|--------|-------------|
| `loadHistory(bookSlug, filePath)` | Fetches first page + total count |
| `loadMoreHistory()` | Fetches next page (offset pagination) |
| `selectVersion(versionId)` | Computes diff against previous version |
| `clearSelection()` | Clears selected version and diff |
| `revertToVersion(versionId)` | Reverts file, reloads history |
| `reset()` | Clears all state |

### pitchRoomStore

File: `stores/pitchRoomStore.ts`

State and actions for the Pitch Room brainstorming view. Stream listener lifecycle managed via `initStreamListener()` / `destroyStreamListener()` (called from AppLayout's StreamManager component, not from PitchRoomView). Double-registration guard: `if (_cleanupListener) return`.

### pitchShelfStore

File: `stores/pitchShelfStore.ts`

Manages shelved pitches listing, reading, deleting, restoring.

### revisionQueueStore

File: `stores/revisionQueueStore.ts`

Manages revision plan state, session execution, approval gates.

### autoDraftStore

File: `stores/autoDraftStore.ts`

Manages auto-drafting state (sequential chapter writing). Tracks `skippedAudits: string[]` — when an audit/fix pass fails, the loop pauses (using existing pause/resume mechanism) with a diagnostic message. Resume skips the failed audit; stop halts the loop. Skipped chapters are logged in the finally block.

### streamHandler (utility)

File: `stores/streamHandler.ts`

Shared stream event handler factory used by chatStore, modalChatStore, and pitchRoomStore. Encapsulates:
- `source`-based filter: primary guard uses `source === 'revision'` to skip revision queue events; falls back to `rev:` prefix check when `source` is absent (backwards compat)
- callId matching guard (prevents cross-call bleed)
- Recovery mode guard (when no callId is active)
- Optional `alwaysCheckConversationId` — modalChatStore and pitchRoomStore enable this; chatStore does not (allows mid-stream conversation switching)
- Event type dispatch to store-specific callbacks

Stores initialize the handler via a lazy IIFE pattern to avoid circular TypeScript type inference.

### cliActivityStore

File: `stores/cliActivityStore.ts`

Tracks active CLI tool usage for the activity panel. Recovery polling uses module-level timer refs (`_activityRecoveryPollTimer`, `_activityRecoveryTimeout`) to prevent duplicate intervals on rapid view switches. `loadDiagnostics()` passes the call's `conversationId` to `context.getLastDiagnostics()` for per-conversation diagnostic lookup.

### fileChangeStore

File: `stores/fileChangeStore.ts`

Tracks file changes reported by the BookWatcher for UI refresh.

### modalChatStore

File: `stores/modalChatStore.ts`

State for modal chat overlays (e.g., hot-take, ad-hoc revision modal conversations). Has `_closeRequested` flag — when user clicks close during streaming, the modal auto-closes when the stream completes or errors.

### importStore

File: `stores/importStore.ts`

| Field | Type | Purpose |
|-------|------|---------|
| `step` | `'idle' \| 'loading' \| 'preview' \| 'importing' \| 'success' \| 'generating' \| 'generated' \| 'error'` | State machine phase |
| `preview` | `ImportPreview \| null` | Parsed chapter breakdown from file |
| `result` | `ImportResult \| null` | Committed book result |
| `error` | `string \| null` | Error message |
| `generationSteps` | `SourceGenerationStep[]` | Per-step progress for source generation |

| Action | What It Does |
|--------|-------------|
| `startImport()` | Opens file dialog, calls preview, transitions to `preview` |
| `updateTitle(title)` | Updates preview title |
| `updateAuthor(author)` | Updates preview author |
| `renameChapter(index, title)` | Renames a detected chapter |
| `mergeWithNext(index)` | Merges chapter with the following one |
| `removeChapter(index)` | Removes a detected chapter |
| `commitImport()` | Commits import via bridge, transitions to `success` |
| `startGeneration()` | Starts source doc generation, subscribes to progress events |
| `reset()` | Cleans up generation listener, resets to idle |

### motifLedgerStore

File: `stores/motifLedgerStore.ts`

Manages motif ledger loading, saving, and tab state.

| Field | Type | Purpose |
|-------|------|---------|
| `isNormalizing` | `boolean` | True during CLI-based schema normalization |

| Action | What It Does |
|--------|-------------|
| `setNormalizing(val)` | Sets `isNormalizing` state (driven by `motifLedger:normalizing` push events) |

---

## Views

| View ID | Component | When Active |
|---------|-----------|-------------|
| `onboarding` | `OnboardingWizard` | First run, no CLI detected |
| `chat` | `ChatView` | Default — agent conversations |
| `files` | `FilesView` | File browser/reader/editor |
| `build` | `BuildView` | Manuscript export |
| `settings` | `SettingsView` | App preferences |
| `revision-queue` | `RevisionQueueView` | Revision session management |
| `pitch-room` | `PitchRoomView` | Free brainstorming |
| `motif-ledger` | `MotifLedgerView` | Motif/phrase tracking |

Routing: `viewStore.currentView` → conditional render in `App.tsx` via `AppLayout`.

Gate: `App.tsx` checks `settings.initialized` — if false, renders `OnboardingWizard` instead of `AppLayout`.

---

## Components

### Layout/

| File | Purpose |
|------|---------|
| `AppLayout.tsx` | Main shell: sidebar + content area, view routing. `StreamManager` component initializes pitchRoomStore stream listener lifecycle (mount → `initStreamListener`, unmount → `destroyStreamListener`). |
| `Sidebar.tsx` | Left panel: book selector + pipeline + file tree + action buttons |
| `TitleBar.tsx` | Custom window title bar (traffic lights on macOS, buttons on Windows/Linux) |
| `ResizeHandle.tsx` | Sidebar resize drag handle |

### Onboarding/

| File | Purpose |
|------|---------|
| `OnboardingWizard.tsx` | First-run wizard: CLI detection, author name, initial setup |

### Settings/

| File | Purpose |
|------|---------|
| `SettingsView.tsx` | Full settings panel: CLI status, providers, model selection (grouped by provider), thinking, theme, author profile, usage stats, catalog export |
| `ProviderSection.tsx` | Provider management: cards with status dots, test connectivity, add/remove/toggle, "Add Provider" form |

### Sidebar/

| File | Purpose |
|------|---------|
| `BookSelector.tsx` | Book list dropdown with create/archive/unarchive. Groups books by series with collapsible `SeriesGroup` headers. "Manage Series" button opens `SeriesModal`. |
| `SeriesGroup.tsx` | Collapsible series group header with volume list, gear icon for management |
| `PipelineTracker.tsx` | Visual 14-phase pipeline with status icons, advance/revert controls |
| `FileTree.tsx` | Collapsible book directory tree |
| `VoiceSetupButton.tsx` | Quick action to start voice profile setup with Verity |
| `HotTakeButton.tsx` | Quick action to launch Ghostlight hot take |
| `AdhocRevisionButton.tsx` | Quick action to start ad-hoc revision with Forge |
| `RevisionQueueButton.tsx` | Navigate to revision queue view |
| `CliActivityButton.tsx` | Toggle CLI activity panel |
| `PitchHistory.tsx` | Shows pitch conversation history |
| `PitchPreviewModal.tsx` | Preview modal for shelved pitches |
| `ShelvedPitchesPanel.tsx` | Lists and manages shelved pitches |

### Series/

| File | Purpose |
|------|---------|
| `SeriesModal.tsx` | Main series management modal — list/create/edit/bible modes |
| `SeriesForm.tsx` | Create/edit series name and description form |
| `VolumeList.tsx` | Volume ordering (up/down arrows), add/remove books, book picker |
| `SeriesBibleEditor.tsx` | Markdown editor with word count, save button, dirty indicator |

### Chat/

| File | Purpose |
|------|---------|
| `ChatView.tsx` | Full chat view with agent header, messages, input |
| `ChatInput.tsx` | Message input with quick actions and thinking budget controls |
| `MessageBubble.tsx` | Single message with copy/save-to-file buttons |
| `MessageList.tsx` | Scrollable message history with auto-scroll |
| `StreamingMessage.tsx` | Live-updating message during CLI stream |
| `ThinkingBlock.tsx` | Collapsible thinking block display |
| `ThinkingBudgetSlider.tsx` | Per-message thinking budget override control |
| `AgentHeader.tsx` | Agent name, role, and color indicator |
| `ChatTitleBar.tsx` | Conversation title and metadata bar |
| `ConversationList.tsx` | Sidebar panel listing conversations for active book |
| `ChatModal.tsx` | Modal chat overlay for hot-take and ad-hoc revision |
| `QuickActions.tsx` | Pre-built prompt suggestions dropdown |

### Files/

| File | Purpose |
|------|---------|
| `FilesView.tsx` | Container: switches between browser, reader, and editor modes. Reader mode has History toggle with split-panel `VersionHistoryPanel` |
| `FileBrowser.tsx` | Traditional file tree browser |
| `StructuredBrowser.tsx` | Structured view with source/chapters/dist panels |
| `FileEditor.tsx` | Markdown editor with save/cancel, History toggle with split-panel `VersionHistoryPanel` |
| `FilesHeader.tsx` | Header with view mode toggles |
| `SourcePanel.tsx` | Source files section in structured browser, with version history icon on hover |
| `ChaptersPanel.tsx` | Chapters section in structured browser, with version history icons on hover for draft/notes |
| `AgentOutputPanel.tsx` | Agent output files section, with version history icon on hover |
| `CollapsibleSection.tsx` | Reusable collapsible section wrapper |
| `DeleteConfirmModal.tsx` | Confirmation dialog for file/folder deletion |
| `DiffViewer.tsx` | Renders `FileDiff` as color-coded unified diff (green/red/neutral) |
| `VersionHistoryPanel.tsx` | Slide-over panel: version timeline, diff viewer, revert with confirmation |

### Build/

| File | Purpose |
|------|---------|
| `BuildView.tsx` | Build progress log, output file listing, export ZIP |

### PitchRoom/

| File | Purpose |
|------|---------|
| `PitchRoomView.tsx` | Free brainstorming with Spark, draft management, promote/shelve/discard |

### RevisionQueue/

| File | Purpose |
|------|---------|
| `RevisionQueueView.tsx` | Main revision queue container |
| `SessionCard.tsx` | Individual revision session display |
| `TaskProgress.tsx` | Task completion progress bar |
| `RevisionSessionPanel.tsx` | Expanded session detail panel |
| `QueueControls.tsx` | Queue mode selector, run/pause buttons |
| `index.ts` | Barrel export |

### MotifLedger/

| File | Purpose |
|------|---------|
| `MotifLedgerView.tsx` | Tabbed view container for motif ledger |
| `EntriesTab.tsx` | Motif entries list and editor |
| `SystemsTab.tsx` | Motif systems overview |
| `ForeshadowTab.tsx` | Foreshadow tracking (planted/paid-off/abandoned) |
| `MinorCharactersTab.tsx` | Minor character motif tracking |
| `FlaggedPhrasesTab.tsx` | Flagged phrase management |
| `StructuralTab.tsx` | Structural devices catalog |
| `AuditLogTab.tsx` | Chapter audit history |

### Import/

| File | Purpose |
|------|---------|
| `ImportWizard.tsx` | Modal wizard for manuscript import. Renders per-step UI: loading spinner, preview (title/author inputs + chapter list), importing spinner, success (stats + "Open Book" / "Generate Source Documents"), generating (step checklist with progress), generated (summary), error (with retry). |
| `ChapterPreviewList.tsx` | Editable chapter list with inline title rename, word count badges, content preview snippets, "Merge ↓" and "×" actions, summary bar. Reads directly from `importStore`. |

### CliActivity/

| File | Purpose |
|------|---------|
| `CliActivityPanel.tsx` | Real-time tool-use activity panel |
| `constants.ts` | Activity display constants |

### ErrorBoundary/

| File | Purpose |
|------|---------|
| `ErrorBoundary.tsx` | React error boundary with fallback UI |

---

## Hooks

| File | Purpose |
|------|---------|
| `useResizeHandle.ts` | Horizontal drag-to-resize for sidebar |
| `useVerticalResize.ts` | Vertical drag-to-resize for panels |
| `useRevisionQueueEvents.ts` | Subscribes to revision queue IPC events |
| `useRotatingStatus.ts` | Rotates fun status messages on an interval |
| `useTheme.ts` | Syncs Tailwind dark mode class with settings theme |

---

## Styling

File: `styles/globals.css`

- Tailwind CSS v4 base import
- Dark theme using zinc scale: 950 (bg), 900 (sidebar), 800 (cards), 700 (borders), 100 (text)
- Blue-500 for interactive elements
- Amber for thinking blocks
- Green for success states
- Red for errors
- Custom scrollbar styles
- Typography plugin for markdown rendering
