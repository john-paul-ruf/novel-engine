# SESSION-03 — Tour Enhancements: Auto-Start Spark Chat + Update Pipeline Step

## Context

**Program:** Novel Engine UI Restructure (p-zero)
**Feature:** When the Welcome Tour starts, the app automatically creates a Spark conversation and opens the chat view. The user arrives in a live Spark session — not just navigated to a blank chat screen. All pipeline tour step selectors are updated to target the new right-panel location.

**Depends on:** SESSION-01 (`data-tour="pipeline-panel"` exists on PipelinePanel), SESSION-02 (nav restructured)
**Layers touched:** M10 (renderer — tourStore.ts, tourDefinitions.ts)

---

## Intent (read before touching code)

On first install, when a user clicks "Welcome Tour" from Settings, the correct behaviour is:

> The app navigates to chat, the pipeline panel opens, and a Spark conversation is automatically created and made active — so the user arrives in an actual live Spark chat session, not a blank screen.

This is not just a navigation change. The tour actively starts the agent. The user should see the Spark chat ready for input as the tour walks them through the UI.

The `createConversation` call is fire-and-forget (not awaited) because the tour must continue even if conversation creation takes a moment or fails. The tour steps will still spotlight the correct UI elements regardless.

---

## Pre-Session Reads

Read these files in full before writing any code:

1. `src/renderer/stores/tourStore.ts`
2. `src/renderer/stores/chatStore.ts` (lines 50–130 — find `createConversation` signature and confirm `useBookStore` is already imported)
3. `src/renderer/stores/bookStore.ts` (lines 1–40 — confirm `activeSlug` field)
4. `src/renderer/tours/tourDefinitions.ts` (full file — find all `pipeline-tracker` references)
5. `src/renderer/components/RightPanel/PipelinePanel.tsx` (SESSION-01 output — confirm `data-tour="pipeline-panel"` is on the outermost div)

---

## What to Build

### 1. Modify `src/renderer/stores/tourStore.ts`

Add imports at the top:
```typescript
import { useViewStore } from './viewStore';
import { useRightPanelStore } from './rightPanelStore';
import { useChatStore } from './chatStore';
import { useBookStore } from './bookStore';
```

Check for circular dependencies: if `viewStore`, `chatStore`, or `bookStore` import from `tourStore`, use dynamic imports for those specific stores instead (to avoid circular references). Based on the codebase, none of them import tourStore, so static imports are safe.

Update `startTour`:

Before:
```typescript
startTour: (tourId: TourId) => {
  const { activeTourId } = get();
  if (activeTourId !== null) return;
  set({ activeTourId: tourId });
},
```

After:
```typescript
startTour: (tourId: TourId) => {
  const { activeTourId } = get();
  if (activeTourId !== null) return;

  // Always open pipeline panel and navigate to chat so tour steps
  // can spotlight both chat and pipeline elements.
  useViewStore.getState().navigate('chat');
  useRightPanelStore.getState().openPipeline();

  // For the welcome tour, auto-start a Spark conversation so the
  // user arrives in a live chat session rather than a blank screen.
  if (tourId === 'welcome') {
    const activeSlug = useBookStore.getState().activeSlug;
    if (activeSlug) {
      useChatStore.getState()
        .createConversation('Spark', activeSlug, 'pitch', 'pipeline')
        .catch((err: unknown) => {
          console.error('[tourStore] Failed to auto-start Spark conversation:', err);
        });
    }
  }

  set({ activeTourId: tourId });
},
```

Key points:
- `set({ activeTourId: tourId })` runs immediately (synchronous) — the conversation creation is async and non-blocking.
- The `if (activeSlug)` guard handles first-install edge cases where no book exists yet. If no book exists, the tour still starts — the user just doesn't get an auto-created conversation.
- The `'pitch'` phase is correct for Spark — it is Spark's native phase.

---

### 2. Modify `src/renderer/tours/tourDefinitions.ts`

**A. Update `welcome-pipeline` step in `WELCOME_TOUR`:**

