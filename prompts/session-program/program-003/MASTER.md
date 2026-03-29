# MASTER — Program 003: Sidebar Bookshelf + FilesView Tabs

**State file:** `prompts/session-program/program-003/STATE.md`
**Input source:** `prompts/session-program/program-003/input-files/p0.md`

---

## Goal

Restructure the Novel Engine UI in two ways:

1. **FilesView gets category tabs** — Replace the 2-tab structure (Files | Motif Ledger) with 5 tabs: Source, Chapters, Agents, Explorer, and Motif Ledger. Each tab renders its panel directly, removing the StructuredBrowser and CollapsibleSection wrappers.

2. **Sidebar gets a Book Panel** — Replace the BookSelector dropdown + FileTree with a permanently visible, scrollable bookshelf. Pinned icon toolbar at top (New Book, Shelved Pitches, Archived Books, Manage Series, Import). Book cards show cover, title, pipeline stage, word count, and archive button. Series books grouped under thin headers.

---

## Sessions

| # | File | Title | Effort |
|---|------|-------|--------|
| 01 | `SESSION-01.md` | FilesView Tab Restructure | ~25 min |
| 02 | `SESSION-02.md` | Sidebar Book Panel | ~30 min |

SESSION-01 must run first — it restructures FilesView to absorb file browsing functionality. SESSION-02 depends on SESSION-01 (removes FileTree from sidebar since the Explorer tab now serves that role).

---

## New Files

| File | Purpose |
|------|---------|
| `src/renderer/components/Sidebar/BookPanel.tsx` | Scrollable bookshelf — replaces BookSelector + FileTree |
| `src/renderer/components/Sidebar/ImportChoiceModal.tsx` | Modal: choose between single book or series import |

## Modified Files

| File | Sessions | What Changes |
|------|----------|-------------|
| `src/renderer/components/Files/FilesView.tsx` | 01 | 2-tab → 5-tab structure, remove StructuredBrowser |
| `src/renderer/components/Layout/Sidebar.tsx` | 02 | Replace BookSelector + FileTree with BookPanel |

## Deleted Files

| File | Sessions | Why |
|------|----------|-----|
| `src/renderer/components/Files/StructuredBrowser.tsx` | 01 | Decomposed into individual tabs |
| `src/renderer/components/Files/CollapsibleSection.tsx` | 01 | No longer used |
| `src/renderer/components/Sidebar/FileTree.tsx` | 02 | Replaced by Explorer tab in FilesView |
| `src/renderer/components/Sidebar/BookSelector.tsx` | 02 | Replaced by BookPanel |

---

## Protocol

### Each iteration:

1. **Read state.** Read `prompts/session-program/program-003/STATE.md`. Check what's done, pending, blocked.

2. **Pick next session.** First `pending` session whose dependencies are all `done`.

   Dependencies:
   - SESSION-01: None
   - SESSION-02: SESSION-01

3. **Read the session prompt.** Read `prompts/session-program/program-003/SESSION-NN.md` in full.

4. **Read affected files.** Before modifying any file, read it completely. Check for changes from prior sessions.

5. **Execute.** Follow implementation steps precisely. Write complete, production-ready code. Follow all architecture rules from the role spec.

6. **Verify.** Run every verification step listed in the session. If verification fails, fix before proceeding.

7. **Update state.** Edit `prompts/session-program/program-003/STATE.md`:
   - Set session status to `done`
   - Set Completed date
   - Add notes about decisions or complications
   - Update Handoff Notes

8. **Update docs.** Follow the AGENTS.md documentation protocol — update CHANGELOG.md and any affected architecture docs.

9. **Loop.** Return to step 1. If all sessions are `done`, produce Final Report.

---

## Crash Recovery

If the agent stops mid-session:

1. Next run reads STATE.md — incomplete sessions show as `in-progress` or `pending`
2. Read Handoff Notes for context
3. Check `git status` and `git log --oneline -5` to see committed state
4. If last session was partial:
   - Read the session prompt for remaining steps
   - Check which files from the file table exist and look correct
   - Complete remaining steps, then verify
5. Update STATE.md and continue

---

## Execution Order

Sequential: SESSION-01 → SESSION-02

---

## Stopping Conditions

- **All done:** Both sessions `done`. Produce Final Report.
- **Blocked:** Session fails verification unfixably. Set `blocked` with notes.
- **Context limit:** Update STATE.md + Handoff Notes. Next run resumes.

---

## Final Report

When all sessions are done:

1. **Summary** — What was built
2. **Sessions** — {done}/{total}
3. **Files created/modified/deleted** — counts + lists
4. **Verification** — How to manually verify end-to-end
5. **Follow-up** — Deferred work, known limitations
