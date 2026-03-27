# Session 30 — Pitch Room: Book-Free Brainstorming with Spark

## Context

Novel Engine Electron app. Sessions 28–29 added shelved pitch infrastructure and UI. Currently, pitching requires creating a book first, then talking to Spark inside that book's pipeline. This is backwards — authors want to brainstorm freely with Spark, explore multiple ideas, and *then* decide which pitch becomes a book.

This session adds the **Pitch Room** — a dedicated brainstorming space where the author talks to Spark without needing a book. Pitches produced in the room can be promoted to books, shelved for later, or left as drafts.

---

## Design

### Concept

The Pitch Room is a **book-free zone**. It lives alongside the book selector as a first-class destination — not buried inside a book's pipeline. The author can:

1. Open the Pitch Room from the sidebar (always accessible, regardless of active book)
2. Start a new conversation with Spark (or continue an existing one)
3. Brainstorm freely — Spark writes `pitch.md` to a temporary draft area
4. When satisfied, choose an outcome for each pitch draft:
   - **"Make it a Book"** → creates a new book with `source/pitch.md`, switches to it
   - **"Shelve for Later"** → saves to `_pitches/` shelf (existing infrastructure)
   - **"Discard"** → deletes the draft pitch file and conversation

### Architecture: The `__pitch-room__` Virtual Book

Rather than introducing a fundamentally new conversation storage mechanism, we use a **reserved book slug** — `__pitch-room__` — as the namespace for pitch room conversations and draft files.

- **Conversations** in the database use `bookSlug: '__pitch-room__'`
- **Draft pitch files** are stored in `{userData}/__pitch-room__/drafts/{conversationId}/pitch.md`
- The `__pitch-room__` slug is excluded from `listBooks()` results
- When a pitch is promoted, the draft file is copied to the new book's `source/pitch.md` and the draft is deleted

This approach means:
- No database schema changes (conversations already have a `bookSlug` field)
- ChatService works unchanged (it just sees a different bookSlug)
- The ClaudeCodeClient works unchanged (it sends messages to Spark normally)
- Only the file routing needs special handling for the virtual slug

### UI Layout

The Pitch Room is a **new view** (`'pitch-room'` in `ViewId`), accessible via a sidebar button above the pipeline tracker:

```
┌──────────────────────────────────────────────────────┐
│  📖 The Recursive Archivist  ▼                       │  Book Selector
├──────────────────────────────────────────────────────┤
│  💡 Pitch Room                              (2)      │  ← NEW: always visible
├──────────────────────────────────────────────────────┤
│  Pipeline Tracker...                                 │
│  File Tree...                                        │
└──────────────────────────────────────────────────────┘
```

The Pitch Room view itself:

```
┌──────────────────────────────────────────────────────────────────┐
│  💡 Pitch Room                                    [+ New Pitch]  │
├──────────────┬───────────────────────────────────────────────────┤
│              │                                                   │
│  DRAFTS (2)  │   Chat with Spark                                │
│              │                                                   │
│  ┌─────────┐ │   [Spark]: What kind of story are you            │
│  │ Untitled│ │   thinking about?                                │
│  │ Draft   │ │                                                   │
│  │ active  │ │   [You]: I want to write a mystery about         │
│  └─────────┘ │   a librarian who discovers...                   │
│              │                                                   │
│  ┌─────────┐ │   [Spark]: That's rich territory! Let me         │
│  │ The     │ │   think about the core tension...                │
│  │ Garden  │ │                                                   │
│  │ Mar 20  │ │   [Spark thinking...]                            │
│  └─────────┘ │                                                   │
│              │                                                   │
│              ├───────────────────────────────────────────────────┤
│              │  [Type your message to Spark...]          [Send]  │
│              ├───────────────────────────────────────────────────┤
│              │  ┌──────────┐ ┌──────────────┐ ┌─────────┐      │
│              │  │ 📖 Make  │ │ 📋 Shelve    │ │ 🗑 Drop │      │
│              │  │   Book   │ │   for Later  │ │         │      │
│              │  └──────────┘ └──────────────┘ └─────────┘      │
└──────────────┴───────────────────────────────────────────────────┘
```

### Pitch Draft Lifecycle

