# Session 22 — Pipeline-Locked Chat & Book-Scoped Conversations

## Context

Novel Engine Electron app. Sessions 01–21 built the complete app including agent chat, pipeline tracking, save-to-file, voice/author profile setup, and the revision queue. Currently the chat window is **completely open** — the user can start conversations with any agent at any time, regardless of which pipeline phase is active. Conversations are loaded per-book via `loadConversations(bookSlug)`, but nothing prevents the user from chatting with the wrong agent for their current stage.

**The problems:**

1. **No agent gating** — The user can chat with Lumen during the `pitch` phase, or Spark during `copy-edit`. The pipeline tracker suggests which agent to use, but the chat itself doesn't enforce it. New users will get confused.

2. **No chat history scoping** — The conversation list shows ALL conversations for a book, regardless of pipeline phase. When the user clicks a pipeline phase, they should see only conversations relevant to that phase.

3. **Book switching doesn't fully reset chat state** — When switching books, `loadConversations` is called but the `activeConversation` may still reference a conversation from the previous book until the user manually selects a new one.

**The solution:** A **Pipeline-Locked Chat** system that:

1. Locks the agent picker and chat input to the agent that owns the current active pipeline phase
2. Filters the conversation list to show only conversations matching the active phase (plus voice-setup and author-profile conversations which are always accessible)
3. Fully resets chat state on book switch — clearing the active conversation, messages, and reloading conversations for the new book
4. Provides a clear UI indicator showing which agent currently "owns the stage"
5. Still allows advanced users to override the lock via an explicit "Unlock" toggle

---

## Architecture

### Layer Placement

| Component | Layer | File |
|-----------|-------|------|
| No new domain types needed | — | — |
| `chatStore.ts` updates | Renderer | `src/renderer/stores/chatStore.ts` |
| `bookStore.ts` updates | Renderer | `src/renderer/stores/bookStore.ts` |
| `ChatView.tsx` updates | Renderer | `src/renderer/components/Chat/ChatView.tsx` |
| `ConversationList.tsx` updates | Renderer | `src/renderer/components/Chat/ConversationList.tsx` |
| `ChatInput.tsx` updates | Renderer | `src/renderer/components/Chat/ChatInput.tsx` |
| `AgentHeader.tsx` updates | Renderer | `src/renderer/components/Chat/AgentHeader.tsx` |
| `PipelineLockBanner.tsx` (**NEW**) | Renderer | `src/renderer/components/Chat/PipelineLockBanner.tsx` |

### Design Principles

- **Renderer-only changes.** The lock is a UI concern — the backend already scopes conversations by `bookSlug` and `pipelinePhase`. No IPC, preload, application, or infrastructure changes needed.
- **The pipeline store is the source of truth** for which agent owns the stage. The chat store reads from it.
- **Soft lock, not hard lock.** The user can toggle an "unlock" mode to access any agent — power users shouldn't be constrained. But the default state is locked.
- **Book switch = full reset.** Switching books clears everything and auto-selects the conversation matching the new book's active phase (if one exists).

---

## Task 1: Chat Store — Pipeline Lock State & Book-Scoped Reset

### Update `src/renderer/stores/chatStore.ts`

Add pipeline-lock state and a comprehensive book-switch handler.

**New imports:**

```typescript
import type { AgentName, Conversation, ConversationPurpose, Message, PipelinePhase, PipelinePhaseId, StreamEvent, UsageRecord } from '@domain/types';
```

**New state fields:**

```typescript
type ChatState = {
  // ... existing fields ...

  // Pipeline lock state
  pipelineLocked: boolean;               // true = chat is locked to the active pipeline agent
  lockedAgentName: AgentName | null;     // the agent that owns the active phase
  lockedPhaseId: PipelinePhaseId | null; // the active pipeline phase

  // New actions
  setPipelineLock: (locked: boolean) => void;
  syncWithPipeline: (activePhase: PipelinePhase | null) => void;
  switchBook: (newBookSlug: string) => Promise<void>;

  // Updated signature (adds purpose param)
  createConversation: (
    agentName: AgentName,
    bookSlug: string,
    phase: PipelinePhaseId | null,
    purpose?: ConversationPurpose,
  ) => Promise<void>;
};
```

**`setPipelineLock` implementation:**

```typescript
setPipelineLock: (locked: boolean) => {
  set({ pipelineLocked: locked });
},
```

**`syncWithPipeline` implementation:**

