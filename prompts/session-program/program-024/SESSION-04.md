# SESSION-04 — Surface Silent Failures + Tracker Clobber Guard

> **Program:** Novel Engine
> **Feature:** query-tracker-parse-resilience
> **Modules:** M08 (application), M01 (domain)
> **Depends on:** SESSION-01 (uses the lenient parser as the detection baseline)
> **Estimated effort:** 25 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M08 | application | `src/application/QueryService.ts` | `researchTargets`, `loadTracker`, `saveTracker` |
| M01 | domain | `src/domain/types.ts` | `QueryResearchResult` type |

## Context

Two silent-failure modes remain even after SESSION-01/02/03:

1. **Invisible format failure.** In the bug run, the agent updated the tracker file but
   `researchTargets` (~line 193) parsed 0 new targets and returned
   `{ addedTargets: 0 }` as a *success*. The user saw "no results" with no hint that a
   9KB tracker full of content existed on disk.
2. **Data-loss clobber.** `loadTracker` (~line 27) returns an EMPTY tracker both when
   parsing yields no sections and when reading throws (the catch at ~line 35). Any
   mutation (`addTarget` ~46, `updateTargetStatus` ~64, `removeTarget` ~82) then calls
   `saveTracker` (~line 41), which re-serializes that empty/near-empty list and
   silently overwrites whatever was on disk.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/domain/types.ts` | Modify | Add optional `warning` to `QueryResearchResult` |
| `src/application/QueryService.ts` | Modify | Change-detection warning in `researchTargets`; archive-before-clobber in `saveTracker` |

## Implementation

### 1. Extend `QueryResearchResult` in `src/domain/types.ts`

Read the type first. Add:

```typescript
/** Set when the run finished abnormally — e.g. the tracker file changed on disk
 *  but no new targets could be parsed from it (format drift). */
warning?: string;
```

### 2. Detect changed-but-unparsed in `researchTargets` (QueryService, ~line 193)

Before sending the message, also capture the raw file content:

```typescript
const rawBefore = (await this.fs.fileExists(bookSlug, TRACKER_PATH))
  ? await this.fs.readFile(bookSlug, TRACKER_PATH)
  : '';
```

After the reload/diff (~line 224–231), add — BEFORE the return:

```typescript
const rawAfter = (await this.fs.fileExists(bookSlug, TRACKER_PATH))
  ? await this.fs.readFile(bookSlug, TRACKER_PATH)
  : '';

let warning: string | undefined;
if (newTargets.length === 0 && rawAfter.trim() !== rawBefore.trim()) {
  warning =
    'source/query-tracker.md was modified during research, but no new targets could ' +
    'be parsed from it. The agent may have used a non-standard heading format — open ' +
    'the file and check that entries look like "## [Name] — drafting".';
  onEvent({ type: 'status', message: warning });
  console.warn(`[QueryService] ${warning}`);
}
```

Include `warning` in the returned object. Do not throw — the file content is intact and
user-recoverable; an exception would suggest the research itself failed.

### 3. Archive-before-clobber in `saveTracker` (~line 41)

Replace the body with a guarded write. If the on-disk file is non-empty but parses to
ZERO targets while we are about to write a serialized tracker that did NOT come from
that content, the in-memory state cannot represent the file — archive first:

```typescript
async saveTracker(bookSlug: string, tracker: QueryTracker): Promise<void> {
  try {
    if (await this.fs.fileExists(bookSlug, TRACKER_PATH)) {
      const existing = await this.fs.readFile(bookSlug, TRACKER_PATH);
      const existingParsed = this.parseTrackerContent(bookSlug, existing);
      // Non-empty file that parses to 0 targets = unparseable content we would
      // otherwise destroy (serializeTracker only writes what's in memory).
      if (existing.trim().length > 0 && existingParsed.targets.length === 0) {
        const archivePath = `source/query-tracker-unparsed-${Date.now()}.md`;
        await this.fs.writeFile(bookSlug, archivePath, existing);
        console.warn(
          `[QueryService] query-tracker.md had unparseable content — archived to ${archivePath} before overwrite`,
        );
      }
    }
  } catch (err) {
    console.error('[QueryService] Clobber-guard check failed:', err);
  }
  const content = this.serializeTracker(tracker);
  await this.fs.writeFile(bookSlug, TRACKER_PATH, content);
}
```

Notes:
- With SESSION-01's lenient parser, `existingParsed.targets.length === 0` now means
  *genuinely* unparseable — bracket-less files no longer trip the guard.
- The guard must never block the save (wrap in try/catch as shown) — archiving is
  best-effort protection, not a gate.
- Confirm `IFileSystemService` exposes `fileExists`/`readFile`/`writeFile` with these
  signatures (read `src/domain/interfaces.ts`) — no interface changes expected.

### 4. Renderer surfacing (read-only check)

Find where `researchTargets`' result reaches the renderer (grep `addedTargets` in
`src/renderer/` and `src/main/ipc/`). If the store/component only shows a count, add the
`warning` string to the existing notification/status display — do NOT build new UI.
If surfacing requires more than ~15 lines, defer it: record the gap in Handoff Notes.

## Verification

1. `npx tsc --noEmit` — clean.
2. Manual: put junk prose (no headings) into a test book's `source/query-tracker.md`,
   add a target via the UI → junk is archived to `query-tracker-unparsed-*.md`, new file
   contains the added target, console shows the archive warning.
3. Architecture compliance: M08 depends only on `IFileSystemService`/`IChatService`
   interfaces; domain type change is additive/optional (no breaking callers).

## State Update

Update `prompts/session-program/program-024/STATE.md`: set SESSION-04 to `done`, add
completion date, note in Handoff Notes whether renderer surfacing was completed or deferred.
