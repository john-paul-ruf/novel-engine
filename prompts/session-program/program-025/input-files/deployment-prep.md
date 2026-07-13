# Deployment Prep — Release Pipeline

> **Purpose:** Execute the full pre-deployment pipeline in strict sequential order: generate release notes, perform a deep README update, then rebuild the project website. Each phase depends on the output of the previous one.
>
> **Input:** The current state of the repo (commits since last tag, source code, existing docs).
> **Output:** Updated `RELEASE_NOTES.md`, rewritten `README.md`, and rebuilt `docs/*.html` pages — all consistent with each other and the current codebase.

---

## Why This Order Matters

The three phases form a data dependency chain:

1. **Release Notes** analyze the git history and produce a structured summary of what changed. This becomes source material for the next two phases.
2. **README Deep Update** reads the full codebase (including the fresh release notes) and rewrites the README to reflect current reality. The README is a primary input for the website.
3. **Update Website** reads the README, changelog, architecture docs, and release notes to rebuild all HTML pages. It must run last because it consumes everything the first two phases produce.

Running them out of order means the website describes a README that doesn't exist yet, or the README misses changes the release notes just cataloged.

---

## Phase 1: Release Notes

Execute the full `prompts/meta/release-notes.md` prompt.

### What it does
- Determines the commit range since the last git tag
- Gathers commit log, file changes, changelog entries, and package version
- Categorizes all changes (features, improvements, bug fixes, infrastructure, docs, refactoring, breaking changes)
- Writes `RELEASE_NOTES.md` at the repo root
- Suggests a semver version bump

### Completion gate
`RELEASE_NOTES.md` exists at the repo root with a valid version header and at least one categorized change section.

### Before moving on
Confirm to the user:
- The suggested version number
- The highlights summary
- Any breaking changes detected

Then proceed to Phase 2. Do not wait for user approval unless there are breaking changes that need discussion.

---

## Phase 2: README Deep Update

Execute the full `prompts/meta/readme-deep-update.md` prompt.

### What it does
- Reads the entire source tree: domain types, infrastructure, application services, main process, renderer, configs, agents
- Verifies every feature claim against actual code
- Discovers new features not in the current README
- Removes phantom features that no longer exist
- Rewrites `README.md` with the "build books, not write them" narrative
- Preserves the Heads Up, Dedication, and Contact sections verbatim

### Completion gate
`README.md` has been rewritten and passes the verification checklist from the prompt:
- Every agent matches `constants.ts`
- Every pipeline phase matches detection logic
- Every npm script exists in `package.json`
- Every feature described has corresponding source code
- No phantom features remain

### Before moving on
Confirm to the user:
- Number of features added vs removed
- Any significant narrative changes
- The updated technology stack table

Then proceed to Phase 3.

---

## Phase 3: Update Website

Execute the full `prompts/meta/update-website.md` prompt.

### What it does
- Reads README, CHANGELOG, architecture docs, release notes, package.json, screenshots
- Builds or updates all 6 HTML pages in `docs/`:
  - `index.html` — Landing page
  - `evaluation.html` — 10-book evaluation (migrated content)
  - `architecture.html` — Technical deep dive
  - `changelog.html` — Full formatted changelog
  - `press.html` — Press kit
  - `contact.html` — Contact & contributing
- Maintains the shared design system (colors, typography, nav, footer)
- Preserves `docs/architecture/*.md` and `docs/og-image.png` untouched

### Completion gate
All 6 HTML files exist in `docs/` and:
- Nav links resolve correctly across all pages
- Version number matches `package.json` on every page
- Changelog page contains every entry from `CHANGELOG.md`
- 10-book evaluation data is preserved verbatim
- No external JS dependencies
- No tracking scripts

---

## Phase Summary Report

After all three phases complete, produce a summary:

```
## Deployment Prep — Complete

### Release Notes (Phase 1)
- Version: vX.Y.Z (bump type: patch/minor/major)
- Changes: N features, N improvements, N fixes, N breaking
- File: RELEASE_NOTES.md

### README (Phase 2)
- Features added: [list]
- Features removed: [list]
- Sections updated: [list]
- File: README.md

### Website (Phase 3)
- Pages updated: [list of 6 HTML files]
- New content: [notable additions]
- File: docs/*.html

### Ready to Ship
- [ ] Review RELEASE_NOTES.md
- [ ] Review README.md diff
- [ ] Preview docs/index.html locally
- [ ] Tag the release: git tag vX.Y.Z
- [ ] Push: git push origin main --tags
```

---

## Rules

1. **Execute phases in order.** Never start Phase 2 before Phase 1 is complete. Never start Phase 3 before Phase 2 is complete.
2. **Each phase follows its own prompt fully.** Don't skip steps within a phase. The sub-prompts are detailed for a reason.
3. **Don't fabricate.** Every claim in every output must be verified against source code.
4. **Carry context forward.** Information discovered in Phase 1 (version, changes) feeds Phase 2 (README accuracy) which feeds Phase 3 (website content). Use what you learned.
5. **Report, don't block.** Brief the user between phases but keep moving unless there's a genuine decision point (like a breaking change requiring migration notes).
6. **Respect the sub-prompts.** This meta-prompt orchestrates — it doesn't override. If `release-notes.md` says to check for zero commits and stop, stop. If `readme-deep-update.md` says to preserve the Dedication section, preserve it.
