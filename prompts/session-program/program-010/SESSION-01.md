# SESSION-01 — Design Tokens & Typography Foundation

> **Program:** Novel Engine · **Feature:** streamlined-workspace-ui · **Modules:** M10
> **Depends on:** none · **Estimated effort:** 25 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M10 | renderer | `src/renderer/styles/globals.css`, `src/renderer/main.tsx`, `package.json` | Token + font injection points |

## Context

The redesign uses an "editorial studio" palette (warm ink surfaces, brass accent, per-agent identity colors) and a three-font system: Fraunces (display/prose serif), Inter (UI), JetBrains Mono (logs/paths). Today the app uses Tailwind zinc + system fonts. This session adds the tokens WITHOUT changing any existing component — everything after builds on these variables. Extract exact dark values from the mock: `design/ui-redesign/mockups/streamlined-workspace/index.html` (`:root` block).

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `package.json` | modify | add `@fontsource-variable/fraunces`, `@fontsource/inter`, `@fontsource/jetbrains-mono` |
| `src/renderer/main.tsx` | modify | import the fontsource CSS files |
| `src/renderer/styles/globals.css` | modify | token layer + `@theme inline` utilities |
| `src/renderer/components/common/agentColors.ts` | create | agent → CSS-var color map |

## Implementation

### 1. Install fonts (offline-safe — no CDN)

`npm install @fontsource-variable/fraunces @fontsource/inter @fontsource/jetbrains-mono`

In `src/renderer/main.tsx`, before the `./styles/globals.css` import:

```ts
import '@fontsource-variable/fraunces';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
```

### 2. Add tokens to `globals.css` (append after the existing `@custom-variant dark` line)

Light values on `:root`, dark overrides on `.dark`. Dark values come from the mock verbatim; light equivalents stay in the same warm hue family:

```css
:root {
  --ne-bg0:#faf7f2; --ne-bg1:#f3efe7; --ne-bg2:#ebe6db; --ne-bg3:#e0dacc;
  --ne-line:#ddd6c8; --ne-line-soft:#e6e0d3;
  --ne-ink:#2b2620; --ne-ink-dim:#6f675a; --ne-ink-faint:#a89e8f;
  --ne-brass:#a97f35; --ne-brass-hi:#8a6526; --ne-brass-dim:rgba(169,127,53,.12);
  --ne-spark:#b07f24; --ne-verity:#7a5cc4; --ne-ghostlight:#2d8fa8;
  --ne-lumen:#3e8f52; --ne-sable:#bf5a78; --ne-forge:#bd6a33; --ne-quill:#4472b8;
  --ne-serif:'Fraunces Variable', Georgia, serif;
  --ne-ui:'Inter', system-ui, sans-serif;
  --ne-mono:'JetBrains Mono', ui-monospace, monospace;
}
.dark {
  --ne-bg0:#131110; --ne-bg1:#191613; --ne-bg2:#201c18; --ne-bg3:#27221d;
  --ne-line:#2b2620; --ne-line-soft:#241f1a;
  --ne-ink:#ece4d6; --ne-ink-dim:#a89e8f; --ne-ink-faint:#6f675a;
  --ne-brass:#c9a25c; --ne-brass-hi:#e8c988; --ne-brass-dim:rgba(201,162,92,.16);
  --ne-spark:#d4a24e; --ne-verity:#a78bda; --ne-ghostlight:#6cc3d5;
  --ne-lumen:#7fbf8a; --ne-sable:#d98a9e; --ne-forge:#d99162; --ne-quill:#7da2d9;
}
```

Expose to Tailwind v4 via `@theme inline` so utilities like `bg-ne-bg1`, `text-ne-ink`, `border-ne-line`, `font-ne-serif` are generated:

```css
@theme inline {
  --color-ne-bg0: var(--ne-bg0); --color-ne-bg1: var(--ne-bg1); --color-ne-bg2: var(--ne-bg2); --color-ne-bg3: var(--ne-bg3);
  --color-ne-line: var(--ne-line); --color-ne-line-soft: var(--ne-line-soft);
  --color-ne-ink: var(--ne-ink); --color-ne-ink-dim: var(--ne-ink-dim); --color-ne-ink-faint: var(--ne-ink-faint);
  --color-ne-brass: var(--ne-brass); --color-ne-brass-hi: var(--ne-brass-hi); --color-ne-brass-dim: var(--ne-brass-dim);
  --color-ne-spark: var(--ne-spark); --color-ne-verity: var(--ne-verity); --color-ne-ghostlight: var(--ne-ghostlight);
  --color-ne-lumen: var(--ne-lumen); --color-ne-sable: var(--ne-sable); --color-ne-forge: var(--ne-forge); --color-ne-quill: var(--ne-quill);
  --font-ne-serif: var(--ne-serif); --font-ne-ui: var(--ne-ui); --font-ne-mono: var(--ne-mono);
}
```

### 3. Agent color map helper

Create `src/renderer/components/common/agentColors.ts`: export `AGENT_COLORS: Record<string, string>` mapping the seven agent names (Spark, Verity, Ghostlight, Lumen, Sable, Forge, Quill) to `'var(--ne-<agent>)'`, plus `agentColor(name: string): string` with `'var(--ne-ink-faint)'` fallback. Check `src/domain/constants.ts` for the existing `AGENT_REGISTRY` — key from it rather than re-declaring name strings if it exports them.

## Verification

- `npx tsc --noEmit` passes
- `npm start` — app boots, existing UI visually unchanged (tokens are additive)
- DevTools: `getComputedStyle(document.documentElement).getPropertyValue('--ne-brass')` returns a value; toggle theme in Settings → Appearance and confirm it changes
- No component files changed except the new `agentColors.ts`

## State Update

Set SESSION-01 `done` in STATE.md with date. Handoff: record the exact generated utility names (e.g. `bg-ne-bg1`) so later sessions use identical spellings.