Before:
```typescript
{
  id: 'welcome-pipeline',
  targetSelector: '[data-tour="pipeline-tracker"]',
  title: 'The Pipeline',
  body: 'Every book follows a pipeline from pitch to publication. Each phase has a dedicated AI agent. The active phase is highlighted — start there.',
  placement: 'right',
},
```

After:
```typescript
{
  id: 'welcome-pipeline',
  targetSelector: '[data-tour="pipeline-panel"]',
  title: 'The Pipeline',
  body: 'Every book follows a pipeline from pitch to publication. Each phase has a dedicated AI agent. The Pipeline panel on the right shows your progress — the active phase is highlighted.',
  placement: 'left',
},
```

`placement: 'left'` because the panel is at the right edge of the screen — the popover should appear to its left.

**B. Update `welcome-chat` step in `WELCOME_TOUR`** — update the body to reflect that Spark has already been started:

Before:
```typescript
{
  id: 'welcome-chat',
  targetSelector: '[data-tour="chat-view"]',
  title: 'Agent Chat',
  body: 'This is where you talk to your AI agents. Each agent specializes in a different part of the writing process — from pitching to copy editing.',
  placement: 'left',
  requiredView: 'chat',
},
```

After:
```typescript
{
  id: 'welcome-chat',
  targetSelector: '[data-tour="chat-view"]',
  title: 'Meet Spark',
  body: "Spark is your story pitcher — we've started a conversation for you. Ask Spark to pitch you a story, or describe your concept and let Spark shape it.",
  placement: 'left',
  requiredView: 'chat',
},
```

**C. Update `welcome-nav` step body** — Reading Mode is now in the nav, Help is not:

```typescript
{
  id: 'welcome-nav',
  targetSelector: '[data-tour="sidebar-nav"]',
  title: 'Navigation',
  body: 'Switch between Chat, Files, Build, Pitch Room, Reading Mode, and Settings. Use the Pipeline and CLI toggles to open the right-side panels.',
  placement: 'right',
},
```

**D. Update `first-book-advance` step in `FIRST_BOOK_TOUR`:**

Before:
```typescript
{
  id: 'first-book-advance',
  targetSelector: '[data-tour="pipeline-tracker"]',
  title: 'Advancing the Pipeline',
  body: 'When an agent finishes its work, the phase turns amber. Click "Advance" to confirm and unlock the next phase.',
  placement: 'right',
},
```

After:
```typescript
{
  id: 'first-book-advance',
  targetSelector: '[data-tour="pipeline-panel"]',
  title: 'Advancing the Pipeline',
  body: 'When an agent finishes its work, the phase turns amber. In the Pipeline panel on the right, click "Advance" to confirm and unlock the next phase.',
  placement: 'left',
},
```

**E. Scan `PIPELINE_INTRO_TOUR` for all `pipeline-tracker` references.** For every step using `targetSelector: '[data-tour="pipeline-tracker"]'`:
- Change to `targetSelector: '[data-tour="pipeline-panel"]'`
- Change `placement: 'right'` to `placement: 'left'`

---

## Verification

```bash
npx tsc --noEmit
```

Grep check — expected: zero matches:
```bash
grep -r "pipeline-tracker" src/renderer/tours/
```

Manual checks:
- Click "Welcome Tour" from Settings → chat view opens, pipeline panel appears on the right → a Spark conversation is created automatically in the chat
- The `welcome-chat` step says "Meet Spark" and the Spark conversation is active
- The `welcome-pipeline` step spotlights the right-side pipeline panel; popover appears to its LEFT
- Starting "Pipeline Guide" from Settings → navigates to chat and opens pipeline panel
- All tour steps with pipeline references spotlight the right panel, not the left sidebar

## Architecture Compliance

- `tourStore.ts` imports from `viewStore`, `rightPanelStore`, `chatStore`, `bookStore` — all M10 renderer stores. Same-layer import. No violation.
- `createConversation` is fire-and-forget — tour activation is synchronous
- No new IPC calls added
- Only `tourStore.ts` and `tourDefinitions.ts` are modified
