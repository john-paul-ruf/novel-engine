# SESSION-04 — Website: Changelog + Evaluation Pages (Phase 3b)

> **Program:** Novel Engine
> **Feature:** deployment-prep
> **Modules:** none (writes `docs/*.html` only)
> **Depends on:** SESSION-03 (sequential website updates)
> **Estimated effort:** ~30 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| — | `CHANGELOG.md` | Yes | Full changelog — 2,312 lines, must all be rendered |
| — | `RELEASE_NOTES.md` | Yes | Latest release notes (from SESSION-01) |
| — | `package.json` | Yes | Version number for nav badge |
| — | `docs/changelog.html` | Yes | Existing changelog page — update in place |
| — | `docs/evaluation.html` | Yes | Existing evaluation page — verify/preserve content |
| — | `docs/index.html` | Yes | Check nav/version consistency with SESSION-03 updates |

## Context

The changelog page must render every entry from the full `CHANGELOG.md` (2,312 lines, entries from project inception through today). The evaluation page contains the 10-book dual AI evaluation — this content must be preserved exactly.

Execute Step 3.2 (evaluation.html) and Step 3.4 (changelog.html) of the update-website prompt.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `docs/changelog.html` | Modify | Re-parse `CHANGELOG.md`, render every entry, update summary stats, update version badge |
| `docs/evaluation.html` | Verify | Content should not need changes — verify nav version badge matches, no broken links |

## Implementation

### 1. Update `docs/changelog.html`

#### 1a. Parse `CHANGELOG.md`

Read the full `CHANGELOG.md`. It has entries in this format:

```markdown
## [YYYY-MM-DD] — Short description

### Summary
...

### Added / Changed / Removed / Fixed
...

### Architecture Impact
...

### Migration Notes
...
```

Every entry must be rendered. Do not skip or summarize entries.

#### 1b. Summary Stats

Update the top-of-page stats:
- Total number of changelog entries (count `## [` headers)
- Date range (first entry date to latest)
- Categorized counts: features added, bugs fixed, architecture changes

#### 1c. Timeline View

- Entries grouped by date (or listed in reverse chronological order)
- Each entry: date header, summary paragraph, categorized bullet lists
- File paths rendered as `<code>` spans
- Architecture Impact and Migration Notes rendered if non-trivial
- Use `<details>/<summary>` for entries with many changes (optional — follow existing pattern in current `docs/changelog.html`)

#### 1d. Highlight Reel

Update if the existing page has one. Add new highlights from this release cycle (Query Manager, WebSearch, Codex hardening).

#### 1e. Version Badge

Update version badge in nav to match SESSION-01's suggested version.

### 2. Verify `docs/evaluation.html`

This page contains the 10-book dual AI evaluation. It should **not need content changes**. Verify:
- Nav version badge matches (update if needed)
- All links still resolve
- No content was accidentally modified
- OG tags are correct

If the only update needed is the version badge, make that single change.

### 3. Preserve

- **`docs/architecture/*.md` files**: do NOT modify
- **`docs/og-image.png`**: do NOT modify
- **10-book evaluation data**: preserve verbatim — every card, score, tier, review paragraph
- **No tracking scripts, no external JS CDNs**

## Verification

- `docs/changelog.html` exists and is valid HTML5
- The changelog page contains every entry from `CHANGELOG.md` — spot-check: latest entry, earliest entry, and 3 random entries all present
- Version badge matches SESSION-01's suggested version
- Summary stats are accurate (count entries manually to verify)
- `docs/evaluation.html` exists and all 10-book evaluation data is preserved
- Nav links resolve to real `.html` files
- No `docs/architecture/*.md` files were modified
- `docs/og-image.png` untouched
- No external JS dependencies
- No tracking scripts

## State Update

Update `prompts/session-program/program-025/STATE.md`:
- Session 04 → `done`, date, notes
- Handoff Notes: number of changelog entries rendered, evaluation page status
- SESSION-05 can now proceed (press + contact pages)