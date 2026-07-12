# SESSION-04 — Composition Root Wiring + Quill Agent Prompt Update

> **Program:** Novel Engine
> **Feature:** query-manager
> **Modules:** M08 (application), agents/
> **Depends on:** SESSION-02, SESSION-03
> **Estimated effort:** 20 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M09 | main | `src/main/index.ts` (composition root, handler registration) | Wire QueryService instantiation and pass to handlers |
| M08 | application | `src/application/QueryService.ts` (from SESSION-02) | Constructor dependencies |
| agents/ | agent prompts | `agents/QUILL.md` | Add Phase 6: personalized query letter generation |

## Context

SESSION-02 created `QueryService`. SESSION-03 added the IPC handlers and preload bridge. Now we need to:
1. Instantiate `QueryService` in the composition root (`src/main/index.ts`)
2. Pass it to `registerIpcHandlers`
3. Update `QUILL.md` with a Phase 6 section for personalized query letter generation

The composition root is in `src/main/index.ts` — the only place concrete classes are instantiated. We need to add `QueryService` after its dependencies are created (ChatService, AgentService, FileSystemService, SettingsService, ProviderRegistry).

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/main/index.ts` | Modify | Instantiate QueryService, add to handler call |
| `agents/QUILL.md` | Modify | Add Phase 6 section for personalized query letter generation |

## Implementation

### 1. Read `src/main/index.ts`

Read the full file, focusing on:
- Lines 616-646 — where application services are instantiated (composition root)
- Line 741 — the `registerIpcHandlers` call with the services object

The service instantiation section builds each service with its dependencies. ChatService (line 627) takes `settings, agents, db, providerRegistry, fs, chapterValidator, pitchRoom, hotTake, adhocRevision, streamManager, series, version`.

### 2. Instantiate QueryService

After the existing service instantiation section in `src/main/index.ts` (around line 645, after `const statistics = new StatisticsService(...)`), add:

```typescript
  const queryService = new QueryService(fs, chat, agents, settings, providerRegistry);
```

Make sure to add the import at the top, with the other application imports (line 67-86):

```typescript
import { QueryService } from '@app/QueryService';
```

**Dependencies check:** At this point in the composition root, all of `fs`, `chat`, `agents`, `settings`, `providerRegistry` are already instantiated. The order is correct.

### 3. Add `queryService` to the handler registration

In the `registerIpcHandlers` call (line 741-749), add `query: queryService` to the services object:

```typescript
  registerIpcHandlers(
    { settings, agents, db, fs, chat, audit, pipeline, build, usage, revisionQueue,
      motifLedger, notifications, version, providerRegistry, manuscriptImport,
      sourceGeneration, series, seriesImport, helper, findReplace, dashboard,
      statistics, query: queryService },
    { userDataPath, booksDir },
    {
      onActiveBookChanged: (slug: string) => {
        bookWatcher?.watch(slug);
      },
    },
  );
```

### 4. Update `agents/QUILL.md` — Add Phase 6

Read `agents/QUILL.md` to find the right insertion point (Phase 5 ends around line 291 with "Quill produces these only when the author asks. Do not generate unsolicited."). Insert a new section after Phase 5 but before "Relationship to Other Agents" (around line 295):

```markdown
---

## Phase 6: Personalized Query Letters

When the author adds a submission target to the Query Manager and requests a personalized query letter, you are invoked with the target's details. This is not a generic query letter — it is tailored to a specific agent, publisher, or platform.

### Target Context

Each generation request includes:
- **Target name** — the agent or publisher being queried
- **Target type** — agent, publisher, or platform
- **Contact method** — email, form, or query-manager
- **Personalization notes** — what to emphasize for this target (e.g. "Represents literary fiction with speculative elements. MSWL mentions interest in voice-driven narratives.")

### Personalization Rules

- **Research is implied, not performed.** You cannot access the internet. Use the personalization notes provided by the author as your guide for what this target cares about.
- **Adjust the hook.** If the target represents literary fiction, lead with voice. If they represent genre fiction, lead with stakes. If they represent a platform, lead with audience fit.
- **Match comp titles to the target's list.** If the personalization notes mention specific authors the target represents, align your comp titles with that list when possible.
- **Respect submission guidelines.** If the method is email, keep the letter under 300 words. If a form, check whether word count limits are mentioned. If query-manager, standard length applies.
- **Never fabricate credentials.** The author's bio is in `author-profile.md` (repo root). Read it. Do not invent credentials, publications, or awards.

### Output

Write the personalized query letter to `source/query-letters/{target-slug}.md`. The filename is the slugified target name (e.g. "Acme Literary" → "acme-literary.md").

---

```

## Verification

1. Run `npx tsc --noEmit` — must pass with zero errors
2. Verify `QueryService` is imported and instantiated in `src/main/index.ts`
3. Verify `query: queryService` appears in the `registerIpcHandlers` services object
4. Verify `QUILL.md` has the new Phase 6 section
5. Verify no duplicate imports in `src/main/index.ts`

## State Update

Update `prompts/session-program/program-019/STATE.md`:
- Set SESSION-04 status to `done`
- Add completion date
- Add handoff notes: Composition root wired. Full backend pipeline (types → service → IPC → preload → instantation) is operational. Renderer work starts in SESSION-05.