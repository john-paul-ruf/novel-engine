# Session 08 — Context Builder

## Context

Novel Engine Electron app. Sessions 01–07 done. Now I need the **Context Builder** — it assembles the right book context for each agent, respects token budgets, and produces the context string that gets appended to the agent's system prompt.

## Architecture Rule

Lives in `src/application/ContextBuilder.ts`. Imports from `@domain` only. This is a pure application service — no infrastructure dependencies, no I/O. It takes data in and returns strings out.

## Task

Create `src/application/ContextBuilder.ts` implementing `IContextBuilder`.

### `estimateTokens(text: string): number`

Return `Math.ceil(text.length / CHARS_PER_TOKEN)` using the constant from `@domain/constants`.

### `build(agentName: AgentName, bookContext: BookContext): string`

1. Start with the book metadata block (always included for all agents):
   ```
   ## Active Book
   ```json
   { ...bookContext.meta }
   ```
   ```

2. Build an array of **context sections**, each with a `label`, `content`, `priority` (lower = more important), based on which agent is asking. The priority determines what gets cut if we exceed the token budget.

3. **Per-agent context rules** (these come directly from the original repo's agent definitions):

   **Spark** (Pitch & Scaffold):
   - Priority 1: `authorProfile`
   - That's it. Spark works from conversation, not from existing book files.

   **Verity** (Ghostwriter):
   - Priority 1: `voiceProfile`
   - Priority 2: `sceneOutline`
   - Priority 3: `storyBible`
   - Priority 4: `revisionPrompts` (if present — these are the Forge-generated session prompts)
   - Priority 5: `authorProfile`
   - Priority 6: Each chapter (`draft` + `notes` combined per chapter)

   **Ghostlight** (First Reader):
   - Priority 1: Each chapter (`draft` ONLY — no notes, no source docs)
   - Ghostlight does a **cold read**. It should NOT see notes, outlines, or story bibles.

   **Lumen** (Developmental Editor):
   - Priority 1: `readerReport` (Ghostlight's output)
   - Priority 2: `sceneOutline`
   - Priority 3: `storyBible`
   - Priority 4: Each chapter (`draft` + `notes`)

   **Sable** (Copy Editor):
   - Priority 1: `styleSheet`
   - Priority 2: `storyBible` (for consistency checking)
   - Priority 3: Each chapter (`draft` only)

   **Forge** (Task Master):
   - Priority 1: `devReport`
   - Priority 2: `readerReport`
   - Priority 3: `auditReport`
   - Priority 4: `sceneOutline`

   **Quill** (Publisher):
   - Priority 1: `authorProfile`
   - Priority 2: `storyBible`
   - Priority 3: `bookContext.meta` (already included above)

4. **Token budgeting:** After building the sections array, call the private `fitToWindow` method:
   - Calculate total budget: `MAX_CONTEXT_TOKENS - CONTEXT_RESERVE_TOKENS - estimateTokens(systemPromptLength)`. Since we don't have the system prompt length here, budget against `MAX_CONTEXT_TOKENS - CONTEXT_RESERVE_TOKENS` and accept the approximation.
   - Sort sections by priority (ascending = most important first)
   - Add sections one by one until the budget is exceeded
   - For chapters: if the full set doesn't fit, include as many as possible starting from chapter 1

5. **Format:** Join all included sections with `\n\n---\n\n` separators. Each section is formatted as:
   ```
   ## {label}
   {content}
   ```

6. Return the assembled context string.

### Private helper

```typescript
private fitToWindow(
  sections: { label: string; content: string; priority: number }[]
): string
```

Implements the token budgeting logic described above.

## Verification

- Compiles with `npx tsc --noEmit`
- Implements `IContextBuilder`
- Imports ONLY from `@domain`
- Ghostlight context contains chapter drafts but NO notes, NO source docs
- Verity context includes everything needed for writing
- Spark context is minimal (just author profile)
- Token budgeting drops lowest-priority sections first