```
[New Pitch] → creates conversation with Spark (bookSlug: __pitch-room__)
     │
     ▼
  DRAFT state — author chats with Spark
     │
     ├── Spark writes pitch.md → saved to drafts/{conversationId}/pitch.md
     │
     ▼
  READY state — pitch.md exists, outcome buttons enabled
     │
     ├── "Make Book" → createBook(title) + copy pitch.md → switch to new book
     ├── "Shelve"    → shelvePitchDraft(conversationId) → moves to _pitches/
     └── "Discard"   → deletePitchDraft(conversationId) → removes draft + conversation
```

### How Spark Knows It's in the Pitch Room

The Pitch Room conversations use `purpose: 'pitch-room'` (new `ConversationPurpose` variant). The ChatService detects this purpose and:

1. Skips the Context Wrangler (no book context to wrangle)
2. Loads only the author profile as context (if it exists)
3. Passes Spark's system prompt with an added instruction: "Write pitch output to `source/pitch.md`"
4. Routes file writes to the draft area instead of a real book directory

---

## Task 1: Domain Changes

### Update `src/domain/types.ts`

1. **Add `'pitch-room'` to `ConversationPurpose`:**

```typescript
export type ConversationPurpose = 'pipeline' | 'voice-setup' | 'author-profile' | 'pitch-room';
```

2. **Add `PitchDraft` type:**

```typescript
export type PitchDraft = {
  conversationId: string;     // the pitch room conversation this belongs to
  title: string;              // extracted from pitch content, or "Untitled Draft"
  hasPitch: boolean;          // true if pitch.md exists in the draft folder
  createdAt: string;          // ISO date (from conversation creation)
  updatedAt: string;          // ISO date (last message timestamp)
};
```

3. **Add `PitchOutcome` type:**

```typescript
export type PitchOutcome = 'make-book' | 'shelve' | 'discard';
```

### Update `src/domain/constants.ts`

Add the reserved slug constant:

```typescript
/** Reserved book slug used for Pitch Room conversations and draft files. */
export const PITCH_ROOM_SLUG = '__pitch-room__';
```

Add Pitch Room-specific prompt addition (similar to `VOICE_SETUP_INSTRUCTIONS`):

```typescript
export const PITCH_ROOM_INSTRUCTIONS = `

---

## Current Mode: Pitch Room

You are in the Pitch Room — a free brainstorming space where the author explores story ideas without commitment. There is no book yet. Your job is to help them discover and develop a compelling story concept.

**Your approach:**
1. Start by understanding what the author is drawn to — genre, themes, emotions, a character, a scene, a "what if"
2. Ask probing questions to uncover the story's core tension and emotional engine
3. Help them find the hook — the thing that makes this story impossible to put down
4. When the concept crystallizes, produce a **full pitch card** including:
   - Title
   - Logline (one sentence)
   - Genre and tone
   - Core conflict
   - Main characters (2-3)
   - The emotional question at the heart of the story
   - Opening hook

When the pitch is ready, write it to \`source/pitch.md\` using the Write tool. The author can then decide to make it a book or shelve it for later.

**Important:** You can explore multiple directions in a single conversation. If an idea isn't working, pivot freely. The Pitch Room is for exploration, not commitment.
`;
```

### Update `src/domain/interfaces.ts`

Add pitch room methods to `IFileSystemService`:

```typescript
// Inside IFileSystemService:

// Pitch Room drafts
listPitchDrafts(): Promise<PitchDraft[]>;
getPitchDraft(conversationId: string): Promise<PitchDraft | null>;
readPitchDraftContent(conversationId: string): Promise<string>;
deletePitchDraft(conversationId: string): Promise<void>;
promotePitchToBook(conversationId: string): Promise<BookMeta>;
shelvePitchDraft(conversationId: string, logline?: string): Promise<ShelvedPitchMeta>;

/**
 * Returns the absolute path to the pitch room drafts directory for a given
 * conversation. Used by ChatService to set the working directory for Spark
 * when running in pitch-room mode.
 */
getPitchDraftPath(conversationId: string): string;
```

---

## Task 2: Infrastructure — FileSystemService Pitch Room Methods

### Update `src/infrastructure/filesystem/FileSystemService.ts`

Add implementations for the new `IFileSystemService` methods. The pitch room draft area is at `{userData}/__pitch-room__/drafts/{conversationId}/`.

Each draft folder mirrors a minimal book structure so Spark's file writes work naturally:

```
{userData}/__pitch-room__/drafts/{conversationId}/
  └── source/
      └── pitch.md     ← written by Spark via CLI
