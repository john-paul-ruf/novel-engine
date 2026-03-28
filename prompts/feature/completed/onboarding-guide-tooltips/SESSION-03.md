# SESSION-03 — Wire Tours into App, Auto-Launch Welcome Tour

> **Feature:** onboarding-guide-tooltips
> **Layer(s):** Renderer
> **Depends on:** SESSION-02
> **Estimated effort:** 15 min

---

## Context

SESSION-01 built the `Tooltip` component and `GuidedTourOverlay` engine. SESSION-02 created tour definitions, the tour store, and added `data-tour` attributes to all anchor components. Now we wire everything together: mount the overlay in `AppLayout`, auto-launch the welcome tour after onboarding, and add a "Replay Tour" option in settings.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/components/Layout/AppLayout.tsx` | Modify | Mount `GuidedTourOverlay`, hydrate tour store, auto-start welcome tour |
| `src/renderer/components/Onboarding/OnboardingWizard.tsx` | Modify | After launch, trigger welcome tour |
| `src/renderer/components/Settings/SettingsView.tsx` | Modify | Add "Guided Tours" section with replay buttons |

---

## Implementation

### 1. Mount Tour Overlay in AppLayout

Read `src/renderer/components/Layout/AppLayout.tsx`.

Import:
- `GuidedTourOverlay` from `../common/GuidedTourOverlay`
- `useTourStore` from `../../stores/tourStore`
- `TOUR_DEFINITIONS` from `../../tours/tourDefinitions`
- `useSettingsStore` from `../../stores/settingsStore`

Add a `TourManager` component (similar pattern to `StreamManager`):

```typescript
function TourManager(): null {
  const settings = useSettingsStore((s) => s.settings);
  const { hydrate, isHydrated } = useTourStore();

  useEffect(() => {
    if (settings && !isHydrated) {
      hydrate(settings.completedTours ?? []);
    }
  }, [settings, isHydrated, hydrate]);

  return null;
}
```

Then render the overlay conditionally:

```typescript
function TourOverlayRenderer(): React.ReactElement | null {
  const activeTourId = useTourStore((s) => s.activeTourId);
  const completeTour = useTourStore((s) => s.completeTour);
  const dismissTour = useTourStore((s) => s.dismissTour);

  if (!activeTourId) return null;

  const steps = TOUR_DEFINITIONS[activeTourId];
  if (!steps) return null;

  return (
    <GuidedTourOverlay
      steps={steps}
      isActive={true}
      onComplete={completeTour}
      onDismiss={dismissTour}
    />
  );
}
```

Add `<TourManager />` and `<TourOverlayRenderer />` inside `AppLayout`, after `<CliActivityListener />`.

### 2. Auto-Launch Welcome Tour After Onboarding

Read `src/renderer/components/Onboarding/OnboardingWizard.tsx`.

In the `handleLaunch` callback, after `navigate('chat')`, add:

```typescript
// Start the welcome tour after a short delay to let the UI render
setTimeout(() => {
  const tourStore = useTourStore.getState();
  if (!tourStore.isTourCompleted('welcome')) {
    tourStore.startTour('welcome');
  }
}, 500);
```

Import `useTourStore` from `../../stores/tourStore`.

The 500ms delay ensures the app layout, sidebar, and chat view are all mounted and have their `data-tour` attributes in the DOM before the tour tries to find them.

### 3. Add Tour Replay Section to Settings

Read `src/renderer/components/Settings/SettingsView.tsx`.

Add a new section titled "Guided Tours" after the existing sections. The section contains:

- A brief description: "Replay the guided tours to refresh your memory of how the app works."
- Three buttons, one for each tour:
  - "Welcome Tour" — replays `welcome`
  - "First Book Guide" — replays `first-book`
  - "Pipeline Deep Dive" — replays `pipeline-intro`
- Each button handler: resets the tour (`resetTour`), navigates to chat view, then starts the tour
- Show a green checkmark next to completed tours

Styling:
- Section container: matches existing settings section patterns
- Buttons: `rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors`
- Completed indicator: small green checkmark or dot inline with button text

---

## Architecture Compliance

- [x] No business logic in the overlay mounting — just reads store state
- [x] Renderer accesses backend only through `window.novelEngine` (inside tourStore)
- [x] No new IPC channels needed — uses existing `settings:update`
- [x] Tour auto-launch uses `setTimeout` + direct store access — avoids race conditions
- [x] All imports are from renderer layer only (plus `import type` from domain)

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. After completing onboarding for the first time, the welcome tour auto-starts
3. The tour spotlight highlights each UI element in sequence
4. Clicking "Skip Tour" dismisses without marking complete
5. Completing the tour marks it done — it won't auto-start again
6. Settings > Guided Tours section shows all three tours with replay buttons
7. Clicking a replay button navigates to chat and starts the selected tour

---

## State Update

After completing this session, update `prompts/feature/onboarding-guide-tooltips/STATE.md`:
- Set SESSION-03 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
