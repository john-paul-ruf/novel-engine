# SESSION-12 — Chapter Deep Dive: UI

> **Feature:** small-queue-intake
> **Layer(s):** M10 (renderer)
> **Depends on:** SESSION-11 (done)
> **Estimated effort:** 20 min

---

## Context

SESSION-11 wired the backend. This session adds the UI entry point: a "Deep Dive" button in the FilesView when a chapter draft is selected. Clicking it triggers the backend and navigates to the resulting Lumen conversation.

---

## Files to Read First

- `src/renderer/components/Files/FilesView.tsx` — how files are selected and displayed
- `src/renderer/components/Files/FilesHeader.tsx` — existing action buttons (to understand where to add the new button)
- `src/renderer/stores/chatStore.ts` — how streaming events are listened to after a send
- `src/renderer/stores/viewStore.ts` — navigate
- `src/renderer/stores/bookStore.ts` — activeSlug

---

## Implementation

### Step 1: Detect chapter draft in FilesView

A chapter draft path matches: `chapters/NN-slug/draft.md`

Add a utility in FilesView (or FilesHeader) to detect this:
```ts
function isChapterDraft(path: string): boolean {
  return /^chapters\/\d+-.+\/draft\.md$/.test(path);
}
```

Extract the `chapterSlug` from the path:
```ts
function extractChapterSlug(path: string): string | null {
  const match = path.match(/^chapters\/(\d+-.+)\/draft\.md$/);
  return match?.[1] ?? null;
}
```

### Step 2: Add Deep Dive button

In `FilesHeader.tsx` (or in the appropriate action area within `FilesView.tsx` — read the current code to decide where action buttons live for the current file):

When the selected file is a chapter draft, render a "Deep Dive" button alongside other file actions:

```tsx
{isChapterDraft(selectedFilePath) && (
  <Tooltip content="Surgical craft analysis of this chapter by Lumen" placement="bottom">
    <button
      onClick={handleDeepDive}
      disabled={isDeepDiving}
      className="no-drag flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 border border-green-200 dark:border-green-800 transition-colors disabled:opacity-50"
    >
      {isDeepDiving ? (
        <>
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
          <span>Diving...</span>
        </>
      ) : (
        <>🔬 <span>Deep Dive</span></>
      )}
    </button>
  </Tooltip>
)}
```

### Step 3: Implement handleDeepDive

In the component where the button lives (FilesView or FilesHeader), implement:

```ts
const [isDeepDiving, setIsDeepDiving] = useState(false);
const { navigate } = useViewStore();
const { activeSlug } = useBookStore();
const { initStreamListenerForId } = useChatStore(); // or however the store listens

const handleDeepDive = async () => {
  if (!activeSlug || !selectedFilePath) return;
  const chapterSlug = extractChapterSlug(selectedFilePath);
  if (!chapterSlug) return;

  setIsDeepDiving(true);
  try {
    const callId = `deep-dive-${Date.now()}`;

    // Attach a stream listener BEFORE making the call
    // (use the same pattern as normal chat sendMessage — read chatStore to match exactly)

    const { conversationId } = await window.novelEngine.chat.deepDive({
      bookSlug: activeSlug,
      chapterSlug,
      callId,
    });

    // Navigate to chat and load the conversation
    navigate('chat', { conversationId });
  } catch (err) {
    console.error('[DeepDive] Failed:', err);
  } finally {
    setIsDeepDiving(false);
  }
};
```

**Stream listener note:** Read `chatStore.ts` to understand how stream events from `chat:stream:{callId}` are attached and how the chat view auto-scrolls/updates. The deep dive reuses the same stream infrastructure — `navigate('chat', { conversationId })` will cause the ChatView to mount with the correct conversation and the stream listener on `callId` should update its messages.

If the chatStore attaches listeners based on `conversationId` or `callId`, mirror that pattern.

---

## Architecture Compliance

- [x] Renderer only — calls `window.novelEngine.chat.deepDive` via preload bridge
- [x] No new stores — uses existing chatStore stream pattern
- [x] `isChapterDraft` and `extractChapterSlug` are pure utility functions in the component file

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Opening a chapter draft in FilesView shows the "🔬 Deep Dive" button
3. Opening a non-chapter file (e.g., pitch.md, about.json) does NOT show the button
4. Clicking Deep Dive shows the loading state, then navigates to a Lumen chat conversation
5. The conversation in chat view shows the user's deep dive request and Lumen's streaming response

---

## State Update

Set SESSION-12 to `done` in STATE.md.