Called whenever the pipeline store's `activePhase` changes. Updates the locked agent and phase. If the chat is locked and there's no active conversation matching the locked phase, auto-select the most recent matching conversation:

```typescript
syncWithPipeline: (activePhase: PipelinePhase | null) => {
  const lockedAgentName = activePhase?.agent ?? null;
  const lockedPhaseId = activePhase?.id ?? null;

  set({ lockedAgentName, lockedPhaseId });

  const { pipelineLocked, activeConversation, conversations } = get();

  // If locked and current conversation doesn't match the active phase, auto-switch
  if (pipelineLocked && lockedAgentName && lockedPhaseId) {
    const currentMatchesPhase =
      activeConversation?.agentName === lockedAgentName &&
      activeConversation?.pipelinePhase === lockedPhaseId &&
      activeConversation?.purpose === 'pipeline';

    if (!currentMatchesPhase) {
      // Find the most recent conversation for this agent + phase
      const match = conversations.find(
        (c) =>
          c.agentName === lockedAgentName &&
          c.pipelinePhase === lockedPhaseId &&
          c.purpose === 'pipeline',
      );
      if (match) {
        get().setActiveConversation(match.id);
      } else {
        // No existing conversation — clear active so the empty state shows
        set({ activeConversation: null, messages: [] });
      }
    }
  }
},
```

**`switchBook` implementation:**

A dedicated action that fully resets chat state when the active book changes:

```typescript
switchBook: async (newBookSlug: string) => {
  // Step 1: Clear all chat state immediately
  set({
    activeConversation: null,
    conversations: [],
    messages: [],
    isStreaming: false,
    isThinking: false,
    streamBuffer: '',
    thinkingBuffer: '',
    conversationUsage: null,
  });

  // Step 2: Load conversations for the new book
  try {
    const conversations = await window.novelEngine.chat.getConversations(newBookSlug);
    set({ conversations });
  } catch (error) {
    console.error('Failed to load conversations for new book:', error);
  }
},
```

**`createConversation` — update signature** to accept optional `purpose`:

```typescript
createConversation: async (
  agentName: AgentName,
  bookSlug: string,
  phase: PipelinePhaseId | null,
  purpose: ConversationPurpose = 'pipeline',
) => {
  try {
    const conversation = await window.novelEngine.chat.createConversation({
      bookSlug,
      agentName,
      pipelinePhase: phase,
      purpose,
    });
    set((state) => ({
      activeConversation: conversation,
      conversations: [conversation, ...state.conversations],
      messages: [],
    }));
  } catch (error) {
    console.error('Failed to create conversation:', error);
  }
},
```

**Initial state values:**

```typescript
pipelineLocked: true,      // locked by default
lockedAgentName: null,
lockedPhaseId: null,
```

---

## Task 2: Book Store — Trigger Chat Reset on Book Switch

### Update `src/renderer/stores/bookStore.ts`

Update `setActiveBook` to call the chat store's `switchBook` after changing the active book:

```typescript
import { useChatStore } from './chatStore';
```

```typescript
setActiveBook: async (slug: string) => {
  try {
    await window.novelEngine.books.setActive(slug);
    set({ activeSlug: slug });

    // Reset chat context for the new book
    const { switchBook } = useChatStore.getState();
    await switchBook(slug);

    await get().refreshWordCount();
  } catch (error) {
    console.error('Failed to set active book:', error);
  }
},
```

---

## Task 3: Pipeline Lock Banner Component

### Create `src/renderer/components/Chat/PipelineLockBanner.tsx`

A banner displayed at the top of the chat area when there is a lockable phase. Shows which agent owns the stage, the current phase, and a toggle to unlock.