```

**Key implementation details:**

1. **`listPitchDrafts()`**: Scans `__pitch-room__/drafts/`, reads each subfolder for a `source/pitch.md` file, extracts title from content (first `# ` heading or "Untitled Draft"), returns sorted by updatedAt descending.

2. **`getPitchDraft(conversationId)`**: Reads the specific draft folder. Returns `null` if the folder doesn't exist.

3. **`readPitchDraftContent(conversationId)`**: Reads and returns `source/pitch.md` content. Throws if file doesn't exist.

4. **`deletePitchDraft(conversationId)`**: Recursively removes the draft folder `__pitch-room__/drafts/{conversationId}/`.

5. **`promotePitchToBook(conversationId)`**:
   - Reads the pitch content from the draft folder
   - Extracts the title from the first `# ` heading (falls back to "Untitled Book")
   - Calls `this.createBook(title)` to create a real book
   - Copies `source/pitch.md` to the new book's `source/pitch.md`
   - Deletes the draft folder
   - Returns the new `BookMeta`

6. **`shelvePitchDraft(conversationId, logline?)`**:
   - Reads the pitch content from the draft folder
   - Extracts title from the first `# ` heading
   - Creates a shelved pitch file in `_pitches/` with front matter (title, logline, shelvedAt, shelvedFrom: '')
   - Deletes the draft folder
   - Returns `ShelvedPitchMeta`

7. **`getPitchDraftPath(conversationId)`**: Returns the absolute path to the draft folder for the given conversationId. Creates the directory structure if it doesn't exist (mkdir -p equivalent).

8. **Ensure `listBooks()` excludes `__pitch-room__`**: Add a filter to skip the reserved slug when listing books.

---

## Task 3: Application — ChatService Pitch Room Handling

### Update `src/application/ChatService.ts`

The ChatService needs to detect `purpose: 'pitch-room'` conversations and handle them differently:

1. **Skip the Context Wrangler** — no book context to plan around
2. **Set working directory** to the draft folder (so Spark's file writes go to the right place)
3. **Load minimal context**: only the author profile (if it exists) + Spark's system prompt + `PITCH_ROOM_INSTRUCTIONS`
4. **No pipeline phase** — pitch room conversations have `pipelinePhase: null`

In the `send()` method (or equivalent orchestration method), add a branch:

```typescript
// Pseudocode for the pitch-room branch:
if (conversation.purpose === 'pitch-room') {
  const agent = await this.agents.load('Spark');
  const authorProfilePath = this.settings.getAuthorProfilePath?.() ?? '';
  let authorProfile = '';
  try {
    // Read author profile if it exists — use the fs service
    authorProfile = await this.fs.readAuthorProfile();
  } catch { /* no profile yet, that's fine */ }

  const systemPrompt = agent.systemPrompt + PITCH_ROOM_INSTRUCTIONS
    + (authorProfile ? `\n\n---\n\n## Author Profile\n\n${authorProfile}` : '');

  // Get the draft directory path for this conversation
  const workingDir = this.fs.getPitchDraftPath(conversation.id);

  await this.claude.sendMessage({
    model: settings.model,
    systemPrompt,
    messages: conversationMessages,
    maxTokens: settings.maxTokens,
    thinkingBudget: settings.enableThinking ? agent.thinkingBudget : undefined,
    workingDir,   // <-- NEW: tells the CLI where to write files
    onEvent,
  });
  return;
}
```

### Update `src/domain/interfaces.ts` — IClaudeClient

Add optional `workingDir` parameter to `sendMessage`:

```typescript
export interface IClaudeClient {
  sendMessage(params: {
    model: string;
    systemPrompt: string;
    messages: { role: MessageRole; content: string }[];
    maxTokens: number;
    thinkingBudget?: number;
    bookSlug?: string;
    workingDir?: string;   // <-- NEW: override working directory for CLI
    onEvent: (event: StreamEvent) => void;
  }): Promise<void>;

