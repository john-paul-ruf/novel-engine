# ARCH-10 — Document Renderer Value Imports Exception

> **Issue:** #3 (Renderer imports values from domain — layer violation)
> **Severity:** Medium
> **Effort:** Trivial
> **Depends on:** Nothing

---

## Objective

15 renderer files import runtime values from `@domain/constants`. These are all pure data constants or pure functions with no Node.js dependencies. Rather than route them through the preload bridge, document a formal exception to the "import type only" rule.

---

## Implementation Steps

### 1. Add exception section to `docs/architecture/ARCHITECTURE.md`

Under Conventions, add a "Renderer Value Import Exception" section listing:
- The criteria (zero Node.js imports, no side effects, statically defined)
- The allowed imports (AGENT_REGISTRY, PIPELINE_PHASES, CREATIVE_AGENT_NAMES, AGENT_QUICK_ACTIONS, CHARS_PER_TOKEN, PITCH_ROOM_SLUG, AVAILABLE_MODELS, randomRespondingStatus, randomPitchRoomFlavor)
- What's still NOT allowed (infrastructure, application, I/O functions)

### 2. Update `docs/architecture/RENDERER.md`

Add a note referencing the exception.

### 3. Add comment to `src/domain/constants.ts`

```typescript
/**
 * NOTE: Some constants in this file are imported by the renderer layer
 * (value imports, not type-only). Permitted for pure data constants
 * with zero Node.js dependencies. See docs/architecture/ARCHITECTURE.md.
 */
```

---

## Verification

1. Documentation exists in both architecture docs
2. Comment exists in constants.ts
3. No code changes

---

## State Update

Set ARCH-10 to `done` in `prompts/arch/STATE.md`.