```tsx
import { AGENT_REGISTRY, PIPELINE_PHASES } from '@domain/constants';
import { useChatStore } from '../../stores/chatStore';

export function PipelineLockBanner(): React.ReactElement | null {
  const { pipelineLocked, lockedAgentName, lockedPhaseId, setPipelineLock } = useChatStore();

  // Don't show if there's no locked agent (e.g., build phase has no agent, or no book selected)
  if (!lockedAgentName || !lockedPhaseId) return null;

  const agentMeta = AGENT_REGISTRY[lockedAgentName];
  const phase = PIPELINE_PHASES.find((p) => p.id === lockedPhaseId);

  return (
    <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-6 py-2">
      <div className="flex items-center gap-2">
        {pipelineLocked ? (
          <>
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: agentMeta.color }}
            />
            <span className="text-xs text-zinc-400">
              <span className="font-medium text-zinc-200">{lockedAgentName}</span>
              {' owns this stage'}
              {phase && (
                <span className="text-zinc-500"> — {phase.label}</span>
              )}
            </span>
          </>
        ) : (
          <span className="text-xs text-amber-400/80">
            Pipeline lock disabled — all agents available
          </span>
        )}
      </div>

      <button
        onClick={() => setPipelineLock(!pipelineLocked)}
        className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
          pipelineLocked
            ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
            : 'bg-amber-600/20 text-amber-400 hover:bg-amber-600/30'
        }`}
      >
        {pipelineLocked ? 'Unlock' : 'Re-lock'}
      </button>
    </div>
  );
}
```

---

## Task 4: Conversation List — Phase-Filtered View

### Update `src/renderer/components/Chat/ConversationList.tsx`

When pipeline lock is active, filter the conversation list to show only:
1. Conversations matching the locked `pipelinePhase` AND `agentName`
2. Voice-setup and author-profile conversations (always visible regardless of lock state)

When unlocked, show all conversations as before.

**Changes:**

1. Read pipeline lock state from the chat store:

```typescript
const { pipelineLocked, lockedAgentName, lockedPhaseId } = useChatStore();
```

2. Compute filtered conversations:

```typescript
const filteredConversations = pipelineLocked && lockedAgentName && lockedPhaseId
  ? conversations.filter(
      (c) =>
        // Match the locked phase
        (c.agentName === lockedAgentName && c.pipelinePhase === lockedPhaseId && c.purpose === 'pipeline') ||
        // Always show special-purpose conversations
        c.purpose === 'voice-setup' ||
        c.purpose === 'author-profile',
    )
  : conversations;
```

3. Use `filteredConversations` instead of `conversations` when rendering the list.

4. Update the count display to show both filtered and total when they differ:

```typescript
<span>
  Conversations ({filteredConversations.length}
  {pipelineLocked && filteredConversations.length !== conversations.length && (
    <span className="text-zinc-600">/{conversations.length}</span>
  )})
</span>
```

5. **When locked, the "New Conversation" button auto-creates with the locked agent and phase** instead of showing the agent picker:

```typescript
// Replace the existing agent picker / new conversation button section:
{pipelineLocked && lockedAgentName && lockedPhaseId ? (
  <button
    onClick={() => handleNewConversation(lockedAgentName, lockedPhaseId)}
    className="flex w-full items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-400"
  >
    <span>+</span> New {lockedAgentName} Conversation
  </button>
) : (
  // ... existing agent picker UI for unlocked mode ...
)}
```

6. Update `handleNewConversation` to accept a phase parameter:

```typescript
const handleNewConversation = useCallback(
  async (agentName: AgentName, phase: PipelinePhaseId | null = null) => {
    if (!activeSlug) return;
    await createConversation(agentName, activeSlug, phase);
    setShowAgentPicker(false);
  },
  [activeSlug, createConversation],
);
```

7. Add purpose badges to conversation items (verify from Session 20, add if missing):

```tsx
{/* After the conversation title div */}
{conv.purpose === 'voice-setup' && (
  <span className="ml-1 shrink-0 rounded bg-purple-500/20 px-1 py-0.5 text-[10px] text-purple-300">
    Voice
  </span>
)}
{conv.purpose === 'author-profile' && (
  <span className="ml-1 shrink-0 rounded bg-purple-500/20 px-1 py-0.5 text-[10px] text-purple-300">
    Profile
  </span>
)}
```

---

## Task 5: ChatView — Pipeline Sync & Lock Integration

### Update `src/renderer/components/Chat/ChatView.tsx`

1. **Add imports:**

```tsx
import { usePipelineStore } from '../../stores/pipelineStore';
import { PipelineLockBanner } from './PipelineLockBanner';
import type { ConversationPurpose, PipelinePhaseId } from '@domain/types';
```

2. **Sync the chat store with the pipeline store** whenever the active phase changes:

```tsx
// Inside ChatView:
const { activePhase } = usePipelineStore();
const { syncWithPipeline, pipelineLocked, lockedAgentName, lockedPhaseId } = useChatStore();

