# SESSION-01 — Domain Types, Constants, and Pipeline Phase Registration

> **Program:** Novel Engine
> **Feature:** query-manager
> **Modules:** M01 (domain)
> **Depends on:** None
> **Estimated effort:** 30 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M01 | domain | `src/domain/types.ts`, `src/domain/interfaces.ts`, `src/domain/constants.ts`, `src/domain/index.ts` | Add new types, interface, pipeline phase entry, output file mapping |

## Context

The domain layer is the foundation. Everything else depends on these types. We need:
- New `PipelinePhaseId` value `'query-agents'` appended after `'publish'`
- New `PIPELINE_PHASES` entry for `query-agents` with Quill as the agent
- New `PHASE_OUTPUT_FILES` entry mapping `'query-agents'` → `['source/query-tracker.md']`
- New query types: `QueryTargetType`, `QueryStatus`, `QuerySubmissionMethod`, `QueryTarget`, `QueryTracker`, `QueryLetter`
- New `IQueryService` interface
- Export updates in domain barrels

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/domain/types.ts` | Modify | Add query types after the Revision Queue section (around line 456) |
| `src/domain/interfaces.ts` | Modify | Add `IQueryService` interface (after `IPitchRoomService` or at end) |
| `src/domain/constants.ts` | Modify | Add `'query-agents'` to `PIPELINE_PHASES`, add `PHASE_OUTPUT_FILES` entry |
| `src/domain/index.ts` | No change | Already re-exports everything via `export *` |

## Implementation

### 1. Add `'query-agents'` to `PipelinePhaseId`

In `src/domain/types.ts`, read the current `PipelinePhaseId` union (line ~99-102):

```typescript
export type PipelinePhaseId =
  | 'pitch' | 'scaffold' | 'first-draft' | 'first-read' | 'first-assessment'
  | 'revision-plan-1' | 'revision' | 'second-read' | 'second-assessment'
  | 'copy-edit' | 'revision-plan-2' | 'mechanical-fixes' | 'build' | 'publish';
```

Add `| 'query-agents'` at the end:

```typescript
export type PipelinePhaseId =
  | 'pitch' | 'scaffold' | 'first-draft' | 'first-read' | 'first-assessment'
  | 'revision-plan-1' | 'revision' | 'second-read' | 'second-assessment'
  | 'copy-edit' | 'revision-plan-2' | 'mechanical-fixes' | 'build' | 'publish'
  | 'query-agents';
```

### 2. Add query types in `src/domain/types.ts`

Add after the Revision Queue section (after line ~456, after `RevisionQueueEvent` type):

```typescript
// === Query Manager ===

export type QueryTargetType = 'agent' | 'publisher' | 'platform';

export type QueryStatus = 'drafting' | 'queried' | 'partial-request' | 'full-request' | 'offer' | 'rejected' | 'withdrawn';

export type QuerySubmissionMethod = 'email' | 'form' | 'query-manager' | 'other';

export type QueryTarget = {
  id: string;                      // nanoid
  name: string;                    // agent/publisher/platform name
  type: QueryTargetType;
  contact: string;                 // email or submission URL
  method: QuerySubmissionMethod;
  status: QueryStatus;
  queryLetterPath: string | null;  // relative path to letter file, e.g. "source/query-letters/acme-literary.md"
  submittedDate: string | null;   // ISO date when query was sent
  responseDate: string | null;     // ISO date when response received
  notes: string;                   // free-text notes (exclusivity, special instructions)
  link: string;                    // URL to agent profile, publisher page, etc.
  personalizationNotes: string;   // what to emphasize for this target (MSWL, comp alignment)
};

export type QueryTracker = {
  bookSlug: string;
  lastUpdated: string;             // ISO date
  targets: QueryTarget[];
};

export type QueryLetter = {
  targetName: string;
  targetSlug: string;              // slugified target name (filename without .md)
  filePath: string;                 // relative path: "source/query-letters/{slug}.md"
  content: string;                  // full markdown content
  generatedAt: string | null;       // ISO date if AI-generated
};
```

### 3. Add `IQueryService` interface in `src/domain/interfaces.ts`

Add import types for `QueryTracker`, `QueryTarget`, `QueryStatus`, `QueryLetter`, `StreamEvent` at the top (they may already be partially imported from `./types`).

Add after the existing service interfaces (e.g. after `IStatisticsService` or at the end):

```typescript
export interface IQueryService {
  /** Load and parse the query tracker file for a book. Returns empty tracker if file doesn't exist. */
  loadTracker(bookSlug: string): Promise<QueryTracker>;

