# SESSION-05 — Feed Author Edits to Verity (Context Injection)

> **Program:** Novel Engine · **Feature:** tracked-chapter-editing
> **Modules:** M08 (application), M09 (main)
> **Depends on:** SESSION-01 · **Estimated effort:** 30 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M08 | application | `src/application/ContextBuilder.ts` (lines 35–110) | `build()` sections assembly |
| M08 | application | `src/application/ChatService.ts` (lines 40–70 constructor; 230–310 context assembly) | Injection site #1 |
| M08 | application | `src/application/MultiCallOrchestrator.ts` (constructor + its `contextBuilder.build` call) | Injection site #2 (first-message pipeline drafts) |
| M08 | application | `src/application/RevisionQueueService.ts` (lines 100–110 constructor; 660–685 `runSession`) | Injection site #3 |
| M09 | main | `src/main/index.ts` (lines 605–630, service construction) | Wiring order — `VersionService` is currently built at line 627, AFTER its new consumers |

## Context

This is the session that makes edits "tracked **by the AI**". A formatted author-edits section
(diff + preserve policy) is built from SESSION-01's baseline API and injected into every
Verity-facing context assembly.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/application/VersionService.ts` | modify | Add `buildAuthorEditsSection()` |
| `src/domain/interfaces.ts` | modify | Add method to `IVersionService` |
| `src/application/ContextBuilder.ts` | modify | Optional `authorEditsSection` param in `build()` |
| `src/application/ChatService.ts` | modify | Inject `IVersionService`; pass section |
| `src/application/MultiCallOrchestrator.ts` | modify | Same |
| `src/application/RevisionQueueService.ts` | modify | Same |
| `src/main/index.ts` | modify | Reorder construction; pass `version` to the three services |

## Implementation

### 1. `VersionService.buildAuthorEditsSection(bookSlug): Promise<string | null>`

Interface JSDoc: "Markdown section describing pending author edits across all body chapters,
for agent context injection. Null when there are none."

Logic: call `this.getChapterEditStatuses(bookSlug)`; for chapters with `hasUserEdits`, get the
diff via `getUserEditsSinceAgentBaseline` and render:

```markdown
## Author Edits Since Your Last Draft

The author hand-edited the chapters below after you last wrote them. **Preserve these edits**
unless the current request explicitly asks to rework that passage. If a requested change
conflicts with an author edit, keep the author's intent and call out the conflict in your reply.

### `chapters/02-the-notebook/draft.md` (+12 / -4 lines)
```diff
@@ -41,7 +41,7 @@
-old line
+new line
```
```

Render hunks in unified-diff style from `FileDiff.hunks` (prefix `-`/`+`/space per
`DiffLine.type`, `@@ -oldStart,oldLines +newStart,newLines @@` headers). **Cap output**: max
120 diff lines per chapter, then append `... ({n} more edited lines — read the file for the
full text)`. Return `null` if no chapter has edits.

### 2. `ContextBuilder.build()` (`src/application/ContextBuilder.ts`)

Add optional param `authorEditsSection?: string` to the `build` params type (line ~41).
Push it into `sections` right after `guidanceSection` (line ~74):

```typescript
if (authorEditsSection) sections.push(authorEditsSection);
```

No other changes — token budgeting already measures the assembled prompt.

### 3. Inject `IVersionService` into the three consumers

Add `private version: IVersionService` to each constructor (import type from
`@domain/interfaces`):

- **ChatService** (line 53): append param; also pass it through to
  `new MultiCallOrchestrator(...)` (line 66).
- **MultiCallOrchestrator** (line ~49 area): append param.
- **RevisionQueueService** (line 102): append param.

At each `contextBuilder.build({...})` call site, compute and pass the section **only for
Verity** (skip for other agents — their work doesn't overwrite chapters):

```typescript
let authorEditsSection: string | undefined;
if (agentName === 'Verity') {
  try {
    authorEditsSection = (await this.version.buildAuthorEditsSection(bookSlug)) ?? undefined;
  } catch (err) {
    console.error('[author-edits] section build failed:', err);
  }
}
```

Call sites: `ChatService.ts:291`, `MultiCallOrchestrator.ts` (locate its
`this.contextBuilder.build`), `RevisionQueueService.ts:673` (agent is always Verity there).

### 4. Composition root (`src/main/index.ts`)

Move `const version = new VersionService(db, fs);` (line 627) **above** the
`AdhocRevisionService`/`ChatService`/`RevisionQueueService` block (lines 613–618), then append
`version` to the `ChatService` and `RevisionQueueService` constructor calls. Verify no other
ordering dependency breaks (VersionService needs only `db` and `fs`, both built earlier).

## Verification

1. `npx tsc --noEmit` — clean.
2. Architecture compliance: application services receive `IVersionService` (interface), never
   the concrete class; composition root remains the only instantiation site.
3. `npm start`: hand-edit a Verity chapter, then ask Verity (Workspace chat) to revise that
   chapter. Inspect the CLI activity / context diagnostics: system prompt contains
   "Author Edits Since Your Last Draft" with the correct diff. A book with no edits produces
   no section.
4. Confirm non-Verity agents (e.g. Lumen deep dive) get no section.

## State Update

Mark SESSION-05 done in STATE.md. Handoff: record the exact section heading string (UI copy in
SESSION-03 banner references "shared with Verity") and the 120-line cap decision.
