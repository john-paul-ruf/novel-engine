# SESSION-03 — Website: Landing Page + Architecture Page (Phase 3a)

> **Program:** Novel Engine
> **Feature:** deployment-prep
> **Modules:** none (writes `docs/*.html` only)
> **Depends on:** SESSION-02 (needs updated README content)
> **Estimated effort:** ~30 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| — | `README.md` | Yes | Primary content source (fresh from SESSION-02) |
| — | `RELEASE_NOTES.md` | Yes | Version + release highlights |
| — | `package.json` | Yes | Version number for nav badge |
| — | `docs/architecture/ARCHITECTURE.md` | Yes | Architecture page content |
| — | `docs/architecture/DOMAIN.md` | Yes | Types, interfaces |
| — | `docs/architecture/INFRASTRUCTURE.md` | Yes | Database, CLI, filesystem |
| — | `docs/architecture/APPLICATION.md` | Yes | Services |
| — | `docs/architecture/IPC.md` | Yes | IPC channels |
| — | `docs/architecture/RENDERER.md` | Yes | Stores, components |
| — | `docs/index.html` | Yes | Existing landing page — update in place |
| — | `docs/architecture.html` | Yes | Existing architecture page — update in place |
| — | `screenshots/` | List | Screenshot filenames for hero/gallery |

## Context

The website already exists with all 6 HTML pages. This session updates `docs/index.html` (landing page) and `docs/architecture.html` to reflect the new features from SESSION-02's README: Query Manager, WebSearch, Codex CLI improvements.

Execute the relevant sections of the update-website prompt (at `prompts/session-program/program-025/input-files/update-website.md`): Step 3.1 (index.html) and Step 3.3 (architecture.html).

The existing pages already have the shared design system, nav, and footer. **Update content**, do not rebuild from scratch. Preserve the CSS design system, nav structure, and footer.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `docs/index.html` | Modify | Update: version badge, feature descriptions, agent table, pipeline table, new features (Query Manager, WebSearch), screenshots |
| `docs/architecture.html` | Modify | Update: tech stack versions, new modules (codex-cli, QueryService), IPC channels, source tree, dependency graph |

## Implementation

### 1. Collect Source Material

Read all files in the Module Context table before writing. Do not work from memory.

### 2. Update `docs/index.html`

Key changes:
- **Version badge** in nav → match the version from SESSION-01
- **Agent section**: verify 7 agents still match README. If Quill's role expanded (Query Manager), update description.
- **Pipeline section**: verify 14 phases still match. The "Publish" phase now includes Query Manager — update if the README reflects this.
- **Features / "What Else Is In The Box"**: add Query Manager, WebSearch if not present
- **Hero/subtitle**: update if README narrative changed in SESSION-02
- **Screenshots**: verify screenshot paths still resolve. Current screenshots use `screenshots/Screenshot 2026-07-08 at *.png` naming pattern. The existing `docs/index.html` uses GitHub raw URLs or relative paths — match whatever pattern the current file uses.
- **Books banner**: verify book links still match README
- **Technology stack section**: verify versions match `package.json`
- **All internal links**: verify nav links resolve to real pages
- **OG tags**: update if tagline changed

### 3. Update `docs/architecture.html`

Key changes:
- **Tech stack table**: verify versions from `package.json`
- **Service dependency graph**: update if new services were added (QueryService, etc.)
- **Source tree**: update to match current `src/` structure (new: `codex-cli/`, `QueryService.ts`, `queryStore.ts`, `QueryManagerView.tsx`, etc.)
- **IPC channels**: add `query:*` namespace channels
- **Design decisions**: add any new significant decisions (multi-provider, WebSearch)
- **Database schema**: verify tables match current `schema.ts`
- **Contributing section**: verify dev commands still match `package.json` scripts

### 4. Preserve

- **`docs/architecture/*.md` files**: do NOT modify
- **`docs/og-image.png`**: do NOT modify
- **`docs/evaluation.html`**: not touched in this session
- **`docs/changelog.html`**: not touched in this session
- **`docs/press.html`**: not touched in this session
- **`docs/contact.html`**: not touched in this session
- **CSS design system**: preserve the existing color tokens, typography, layout, nav, footer
- **No tracking scripts, no external JS CDNs**

## Verification

- `docs/index.html` exists and is valid HTML5
- `docs/architecture.html` exists and is valid HTML5
- Nav links on both pages resolve to real `.html` files in `docs/`
- Version badge on both pages matches `package.json` or the suggested version from SESSION-01
- Agent table matches `src/domain/constants.ts` `AGENT_REGISTRY`
- Pipeline table matches `PIPELINE_PHASES`
- No features described that don't exist in source code
- No `docs/architecture/*.md` files were modified
- `docs/og-image.png` untouched
- No external JS dependencies
- No tracking scripts
- Screenshot references resolve to files in `screenshots/`
- Mobile nav (hamburger) present in both files

## State Update

Update `prompts/session-program/program-025/STATE.md`:
- Session 03 → `done`, date, notes
- Handoff Notes: what content changed on index.html and architecture.html, any issues found
- SESSION-04 can now proceed (changelog + evaluation pages)