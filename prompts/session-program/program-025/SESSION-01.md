# SESSION-01 — Release Notes (Phase 1)

> **Program:** Novel Engine
> **Feature:** deployment-prep
> **Modules:** none (writes `RELEASE_NOTES.md` only)
> **Depends on:** nothing
> **Estimated effort:** ~25 min

## Module Context

No source modules are modified. This session reads git history and `CHANGELOG.md` only.

| ID | Module | Read | Why |
|----|--------|------|-----|
| — | CHANGELOG.md | Yes | Primary source of curated change descriptions |
| — | RELEASE_NOTES.md | Yes | Existing file (v0.8.0) — will be overwritten |
| — | package.json | Yes | Version check against last tag |

## Context

The last git tag is `v0.8.0` (tagged 2026-07-08). There are 33 commits since then. The existing `RELEASE_NOTES.md` already covers v0.8.0 → v0.7.0. This session generates a new `RELEASE_NOTES.md` covering everything since v0.8.0, to be tagged as the next release.

**Known discrepancy:** `package.json` version is `0.2.0` while the last tag is `v0.8.0`. The release-notes prompt says to compare and note this. Flag it in the output. The suggested version should follow from the semver logic, not the stale package.json.

Execute the full `prompts/meta/release-notes.md` prompt (copied to `prompts/session-program/program-025/input-files/release-notes.md`). Do not skip steps.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `RELEASE_NOTES.md` | Overwrite | New release notes for the next version since v0.8.0 |
| `docs/releases/vX.Y.Z-RELEASE_NOTES.md` | Create | Archive copy of the new release notes |

## Implementation

### 1. Determine the Range

```bash
LAST_TAG=$(git describe --tags --abbrev=0)
echo "Last tag: $LAST_TAG"
git tag -l "$LAST_TAG" --format='Tagged: %(creatordate:short) — %(subject)'
git log "$LAST_TAG"..HEAD --oneline | wc -l
```

If zero commits → stop. (Spoiler: there are 33.)

### 2. Gather Raw Material

Run all 5 commands from Step 2 of the release-notes prompt:

- **2a:** `git log v0.8.0..HEAD --pretty=format:"- %h %s (%an, %ad)" --date=short`
- **2b:** `git diff v0.8.0..HEAD --stat`
- **2c:** `git diff v0.8.0..HEAD --name-status`
- **2d:** Read `CHANGELOG.md` — extract all entries dated on or after 2026-07-08 (the v0.8.0 tag date). These are the primary source for descriptions.
- **2e:** `node -e "console.log(require('./package.json').version)"` — note the `0.2.0` vs `v0.8.0` discrepancy.

### 3. Categorize Changes

Sort every change into one of: Features, Improvements, Bug Fixes, Infrastructure, Documentation, Refactoring, Breaking Changes.

Key changes since v0.8.0 (33 commits):
- **Codex CLI error hardening** (6 commits) — envelope unwrap, error surfacing, retry, file-only detection, model resolution
- **Query Manager feature** (7 commits) — full Quill query-agent pipeline: domain types, QueryService, IPC, store, view, pipeline integration
- **WebSearch** (3 commits) — Ollama/llama-server web search, Codex standalone_web_search flag
- **Query auto-populate** (2 commits) — ResearchPanel, TargetCard AI buttons, auto-populate feature
- **Query research failure handling** (4 commits) — error event handling, non-document content guard, maxTurns override, UI surfacing
- **Query tracker parse resilience** (4 commits) — lenient parsing, prompt hardening, filesTouched tracking, clobber guard
- **YouTube demo** (1 commit)
- **Docs** (1 commit)

### 4. Write RELEASE_NOTES.md

Use the exact structure from Step 4 of the release-notes prompt. Omit empty sections. Link short commit hashes (7 chars). Group related commits into single bullets.

Save new release notes to `docs/releases/v{VERSION}-RELEASE_NOTES.md` as well (following the existing pattern in `docs/releases/`).

### 5. Version Suggestion

Based on the changes: multiple new features (Query Manager, WebSearch), bug fixes, improvements. No breaking changes detected. Suggest the appropriate semver bump.

State recommendation with reasoning.

## Verification

- `RELEASE_NOTES.md` exists at repo root with a valid version header
- At least one categorized change section has content
- Every commit hash is 7 characters and exists in the repo
- No empty sections remain
- `docs/releases/v{VERSION}-RELEASE_NOTES.md` matches `RELEASE_NOTES.md`
- The `package.json` version discrepancy is noted

## State Update

Update `prompts/session-program/program-025/STATE.md`:
- Session 01 → `done`, date, notes
- Handoff Notes: version suggested, highlights summary, breaking changes (if any), package.json discrepancy flagged
- SESSION-02 can now proceed