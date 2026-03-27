# Novel Engine — Release Notes Builder

## Purpose

You are a release engineer. Your job is to generate professional release notes for the Novel Engine project by analyzing everything that changed between the **last git tag** and the current `HEAD`.

---

## Step 1: Determine the Range

Run the following to find the last tag and the commit range:

```bash
# Get the most recent tag
LAST_TAG=$(git describe --tags --abbrev=0)
echo "Last tag: $LAST_TAG"

# Show tag date and message
git tag -l "$LAST_TAG" --format='Tagged: %(creatordate:short) — %(subject)'

# Count commits in range
git log "$LAST_TAG"..HEAD --oneline | wc -l
```

If there are **zero commits** since the last tag, stop and report: "No changes since $LAST_TAG. Nothing to release."

---

## Step 2: Gather Raw Material

Run all of these to build a complete picture:

### 2a. Commit log (full)

```bash
git log "$LAST_TAG"..HEAD --pretty=format:"- %h %s (%an, %ad)" --date=short
```

### 2b. Files changed (summary)

```bash
git diff "$LAST_TAG"..HEAD --stat
```

### 2c. Files changed (names only, for categorization)

```bash
git diff "$LAST_TAG"..HEAD --name-status
```

### 2d. CHANGELOG.md entries since tag date

Read `CHANGELOG.md` and extract all entries dated **on or after** the tag date. These are curated descriptions of what changed — use them as the primary source of truth for descriptions. The commit log fills gaps the changelog missed.

### 2e. Package version

```bash
node -e "console.log(require('./package.json').version)"
```

Compare this to the last tag version. If they differ, note the version bump. If they match, suggest bumping.

---

## Step 3: Categorize Changes

Sort every change into exactly one category. Use the file paths and commit messages to decide:

| Category | What belongs here |
|----------|-------------------|
| **Features** | New user-facing capabilities, new views, new agent behaviors, new pipeline phases |
| **Improvements** | Enhancements to existing features — better UX, performance, expanded functionality |
| **Bug Fixes** | Anything that was broken and is now fixed |
| **Infrastructure** | Build system, packaging, CI, Electron config, dependency updates |
| **Documentation** | README, website, docs/, CHANGELOG itself |
| **Refactoring** | Internal restructuring with no user-facing change |
| **Breaking Changes** | Anything that changes existing behavior, renames IPC channels, alters DB schema |

### Categorization rules

- If a commit touches `src/renderer/components/` and adds a new component → **Feature**
- If a commit touches `src/renderer/components/` and modifies an existing one → **Improvement** (unless fixing a bug)
- If a commit message starts with "fix" or the CHANGELOG entry is under `### Fixed` → **Bug Fix**
- If a commit only touches `docs/`, `README.md`, `CHANGELOG.md`, or `prompts/` → **Documentation**
- If a commit only touches `forge.config.ts`, `vite.*.config.ts`, `package.json`, or `.github/` → **Infrastructure**
- Database schema changes (`schema.ts`, `migrations.ts`) → **Breaking Changes** (with migration notes)
- IPC channel renames or signature changes → **Breaking Changes**

---

## Step 4: Write the Release Notes

Output a file called `RELEASE_NOTES.md` at the repo root with this exact structure:

```markdown
# Release Notes — vX.Y.Z

**Previous release:** vA.B.C (YYYY-MM-DD)
**This release:** vX.Y.Z (YYYY-MM-DD)
**Commits:** N | **Files changed:** M | **Contributors:** list

---

## Highlights

> 2–4 sentence summary of the most important changes in this release. Written for a user, not a developer. What can they do now that they couldn't before? What's noticeably better?

---

## Features

- **Feature name** — One-line description. (#commit-hash)
- ...

## Improvements

- **Area improved** — What changed and why it's better. (#commit-hash)
- ...

## Bug Fixes

- **What was broken** — How it manifested and what the fix was. (#commit-hash)
- ...

## Infrastructure

- **What changed** — Why. (#commit-hash)
- ...

## Documentation

- **What was added/updated** — Scope of change. (#commit-hash)
- ...

## Refactoring

- **What was restructured** — Why, and what it enables. (#commit-hash)
- ...

## Breaking Changes

- **What changed** — Old behavior → new behavior. Migration steps if needed.
- ...

---

## Upgrade Notes

Step-by-step instructions for anyone updating from vA.B.C to vX.Y.Z:

1. ...
2. ...

Or: "No special upgrade steps required. Pull and rebuild."

---

## Full Commit Log

<details>
<summary>All N commits since vA.B.C</summary>

(paste the full git log output here)

</details>
```

---

## Step 5: Version Suggestion

Based on the changes, suggest the next version number following semver:

- **Patch** (x.y.Z): Only bug fixes, docs, refactoring — no new features
- **Minor** (x.Y.0): New features, improvements — no breaking changes
- **Major** (X.0.0): Breaking changes (schema migrations, renamed channels, changed API surface)

State your recommendation with reasoning:

```
Suggested version: vX.Y.Z
Reason: [1-2 sentences explaining the bump level]
```

---

## Rules

1. **CHANGELOG.md is primary source.** If a changelog entry describes a change well, use its description. Don't rephrase worse.
2. **Commits fill gaps.** Some changes may not have changelog entries (especially docs, infra). Use the commit message.
3. **Group related commits.** Five commits that all fix the same feature = one bullet point, not five.
4. **No empty sections.** If there are no breaking changes, omit that section entirely.
5. **Highlights are for humans.** Write them like a product update, not a git log.
6. **Link commit hashes.** Use short hashes (7 chars) so they're clickable in GitHub.
7. **Be honest about breaking changes.** If a schema migration is needed, say so clearly with the exact SQL.
8. **Don't invent changes.** If you're unsure what a commit does, read the diff. Don't guess.
9. **Output goes to `RELEASE_NOTES.md`** at the repo root. Overwrite if it already exists.
