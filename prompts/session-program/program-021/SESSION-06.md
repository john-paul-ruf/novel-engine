# SESSION-06 — ResearchPanel Component + QueryManagerView Integration

> **Program:** Novel Engine
> **Feature:** query-auto-populate
> **Modules:** M-RENDERER (QueryManager components)
> **Depends on:** SESSION-05 (queryStore actions)
> **Estimated effort:** 20–25 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M-RENDERER | `src/renderer/components/QueryManager/QueryManagerView.tsx` | Full file (177 lines) | Add "Research Targets" button + ResearchPanel |
| M-RENDERER | `src/renderer/stores/queryStore.ts` | New `researchTargets` action from SESSION-05 | Call from button |

## Context

The QueryManagerView currently has an "+ Add Target" button (line 97) that opens a manual form. We add a "Research Targets" button next to it that triggers Quill to search the web and auto-populate targets. While researching, a streaming panel shows Quill's progress.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/renderer/components/QueryManager/ResearchPanel.tsx` | Create | Streaming panel showing Quill's research progress |
| `src/renderer/components/QueryManager/QueryManagerView.tsx` | Modify | Add "Research Targets" button, wire ResearchPanel |

## Implementation

### 1. Create ResearchPanel.tsx

Create `src/renderer/components/QueryManager/ResearchPanel.tsx`:

```tsx
import { useQueryStore } from '../../stores/queryStore';

export function ResearchPanel(): React.ReactElement {
  const isResearching = useQueryStore((s) => s.isResearching);
  const researchBuffer = useQueryStore((s) => s.researchBuffer);
  const researchTargets = useQueryStore((s) => s.researchTargets);

  if (!isResearching && researchBuffer === '') return <></>;

  return (
    <div className="mb-4 rounded-[13px] border border-ne-brass/30 bg-ne-bg1 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium text-ne-ink">
          {isResearching ? 'Researching targets…' : 'Research complete'}
        </span>
        {isResearching && (
          <span className="h-2 w-2 animate-pulse rounded-full bg-ne-brass" />
        )}
      </div>
      {researchBuffer && (
        <div className="max-h-48 overflow-y-auto rounded-md bg-ne-bg0 p-3 text-xs text-ne-ink-dim whitespace-pre-wrap font-mono">
          {researchBuffer}
        </div>
      )}
      {!isResearching && researchBuffer && (
        <button
          onClick={() => researchTargets()}
          className="mt-2 text-xs text-ne-brass hover:underline"
        >
          Research again
        </button>
      )}
    </div>
  );
}
```

### 2. Add Research Button + Panel to QueryManagerView

Read `src/renderer/components/QueryManager/QueryManagerView.tsx`. Make these changes:

**a) Add import:**

```typescript
import { ResearchPanel } from './ResearchPanel';
```

**b) Add store access** (after line 26, the `initStreamListener` selector):

```typescript
const researchTargets = useQueryStore((s) => s.researchTargets);
const isResearching = useQueryStore((s) => s.isResearching);
```

**c) Add the "Research Targets" button** next to the existing "+ Add Target" button. Replace the button section (lines 93–98) with:

```tsx
<button
  onClick={() => setShowAddForm(true)}
  className="rounded-lg bg-ne-brass px-4 py-2 text-sm font-medium text-ne-bg0 transition-colors hover:bg-ne-brass-hi"
>
  + Add Target
</button>
<button
  onClick={() => researchTargets()}
  disabled={isResearching}
  className="rounded-lg border border-ne-brass/50 px-4 py-2 text-sm font-medium text-ne-brass transition-colors hover:bg-ne-brass/10 disabled:opacity-50"
>
  {isResearching ? 'Researching…' : 'Research Targets'}
</button>
```

**d) Add ResearchPanel** after the error display block (after line 105, after the `{error && ...}` block) and before the `{showAddForm && ...}` block:

```tsx
<ResearchPanel />
```

## Verification

1. `npx tsc --noEmit` — type check passes
2. `ResearchPanel.tsx` exists and exports `ResearchPanel` component
3. "Research Targets" button appears in QueryManagerView next to "+ Add Target"
4. Button is disabled when `isResearching` is true
5. `ResearchPanel` renders when researching or when buffer has content
6. `npm run lint` — no lint errors

## State Update

Update `prompts/session-program/program-021/STATE.md`:
- Set SESSION-06 status to `done`
- Add completion date
- Handoff: Research button + streaming panel done. SESSION-07 can add per-field AI buttons to TargetCard.