  isAvailable(): Promise<boolean>;
}
```

### Update `src/infrastructure/claude-cli/ClaudeCodeClient.ts`

When `workingDir` is provided, use it as the `cwd` for the spawned CLI process instead of deriving it from `bookSlug`.

---

## Task 4: IPC Handlers and Preload Bridge

### Update `src/main/ipc/handlers.ts`

Add new handlers under the `pitchRoom:` namespace:

```typescript
'pitchRoom:listDrafts'     → () => fs.listPitchDrafts()
'pitchRoom:getDraft'       → (_, convId) => fs.getPitchDraft(convId)
'pitchRoom:readContent'    → (_, convId) => fs.readPitchDraftContent(convId)
'pitchRoom:promote'        → (_, convId) => fs.promotePitchToBook(convId)
'pitchRoom:shelve'         → (_, convId, logline?) => fs.shelvePitchDraft(convId, logline)
'pitchRoom:discard'        → (_, convId) => { fs.deletePitchDraft(convId); db.deleteConversation(convId); }
```

### Update `src/preload/index.ts`

Add the `pitchRoom` namespace to the bridge:

```typescript
pitchRoom: {
  listDrafts: (): Promise<PitchDraft[]> =>
    ipcRenderer.invoke('pitchRoom:listDrafts'),
  getDraft: (conversationId: string): Promise<PitchDraft | null> =>
    ipcRenderer.invoke('pitchRoom:getDraft', conversationId),
  readContent: (conversationId: string): Promise<string> =>
    ipcRenderer.invoke('pitchRoom:readContent', conversationId),
  promote: (conversationId: string): Promise<BookMeta> =>
    ipcRenderer.invoke('pitchRoom:promote', conversationId),
  shelve: (conversationId: string, logline?: string): Promise<ShelvedPitchMeta> =>
    ipcRenderer.invoke('pitchRoom:shelve', conversationId, logline),
  discard: (conversationId: string): Promise<void> =>
    ipcRenderer.invoke('pitchRoom:discard', conversationId),
},
```

Update the `NovelEngineAPI` type declaration to include the new namespace.

---

## Task 5: Renderer — Pitch Room Store

### Create `src/renderer/stores/pitchRoomStore.ts`

```typescript
import { create } from 'zustand';
import type { PitchDraft, Conversation, Message, StreamEvent, BookMeta, ShelvedPitchMeta } from '@domain/types';
import { PITCH_ROOM_SLUG } from '@domain/constants';
import { useChatStore } from './chatStore';
import { useBookStore } from './bookStore';
import { useViewStore } from './viewStore';

