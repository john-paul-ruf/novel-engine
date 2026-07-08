# SESSION-08 — Site-Wide Verification + Deployment Prep Report

> **Program:** Novel Engine
> **Feature:** deployment-prep
> **Modules:** none (fix-ups limited to `docs/*.html`, `README.md`, `RELEASE_NOTES.md`)
> **Depends on:** SESSION-05, SESSION-06, SESSION-07
> **Estimated effort:** 25 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| — | docs | all 6 `docs/*.html` pages | Cross-page verification |
| — | repo root | `README.md`, `RELEASE_NOTES.md`, `CHANGELOG.md`, `package.json` | Consistency checks |
| — | input | `input-files/update-website.md` Step 8, `input-files/deployment-prep.md` | Verification lists + report template |

## Context

Final session. The three phases produced artifacts independently; this session verifies the whole set is **mutually consistent** (the point of deployment-prep's ordering) and produces the pipeline's summary report. Small fix-ups (a broken link, a stale version string) are done here; anything structural reopens the owning session instead.

## Implementation

### 1. Run update-website.md Step 8 — all 16 checks

1. All 6 HTML files exist in `docs/` (`index`, `evaluation`, `architecture`, `changelog`, `press`, `contact`)
2. Every nav link points to a real page with correct relative paths
3. All internal cross-page links resolve (e.g., index "Read the Evaluation" → `evaluation.html`)
4. 10-book evaluation data in `evaluation.html` identical to the pre-SESSION-05 `docs/index.html` (compare against `git show HEAD:docs/index.html` if index was already replaced, or the SESSION-04 commit)
5. No external JS dependencies anywhere
6. Version number on every page matches `package.json`
7. All Amazon book links from README present and correct
8. GitHub repo link correct: `https://github.com/john-paul-ruf/novel-engine`
9. Contact email correct: `john.paul.ruf@gmail.com`
10. Screenshot references resolve (test the chosen URL pattern)
11. Every page has unique, accurate OG tags
12. Mobile nav (hamburger) works on every page
13. No `docs/architecture/*.md` modified or deleted
14. `docs/og-image.png` untouched
15. No tracking scripts, analytics, or cookies
16. `changelog.html` contains every entry from `CHANGELOG.md`

Useful spot checks: `grep -L 'og:title' docs/*.html` (must be empty), `grep -l 'src="http' docs/*.html` (inspect any hits), `grep -c` version string across pages.

### 2. Cross-phase consistency

- [ ] Website agent/pipeline/feature claims match the SESSION-03 README
- [ ] README reflects all changes in `RELEASE_NOTES.md`
- [ ] Version consistent across `package.json`, `RELEASE_NOTES.md` suggestion, and site badges

### 3. Produce the Phase Summary Report

Output the **Deployment Prep — Complete** report exactly per the template in `deployment-prep.md`: Release Notes (version, bump type, change counts), README (features added/removed, sections updated), Website (pages updated, notable new content), and the **Ready to Ship** checklist (review RELEASE_NOTES.md, review README diff, preview `docs/index.html` locally, `git tag vX.Y.Z`, `git push origin main --tags`). Fill every field from STATE.md Handoff Notes and the actual artifacts — no placeholders.

## Verification

- [ ] All 16 Step-8 checks pass (list any fixed during this session)
- [ ] Cross-phase consistency checks pass
- [ ] Summary report delivered to the user with the Ready to Ship checklist

## State Update

Set SESSION-08 to `done`. Mark the feature complete in STATE.md. Handoff Notes: any checks that required fix-ups, and any items deliberately left for the user (e.g., tagging the release).
