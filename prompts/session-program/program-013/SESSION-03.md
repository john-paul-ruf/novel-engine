# SESSION-03 — README Rewrite

> **Program:** Novel Engine
> **Feature:** deployment-prep
> **Modules:** none modified in `src/` (writes `README.md` only)
> **Depends on:** SESSION-02
> **Estimated effort:** 30 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| — | program artifacts | `prompts/session-program/program-013/artifacts/readme-analysis.md` | The verified fact base — the rewrite draws only from this |
| — | repo root | `README.md`, `RELEASE_NOTES.md` | Current text (preserved sections, diff baseline) + fresh changes |
| M01 | domain | `src/domain/constants.ts` | Spot-check agents/phases at write time |

## Context

Second half of **Phase 2**. SESSION-02 produced a verified analysis artifact; this session rewrites `README.md` from it, following the narrative and structure rules of `readme-deep-update.md`. Do not re-derive facts from memory — if something needed isn't in the artifact, read the source file and verify it.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `README.md` | Rewrite | Full rewrite per readme-deep-update.md structure; three sections preserved verbatim |

## Implementation

### 1. Re-read the governing prompt

Read `prompts/session-program/program-013/input-files/readme-deep-update.md` — specifically **Core Narrative**, **Language Guidance**, **Preservation Requirements**, **README Structure**, and **Writing Guidelines**.

### 2. Rewrite README.md

- **Preserve verbatim, in current order, above `# Novel Engine`:** `# Heads up`, `# Dedication`, `# Questions, comments, or rants?` — copy from the artifact's "Preserved Sections".
- Follow the prescribed structure: intro → What It Does → The Seven Agents (table verified against constants) → The Build Pipeline (table verified against detection logic) → Key Features → Screenshots (if assets exist) → Prerequisites → Getting Started → Building for Distribution → Project Structure (src/ + userData trees from artifact) → Technology Stack (versions from artifact) → Architecture → License.
- **Narrative:** "build books, not write them" — build/construction metaphors throughout; agents framed as a publishing-house editorial team; the author is the creative authority. Say "build a novel", "editorial pipeline", "production-ready manuscript".
- **Add** every real, implemented feature from the artifact's "New Features" list. **Remove** every entry on the "Phantom Features" list.
- Ensure changes cataloged in `RELEASE_NOTES.md` are reflected (new features since last tag must appear).
- Link to `AGENTS.MD` / architecture docs rather than reproducing internals.

## Verification

Run the full **Verification Checklist** from readme-deep-update.md:

- [ ] Every agent listed matches `constants.ts`
- [ ] Every pipeline phase matches the actual detection logic
- [ ] Every npm script listed exists in `package.json`
- [ ] Every dependency listed matches `package.json`
- [ ] Every feature described has corresponding source code
- [ ] src/ tree and userData tree match reality
- [ ] Preload bridge claims match `src/preload/index.ts`
- [ ] No phantom features remain
- [ ] Heads Up, Dedication, and Contact sections byte-identical to the originals (verify with `git diff README.md` — those hunks must show no changes)
- [ ] Internal links use correct relative paths

## Completion Gate (from deployment-prep.md)

Confirm to the user: number of features added vs removed, any significant narrative changes, and the updated technology stack table. Then proceed to Phase 3.

## State Update

Set SESSION-03 to `done`. Handoff Notes: features added/removed counts, sections restructured, and anything the website sessions must pick up (new features, changed getting-started flow, updated book list).
