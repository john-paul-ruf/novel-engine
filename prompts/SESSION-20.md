# Session 20 — Voice Profile & Author Profile Conversational Setup

## Context

Novel Engine Electron app. Sessions 01–19 built the complete app including agent chat, pipeline tracking, and save-to-file. However, two critical creative workflows are missing:

1. **Voice Profile setup** — Verity has a complete Voice Interview protocol in her system prompt (4 prompts that draw out an author's natural voice), but there's no dedicated way to trigger it. The user must manually start a chat with Verity and hope they know to ask for a voice interview. The voice profile is **per-book** and lives at `books/<book>/source/voice-profile.md`.

2. **Author Profile setup** — Session 14 added a plain textarea for the author profile during onboarding, but it's just a text box. Verity is *designed* to draw out an author's creative DNA through conversation. The author profile is **global** and lives at `{userDataPath}/author-profile.md`.

This session adds **guided conversational setup** for both, using Verity as the interviewer.

---

## Design

### How it works

Both features use the existing chat infrastructure with three additions:

1. **A `purpose` field on conversations** that distinguishes voice-setup and author-profile conversations from regular pipeline conversations
2. **Purpose-specific system prompt additions** that tell Verity exactly what to do (voice interview vs. author profile interview)
3. **Purpose-aware save buttons** on assistant messages that write to the correct file

The user experience:
- Click "Set Up Voice" in the sidebar → opens a chat with Verity who immediately starts the voice interview
- Click "Edit Author Profile" in settings → opens a chat with Verity who helps articulate your creative identity
- When Verity produces the final document, click "Save as Voice Profile" or "Save as Author Profile" → written to disk
- The conversation is preserved — you can return to refine the profile later

---

## Task 1: Domain Type Changes

### Update `src/domain/types.ts`

Add the `ConversationPurpose` type and update `Conversation`:

```typescript
// After the existing StreamEvent type
type ConversationPurpose = 'pipeline' | 'voice-setup' | 'author-profile';
```

Update the `Conversation` type to include `purpose`:

```typescript
type Conversation = {
  id: string;
  bookSlug: string;
  agentName: AgentName;
  pipelinePhase: PipelinePhaseId | null;
  purpose: ConversationPurpose;  // NEW — defaults to 'pipeline'
  title: string;
  createdAt: string;
  updatedAt: string;
};
```

Export `ConversationPurpose`.

### Update `src/domain/constants.ts`

Add purpose-specific prompt additions. These are appended to Verity's system prompt when the conversation has a special purpose:

```typescript
const VOICE_SETUP_INSTRUCTIONS = `

---

## Current Task: Voice Profile Setup

The author wants to establish or refine their voice profile for this book. This is your most important onboarding task — every sentence of prose you write later will be measured against this profile.

**If no writing samples are available**, conduct your Voice Interview:

1. Ask the author to respond to these four prompts (one at a time, conversationally — don't dump all four at once):
   - "Describe a room you spent a lot of time in as a child."
   - "Tell me about a moment when you felt completely out of place."
   - "What's something most people get wrong about a topic you know well?"
   - "Finish this sentence without thinking: 'The trouble with getting what you want is...'"

2. After receiving responses, analyze them for all Voice Profile dimensions:
   - Sentence Rhythm
   - Vocabulary Register
   - Dialogue Style
   - Emotional Temperature
   - Interiority Depth
   - Punctuation Habits
   - Structural Instincts
   - Tonal Anchors
   - Avoid list

3. Produce a **complete Voice Profile** in the standard format (the format defined in your Voice Profile Format section). Present it to the author for validation.

**If writing samples are provided**, skip the interview and analyze the samples directly. Then produce the Voice Profile.

**If an existing voice profile is already loaded in context**, help the author refine it. Ask what feels wrong or incomplete. Update specific dimensions based on their feedback.

When you present the final Voice Profile, tell the author they can save it using the "Save as Voice Profile" button below your message.
`;

const AUTHOR_PROFILE_INSTRUCTIONS = `

---

## Current Task: Author Profile Setup

The author wants to create or refine their author profile — their creative DNA document. This is a global document that follows them across all books and helps every agent understand who they are as a writer.

Help them articulate (conversationally — draw this out naturally, don't interrogate):

- **Genres and forms** — What do they write? Why those genres? What draws them?
- **Influences** — Which authors, filmmakers, musicians, or artists shaped their creative instincts?
- **Themes** — What questions or obsessions keep showing up in their work?
- **Voice identity** — How would they describe their writing to a stranger? What's the "feel"?
- **Process** — How do they write? Pantser or plotter? Morning or midnight? Music or silence?
- **What makes them unique** — What perspective, experience, or obsession do they bring that no one else can?
- **Aspirations** — What kind of writer do they want to become? What's the gap between where they are and where they want to be?

When you have enough material, produce a polished **Author Profile** document — a 300–600 word creative self-portrait that any agent could read and immediately understand this writer's identity, instincts, and ambitions.

If an existing author profile is loaded in context, help refine it. Ask what's changed, what's missing, what no longer feels true.

When you present the final Author Profile, tell the author they can save it using the "Save as Author Profile" button below your message.
`;
```

Export both constants.

---

## Task 2: Database Schema Update

### Update `src/infrastructure/database/schema.ts`

Add the `purpose` column to the `conversations` table:

```sql
conversations (
  id             TEXT PRIMARY KEY,
  book_slug      TEXT NOT NULL,
  agent_name     TEXT NOT NULL,
  pipeline_phase TEXT,
  purpose        TEXT NOT NULL DEFAULT 'pipeline',
  title          TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
)
```

**Migration for existing databases:** After `initializeSchema`, add a migration check:

```typescript
// Check if purpose column exists; add it if not (handles databases created before Session 20)
const columns = db.pragma('table_info(conversations)') as { name: string }[];
if (!columns.some(c => c.name === 'purpose')) {
  db.exec(`ALTER TABLE conversations ADD COLUMN purpose TEXT NOT NULL DEFAULT 'pipeline'`);
}
```

### Update `src/infrastructure/database/DatabaseService.ts`

1. **`createConversation`**: Accept and store the `purpose` field. Update the prepared INSERT statement to include `purpose`.

2. **`getConversation`** and **`listConversations`**: Include `purpose` in the SELECT and map it in the camelCase conversion.

3. Update all prepared statements that touch the `conversations` table.

---

## Task 3: ChatService — Purpose-Aware System Prompts

### Update `src/application/ChatService.ts`

Modify `sendMessage` step 6 (system prompt assembly). After concatenating agent prompt + context, check if the conversation has a special purpose:

```typescript
// Step 6: Assemble the system prompt
let systemPrompt = `${agent.systemPrompt}\n\n---\n\n# Current Book Context\n\n${contextString}`;

// Step 6b: Append purpose-specific instructions
const conversation = this.db.getConversation(params.conversationId);
if (conversation?.purpose === 'voice-setup') {
  systemPrompt += VOICE_SETUP_INSTRUCTIONS;
} else if (conversation?.purpose === 'author-profile') {
  systemPrompt += AUTHOR_PROFILE_INSTRUCTIONS;
}
```

Import `VOICE_SETUP_INSTRUCTIONS` and `AUTHOR_PROFILE_INSTRUCTIONS` from `@domain/constants`.

### Update `createConversation`

Accept `purpose` in the params and pass it through to the database:

```typescript
async createConversation(params: {
  bookSlug: string;
  agentName: AgentName;
  pipelinePhase: PipelinePhaseId | null;
  purpose?: ConversationPurpose;
}): Promise<Conversation> {
  return this.db.createConversation({
    id: nanoid(),
    bookSlug: params.bookSlug,
    agentName: params.agentName,
    pipelinePhase: params.pipelinePhase,
    purpose: params.purpose ?? 'pipeline',
    title: '',
  });
}
```

---

## Task 4: Context Wrangler — Purpose-Aware Context

The `ContextWrangler` already handles purpose-aware context intelligently through its AI-powered planning. However, the `IContextWrangler.assemble()` interface needs to accept the `purpose` parameter so it can include it in the Wrangler's input.

### Update `src/domain/interfaces.ts`

Add optional `purpose` to the `assemble` params:

```typescript
interface IContextWrangler {
  assemble(params: {
    agentName: AgentName;
    userMessage: string;
    conversationId: string;
    bookSlug: string;
    purpose?: ConversationPurpose;
  }): Promise<AssembledContext>;
  estimateTokens(text: string): number;
}
```

### Update `src/application/ContextWrangler.ts`

When `purpose === 'voice-setup'` or `'author-profile'`, the Wrangler still runs but with a modified input that signals the special purpose. The Wrangler agent prompt already handles this — voice-setup and author-profile conversations get minimal project context since they're focused interviews, not manuscript work.

Pass the purpose through to the `WranglerInput` so the Wrangler can see it. Add an optional `purpose` field to the `WranglerInput` type.

### Update ChatService `sendMessage`

Pass the conversation purpose through when calling `contextWrangler.assemble()`:

```typescript
const conversation = this.db.getConversation(params.conversationId);
const assembled = await this.contextWrangler.assemble({
  agentName: params.agentName,
  userMessage: params.message,
  conversationId: params.conversationId,
  bookSlug: params.bookSlug,
  purpose: conversation?.purpose,
});
```

---

## Task 5: IPC + Preload Updates

### Update `src/main/ipc/handlers.ts`

Update the `'chat:createConversation'` handler to accept and pass `purpose`:

```typescript
ipcMain.handle('chat:createConversation', async (_, params: {
  bookSlug: string;
  agentName: AgentName;
  pipelinePhase: PipelinePhaseId | null;
  purpose?: ConversationPurpose;
}) => {
  return services.chat.createConversation(params);
});
```

### Update `src/preload/index.ts`

Update the `chat.createConversation` method signature:

```typescript
createConversation: (params: {
  bookSlug: string;
  agentName: AgentName;
  pipelinePhase: PipelinePhaseId | null;
  purpose?: ConversationPurpose;
}): Promise<Conversation> =>
  ipcRenderer.invoke('chat:createConversation', params),
```

Add `ConversationPurpose` to the `import type` list at the top.

---

## Task 6: Chat Store Update

### Update `src/renderer/stores/chatStore.ts`

Update `createConversation` to accept a `purpose` parameter:

```typescript
createConversation: async (
  agentName: AgentName,
  bookSlug: string,
  phase: PipelinePhaseId | null,
  purpose: ConversationPurpose = 'pipeline',
) => {
  const conversation = await window.novelEngine.chat.createConversation({
    bookSlug,
    agentName,
    pipelinePhase: phase,
    purpose,
  });
  set({
    activeConversation: conversation,
    messages: [],
    conversations: [conversation, ...get().conversations],
  });
},
```

---

## Task 7: Save Buttons for Voice & Author Profile

### Update `src/renderer/components/Chat/MessageBubble.tsx`

Currently, save buttons appear based on `AGENT_OUTPUT_TARGETS[pipelinePhase]`. Extend this to also show save buttons based on the conversation's `purpose`:

```typescript
// Read purpose from the active conversation
const { activeConversation } = useChatStore();
const { activeSlug } = useBookStore();

// Determine save targets based on purpose OR pipeline phase
let saveTargets: { targetPath: string; description: string; isChapter?: boolean }[] = [];

if (message.role === 'assistant' && activeConversation) {
  if (activeConversation.purpose === 'voice-setup') {
    saveTargets = [{
      targetPath: 'source/voice-profile.md',
      description: 'Save as Voice Profile',
    }];
  } else if (activeConversation.purpose === 'author-profile') {
    saveTargets = [{
      targetPath: '__author-profile__',  // sentinel value — handled differently
      description: 'Save as Author Profile',
    }];
  } else if (activeConversation.pipelinePhase) {
    // Existing pipeline-based targets from AGENT_OUTPUT_TARGETS
    saveTargets = AGENT_OUTPUT_TARGETS[activeConversation.pipelinePhase] ?? [];
  }
}
```

**Save handler for voice profile:**
Use the existing `files:write` IPC:

```typescript
await window.novelEngine.files.write(activeSlug, 'source/voice-profile.md', message.content);
```

**Save handler for author profile:**
Use the existing `settings:saveAuthorProfile` IPC:

```typescript
await window.novelEngine.settings.saveAuthorProfile(message.content);
```

**UI for save buttons:** Same styling as Session 19's save buttons. Show below the message content. Track saved state per message per target. The sentinel `__author-profile__` target path triggers the settings IPC instead of the files IPC.

After a successful voice profile save, also call `pipelineStore.loadPipeline(activeSlug)` to refresh the sidebar (the voice profile existence may affect pipeline detection if it's ever added as a gate).

---

## Task 8: Sidebar — "Set Up Voice" Button

### Create `src/renderer/components/Sidebar/VoiceSetupButton.tsx`

A button displayed in the sidebar between the BookSelector and the PipelineTracker. It's contextual to the active book.

```tsx
import { useChatStore } from '../../stores/chatStore';
import { useBookStore } from '../../stores/bookStore';
import { useViewStore } from '../../stores/viewStore';
import type { ConversationPurpose } from '@domain/types';

export function VoiceSetupButton() {
  const { activeSlug } = useBookStore();
  const { createConversation, conversations } = useChatStore();
  const { navigate } = useViewStore();

  if (!activeSlug) return null;

  const handleClick = async () => {
    // Check if there's already a voice-setup conversation for this book
    const existing = conversations.find(
      c => c.bookSlug === activeSlug && c.purpose === 'voice-setup'
    );

    if (existing) {
      // Resume existing conversation
      useChatStore.getState().setActiveConversation(existing.id);
    } else {
      // Create new voice-setup conversation with Verity
      await createConversation('Verity', activeSlug, null, 'voice-setup');
    }
    navigate('chat');
  };

  return (
    <button
      onClick={handleClick}
      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors"
    >
      <span className="text-purple-400">🎙</span>
      <span>Set Up Voice Profile</span>
    </button>
  );
}
```

**Placement:** In `Sidebar.tsx`, add `<VoiceSetupButton />` between `<BookSelector />` and the scrollable pipeline area. It only appears when a book is active.

### Update `src/renderer/components/Layout/Sidebar.tsx`

```tsx
{/* Book selector */}
<BookSelector />

{/* Voice setup — contextual to active book */}
<VoiceSetupButton />

{/* Pipeline tracker — scrollable */}
<div className="flex-1 overflow-y-auto">
  <PipelineTracker />
  {/* ... */}
</div>
```

---

## Task 9: Settings — Author Profile via Verity

### Update `src/renderer/components/Settings/SettingsView.tsx`

Replace the Author Profile section's textarea with a split view:

**Author Profile section (updated):**

```tsx
{/* Author Profile */}
<section>
  <h2 className="text-lg font-semibold text-zinc-100 mb-4">Author Profile</h2>

  {/* Current profile preview */}
  <div className="mb-4">
    <label className="block text-sm text-zinc-400 mb-2">
      Your name (as it appears on book covers)
    </label>
    <input
      type="text"
      value={authorName}
      onChange={(e) => handleAuthorNameChange(e.target.value)}
      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-zinc-100"
    />
  </div>

  {/* Profile content preview */}
  <div className="mb-4">
    <label className="block text-sm text-zinc-400 mb-2">
      Your creative DNA — loaded by agents to understand your writing identity
    </label>
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 max-h-48 overflow-y-auto">
      {authorProfile ? (
        <div
          className="prose prose-invert prose-sm"
          dangerouslySetInnerHTML={{ __html: marked.parse(authorProfile) }}
        />
      ) : (
        <p className="text-zinc-500 italic">No author profile yet.</p>
      )}
    </div>
  </div>

  {/* Action buttons */}
  <div className="flex gap-3">
    <button
      onClick={handleEditWithVerity}
      className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-2 text-sm transition-colors"
    >
      <span>🎙</span>
      {authorProfile ? 'Refine with Verity' : 'Set Up with Verity'}
    </button>
    <button
      onClick={() => setShowManualEdit(true)}
      className="text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-lg px-4 py-2 transition-colors"
    >
      Edit Manually
    </button>
  </div>

  {/* Manual edit textarea (hidden by default, shown on "Edit Manually") */}
  {showManualEdit && (
    <div className="mt-4">
      <textarea
        value={editableProfile}
        onChange={(e) => setEditableProfile(e.target.value)}
        rows={8}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-zinc-100 placeholder-zinc-500 resize-y"
        placeholder="What genres do you write? What's your style? Who are your influences?"
      />
      <div className="flex gap-2 mt-2">
        <button
          onClick={handleSaveManual}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm"
        >
          Save
        </button>
        <button
          onClick={() => setShowManualEdit(false)}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          Cancel
        </button>
      </div>
    </div>
  )}
</section>
```

**`handleEditWithVerity` implementation:**

```typescript
const handleEditWithVerity = async () => {
  const { activeSlug } = useBookStore.getState();
  const chatStore = useChatStore.getState();
  const viewStore = useViewStore.getState();

  // Find existing author-profile conversation or create new one
  // Note: author profile conversations use whatever book is active but are conceptually global
  const existing = chatStore.conversations.find(
    c => c.purpose === 'author-profile'
  );

  if (existing) {
    await chatStore.setActiveConversation(existing.id);
  } else {
    await chatStore.createConversation(
      'Verity',
      activeSlug || '',
      null,
      'author-profile',
    );
  }

  viewStore.navigate('chat');
};
```

**Data loading:** On mount, load the author profile for the preview:

```typescript
const [authorProfile, setAuthorProfile] = useState('');

useEffect(() => {
  window.novelEngine.settings.loadAuthorProfile().then(setAuthorProfile);
}, []);
```

---

## Task 10: Onboarding — Voice Setup Option

### Update `src/renderer/components/Onboarding/OnboardingWizard.tsx`

**Modify Step 4 (Author Profile)** to offer the Verity conversation option alongside the textarea:

Replace the current step 4 with:

```tsx
{/* Step 4: Author Profile */}
<div className="text-center">
  <h2 className="text-2xl font-bold text-zinc-100 mb-2">Tell Us About Your Writing</h2>
  <p className="text-zinc-400 mb-6">
    Your author profile helps every agent understand your creative identity.
    You can set this up now or come back to it later.
  </p>

  <div className="space-y-4 max-w-md mx-auto">
    {/* Author Name */}
    <div className="text-left">
      <label className="block text-sm text-zinc-400 mb-1">
        Your name (as it appears on book covers)
      </label>
      <input
        type="text"
        value={authorName}
        onChange={(e) => setAuthorName(e.target.value)}
        placeholder="Jane Doe"
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
    </div>

    {/* Quick profile textarea */}
    <div className="text-left">
      <label className="block text-sm text-zinc-400 mb-1">
        Quick profile (optional — you can refine this with Verity later)
      </label>
      <textarea
        value={profileText}
        onChange={(e) => setProfileText(e.target.value)}
        rows={4}
        placeholder="What genres do you write? What's your style? Who are your influences?"
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
      />
    </div>
  </div>

  <div className="mt-6 flex flex-col items-center gap-3">
    <button onClick={handleSaveProfile} className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-6 py-3 font-medium">
      Save & Continue
    </button>
    <button onClick={goNext} className="text-sm text-zinc-500 hover:text-zinc-400">
      Skip — I'll set this up later
    </button>
  </div>
</div>
```

The textarea remains for a quick initial profile. The full Verity conversation is available after onboarding via the Settings panel "Set Up with Verity" button or the sidebar "Set Up Voice Profile" button.

---

## Task 11: Conversation List — Purpose Badge

### Update `src/renderer/components/Chat/ConversationList.tsx`

For conversations with `purpose !== 'pipeline'`, show a small badge next to the agent name:

```tsx
{conversation.purpose === 'voice-setup' && (
  <span className="text-xs bg-purple-500/20 text-purple-300 rounded px-1.5 py-0.5 ml-2">
    Voice Setup
  </span>
)}
{conversation.purpose === 'author-profile' && (
  <span className="text-xs bg-purple-500/20 text-purple-300 rounded px-1.5 py-0.5 ml-2">
    Author Profile
  </span>
)}
```

This helps the user distinguish special-purpose conversations from regular pipeline chats in the conversation history.

---

## Summary of Changes by File

| File | Change |
|------|--------|
| `src/domain/types.ts` | Add `ConversationPurpose` type, add `purpose` to `Conversation` |
| `src/domain/interfaces.ts` | Add optional `purpose` param to `IContextWrangler.assemble()` |
| `src/domain/constants.ts` | Add `VOICE_SETUP_INSTRUCTIONS`, `AUTHOR_PROFILE_INSTRUCTIONS` |
| `src/infrastructure/database/schema.ts` | Add `purpose` column + migration |
| `src/infrastructure/database/DatabaseService.ts` | Update CRUD for `purpose` field |
| `src/application/ContextWrangler.ts` | Purpose-aware context assembly (passes purpose to Wrangler input) |
| `src/application/ChatService.ts` | Purpose-aware system prompt, updated `createConversation` |
| `src/main/ipc/handlers.ts` | Pass `purpose` through `chat:createConversation` |
| `src/preload/index.ts` | Update `chat.createConversation` signature |
| `src/renderer/stores/chatStore.ts` | Accept `purpose` in `createConversation` action |
| `src/renderer/components/Chat/MessageBubble.tsx` | Purpose-based save buttons |
| `src/renderer/components/Sidebar/VoiceSetupButton.tsx` | **NEW** — sidebar entry point |
| `src/renderer/components/Layout/Sidebar.tsx` | Add `VoiceSetupButton` |
| `src/renderer/components/Settings/SettingsView.tsx` | Author profile Verity conversation + manual edit |
| `src/renderer/components/Onboarding/OnboardingWizard.tsx` | Simplified step 4 with skip option |
| `src/renderer/components/Chat/ConversationList.tsx` | Purpose badges |

---

## Verification

1. **Voice Profile setup:**
   - Click "Set Up Voice Profile" in the sidebar → a chat with Verity opens
   - Verity begins the voice interview (asks the first prompt)
   - After the conversation, Verity produces a Voice Profile document
   - Click "Save as Voice Profile" on the assistant message → writes to `books/<book>/source/voice-profile.md`
   - The button shows "Saved ✓" and is disabled
   - Clicking "Set Up Voice Profile" again → resumes the existing conversation (doesn't create a duplicate)

2. **Author Profile setup:**
   - Go to Settings → Author Profile section
   - Click "Set Up with Verity" → navigates to a chat with Verity
   - Verity helps articulate your creative identity
   - Click "Save as Author Profile" → writes to `{userDataPath}/author-profile.md`
   - Return to Settings → the preview shows the new profile content
   - "Edit Manually" still works as a fallback

3. **Persistence:**
   - Close and reopen the app → voice-setup and author-profile conversations appear in the conversation list with badges
   - Switching books → "Set Up Voice Profile" checks for an existing voice-setup conversation per book

4. **Database migration:**
   - The `purpose` column is added to existing databases without data loss
   - Existing conversations get `purpose = 'pipeline'` by default

5. **Compilation:**
   - `npx tsc --noEmit` passes with all changes
   - No new imports that violate layer boundaries