// Sync pipeline lock state when the active phase changes
useEffect(() => {
  syncWithPipeline(activePhase);
}, [activePhase, syncWithPipeline]);
```

3. **Update the EmptyState** to be pipeline-aware. When locked, show the locked agent with a single "Start Conversation" button (no agent picker dropdown):

```tsx
function EmptyState({
  activeSlug,
  createConversation,
}: {
  activeSlug: string;
  createConversation: (agentName: AgentName, bookSlug: string, phase: PipelinePhaseId | null, purpose?: ConversationPurpose) => Promise<void>;
}): React.ReactElement {
  const { pipelineLocked, lockedAgentName, lockedPhaseId } = useChatStore();
  const [selectedAgent, setSelectedAgent] = useState<AgentName>('Spark');

  const handleNewConversation = useCallback(async () => {
    if (!activeSlug) return;

    if (pipelineLocked && lockedAgentName && lockedPhaseId) {
      await createConversation(lockedAgentName, activeSlug, lockedPhaseId);
    } else {
      await createConversation(selectedAgent, activeSlug, null);
    }
  }, [activeSlug, selectedAgent, createConversation, pipelineLocked, lockedAgentName, lockedPhaseId]);

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        {pipelineLocked && lockedAgentName ? (
          <>
            <div
              className="mx-auto mb-3 h-4 w-4 rounded-full"
              style={{ backgroundColor: AGENT_REGISTRY[lockedAgentName].color }}
            />
            <h3 className="text-lg font-medium text-zinc-400">
              {lockedAgentName} is ready
            </h3>
            <p className="mt-1 text-sm text-zinc-600">
              {AGENT_REGISTRY[lockedAgentName].role}
              {lockedPhaseId && (
                <> — {PIPELINE_PHASES.find(p => p.id === lockedPhaseId)?.label}</>
              )}
            </p>
          </>
        ) : (
          <>
            <h3 className="text-lg font-medium text-zinc-400">
              No conversation selected
            </h3>
            <p className="mt-1 text-sm text-zinc-600">
              Select a phase from the pipeline or start a new conversation
            </p>
          </>
        )}

        {activeSlug && (
          <div className="mt-6 flex items-center justify-center gap-3">
            {/* Only show agent picker when unlocked */}
            {!pipelineLocked && (
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value as AgentName)}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
              >
                {CREATIVE_AGENT_NAMES.map((name) => {
                  const meta = AGENT_REGISTRY[name];
                  return (
                    <option key={name} value={name}>
                      {name} — {meta.role}
                    </option>
                  );
                })}
              </select>
            )}
            <button
              onClick={handleNewConversation}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {pipelineLocked && lockedAgentName
                ? `Start ${lockedAgentName} Conversation`
                : 'New Conversation'}
            </button>
          </div>
        )}

        {!activeSlug && (
          <p className="mt-4 text-sm text-zinc-600">
            Create or select a book to get started
          </p>
        )}
      </div>
    </div>
  );
}
```

4. **Layout order** — the full ChatView return should be:

```tsx
return (
  <div className="flex h-full flex-col">
    <ConversationList
      expanded={conversationsExpanded}
      onToggle={() => setConversationsExpanded((prev) => !prev)}
    />
    <PipelineLockBanner />
    {activeConversation ? (
      <>
        <AgentHeader />
        <MessageList />
        <ChatInput
          onSend={handleSend}
          disabled={isStreaming}
          lockedAgentName={pipelineLocked ? lockedAgentName : null}
        />
      </>
    ) : (
      <EmptyState activeSlug={activeSlug} createConversation={createConversation} />
    )}
  </div>
);
```

Apply the same structure for both the "no active conversation" and "has active conversation" branches — `PipelineLockBanner` appears in both.

---

## Task 6: ChatInput — Agent Name in Placeholder

### Update `src/renderer/components/Chat/ChatInput.tsx`

Accept an optional `lockedAgentName` prop to personalize the placeholder:

```typescript
type ChatInputProps = {
  onSend: (message: string) => void;
  disabled: boolean;
  lockedAgentName?: string | null;
};