  /** Save the full tracker back to source/query-tracker.md */
  saveTracker(bookSlug: string, tracker: QueryTracker): Promise<void>;

  /** Add a new submission target to the tracker */
  addTarget(bookSlug: string, target: Omit<QueryTarget, 'id' | 'queryLetterPath' | 'submittedDate' | 'responseDate'>): Promise<QueryTarget>;

  /** Update the status of a submission target */
  updateTargetStatus(bookSlug: string, targetId: string, status: QueryStatus, responseDate?: string): Promise<void>;

  /** Remove a target from the tracker (and delete its query letter if present) */
  removeTarget(bookSlug: string, targetId: string): Promise<void>;

  /** Generate a personalized query letter for a target via Quill agent. Streams response. */
  generateQueryLetter(bookSlug: string, targetId: string, onEvent: (event: StreamEvent) => void): Promise<QueryLetter>;

  /** List all query letter files for a book */
  listQueryLetters(bookSlug: string): Promise<QueryLetter[]>;

  /** Read a specific query letter file */
  readQueryLetter(bookSlug: string, targetSlug: string): Promise<string>;

  /** Save manually edited query letter content */
  saveQueryLetter(bookSlug: string, targetSlug: string, content: string): Promise<void>;
}
```

Make sure to add the needed imports at the top of `interfaces.ts`. The existing import block already imports from `./types` — add `QueryTarget`, `QueryStatus`, `QueryTracker`, `QueryLetter` to that import.

### 4. Add `PIPELINE_PHASES` entry in `src/domain/constants.ts`

In the `PIPELINE_PHASES` array (line ~77-92), add a new entry after `publish`:

```typescript
  { id: 'query-agents',       label: 'Query Agents',           agent: 'Quill',      description: 'Research agents and publishers, generate query letters, track submissions' },
```

So the array becomes (add as last element):

```typescript
export const PIPELINE_PHASES: { id: PipelinePhaseId; label: string; agent: AgentName | null; description: string }[] = [
  { id: 'pitch',              label: 'Story Pitch',           agent: 'Spark',      description: 'Discover and pitch your story concept' },
  // ... existing phases ...
  { id: 'publish',            label: 'Publish & Audit',       agent: 'Quill',      description: 'Audit outputs and prepare metadata' },
  { id: 'query-agents',       label: 'Query Agents',           agent: 'Quill',      description: 'Research agents and publishers, generate query letters, track submissions' },
];
```

### 5. Add `PHASE_OUTPUT_FILES` entry

In `src/domain/constants.ts`, after the `publish` entry in `PHASE_OUTPUT_FILES` (line ~107-118), add:

```typescript
  'query-agents':        ['source/query-tracker.md'],
```

### 6. Add Quill quick actions for query management

In `src/domain/constants.ts`, in the `AGENT_QUICK_ACTIONS` record, find `Quill` (line ~328-351). Add new quick actions after the existing ones:

```typescript
    { label: 'Analyze for queries', prompt: 'Read the manuscript, pitch, story bible, and metadata. Analyze the book\'s market position — genre, comp titles, themes, word count, and target audience. Identify the types of literary agents, publishers, or platforms that would be the best fit for this book. Write your analysis to source/query-analysis.md.' },
    { label: 'Find agents for this book', prompt: 'Read source/query-analysis.md if it exists, plus the pitch and story bible. Based on the book\'s genre, themes, and comp titles, identify 5-10 literary agents or publishers who represent or publish similar work. For each, note their name, agency/publisher, what they\'re looking for (based on MSWL or known preferences), and why this book is a fit. Write the list to source/query-research.md.' },
```

## Verification

1. Run `npx tsc --noEmit` — must pass with zero errors
2. Verify `PipelinePhaseId` includes `'query-agents'`
3. Verify `PIPELINE_PHASES` has 15 entries (was 14)
4. Verify `PHASE_OUTPUT_FILES` has an entry for `'query-agents'`
5. Verify `IQueryService` is exported from `src/domain/interfaces.ts`
6. Verify all new types are exported from `src/domain/types.ts`
7. Verify `src/domain/index.ts` re-exports them (it uses `export *` so it should)

## State Update

Update `prompts/session-program/program-019/STATE.md`:
- Set SESSION-01 status to `done`
- Add completion date
- Add handoff notes: types are ready for SESSION-02