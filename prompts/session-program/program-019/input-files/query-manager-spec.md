# Query Manager — Feature Specification

## Source
Derived from a user conversation about adding a "Query Agents" stage that analyzes the novel, finds appropriate agents, creates personalized query letters, and submits them after user approval, plus a full query tracking manager.

## Core Intent
Add a query management system that lets authors research submission targets (agents, publishers, self-publishing platforms), generate personalized AI-tailored query letters per target, track submission status through the full lifecycle, and persist everything alongside the book.

## Decisions (from user Q&A)

1. **Scope of targets:** Literary agents + publishers + self-publishing platforms
2. **Storage:** Per-book markdown files in `source/`
3. **Pipeline integration:** New pipeline phase after `publish` that unlocks a standalone view
4. **Statuses:** Drafting, Queried, Partial Request (pages), Full Request, Offer, Rejected, Withdrawn
5. **Query letter generation:** Personalized per-agent query letters — AI tailors each one

## Feature Details

### Pipeline Phase
- New phase: `query-agents` (after `publish`)
- Agent: `Quill` (publisher agent, already has query letter quick actions)
- Detection file: `source/query-tracker.md` (existence = phase complete)
- Phase output: `source/query-tracker.md`

### Query Tracker File Format
A single markdown file `source/query-tracker.md` per book containing structured front matter and an entry per submission target:

```markdown
---
last_updated: 2026-07-12
total_targets: 5
by_status:
  drafting: 2
  queried: 1
  full-request: 1
  rejected: 1
---

# Query Tracker — {Book Title}

## [Target Name] — {Status}
- **Type:** Agent | Publisher | Platform
- **Contact:** email@address or submission URL
- **Submitted:** 2026-07-10
- **Method:** Email | Form | QueryManager
- **Sent:** query-letter-{slug}.md
- **Personalization:** Expected based on comp titles, MSWL, etc.
- **Response:** No response | Partial request | Full request | Offer | Rejected
- **Response Date:**
- **Notes:** Exclusivity 60 days, no multiple queries
- **Link:** https://...

## [Next Target] — {Status}
...
```

### Per-Target Query Letters
Individual personalized query letters saved as `source/query-letters/{target-slug}.md`.

### Application Layer — QueryService
New service `QueryService` in `src/application/`:

- `loadTracker(bookSlug)` → Parse `source/query-tracker.md`, return structured `QueryTracker` object
- `saveTracker(bookSlug, tracker)` → Write back to file
- `addTarget(bookSlug, target)` → Add a new submission target entry
- `updateTargetStatus(bookSlug, targetId, status)` → Update status, re-write file
- `removeTarget(bookSlug, targetId)` → Remove a target entry
- `generateQueryLetter(bookSlug, targetId)` → AI-generate a personalized query letter for the target
- `listQueryLetters(bookSlug)` → List all generated query letters

### Domain Types
New types in `src/domain/types.ts`:

- `QueryTargetType` — `'agent' | 'publisher' | 'platform'`
- `QueryStatus` — `'drafting' | 'queried' | 'partial-request' | 'full-request' | 'offer' | 'rejected' | 'withdrawn'`
- `QuerySubmissionMethod` — `'email' | 'form' | 'query-manager' | 'other'`
- `QueryTarget` — `{ id, name, type, contact, method, status, queryLetterPath, submittedDate, responseDate, notes, link, personalizationNotes }`
- `QueryTracker` — `{ bookSlug, lastUpdated, targets, totalTargets, byStatus }`

### IPC Channels
- `query:loadTracker` — Load tracker for a book
- `query:saveTracker` — Save tracker
- `query:addTarget` — Add a target
- `query:updateTargetStatus` — Update target status
- `query:removeTarget` — Remove a target
- `query:generateLetter` — Generate personalized query letter (streams via existing stream infrastructure)
- `query:listLetters` — List all query letters for a book
- `query:readLetter` — Read a specific query letter
- `query:saveLetter` — Save manually edited query letter

### Preload Bridge
New `query` namespace on `window.novelEngine`.

### Renderer
- New Zustand store: `queryStore`
- New view: `QueryManagerView` (standalone, accessible from IconRail)
- ViewID: `'query-manager'` added to viewStore
- Pipeline phase `query-agents` in the PipelineSpine, clicking it navigates to the QueryManagerView
- New `FilterBar` component with three filter dimensions:
  - **Method filter:** Email Only, Website Only, Query Manager Only, Other
  - **Status filter:** All 7 statuses (Drafting, Queried, Partial Request, Full Request, Offer, Rejected, Withdrawn)
  - **Type filter:** Agents, Publishers, Platforms
  - Filters are purely UI-level (useState in QueryManagerView), no backend changes
  - Stats summary always reflects ALL targets (ignoring active filters)
  - "Clear filters" button appears when any filter is active
  - Empty state shown when filters yield no results

### Agent Prompt
- Update `QUILL.md` to include a Phase 6 for query letter generation
- Quill already has query letter and synopsis quick actions — extend the prompt for per-target personalization