export function ChatInput({ onSend, disabled, lockedAgentName }: ChatInputProps): React.ReactElement {
  // ... existing implementation ...

  // Update the placeholder:
  // placeholder={lockedAgentName ? `Message ${lockedAgentName}...` : 'Type a message...'}
}
```

The only change is the type definition, destructured prop, and the `placeholder` attribute on the `<textarea>`.

---

## Task 7: AgentHeader — Purpose & Phase Badges

### Update `src/renderer/components/Chat/AgentHeader.tsx`

Add visual indicators for the conversation's purpose and whether it matches the currently locked phase:

1. Import chat store lock state:

```typescript
import { useChatStore } from '../../stores/chatStore';
```

2. Read lock state:

```typescript
const { pipelineLocked, lockedPhaseId } = useChatStore();
```

3. Add badges next to the agent role text:

```tsx
{/* Purpose badges */}
{activeConversation.purpose === 'voice-setup' && (
  <span className="ml-2 rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] text-purple-300">
    Voice Setup
  </span>
)}
{activeConversation.purpose === 'author-profile' && (
  <span className="ml-2 rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] text-purple-300">
    Author Profile
  </span>
)}

{/* Past phase indicator — shows when viewing a conversation from a completed/non-current phase */}
{pipelineLocked && lockedPhaseId && activeConversation.purpose === 'pipeline' && activeConversation.pipelinePhase !== lockedPhaseId && (
  <span className="ml-2 rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400">
    Past Phase
  </span>
)}
```

Place these inside the `<p>` element alongside the existing phase label, or as siblings right after it.

---

## Summary of Changes by File

| File | Change |
|------|--------|
| `src/renderer/stores/chatStore.ts` | Add `pipelineLocked`, `lockedAgentName`, `lockedPhaseId` state; add `setPipelineLock`, `syncWithPipeline`, `switchBook` actions; update `createConversation` signature to accept `purpose` |
| `src/renderer/stores/bookStore.ts` | Import `useChatStore`; update `setActiveBook` to call `chatStore.switchBook()` for full chat reset on book switch |
| `src/renderer/components/Chat/PipelineLockBanner.tsx` | **NEW** — Shows locked agent name, pipeline phase label, and unlock/re-lock toggle button |
| `src/renderer/components/Chat/ChatView.tsx` | Add pipeline sync `useEffect`; integrate `PipelineLockBanner` into layout; update `EmptyState` for locked mode (single agent, no picker) vs unlocked mode (agent dropdown) |
| `src/renderer/components/Chat/ConversationList.tsx` | Filter conversations by locked phase when locked; show filtered/total count; auto-create with locked agent; add purpose badges |
| `src/renderer/components/Chat/ChatInput.tsx` | Accept optional `lockedAgentName` prop; use agent name in textarea placeholder |
| `src/renderer/components/Chat/AgentHeader.tsx` | Add purpose badges (Voice Setup, Author Profile); add "Past Phase" indicator for non-current phase conversations |

---

## Verification

1. **Pipeline lock (default behavior):**
   - Open a book at the `pitch` phase → chat shows "Spark owns this stage — Story Pitch"
   - Only Spark conversations for the `pitch` phase appear in the conversation list
   - The empty state shows "Spark is ready" with a single "Start Spark Conversation" button
   - The ChatInput placeholder says "Message Spark..."
   - Clicking "New Conversation" in the conversation list creates a Spark conversation with `pipelinePhase: 'pitch'`

2. **Unlock mode:**
   - Click "Unlock" on the pipeline lock banner → banner shows "Pipeline lock disabled — all agents available"
   - All conversations for the book appear in the list
   - Agent picker dropdown returns in the empty state and "New Conversation" button
   - Click "Re-lock" → returns to locked behavior

3. **Book switching:**
   - Switch from Book A to Book B → active conversation clears immediately, conversation list reloads for Book B
   - If Book B is at the `first-draft` phase, Verity becomes the locked agent
   - No stale conversations from Book A appear
   - No stale messages from Book A's conversations visible

4. **Phase progression:**
   - Complete the `pitch` phase (save pitch.md) → pipeline detects `scaffold` as active
   - The lock banner updates to "Verity owns this stage — Story Scaffold"
   - Conversation list filters to scaffold-phase Verity conversations
   - Previous Spark pitch conversations are hidden (visible when unlocked)

5. **Special purpose conversations:**
   - Voice-setup and author-profile conversations are always visible in the filtered conversation list regardless of lock state
   - They show purpose badges (Voice, Profile)

6. **Past phase review:**
   - Click a completed phase in the pipeline tracker → opens the old conversation
   - AgentHeader shows a "Past Phase" badge
   - The lock banner still shows the actual active phase (source of truth)

7. **Compilation:**
   - `npx tsc --noEmit` passes with all changes
   - No new imports that violate layer boundaries (all changes are renderer-only)
