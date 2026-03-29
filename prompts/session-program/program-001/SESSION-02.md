# SESSION-02 — Done Confirm Box + Onboarding Guide Selectors

> **Feature:** small-queue-intake
> **Layer(s):** M10 (renderer only)
> **Depends on:** Nothing
> **Estimated effort:** 20 min

---

## Context

Two small UX fixes in the pipeline area:

1. The "Done" button on `first-draft` shows a warning modal ("Manual Override — not recommended"). Completing your first draft is a milestone, not an override. It should show a positive confirmation.
2. Pipeline-intro tour steps reference pipeline phase elements via `data-tour="pipeline-phase-{id}"` — these elements only exist when the Pipeline accordion is open. The tour can fail to highlight them when the accordion is collapsed.

---

## Files to Read First

- `src/renderer/components/Sidebar/PipelineTracker.tsx` — contains ManualOverrideModal, handleMarkComplete
- `src/renderer/tours/tourDefinitions.ts` — tour step definitions
- `src/renderer/components/common/GuidedTourOverlay.tsx` — how the tour positions its popover (read to understand requiredView handling)

---

## Fix 1: First-Draft Completion Modal

**Current behavior:** Pressing "Done" on any active phase opens `ManualOverrideModal`, which displays a ⚠ amber warning with text "This is not recommended. Skipping an agent may leave the pipeline without the output that later phases depend on."

**Desired behavior for `first-draft`:** A positive confirmation. The user has finished writing their draft — this is an achievement, not a warning.

**Implementation in `PipelineTracker.tsx`:**

Add a new modal component `FirstDraftCompleteModal` alongside `ManualOverrideModal`:

```tsx
function FirstDraftCompleteModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}): React.ReactElement
```

Design: green checkmark header, title "First Draft Complete!", body text confirming the milestone, positive confirm button ("Mark Complete"). No warning language.

In `handleMarkComplete`, check if the phase is `first-draft`. If so, store the target in the existing `manualOverridePhase` state but render `FirstDraftCompleteModal` instead of `ManualOverrideModal` at the bottom of the component return:

```tsx
{manualOverridePhase === 'first-draft' ? (
  <FirstDraftCompleteModal onConfirm={confirmManualOverride} onCancel={() => setManualOverridePhase(null)} />
) : manualOverridePhase ? (
  <ManualOverrideModal ... />
) : null}
```

All other phases keep the existing warning modal unchanged.

---

## Fix 2: Onboarding Tour Pipeline Selectors

**Current behavior:** Pipeline-intro tour steps target `[data-tour="pipeline-phase-pitch"]`, `[data-tour="pipeline-phase-scaffold"]`, etc. These divs are only in the DOM when the Pipeline accordion is open. If the accordion is collapsed when the tour fires, the popover has no target to anchor to and may mis-position.

**Implementation in `tourDefinitions.ts`:**

Read `GuidedTourOverlay.tsx` to understand how `requiredView` is handled. Then apply the same pattern (or the nearest available pattern) to ensure the pipeline accordion is open when pipeline phase steps fire.

If `GuidedTourOverlay` only supports `requiredView` (navigating to a view) and not accordion expansion: update the pipeline-intro tour steps that target specific phase rows to instead target the always-visible `[data-tour="pipeline-tracker"]` container for their anchor. Update their `placement` to `right` and update body text to describe the relevant agents without requiring the specific phase row to be visible.

The steps to update (if falling back to container-level targeting):
- `pipeline-agents` → target `[data-tour="pipeline-tracker"]`, update body to mention Spark
- `pipeline-verity` → target `[data-tour="pipeline-tracker"]`, update body to mention Verity
- `pipeline-readers` → target `[data-tour="pipeline-tracker"]`
- `pipeline-forge` → target `[data-tour="pipeline-tracker"]`
- `pipeline-sable` → target `[data-tour="pipeline-tracker"]`
- `pipeline-build` → target `[data-tour="pipeline-tracker"]`

If `GuidedTourOverlay` has a mechanism to trigger side effects before highlighting (like expanding accordions), use that instead.

Keep `pipeline-overview` pointing at `[data-tour="pipeline-tracker"]` — it already does.

---

## Architecture Compliance

- [x] Renderer only — no domain, infra, application, or IPC changes
- [x] No new stores or IPC channels
- [x] `FirstDraftCompleteModal` is a co-located function component in PipelineTracker.tsx — not a separate file

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Clicking "Done" on the `first-draft` phase (when active) shows the green celebration modal, not the amber warning
3. Clicking "Done" on any other active phase (e.g., `pitch`) still shows the amber warning modal
4. Running the Pipeline Guide tour: every step positions its popover without error regardless of accordion state

---

## State Update

Set SESSION-02 to `done` in STATE.md.
