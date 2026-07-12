# SESSION-08 — Quill Agent Prompt: Phase 7 Target Research & Field Fill

> **Program:** Novel Engine
> **Feature:** query-auto-populate
> **Modules:** M-AGENTS (QUILL.md)
> **Depends on:** SESSION-03 (QueryService prompts that invoke Quill)
> **Estimated effort:** 15–20 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M-AGENTS | `agents/QUILL.md` | Lines 295–319 (Phase 6 section) | Add Phase 7 after Phase 6 |

## Context

Quill's prompt currently says "Research is implied, not performed. You cannot access the internet." (line 309). That's now false — `WebSearch` is in the allowed tools. We need to:

1. Update Phase 6 to remove the "no internet" restriction
2. Add Phase 7 with instructions for bulk target research and per-field fill

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `agents/QUILL.md` | Modify | Update Phase 6 personalization rules, add Phase 7 |

## Implementation

### 1. Update Phase 6 — Remove "No Internet" Restriction

Read `agents/QUILL.md` around line 309. The current text is:

```
- **Research is implied, not performed.** You cannot access the internet. Use the personalization notes provided by the author as your guide for what this target cares about.
```

Replace with:

```
- **Use available research.** You have WebSearch available. If personalization notes are sparse, search for the agent's MSWL or recent interviews to strengthen the letter. Use the author's notes as the primary guide, but supplement with live research when possible.
```

### 2. Add Phase 7 After Phase 6

Read the end of Phase 6 (line 317, the `### Output` paragraph about writing to `source/query-letters/`). Add after it (before the `---` separator and `## Relationship to Other Agents`):

```markdown
---

## Phase 7: Target Research & Field Fill

When the author requests target research from the Query Manager, you are invoked to find appropriate submission targets for the book and populate the tracker automatically.

### Research Workflow

1. Read `about.json` for genre, subgenre, audience, comp titles, and word count.
2. Read `source/story-bible.md` and `source/pitch-card.md` (if they exist) for market positioning context.
3. Use `WebSearch` to find:
   - Literary agents actively seeking clients in this genre
   - Publisher's Marketplace recent deals in this genre
   - MSWL (Manuscript Wish List) entries matching the book's themes
   - QueryTracker.net profiles active in this genre
4. For each viable target (aim for 5–10), add an entry to `source/query-tracker.md` using the existing format. Include all available fields — name, type, contact, method, link, and personalization notes.

### Research Rules

- **Append, don't replace.** If `source/query-tracker.md` already has targets, add new ones below. Never remove existing entries.
- **Be specific in personalization.** Don't write "represents literary fiction." Write "MSWL: seeking upmarket literary fiction with speculative elements, comp titles to The Midnight Library and The Invisible Life of Addie LaRue." Specificity helps the author decide who to prioritize.
- **Verify contact info.** If the agent's submission email isn't publicly listed, note "Check agency website for submission guidelines" in the contact field rather than guessing.
- **Include source links.** Every target should have a link to the agent's profile, agency page, or MSWL entry. The author needs to verify before querying.
- **Mark as drafting.** All auto-populated targets start with status "drafting" — it's the author's job to review, edit, and move to "queried" when ready.

### Per-Field Fill

When the author requests an AI fill for a single field on an existing target, you are invoked with the target name and the specific field to fill.

- **Research the specific field only.** Don't rewrite the whole target entry.
- **Update in place.** Modify only the requested field in `source/query-tracker.md`. Leave all other fields and targets untouched.
- **For personalization notes:** Search the agent's MSWL, recent interviews, and agency bio. Write 2–3 sentences explaining why this book fits their list specifically.
- **For contact:** Search for the submission email or form URL. If not publicly available, note where to find it.
- **For method:** Determine from the agency website whether they accept email, form, or Query Manager submissions.
- **For link:** Find the agent's profile page or agency website URL.
- **For notes:** Flag any special requirements — exclusivity periods, response times, simultaneous submission policies.
```

### 3. Update "Files Owned by This Agent" Table

Read the table at line 395–401. Add the query tracker to the list of files Quill writes:

Add this row before the closing `|` of the table:

```markdown
| **Query Tracker** | `source/query-tracker.md` | Quill | Auto-populated targets, per-field updates. Existing entries not removed. |
```

### 4. Update Red Lines (line 350)

Read line 350:

```
- **Never modify source files.** `chapters/*/draft.md` and all `source/` documents are read-only. Quill creates new publication documents in `source/` and `dist/`.
```

This is now partially incorrect. Replace with:

```
- **Never modify prose source files.** `chapters/*/draft.md` are read-only. Quill creates new publication documents in `source/` and `dist/`, and writes/updates `source/query-tracker.md` for query target management.
```

## Verification

1. `agents/QUILL.md` contains a `## Phase 7` section
2. Phase 6 no longer says "You cannot access the internet"
3. Red Lines section no longer says `source/` documents are read-only (query-tracker.md is now writable)
4. "Files Owned by This Agent" table includes `source/query-tracker.md`
5. Phase 7 covers both bulk research and per-field fill workflows

## State Update

Update `prompts/session-program/program-021/STATE.md`:
- Set SESSION-08 status to `done`
- Add completion date
- Handoff: Quill agent prompt updated. All sessions complete — final verification in SESSION-09.