# SESSION-02 — Content: User Guide & Helper Agent Prompt

> **Feature:** helper-agent
> **Layer(s):** Content / Infrastructure (agent files)
> **Depends on:** SESSION-01
> **Estimated effort:** 30 min

---

## Context

SESSION-01 added the Helper agent to the domain layer — type definitions, registry entry, and service interface. Before we can build the service, we need the content the helper will use: a comprehensive user guide that serves as the helper's knowledge base, and the HELPER.md agent prompt file that instructs the CLI on how to behave.

This session creates two files:
1. `docs/USER_GUIDE.md` — The living FAQ. A comprehensive document covering every feature, workflow, and concept in Novel Engine. Written for end users who may be stuck or confused.
2. `agents/HELPER.md` — The agent system prompt. Tells Claude how to be a helpful assistant, references the user guide, and includes the repo issue URL for unresolvable problems.

The user guide will be embedded directly in the helper's system prompt (concatenated after HELPER.md). At ~15-20K tokens for a thorough guide, this fits easily in the 200K context window.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `docs/USER_GUIDE.md` | Create | Comprehensive application guide — every feature, workflow, and concept |
| `agents/HELPER.md` | Create | Helper agent system prompt |
| `src/main/bootstrap.ts` | Modify | Copy `USER_GUIDE.md` to userData during bootstrap so the helper can access it at runtime |

---

## Implementation

### 1. Create `agents/HELPER.md`

This is the system prompt for the Helper agent. It establishes the assistant's personality and behavior.

```markdown
# Helper — Novel Engine Assistant

You are the built-in help assistant for **Novel Engine**, an Electron desktop application for writing novels with AI agents.

## Your Role

You help users understand and navigate the application. You answer questions about features, workflows, agents, the pipeline, file management, and troubleshooting. You are friendly, concise, and practical.

## Knowledge Base

The complete user guide follows below this section. Use it to answer questions accurately. If the user asks about something not covered in the guide, say so honestly.

## Behavior Rules

1. **Be concise.** Users asking for help want quick answers, not essays. Use bullet points and short paragraphs.
2. **Reference specific UI elements.** Say "click the Spark agent in the sidebar" not "navigate to the pitch creation interface."
3. **Show examples.** When explaining workflows, give concrete step-by-step instructions.
4. **Acknowledge limitations.** If something is a known limitation or not yet implemented, say so.
5. **Don't modify files.** You have read access to the user's book files for reference, but never write, edit, or delete anything. You are here to help, not to create content.
6. **Direct to GitHub for bugs.** If the user describes a bug or an issue you can't resolve, direct them to: https://github.com/john-paul-ruf/novel-engine/issues
7. **Stay in scope.** You help with Novel Engine the application. You don't write prose, pitch stories, or do the creative agents' jobs.

## Conversation Style

- Warm but efficient — like a knowledgeable colleague
- Use markdown formatting for readability
- When listing steps, use numbered lists
- When explaining concepts, use bold for key terms
- Keep responses under 500 words unless the user asks for detailed explanation

---

## User Guide

The following is the complete Novel Engine user guide. Reference it to answer user questions.

```

**Important:** The actual user guide content will be concatenated after this prompt by the HelperService at runtime. The `---\n\n## User Guide\n\n` section acts as a separator.

### 2. Create `docs/USER_GUIDE.md`

This is the comprehensive user guide. It must cover everything a user needs to know. Write it as a structured reference document.

The guide must include these sections (derive content from the actual codebase state — read `src/domain/constants.ts` for agent names/roles, `PIPELINE_PHASES` for pipeline steps, the existing UI components for feature descriptions):

#### Required Sections

**1. What is Novel Engine?**
- One-paragraph overview: Electron desktop app for writing novels with 7 AI agents
- The core concept: each agent has a specific role in the writing pipeline
- Claude Code CLI as the AI backend — user's own Claude subscription
- Books stored locally on disk

**2. Getting Started**
- First launch and onboarding wizard
- Claude CLI detection and authentication
- Creating your first book
- The author profile and why it matters
- Choosing a model (Opus vs Sonnet)

**3. The Writing Pipeline**
- What the pipeline is and why it exists
- All 14 phases in order with descriptions (from `PIPELINE_PHASES`):
  1. Story Pitch (Spark)
  2. Story Scaffold (Verity)
  3. First Draft (Verity)
  4. First Read (Ghostlight)
  5. Structural Assessment (Lumen)
  6. Revision Plan (Forge)
  7. Revision (Verity)
  8. Second Read (Ghostlight)
  9. Second Assessment (Lumen)
  10. Copy Edit (Sable)
  11. Fix Planning (Forge)
  12. Mechanical Fixes (Verity)
  13. Build (export)
  14. Publish & Audit (Quill)
