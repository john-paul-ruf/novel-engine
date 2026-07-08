# SESSION-01 — Generate Release Notes

> **Program:** Novel Engine
> **Feature:** deployment-prep
> **Modules:** none modified (docs-only; reads git history + `CHANGELOG.md` + `package.json`)
> **Depends on:** nothing
> **Estimated effort:** 20 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| — | repo root | `CHANGELOG.md`, `package.json` | Primary sources for change descriptions and version |

## Context

This is **Phase 1** of the deployment-prep pipeline. The release notes produced here become source material for SESSION-02/03 (README) and SESSION-04–08 (website). Nothing else in the pipeline may start until this session is done.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `RELEASE_NOTES.md` | Create/Overwrite | Full release notes for the range last-tag → HEAD |

## Implementation

### 1. Execute the release-notes prompt in full

Read and execute `prompts/session-program/program-013/input-files/release-notes.md` (canonical copy: `prompts/meta/release-notes.md`) exactly as written:

1. Determine the range: `git describe --tags --abbrev=0` → `$LAST_TAG..HEAD`. **If zero commits since the last tag, STOP** — set this session and all downstream sessions to `skipped` in STATE.md with note "No changes since last tag", and report to the user.
2. Gather raw material: full commit log, `--stat`, `--name-status`, `CHANGELOG.md` entries on/after the tag date, `package.json` version.
3. Categorize every change into exactly one category (Features, Improvements, Bug Fixes, Infrastructure, Documentation, Refactoring, Breaking Changes) using the rules in the prompt.
4. Write `RELEASE_NOTES.md` at the repo root with the exact structure the prompt specifies (Highlights, categorized sections, Upgrade Notes, collapsible full commit log). Omit empty sections.
5. Suggest the next semver version with reasoning.

Follow all 9 Rules from the prompt — CHANGELOG.md is the primary source, group related commits, don't invent changes, read diffs when unsure.

## Verification

- [ ] `RELEASE_NOTES.md` exists at the repo root
- [ ] It has a valid `# Release Notes — vX.Y.Z` header
- [ ] At least one categorized change section is present
- [ ] No empty category sections
- [ ] Commit hashes are short (7 chars)
- [ ] A semver bump suggestion with reasoning was produced

## Completion Gate (from deployment-prep.md)

Confirm to the user before proceeding: the suggested version number, the highlights summary, and any breaking changes detected. **Only pause for approval if breaking changes need discussion** — otherwise report and keep moving.

## State Update

In `prompts/session-program/program-013/STATE.md`:
- Set SESSION-01 status to `done` with date
- Record in Handoff Notes: last tag, commit count, suggested version + bump type, breaking changes (if any), and the 2–4 sentence highlights summary — SESSION-02/03 and the website sessions consume these
