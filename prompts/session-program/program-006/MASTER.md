# MASTER — Deployment Prep: Release Pipeline

> **Program:** Deployment Prep
> **Purpose:** Execute the full pre-deployment pipeline in strict sequential order: generate release notes, perform a deep README update, then rebuild the project website.
> **Sessions:** 3 (strictly sequential — each phase depends on the output of the previous one)

---

## Data Dependency Chain

```
SESSION-01 (Release Notes)
    ↓ produces RELEASE_NOTES.md
SESSION-02 (README Deep Update)
    ↓ reads RELEASE_NOTES.md, full codebase → produces README.md
SESSION-03 (Update Website)
    ↓ reads README.md, RELEASE_NOTES.md, CHANGELOG.md, architecture docs → produces docs/*.html
```

Running them out of order means the website describes a README that doesn't exist yet, or the README misses changes the release notes just cataloged.

---

## State Tracking

Current state is tracked in:
- [STATE.md](prompts/session-program/program-006/STATE.md)

---

## Session Index

| Session | Title | Depends On | Produces | Status |
|---------|-------|------------|----------|--------|
| [SESSION-01](prompts/session-program/program-006/SESSION-01.md) | Release Notes | — | `RELEASE_NOTES.md` | pending |
| [SESSION-02](prompts/session-program/program-006/SESSION-02.md) | README Deep Update | SESSION-01 | `README.md` | pending |
| [SESSION-03](prompts/session-program/program-006/SESSION-03.md) | Update Website | SESSION-01, SESSION-02 | `docs/*.html` (6 pages) | pending |

---

## Completion Gate

All three phases are complete when:

1. `RELEASE_NOTES.md` exists at repo root with a valid version header and categorized changes
2. `README.md` has been rewritten and passes verification (agents match constants.ts, pipeline phases match detection logic, npm scripts exist, no phantom features)
3. All 6 HTML files exist in `docs/` with correct nav links, matching version numbers, preserved evaluation data, and no external JS dependencies

---

## Rules

1. **Execute phases in order.** Never start SESSION-02 before SESSION-01 is complete. Never start SESSION-03 before SESSION-02 is complete.
2. **Each session follows its source prompt fully.** Don't skip steps. The sub-prompts are detailed for a reason.
3. **Don't fabricate.** Every claim in every output must be verified against source code.
4. **Carry context forward.** Information discovered in SESSION-01 (version, changes) feeds SESSION-02 (README accuracy) which feeds SESSION-03 (website content).
5. **Report, don't block.** Brief the user between sessions but keep moving unless there's a genuine decision point (like a breaking change requiring migration notes).
6. **Respect the sub-prompts.** This program orchestrates — it doesn't override.

---

## Input Files

Source prompts that define each phase's behavior:

| File | Purpose |
|------|---------|
| `input-files/deployment-prep.md` | Orchestration prompt (this program's source) |
| `input-files/release-notes.md` | Phase 1 detailed instructions |
| `input-files/readme-deep-update.md` | Phase 2 detailed instructions |
| `input-files/update-website.md` | Phase 3 detailed instructions |
