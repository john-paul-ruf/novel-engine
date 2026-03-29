# SESSION-01 — Release Notes

> **Phase:** 1 of 3
> **Depends on:** Nothing
> **Produces:** `RELEASE_NOTES.md` at repo root
> **Source prompt:** `prompts/session-program/program-006/input-files/release-notes.md`

---

## Objective

Generate professional release notes by analyzing everything that changed between the last git tag and the current `HEAD`. This output feeds SESSION-02 (README update) and SESSION-03 (website rebuild).

---

## Steps

### 1. Determine the Range

```bash
# Get the most recent tag
LAST_TAG=$(git describe --tags --abbrev=0)
echo "Last tag: $LAST_TAG"

# Show tag date and message
git tag -l "$LAST_TAG" --format='Tagged: %(creatordate:short) — %(subject)'

# Count commits in range
git log "$LAST_TAG"..HEAD --oneline | wc -l
```

If there are **zero commits** since the last tag, **STOP** and report: "No changes since $LAST_TAG. Nothing to release." Update STATE.md and halt the program.

---

### 2. Gather Raw Material

Run all of these to build a complete picture:

**2a. Commit log (full):**
```bash
git log "$LAST_TAG"..HEAD --pretty=format:"- %h %s (%an, %ad)" --date=short
```

**2b. Files changed (summary):**
```bash
git diff "$LAST_TAG"..HEAD --stat
```

**2c. Files changed (names only, for categorization):**
```bash
git diff "$LAST_TAG"..HEAD --name-status
```

**2d. CHANGELOG.md entries since tag date:**
Read `CHANGELOG.md` and extract all entries dated on or after the tag date. These are curated descriptions — use them as the primary source of truth. The commit log fills gaps the changelog missed.

**2e. Package version:**
```bash
node -e "console.log(require('./package.json').version)"
```

Compare to the last tag version. If they differ, note the version bump. If they match, suggest bumping.

---

### 3. Categorize Changes

Sort every change into exactly one category:

| Category | What belongs here |
|----------|-------------------|
| **Features** | New user-facing capabilities, new views, new agent behaviors, new pipeline phases |
| **Improvements** | Enhancements to existing features — better UX, performance, expanded functionality |
| **Bug Fixes** | Anything that was broken and is now fixed |
| **Infrastructure** | Build system, packaging, CI, Electron config, dependency updates |
| **Documentation** | README, website, docs/, CHANGELOG itself |
| **Refactoring** | Internal restructuring with no user-facing change |
| **Breaking Changes** | Anything that changes existing behavior, renames IPC channels, alters DB schema |

#### Categorization rules

- Commit touches `src/renderer/components/` + adds new component → **Feature**
- Commit touches `src/renderer/components/` + modifies existing → **Improvement** (unless fixing a bug)
- Commit message starts with "fix" or CHANGELOG entry under `### Fixed` → **Bug Fix**
- Commit only touches `docs/`, `README.md`, `CHANGELOG.md`, or `prompts/` → **Documentation**
- Commit only touches `forge.config.ts`, `vite.*.config.ts`, `package.json`, or `.github/` → **Infrastructure**
- Database schema changes (`schema.ts`, `migrations.ts`) → **Breaking Changes** (with migration notes)
- IPC channel renames or signature changes → **Breaking Changes**

---

### 4. Write RELEASE_NOTES.md

Output `RELEASE_NOTES.md` at the repo root with this structure:

```markdown
# Release Notes — vX.Y.Z

**Previous release:** vA.B.C (YYYY-MM-DD)
**This release:** vX.Y.Z (YYYY-MM-DD)
**Commits:** N | **Files changed:** M | **Contributors:** list

---

## Highlights

> 2-4 sentence summary for users. What can they do now that they couldn't before?

---

## Features
- **Feature name** — One-line description. (#commit-hash)

## Improvements
- **Area improved** — What changed and why it's better. (#commit-hash)

## Bug Fixes
- **What was broken** — How it manifested and what the fix was. (#commit-hash)

## Infrastructure
- **What changed** — Why. (#commit-hash)

## Documentation
- **What was added/updated** — Scope of change. (#commit-hash)

## Refactoring
- **What was restructured** — Why, and what it enables. (#commit-hash)

## Breaking Changes
- **What changed** — Old behavior → new behavior. Migration steps if needed.

---

## Upgrade Notes
Step-by-step or "No special upgrade steps required. Pull and rebuild."

---

## Full Commit Log
<details>
<summary>All N commits since vA.B.C</summary>
(full git log)
</details>
```

#### Writing rules

- CHANGELOG.md is primary source — don't rephrase worse
- Group related commits into single bullets
- Omit empty sections entirely
- Highlights are for humans, not developers
- Use short hashes (7 chars)
- Be honest about breaking changes — include exact SQL for schema migrations
- Don't invent changes — read the diff if unsure

---

### 5. Version Suggestion

Recommend the next version following semver:

- **Patch** (x.y.Z): Only bug fixes, docs, refactoring
- **Minor** (x.Y.0): New features, improvements, no breaking changes
- **Major** (X.0.0): Breaking changes

State recommendation with reasoning.

---

## Completion Gate

`RELEASE_NOTES.md` exists at repo root with:
- A valid version header
- At least one categorized change section
- Highlights summary
- Full commit log in collapsible section

---

## Report to User Before Proceeding

Confirm:
- The suggested version number
- The highlights summary
- Any breaking changes detected

Then proceed to SESSION-02 unless there are breaking changes that need discussion.

---

## Update STATE.md

After completion, update STATE.md with:
- SESSION-01 status → `complete`
- SESSION-02 status → `pending` (unblocked)
- Carry-forward context: version, previous version, commit count, highlights, breaking changes, bump type
