# Query Manager Auto-Populate & Per-Field AI Fill

## Source
User conversation. The query manager requires manual data entry for every field — agent names, contacts, methods, personalization notes. This is tedious. Quill should do the research and populate targets automatically.

## Core Intent
Make the Query Manager AI-driven instead of manual. Quill researches and populates submission targets in bulk, and any individual field on a target can be AI-generated or updated on demand.

## Decisions (from user Q&A)

1. **Web search access:** Add `WebSearch` to Quill's allowed tools so he can research live agent databases (MSWL, QueryTracker.net, Publisher's Marketplace)
2. **Bulk populate:** A "Research Targets" button in QueryManagerView starts a Quill conversation that researches appropriate agents/publishers for the book's genre, comp titles, and target audience. Quill writes structured target entries directly to `source/query-tracker.md`.
3. **Per-field AI fill:** Any field on an existing target (contact, method, personalization notes, link) can be AI-filled individually. A small "AI" button next to each field triggers Quill to research and update that specific field.
4. **All through Quill chat:** The trigger originates from the Query Manager UI but executes through a Quill conversation, streaming visible to the user.

## Scope

### Affected Modules
- `src/domain/types.ts` — new types for field-fill requests
- `src/domain/interfaces.ts` — new `IQueryService` methods
- `src/application/QueryService.ts` — `researchTargets()` + `fillTargetField()`
- `src/infrastructure/claude-cli/ClaudeCodeClient.ts` — add `WebSearch` to `--allowedTools`
- `agents/QUILL.md` — Phase 7: target research + field-fill instructions
- `src/main/ipc/handlers.ts` — new IPC channels
- `src/preload/index.ts` — new bridge methods
- `src/renderer/stores/queryStore.ts` — new actions
- `src/renderer/components/QueryManager/QueryManagerView.tsx` — "Research Targets" button
- `src/renderer/components/QueryManager/TargetCard.tsx` — per-field AI buttons
- `src/renderer/components/QueryManager/ResearchPanel.tsx` — new: streaming research UI

### Out of Scope
- Automatic status tracking (response monitoring) — still manual
- Email sending — still external
- Non-Quill agent involvement