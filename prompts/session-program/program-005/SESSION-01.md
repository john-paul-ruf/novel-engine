# SESSION-01 — Active Book Highlight — Bright Orange

> **Depends on:** Nothing (independent)
> **Modules:** M10 (renderer)
> **Estimated effort:** 10 minutes

---

## Goal

Make the currently selected book in the bookshelf **unmistakably obvious** with a bright orange highlight. The user must be able to tell which book they're working on at a glance — no squinting at subtle blue tints.

---

## Context

Two components render book list items:

1. **`src/renderer/components/Sidebar/BookPanel.tsx`** — standalone books (not in a series)
2. **`src/renderer/components/Sidebar/SeriesGroup.tsx`** — books within a series group

Both currently use blue for the active state:
- BookPanel: `bg-blue-50 dark:bg-blue-950/20 border-l-2 border-blue-500`
- SeriesGroup (series container): `border-l-2 border-blue-500`
- SeriesGroup (individual volume): `bg-zinc-200/70 dark:bg-zinc-800/70`

---

## Changes

### 1. `src/renderer/components/Sidebar/BookPanel.tsx`

Find the standalone book item's className (around line 499):

```typescript
isActive ? 'bg-blue-50 dark:bg-blue-950/20 border-l-2 border-blue-500' : ''
```

Replace with:

```typescript
isActive ? 'bg-orange-50 dark:bg-orange-950/20 border-l-2 border-orange-500' : ''
```

### 2. `src/renderer/components/Sidebar/SeriesGroup.tsx`

**Series container border** (around line 41):

```typescript
hasActiveBook ? 'border-l-2 border-blue-500' : 'border-l-2 border-transparent'
```

Replace with:

```typescript
hasActiveBook ? 'border-l-2 border-orange-500' : 'border-l-2 border-transparent'
```

**Individual volume active state** (around line 99):

```typescript
isActive ? 'bg-zinc-200/70 dark:bg-zinc-800/70' : ''
```

Replace with:

```typescript
isActive ? 'bg-orange-50 dark:bg-orange-950/20' : ''
```

---

## Verification

```bash
npx tsc --noEmit
```

Visual check: The active book should have an orange-500 left border and a warm orange tinted background in both light and dark modes. It should be immediately obvious which book is selected.

---

## Files Modified

| File | Change |
|------|--------|
| `src/renderer/components/Sidebar/BookPanel.tsx` | Active book: blue → orange highlight |
| `src/renderer/components/Sidebar/SeriesGroup.tsx` | Active series border + active volume: blue/zinc → orange highlight |
