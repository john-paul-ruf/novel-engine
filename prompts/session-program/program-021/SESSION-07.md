# SESSION-07 — TargetCard Per-Field AI Buttons

> **Program:** Novel Engine
> **Feature:** query-auto-populate
> **Modules:** M-RENDERER (TargetCard)
> **Depends on:** SESSION-05 (queryStore actions)
> **Estimated effort:** 20–25 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M-RENDERER | `src/renderer/components/QueryManager/TargetCard.tsx` | Full file (121 lines) | Add per-field AI fill buttons |
| M-RENDERER | `src/renderer/stores/queryStore.ts` | `fillTargetField` action from SESSION-05 | Call from buttons |

## Context

Currently `TargetCard` displays target info as read-only text with only a "Generate Letter" button and a status dropdown. We add small "AI" buttons next to each fillable field — contact, method, link, personalization notes, and notes — that trigger Quill to research and fill that specific field.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/renderer/components/QueryManager/TargetCard.tsx` | Modify | Add AI fill buttons for each field, convert display to editable display with AI trigger |

## Implementation

### 1. Add Imports

Add to the imports at the top of `src/renderer/components/QueryManager/TargetCard.tsx`:

```typescript
import type { QueryTarget, QueryStatus, QueryLetter, QueryFillableField } from '@domain/types';
```

### 2. Add AiFillButton Component

Add a small inline component at the top of the file (after the constants, before `TargetCard`):

```tsx
function AiFillButton({
  targetId,
  field,
  label,
}: {
  targetId: string;
  field: QueryFillableField;
  label: string;
}): React.ReactElement {
  const fillTargetField = useQueryStore((s) => s.fillTargetField);
  const fillingFor = useQueryStore((s) => s.fillingFor);
  const isFilling = fillingFor === targetId;

  return (
    <button
      onClick={() => fillTargetField(targetId, field)}
      disabled={isFilling}
      title={`AI-fill ${label}`}
      className="rounded px-1.5 py-0.5 text-[10px] font-medium text-ne-brass transition-colors hover:bg-ne-brass/10 disabled:opacity-50"
    >
      {isFilling ? '…' : 'AI'}
    </button>
  );
}
```

### 3. Update TargetCard Layout

The current `TargetCard` shows target info as a block of text (lines 52–70). Replace the info display section to show each field with an AI button next to it.

Read the file first, then replace the `<div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ne-ink-dim">` block and the personalization/notes display with a structured field layout:

Replace lines 59–70 (the `<div className="mt-1 flex flex-wrap...` through the `notes` paragraph closing `</p>`):

```tsx
<div className="mt-1.5 space-y-1 text-xs text-ne-ink-dim">
  <div className="flex items-center gap-2">
    <span className="text-ne-ink-faint">Type:</span>
    <span>{target.type}</span>
  </div>
  <div className="flex items-center gap-2">
    <span className="text-ne-ink-faint">Contact:</span>
    <span className="truncate">{target.contact || '—'}</span>
    <AiFillButton targetId={target.id} field="contact" label="contact" />
  </div>
  <div className="flex items-center gap-2">
    <span className="text-ne-ink-faint">Method:</span>
    <span>{target.method}</span>
    <AiFillButton targetId={target.id} field="method" label="method" />
  </div>
  {target.link && (
    <div className="flex items-center gap-2">
      <span className="text-ne-ink-faint">Link:</span>
      <span className="truncate text-blue-400">{target.link}</span>
      <AiFillButton targetId={target.id} field="link" label="link" />
    </div>
  )}
  {!target.link && (
    <div className="flex items-center gap-2">
      <span className="text-ne-ink-faint">Link:</span>
      <span>—</span>
      <AiFillButton targetId={target.id} field="link" label="link" />
    </div>
  )}
  <div className="flex items-start gap-2">
    <span className="shrink-0 text-ne-ink-faint">Personalization:</span>
    <span className="flex-1">{target.personalizationNotes || '—'}</span>
    <AiFillButton targetId={target.id} field="personalizationNotes" label="personalization" />
  </div>
  <div className="flex items-start gap-2">
    <span className="shrink-0 text-ne-ink-faint">Notes:</span>
    <span className="flex-1">{target.notes || '—'}</span>
    <AiFillButton targetId={target.id} field="notes" label="notes" />
  </div>
</div>
```

### 4. Keep Existing Buttons Intact

The "Generate Letter", "View Letter", "Remove", and status dropdown stay exactly as they are. Only the info display section changes.

## Verification

1. `npx tsc --noEmit` — type check passes
2. Each field row shows an "AI" button
3. Clicking "AI" calls `fillTargetField` with the correct field name
4. Button shows "…" while filling (when `fillingFor === target.id`)
5. `npm run lint` — no lint errors
6. Existing Generate Letter, Remove, and status dropdown still work

## State Update

Update `prompts/session-program/program-021/STATE.md`:
- Set SESSION-07 status to `done`
- Add completion date
- Handoff: UI complete. SESSION-08 can update the Quill agent prompt.