- How phases advance (pending-completion -> confirmed -> next unlocks)
- The "Advance" button and manual phase completion
- Reverting phases

**4. The Agents**
- Overview of each agent with their role and personality:
  - **Spark** — Story discovery and pitching
  - **Verity** — The ghostwriter (drafting, scaffolding, revisions)
  - **Ghostlight** — Cold first reader
  - **Lumen** — Developmental editor
  - **Sable** — Copy editor
  - **Forge** — Task master and revision planner
  - **Quill** — Publisher and metadata
- How to start a conversation with an agent
- Quick actions (pre-built prompts per agent)
- Extended thinking and what it means

**5. Book Management**
- Creating a new book
- The book selector in the sidebar
- Switching between books
- Book metadata (title, author, status, cover image)
- Archiving and unarchiving books
- Importing manuscripts (markdown and DOCX)
- Shelved pitches — saving ideas for later

**6. The Pitch Room**
- What it is: a free brainstorming space with Spark
- Creating multiple draft pitches
- Promoting a pitch to a real book
- Shelving pitches for later

**7. File Management**
- The Files view and file browser
- Reading and editing files
- Book directory structure:
  - `source/` — pitch, outline, bible, reports, prompts
  - `chapters/NN-slug/` — draft.md and notes.md per chapter
  - `dist/` — build outputs
- Version history and file diffing
- Reverting to previous versions

**8. Conversations**
- How conversations work (one per agent per phase)
- Conversation history and persistence
- Deleting conversations
- Multiple concurrent conversations

**9. The Revision Queue**
- What it is: automated execution of Forge's revision plan
- Loading a revision plan
- Execution modes: manual, auto-approve, selective
- Approval gates
- Monitoring progress

**10. Building Your Book**
- Export formats: Markdown, DOCX, EPUB, PDF
- Pandoc requirement
- The Build view
- Exporting a zip

**11. Series Management**
- Creating a series
- Adding/removing volumes
- Reordering volumes
- Series bible

**12. Settings**
- Model selection
- Thinking budget configuration
- Theme (light/dark/system)
- Provider management
- OS notifications

**13. Motif Ledger**
- What it tracks: motifs, foreshadowing, flagged phrases
- How it's updated (automatic during drafting)
- Manual editing

**14. Keyboard Shortcuts & Tips**
- Common workflows
- Tips for efficient use
- The sidebar as command center

**15. Troubleshooting**
- "Claude CLI not detected" — installation steps
- Agent not responding — check CLI authentication
- Slow responses — model choice, thinking budget
- Files not updating — file watcher and refresh
- Build failing — Pandoc installation
- For bugs: link to GitHub issues

**16. Architecture Overview (for power users)**
- Where books are stored (userData path)
- The `custom-agents/` directory — customizing agent prompts
- The `author-profile.md` file

### 3. Update Bootstrap

Read `src/main/bootstrap.ts`.

Add logic to copy `docs/USER_GUIDE.md` to `{userData}/USER_GUIDE.md` during bootstrap. This file is read by the HelperService at runtime.

In the `bootstrap()` function, after the existing agent copying logic, add:

```typescript
// Copy user guide for the helper agent
const guideSource = app.isPackaged
  ? path.join(process.resourcesPath, 'docs', 'USER_GUIDE.md')
  : path.join(app.getAppPath(), 'docs', 'USER_GUIDE.md');
const guideDest = path.join(userDataPath, 'USER_GUIDE.md');
try {
  await fs.copyFile(guideSource, guideDest);
} catch {
  // Guide copy failed — helper will work without it (degraded)
}
```

Also ensure the `docs/` directory is included in the Electron Forge `extraResource` config (check `forge.config.ts`). If not feasible, the alternative is to read the guide from the app bundle path directly in the HelperService.

**Decision note:** If modifying bootstrap proves complex, the HelperService can resolve the guide path at runtime using `app.isPackaged` logic (same pattern as `resolvePandocPath`). The session executor should choose whichever approach is cleaner.

---

## Architecture Compliance

- [x] Domain files not modified (those changes were SESSION-01)
- [x] Agent prompt file (`agents/HELPER.md`) follows existing pattern
- [x] User guide is pure documentation content — no code dependencies
- [x] Bootstrap modification is minimal and follows existing copy patterns

---

## Verification

1. `agents/HELPER.md` exists and contains the system prompt
2. `docs/USER_GUIDE.md` exists and covers all 16 sections
3. The user guide references actual features that exist in the codebase (not hallucinated features)
4. `npx tsc --noEmit` still passes (no TypeScript changes in this session)

---

## State Update

After completing this session, update `prompts/feature/helper-agent/STATE.md`:
- Set SESSION-02 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
