# SESSION-05 — Website: Press + Contact Pages + Phase Summary (Phase 3c)

> **Program:** Novel Engine
> **Feature:** deployment-prep
> **Modules:** none (writes `docs/*.html` only)
> **Depends on:** SESSION-04 (sequential website updates)
> **Estimated effort:** ~25 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| — | `README.md` | Yes | Published books, quotes, feature list |
| — | `RELEASE_NOTES.md` | Yes | Release highlights for press kit |
| — | `CHANGELOG.md` | Yes | Counts for "By The Numbers" section |
| — | `package.json` | Yes | Version number |
| — | `docs/press.html` | Yes | Existing press page — update in place |
| — | `docs/contact.html` | Yes | Existing contact page — update in place |
| — | `docs/index.html` | Yes | Check consistency with SESSION-03 updates |
| — | `LICENSE` | Yes | License type for footer |
| — | `src/domain/constants.ts` | Yes | Agent count, pipeline phase count for "By The Numbers" |
| — | `src/main/ipc/handlers.ts` | Scan | IPC channel count for "By The Numbers" |
| — | `src/renderer/components/` | Scan | Component count for "By The Numbers" |

## Context

Final website session. Updates the press kit and contact pages, then produces the Phase Summary Report required by the deployment-prep prompt. After this session, all 6 HTML pages are updated and consistent.

Execute Step 3.5 (press.html) and Step 3.6 (contact.html) of the update-website prompt, then produce the Phase Summary Report from the deployment-prep prompt.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `docs/press.html` | Modify | Update: published books, differentiators, quotable lines, "By The Numbers" stats, version badge |
| `docs/contact.html` | Modify | Update: version badge, verify links and content accuracy |

## Implementation

### 1. Update `docs/press.html`

Key changes:
- **Version badge** in nav → match SESSION-01
- **Published Works**: verify book list and Amazon links match README (10 books listed)
- **What Makes This Different**: verify all differentiators still hold. Add new ones if applicable:
  - Query Manager (Quill can research agents/publicists and auto-populate queries)
  - Multi-provider support (Claude, Codex, Ollama, llama-server)
  - WebSearch across all providers
- **By The Numbers**: update stats:
  - Number of agents: count from `AGENT_REGISTRY` in `constants.ts` (should be 7)
  - Pipeline phases: count from `PIPELINE_PHASES` (should be 14)
  - IPC channels: count from `handlers.ts`
  - Published books: 10
  - Lines of code: approximate (count `.ts`/`.tsx` files)
- **Quotable Lines**: verify quotes still match README. Add new ones if the README's narrative changed.
- **Assets**: verify screenshot links still resolve
- **Contact**: verify email `john.paul.ruf@gmail.com` and GitHub link

### 2. Update `docs/contact.html`

Key changes:
- **Version badge** in nav → match SESSION-01
- **Get In Touch**: verify email, GitHub issues link
- **Contributing**: verify architecture.html link, contribution flow still accurate
- **Report a Bug**: verify GitHub issues link
- **Testers Wanted**: verify content matches README's testers callout
- **License**: verify license type (AGPL-3.0) and link to LICENSE file

### 3. Cross-Page Verification

After both pages are updated, verify across ALL 6 pages:
- [ ] Version badge is consistent on every page
- [ ] Nav links resolve correctly across all pages
- [ ] Footer is consistent across all pages
- [ ] No external JS dependencies on any page
- [ ] No tracking scripts on any page
- [ ] OG tags are unique and accurate per page
- [ ] `docs/architecture/*.md` files untouched
- [ ] `docs/og-image.png` untouched
- [ ] 10-book evaluation data preserved in `evaluation.html`
- [ ] Changelog page contains every `CHANGELOG.md` entry

### 4. Phase Summary Report

Produce the summary required by `prompts/meta/deployment-prep.md` (lines 103-132):

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

Output this report to the user as the final deliverable of the program.

### 5. Preserve

- **`docs/architecture/*.md` files**: do NOT modify
- **`docs/og-image.png`**: do NOT modify
- **No tracking scripts, no external JS CDNs**

## Verification

- `docs/press.html` exists and is valid HTML5
- `docs/contact.html` exists and is valid HTML5
- Version badge on both pages matches SESSION-01's suggested version
- All 6 HTML pages have consistent version badges
- All nav links across all 6 pages resolve
- Published books list on press.html matches README
- Email `john.paul.ruf@gmail.com` appears correctly on press.html and contact.html
- GitHub repo link `https://github.com/john-paul-ruf/novel-engine` is correct everywhere
- No `docs/architecture/*.md` files were modified
- `docs/og-image.png` untouched
- No external JS dependencies on any page
- No tracking scripts on any page
- Phase Summary Report produced

## State Update

Update `prompts/session-program/program-025/STATE.md`:
- Session 05 → `done`, date, notes
- Handoff Notes: final status, Phase Summary Report, any issues
- All sessions done → Final Report time