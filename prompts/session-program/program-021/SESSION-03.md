# SESSION-03 — QueryService: researchTargets() + fillTargetField()

> **Program:** Novel Engine
> **Feature:** query-auto-populate
> **Modules:** M-APP (QueryService)
> **Depends on:** SESSION-02 (domain types + interface)
> **Estimated effort:** 25–30 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M-APP | `src/application/QueryService.ts` | Full file (307 lines) | Add two new methods, understand existing patterns |
| M-DOMAIN | `src/domain/types.ts` | New types from SESSION-02 | Import and use |
| M-DOMAIN | `src/domain/interfaces.ts` | `IQueryService` + `IChatService` | Implement new interface methods |

## Context

`QueryService` already implements `generateQueryLetter()` which creates a Quill conversation, sends a prompt, streams the response, and saves the result. We follow the same pattern for `researchTargets()` and `fillTargetField()`, but instead of writing a letter file, Quill writes directly to `source/query-tracker.md` (for research) or updates a single field (for field fill).

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/application/QueryService.ts` | Modify | Add `researchTargets()` and `fillTargetField()` methods, plus private prompt builders |

## Implementation

### 1. Add Imports

At the top of `src/application/QueryService.ts`, add the new types to the existing import from `@domain/types`:

```typescript
import type {
  QueryTracker,
  QueryTarget,
  QueryStatus,
  QueryLetter,
  QueryResearchResult,
  QueryFieldFillResult,
  QueryFillableField,
  StreamEvent,
} from '@domain/types';
```

### 2. Implement researchTargets()

Add this method to the `QueryService` class (after `saveQueryLetter`, before the `// ── Private: Parsing` section):

```typescript
async researchTargets(
  bookSlug: string,
  onEvent: (event: StreamEvent) => void,
): Promise<QueryResearchResult> {
  const conversation = await this.chat.createConversation({
    bookSlug,
    agentName: 'Quill',
    pipelinePhase: 'query-agents',
    purpose: 'pipeline',
  });

  const prompt = this.buildResearchPrompt();

  await this.chat.sendMessage({
    agentName: 'Quill',
    message: prompt,
    conversationId: conversation.id,
    bookSlug,
    onEvent,
  });

  // Reload tracker — Quill wrote directly to source/query-tracker.md
  const updatedTracker = await this.loadTracker(bookSlug);
  const targetNames = updatedTracker.targets.map((t) => t.name);

  return {
    addedTargets: updatedTracker.targets.length,
    targetNames,
    conversationId: conversation.id,
  };
}
```

### 3. Implement fillTargetField()

Add after `researchTargets()`:

```typescript
async fillTargetField(
  bookSlug: string,
  targetId: string,
  field: QueryFillableField,
  onEvent: (event: StreamEvent) => void,
): Promise<QueryFieldFillResult> {
  const tracker = await this.loadTracker(bookSlug);
  const target = tracker.targets.find((t) => t.id === targetId);
  if (!target) throw new Error(`Query target not found: ${targetId}`);

  const oldValue = String(target[field] ?? '');

  const conversation = await this.chat.createConversation({
    bookSlug,
    agentName: 'Quill',
    pipelinePhase: 'query-agents',
    purpose: 'pipeline',
  });

  const prompt = this.buildFieldFillPrompt(target, field);

  await this.chat.sendMessage({
    agentName: 'Quill',
    message: prompt,
    conversationId: conversation.id,
    bookSlug,
    onEvent,
  });

  // Quill writes the updated value to the tracker file.
  // Parse the new value from the reloaded tracker.
  const updatedTracker = await this.loadTracker(bookSlug);
  const updatedTarget = updatedTracker.targets.find((t) => t.id === targetId);
  const newValue = updatedTarget ? String(updatedTarget[field] ?? '') : oldValue;

  return {
    targetId,
    field,
    oldValue,
    newValue,
    conversationId: conversation.id,
  };
}
```

### 4. Add Private Prompt Builders

Add to the private section (after `buildGeneratePrompt`):

```typescript
private buildResearchPrompt(): string {
  return `Research submission targets for this book.

Read about.json for genre, subgenre, audience, and comp titles. Read source/story-bible.md and source/pitch-card.md if they exist for context on the book's themes and market positioning.

Use WebSearch to find literary agents and publishers who represent or publish books in this genre. Search for:
- "literary agents [genre]" and "[genre] literary agents seeking new clients"
- Manuscript Wish List (MSWL) entries matching this book's genre and themes
- Publisher's Marketplace listings for recent deals in this genre
- QueryTracker.net agent profiles active in this genre

For each viable target found (aim for 5–10), add an entry to source/query-tracker.md following the existing format. Include:
- Agent/publisher name
- Type (agent, publisher, or platform)
- Contact (email or submission URL from their listing)
- Method (email, form, or query-manager)
- Link to their profile/agency page
- Personalization notes: what they're looking for, why this book fits their list, specific MSWL items aligned with the book

Append new entries to any existing content in source/query-tracker.md. Do not remove existing targets. Use the same markdown format as existing entries:

## [Target Name] — drafting
- **Type:** agent
- **Contact:** [email or URL]
- **Method:** email
- **ID:** [generated id]
- **Submitted:**
- **Response Date:**
- **Query Letter:**
- **Personalization:** [why this book fits]
- **Notes:**
- **Link:** [profile URL]

Focus on agents and publishers that are actively accepting submissions in this genre as of today.`;
}

private buildFieldFillPrompt(target: QueryTarget, field: QueryFillableField): string {
  const fieldDescriptions: Record<QueryFillableField, string> = {
    contact: 'the submission email address or form URL',
    method: 'the submission method (email, form, query-manager, or other)',
    link: 'a URL to their agent/publisher profile or agency page',
    personalizationNotes: 'what this target is looking for, why this book fits their list, specific MSWL or interview quotes that align',
    notes: 'any special submission instructions, exclusivity requirements, or notable details',
  };

  return `Research and fill the "${field}" field for ${target.name} (${target.type}).

Target context:
- Name: ${target.name}
- Type: ${target.type}
- Current contact: ${target.contact}
- Current link: ${target.link}

Use WebSearch to find ${fieldDescriptions[field]} for ${target.name}.

After researching, update the "${field}" field for ${target.name} in source/query-tracker.md. Only change that one field — do not modify any other fields or targets. Write the updated value using the same markdown format:

- **${this.fieldToLabel(field)}:** [new value]

where the field label matches the existing format in the file.`;
}

private fieldToLabel(field: QueryFillableField): string {
  const map: Record<QueryFillableField, string> = {
    contact: 'Contact',
    method: 'Method',
    link: 'Link',
    personalizationNotes: 'Personalization',
    notes: 'Notes',
  };
  return map[field];
}
```

## Verification

1. `npx tsc --noEmit` — type check passes
2. `QueryService` implements all methods of `IQueryService` (no missing method errors)
3. `researchTargets()` creates a conversation, sends prompt, reloads tracker
4. `fillTargetField()` creates a conversation, sends prompt, reloads tracker, returns old/new values
5. Both methods accept an `onEvent` callback for streaming

## State Update

Update `prompts/session-program/program-021/STATE.md`:
- Set SESSION-03 status to `done`
- Add completion date
- Handoff: QueryService logic complete. SESSION-04 can wire IPC channels + preload bridge.