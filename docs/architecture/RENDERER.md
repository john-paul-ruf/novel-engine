# Renderer — Stores, Components, Views

> Last updated: 2026-03-27

Everything in `src/renderer/`. React + Zustand UI layer. Talks to backend only through `window.novelEngine`.

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

### chatStore

File: `stores/chatStore.ts`

| Field | Type | Purpose |
|-------|------|---------|
| `conversations` | `Conversation[]` | Conversations for active book |
| `activeConversation` | `Conversation \| null` | Currently open conversation |
| `messages` | `Message[]` | Messages for active conversation |
| `isStreaming` | `boolean` | True during CLI stream |
| `streamBuffer` | `string` | Accumulating response text |
| `thinkingBuffer` | `string` | Accumulating thinking text |
| `progressStage` | `ProgressStage` | Tool-use stage inferred from stream |

| Action | What It Does |
|--------|-------------|
| `loadConversations(bookSlug)` | Fetches conversation list from DB |
| `createConversation(agent, book, phase)` | Creates and opens new conversation |
| `sendMessage(content)` | Sends via bridge, attaches stream listener |
| `abortStream()` | Kills active CLI process |

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

### pitchRoomStore

File: `stores/pitchRoomStore.ts`

State and actions for the Pitch Room brainstorming view.

### pitchShelfStore

File: `stores/pitchShelfStore.ts`

Manages shelved pitches listing, reading, deleting, restoring.

### revisionQueueStore

File: `stores/revisionQueueStore.ts`

Manages revision plan state, session execution, approval gates.

### autoDraftStore

File: `stores/autoDraftStore.ts`

Manages auto-drafting state (sequential chapter writing).

### cliActivityStore

File: `stores/cliActivityStore.ts`

Tracks active CLI tool usage for the activity panel.

### fileChangeStore

File: `stores/fileChangeStore.ts`

Tracks file changes reported by the BookWatcher for UI refresh.

### modalChatStore

File: `stores/modalChatStore.ts`

State for modal chat overlays (e.g., hot-take, ad-hoc revision modal conversations).

### motifLedgerStore

File: `stores/motifLedgerStore.ts`

Manages motif ledger loading, saving, and tab state.

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
| `AppLayout.tsx` | Main shell: sidebar + content area, view routing |
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
| `SettingsView.tsx` | Full settings panel: model, thinking, theme, author profile, usage stats |

### Sidebar/

| File | Purpose |
|------|---------|
| `BookSelector.tsx` | Book list dropdown with create/archive/unarchive |
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
| `FilesView.tsx` | Container: switches between browser, reader, and editor modes |
| `FileBrowser.tsx` | Traditional file tree browser |
| `StructuredBrowser.tsx` | Structured view with source/chapters/dist panels |
| `FileEditor.tsx` | Markdown editor with save/cancel |
| `FilesHeader.tsx` | Header with view mode toggles |
| `SourcePanel.tsx` | Source files section in structured browser |
| `ChaptersPanel.tsx` | Chapters section in structured browser |
| `AgentOutputPanel.tsx` | Agent output files section |
| `CollapsibleSection.tsx` | Reusable collapsible section wrapper |
| `DeleteConfirmModal.tsx` | Confirmation dialog for file/folder deletion |

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