type PitchRoomState = {
  drafts: PitchDraft[];
  activeConversation: Conversation | null;
  messages: Message[];
  isStreaming: boolean;
  streamBuffer: string;
  thinkingBuffer: string;
  statusMessage: string;
  loading: boolean;

  // Actions
  loadDrafts: () => Promise<void>;
  startNewPitch: () => Promise<void>;
  selectDraft: (conversationId: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  promoteToBook: (conversationId: string) => Promise<BookMeta>;
  shelveDraft: (conversationId: string, logline?: string) => Promise<ShelvedPitchMeta>;
  discardDraft: (conversationId: string) => Promise<void>;
  refreshDrafts: () => Promise<void>;

  _handleStreamEvent: (event: StreamEvent) => void;
};
```

The store manages its own conversation list and streaming state, separate from the main `chatStore`. This is important because:
- The pitch room has different streaming behavior (no pipeline lock, no phase tracking)
- The pitch room conversations use a different bookSlug
- The main chat store shouldn't be polluted with pitch room state

Key behaviors:
- `startNewPitch()`: Creates a conversation with `agentName: 'Spark'`, `bookSlug: PITCH_ROOM_SLUG`, `purpose: 'pitch-room'`, `pipelinePhase: null`
- `sendMessage()`: Sends via `window.novelEngine.chat.send()` with the pitch room conversation params
- `promoteToBook()`: Calls `window.novelEngine.pitchRoom.promote(conversationId)`, then switches to the new book
- `shelveDraft()`: Calls `window.novelEngine.pitchRoom.shelve(conversationId, logline)`
- `discardDraft()`: Calls `window.novelEngine.pitchRoom.discard(conversationId)`, removes from local state
- `refreshDrafts()`: Reloads the drafts list (called after promote/shelve/discard)

---

## Task 6: Renderer — PitchRoom View Component

### Update `src/renderer/stores/viewStore.ts`

Add `'pitch-room'` to the `ViewId` type:

```typescript
type ViewId = 'onboarding' | 'chat' | 'files' | 'build' | 'settings' | 'revision-queue' | 'pitch-room';
```

### Create `src/renderer/components/PitchRoom/PitchRoomView.tsx`

The main Pitch Room view with three sections:

1. **Draft sidebar** (left, narrow): Lists pitch drafts with title, date, and "has pitch" indicator
2. **Chat area** (center): Full chat interface with Spark — reuses `MessageList` and `ChatInput` components
3. **Outcome bar** (bottom): Three buttons — "Make Book", "Shelve for Later", "Discard"

```
┌──────────────────────────────────────────────────────────────────┐
│  💡 Pitch Room                                    [+ New Pitch]  │
├──────────────┬───────────────────────────────────────────────────┤
│  DRAFTS      │  [Spark agent header]                            │
│              │                                                   │
│  ● Untitled  │  [Message list - reuse MessageList component]    │
│    Draft     │                                                   │
│    active    │                                                   │
│              │                                                   │
│  ○ The Last  │                                                   │
│    Garden    │                                                   │
│    Mar 20    │                                                   │
│              │                                                   │
│              ├───────────────────────────────────────────────────┤
│              │  [ChatInput component]                            │
│              ├───────────────────────────────────────────────────┤
│              │  [📖 Make Book] [📋 Shelve] [🗑 Discard]         │
│              │  ↑ only enabled when pitch.md exists              │
└──────────────┴───────────────────────────────────────────────────┘
```

**Component tree:**

```
PitchRoomView
├── PitchRoomHeader         (title bar with "New Pitch" button)
├── PitchDraftSidebar       (draft list)
├── AgentHeader             (reuse — shows Spark's info)
├── MessageList             (reuse — renders the conversation)
├── ChatInput               (reuse — message input)
└── PitchOutcomeBar         (make book / shelve / discard buttons)
```

### Create `src/renderer/components/PitchRoom/PitchDraftSidebar.tsx`

Lists draft pitches. Each draft card shows:
- Title (extracted from pitch.md or "Untitled Draft")
- Created date
- A dot indicator: filled = has pitch.md, empty = still brainstorming
- Click to select/switch draft conversation

### Create `src/renderer/components/PitchRoom/PitchOutcomeBar.tsx`

Three outcome buttons with confirmation dialogs:

- **"📖 Make Book"**: Enabled when `hasPitch` is true. Confirmation: "Create a new book from this pitch?" → calls `promoteToBook()` → navigates to the new book's chat view
- **"📋 Shelve for Later"**: Enabled when `hasPitch` is true. Optional logline input → calls `shelveDraft()` → shows success toast → removes draft from list
- **"🗑 Discard"**: Always enabled. Confirmation: "Discard this pitch draft and conversation?" → calls `discardDraft()` → selects next draft or shows empty state

### Create `src/renderer/components/PitchRoom/PitchRoomHeader.tsx`

Title bar showing "💡 Pitch Room" with a [+ New Pitch] button that calls `startNewPitch()`.

---

## Task 7: Integrate into AppLayout and Sidebar

### Update `src/renderer/components/Layout/AppLayout.tsx`

Add the PitchRoomView to the `ViewContent` component:

```tsx
import { PitchRoomView } from '../PitchRoom/PitchRoomView';

// Inside ViewContent:
<div className={`h-full ${currentView === 'pitch-room' ? '' : 'hidden'}`}>
  <PitchRoomView />
</div>
```

### Update `src/renderer/components/Layout/Sidebar.tsx`

Add a "Pitch Room" button above (or below) the pipeline tracker. It should:
- Show a lightbulb icon and "Pitch Room" label
- Show the draft count badge (like shelved pitches count)
- Navigate to the `'pitch-room'` view when clicked
- Be highlighted when `currentView === 'pitch-room'`

```tsx
<button
  onClick={() => navigate('pitch-room')}
  className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
    currentView === 'pitch-room'
      ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400'
      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
  }`}
>
  <span>💡</span>
  <span>Pitch Room</span>
  {draftCount > 0 && (
    <span className="ml-auto rounded-full bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
      {draftCount}
    </span>
  )}
</button>
```

---

## Task 8: Stream Routing for Pitch Room

The Pitch Room needs its own stream event handling, separate from the main chat. The existing `streamRouter` pattern (used for the revision queue's `modalChatStore`) should be extended:

### Update `src/renderer/stores/streamRouter.ts`

Add `'pitch-room'` as a valid stream target:

```typescript
type StreamTarget = 'main' | 'modal' | 'revision' | 'pitch-room';
```

### Update `pitchRoomStore.ts`

When the Pitch Room sends a message, set `streamRouter.target = 'pitch-room'` before calling `window.novelEngine.chat.send()`. The store's `_handleStreamEvent` should check that the router target is `'pitch-room'` before processing events.

### Wire up stream listener

The PitchRoomView component should register its own stream event listener (similar to how ChatModal does it). Since the main `StreamManager` in AppLayout already handles `onStreamEvent`, the pitch room store listens to the same events but only processes them when `streamRouter.target === 'pitch-room'`.

---

## Summary of Changes by File

| File | Change |
|------|--------|
| `src/domain/types.ts` | Add `'pitch-room'` to `ConversationPurpose`, add `PitchDraft` and `PitchOutcome` types |
| `src/domain/constants.ts` | Add `PITCH_ROOM_SLUG`, `PITCH_ROOM_INSTRUCTIONS` |
| `src/domain/interfaces.ts` | Add pitch room methods to `IFileSystemService`, add `workingDir` to `IClaudeClient.sendMessage` |
| `src/infrastructure/filesystem/FileSystemService.ts` | Implement 7 pitch room methods, exclude `__pitch-room__` from `listBooks()` |
| `src/infrastructure/claude-cli/ClaudeCodeClient.ts` | Honor `workingDir` parameter in `sendMessage` |
| `src/application/ChatService.ts` | Add pitch-room branch that skips wrangler, uses draft path as working dir |
| `src/main/ipc/handlers.ts` | Add `pitchRoom:*` handlers |
| `src/preload/index.ts` | Add `pitchRoom` namespace to bridge + type declaration |
| `src/renderer/stores/viewStore.ts` | Add `'pitch-room'` to `ViewId` |
| `src/renderer/stores/pitchRoomStore.ts` | **NEW** — Zustand store for pitch room state |
| `src/renderer/stores/streamRouter.ts` | Add `'pitch-room'` target |
| `src/renderer/components/PitchRoom/PitchRoomView.tsx` | **NEW** — Main pitch room view |
| `src/renderer/components/PitchRoom/PitchDraftSidebar.tsx` | **NEW** — Draft list sidebar |
| `src/renderer/components/PitchRoom/PitchOutcomeBar.tsx` | **NEW** — Outcome buttons (make book / shelve / discard) |
| `src/renderer/components/PitchRoom/PitchRoomHeader.tsx` | **NEW** — Title bar with new pitch button |
| `src/renderer/components/Layout/AppLayout.tsx` | Mount PitchRoomView in ViewContent |
| `src/renderer/components/Layout/Sidebar.tsx` | Add Pitch Room navigation button |

## Architecture Notes

- **Layer boundaries preserved.** The Pitch Room follows the same clean architecture as the rest of the app. Infrastructure implements interfaces, application orchestrates via injected dependencies, renderer communicates only through the preload bridge.
- **No database schema changes.** Conversations already support arbitrary `bookSlug` values — we just use a reserved one.
- **Reuses existing components.** `MessageList`, `ChatInput`, and `AgentHeader` are reused in the Pitch Room view — no duplication.
- **Stream isolation.** The pitch room has its own stream routing target, so streaming in the pitch room doesn't interfere with the main chat or revision queue.
- **Graceful degradation.** If the draft directory is empty or missing, the Pitch Room shows an empty state with a "Start brainstorming" call to action.

## Verification

1. **Pitch Room accessible:**
   - Verify "💡 Pitch Room" button appears in the sidebar
   - Clicking it navigates to the pitch room view

2. **New pitch conversation:**
   - Click "+ New Pitch" → new Spark conversation starts
   - Chat with Spark normally — messages stream correctly
   - Spark can write `source/pitch.md` (file appears in draft folder)

3. **Draft list:**
   - Multiple pitch conversations appear in the draft sidebar
   - Clicking a draft switches to that conversation
   - Drafts with pitch.md show a filled indicator

4. **Make Book:**
   - Click "Make Book" on a draft with pitch.md → confirmation dialog
   - Confirm → new book created with pitch.md, app switches to the book's chat view
   - Draft removed from pitch room list

5. **Shelve:**
   - Click "Shelve for Later" → optional logline input → confirm
   - Pitch appears in the shelved pitches panel (from Session 29)
   - Draft removed from pitch room list

6. **Discard:**
   - Click "Discard" → confirmation dialog → confirm
   - Draft and conversation deleted
   - Next draft selected, or empty state shown

7. **Unshelve → Book (existing flow, unchanged):**
   - Open shelved pitches from book selector
   - Click "Restore" on a shelved pitch → creates book, switches to it

8. **No interference with main chat:**
   - While streaming in the pitch room, the main chat view shows no streaming state
   - Switching between pitch room and chat view preserves both states

9. **Compilation:**
   - `npx tsc --noEmit` passes with zero errors
