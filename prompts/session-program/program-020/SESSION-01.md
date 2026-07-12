# SESSION-01 — Release Notes Generation

> **Program:** Novel Engine
> **Feature:** deployment-prep
> **Modules:** None (documentation-only)
> **Depends on:** Nothing
> **Estimated effort:** 20–30 min

## Module Context

No source modules are modified. This session reads the git history, `CHANGELOG.md`, and `package.json` to produce `RELEASE_NOTES.md`.

| ID | Module | Read | Why |
|----|--------|------|-----|
| — | git repo | `git log`, `git diff`, `git tag` | Determine commit range and changes since last tag |
| — | `CHANGELOG.md` | Full read | Primary source of curated change descriptions |
| — | `package.json` | Version field | Compare current version to last tag version |

## Context

The last git tag is `v0.8.0` (2026-07-08). There are **15 commits** since that tag, spanning three feature/fix clusters:
1. **query-manager** (7 sessions) — new pipeline phase, domain types, QueryService, IPC, store, view, spine integration
2. **codex-stream-error-hardening** (3 sessions) — Codex envelope unwrap, error surfacing, bounded retry
3. **codex-file-only-completion** (2 sessions) — file-only success detection, unknown-event diagnostics
4. **codex-clean-exit-recovery** (3 sessions) — final-output fallback, tool/file tracking, model resolution guardrails

The current `package.json` version is `0.2.0` and the last tag was `v0.8.0`. These diverge — the release notes must note this discrepancy.

An existing `RELEASE_NOTES.md` exists at the repo root (for v0.8.0). It will be **overwritten** with the new release.

This session executes `prompts/meta/release-notes.md` in full. Read that prompt before starting.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `RELEASE_NOTES.md` | Overwrite | New release notes for the version after v0.8.0, covering all 15 commits since that tag |

## Implementation

### 1. Determine the Commit Range

```bash
LAST_TAG=$(git describe --tags --abbrev=0)
echo "Last tag: $LAST_TAG"
git tag -l "$LAST_TAG" --format='Tagged: %(creatordate:short) — %(subject)'
git log "$LAST_TAG"..HEAD --oneline | wc -l
```

If zero commits, stop and report. (There are 15 — proceed.)

### 2. Gather Raw Material

Run all of these and collect output:

```bash
# Full commit log
git log "$LAST_TAG"..HEAD --pretty=format:"- %h %s (%an, %ad)" --date=short

# Files changed (stat summary)
git diff "$LAST_TAG"..HEAD --stat

# File change names (for categorization)
git diff "$LAST_TAG"..HEAD --name-status

# Package version
node -e "console.log(require('./package.json').version)"
```

Then read `CHANGELOG.md` and extract every entry dated on or after the `v0.8.0` tag date (2026-07-08). These are the primary source of curated descriptions. The commit log fills gaps the changelog missed.

### 3. Categorize All Changes

Sort every change into exactly one category per the table in `prompts/meta/release-notes.md`:

| Category | What belongs |
|----------|-------------|
| **Features** | New user-facing capabilities (query-manager feature, Query Manager view, query-agents pipeline phase) |
| **Improvements** | Enhancements to existing features (Codex error hardening, better diagnostics) |
| **Bug Fixes** | Things that were broken (file-only completion detection, silent Codex exits, clean-exit recovery) |
| **Infrastructure** | None expected this release |
| **Documentation** | Architecture doc updates, CHANGELOG entries |
| **Refactoring** | Internal restructuring with no user-facing change |
| **Breaking Changes** | Schema changes, IPC renames, API surface changes (check `src/domain/types.ts`, `src/domain/interfaces.ts`, `src/main/ipc/handlers.ts`, `src/preload/index.ts` diffs) |

**Categorization rules:**
- Commits touching `src/renderer/components/QueryManager/` → **Feature** (new component)
- Commits touching `src/infrastructure/codex-cli/CodexCliClient.ts` → **Bug Fix** or **Improvement** depending on commit message
- Commits only touching `docs/`, `CHANGELOG.md`, `prompts/` → **Documentation**
- Check for DB schema changes in `src/infrastructure/database/schema.ts` → **Breaking Changes**
- Check for IPC channel additions in `src/main/ipc/handlers.ts` and `src/preload/index.ts` → note in **Features** (new `query:*` channels)

### 4. Write `RELEASE_NOTES.md`

Write to repo root with this structure (from `prompts/meta/release-notes.md`):

```markdown
# Release Notes — vX.Y.Z

**Previous release:** v0.8.0 (2026-07-08)
**This release:** vX.Y.Z (2026-07-12)
**Commits:** 15 | **Files changed:** 60 | **Contributors:** the.phoenix, John Paul Ruf

---

## Highlights

> 2–4 sentence summary. What can users do now? What's noticeably better?
> Key items: query manager feature (track submission targets, generate query letters),
> Codex CLI error hardening (no more silent exits, bounded retries on transient failures).

---

## Features

- **Query Manager** — New `query-agents` pipeline phase + standalone Query Manager view. Track submission targets (agents, publishers, platforms), generate personalized AI query letters per target, monitor submission lifecycle. (#4d8e36e … #64b19b0)

## Improvements

- ...

## Bug Fixes

- ...

## Breaking Changes
(omit section if none — check for schema/IPC renames/API surface changes)

---

## Upgrade Notes

1. ... or "No special upgrade steps required. Pull and rebuild."

---

## Full Commit Log

<details>
<summary>All 15 commits since v0.8.0</summary>

(paste full git log)

</details>
```

**Rules from the prompt:**
1. `CHANGELOG.md` is primary source — use its descriptions
2. Commits fill gaps the changelog missed
3. Group related commits — five commits fixing the same feature = one bullet
4. No empty sections — omit if nothing fits
5. Highlights are for humans, not a git log
6. Link commit hashes (7 chars, clickable on GitHub)
7. Be honest about breaking changes
8. Don't invent changes — read diffs if unsure
9. Overwrite existing `RELEASE_NOTES.md`

### 5. Version Suggestion

Based on the changes, suggest the next semver:

- **Patch** — Only bug fixes, docs, refactoring, no new features
- **Minor** — New features (query-manager), improvements, no breaking changes
- **Major** — Breaking changes (schema migrations, renamed IPC channels)

The query-manager feature adds new IPC channels, a new pipeline phase, new domain types — but doesn't break existing behavior. State your recommendation with reasoning.

## Verification

1. `RELEASE_NOTES.md` exists at the repo root
2. Has a valid version header: `# Release Notes — vX.Y.Z`
3. Previous release line: `**Previous release:** v0.8.0 (2026-07-08)`
4. At least one categorized change section (Features, Improvements, Bug Fixes)
5. No empty sections (omit categories with no entries)
6. All commit hashes are 7-character short hashes
7. Full commit log section contains all 15 commits in a `<details>` block
8. Version suggestion with reasoning is stated
9. Every claim can be traced to a commit or `CHANGELOG.md` entry

## State Update

Update `prompts/session-program/program-020/STATE.md`:
- Set SESSION-01 status to `done`
- Add completion date
- Add handoff notes: version number suggested, highlights summary, any breaking changes detected
- Carry forward: the suggested version number, the highlights summary, and the categorization — these feed SESSION-02 (README accuracy) and SESSION-03 (website content)