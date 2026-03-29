# SESSION-01 — Bug Cluster: Layout Overflow, Sidebar Compression, CLI Scrollbars

> **Feature:** small-queue-intake
> **Layer(s):** M10 (renderer only — CSS/layout fixes)
> **Depends on:** Nothing
> **Estimated effort:** 20 min

---

## Context

Three UI bugs reported together. All pure renderer fixes.

---

## Files to Read First

- `src/renderer/components/RevisionQueue/QueueControls.tsx`
- `src/renderer/components/Sidebar/BookSelector.tsx`
- `src/renderer/components/CliActivity/CliActivityPanel.tsx`

---

## Bug 1: Select Dropdown Overflow in Revision Queue

**Symptom:** The mode `<select>` in `QueueControls.tsx` overflows its container at non-full widths.

**Fix:** Add `min-w-0 max-w-[200px]` to the `<select>` element. Ensure the parent flex child wrapping it has `min-w-0` so it can shrink.

---

## Bug 2: Wonky Book Dropdown When Sidebar Compressed

**Symptom:** At ~200px sidebar width the active-book trigger row wraps or clips text.

**Root cause:** The middle flex child (title + word count) needs `min-w-0 overflow-hidden` on its outer div so `truncate` on the title can activate.

**Fix in `BookSelector.tsx`:** In the closed-state trigger row, find the `<div>` wrapping title + word count text. It should have `min-w-0 flex-1 overflow-hidden`. Confirm `truncate` is on the title element. Cover thumbnail already has `shrink-0` — leave it. No changes to the dropdown panel.

---

## Bug 3: Scrollbar Proliferation in CLI Activity Panel

**Symptom:** Multiple simultaneous scrollbars in `CliActivityPanel`.

**Root cause:** Nested `overflow-y-auto` containers competing for scroll context.

**Fix in `CliActivityPanel.tsx`:**
1. Read the full component to map the nesting.
2. Only the innermost content list (stream entry log) should have `overflow-y-auto`.
3. Outer flex-column wrappers: use `min-h-0 flex-1 overflow-hidden` — not `overflow-y-auto`.
4. The panel outermost container: `overflow-hidden` not `overflow-y-auto`.
5. Do not touch resize handle logic or vertical split behavior.

---

## Architecture Compliance

- [x] Renderer only — no domain, infra, application, or IPC changes
- [x] Tailwind utilities only
- [x] No new components — class changes to existing files only

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Sidebar at 200px min-width: active-book row shows single-line truncated title
3. Revision queue mode select does not overflow at narrow window widths
4. CLI Activity panel: one scrollbar in the log area only

---

## State Update

Set SESSION-01 to `done` in STATE.md.
