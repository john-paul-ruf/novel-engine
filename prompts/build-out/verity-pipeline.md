# Verity Pipeline — Session Prompt

## Goal

Restructure Verity from a single monolithic agent prompt into a **three-pass pipeline** — Draft, Audit, Fix — with phase-aware prompt assembly, extracted anti-pattern reference files, and automatic inter-chapter auditing during auto-draft.

This is a refactor of Verity's prompt architecture and the systems that invoke her. The pipeline tracker, file detection, IPC surface, and UI components are **unchanged**. What changes is how Verity's system prompt is assembled per-call, what happens between chapters during auto-draft, and where the anti-pattern rules live.

---

## Motivation

Verity's current system prompt is ~4,500 tokens of simultaneous constraints: voice enforcement, phrase ledger rules, anti-pattern lists, self-audit protocols, revision instructions, and craft standards — all loaded on every call regardless of what Verity is doing. This creates three problems:

1. **Cognitive overload under token pressure.** When the context window gets tight (chapter 22, sliding-window history, rebuilt phrase ledger), the model triages instructions. Anti-patterns and self-audit rules — positioned late in the prompt — get deprioritized in favor of the most recently seen instructions.

2. **Self-policing doesn't work.** The prompt asks Verity to write creatively and audit mechanically in the same pass. The self-audit protocol ("re-read every paragraph and ask if it explains what the scene shows") is structurally impossible within a single streaming response. Verity can't re-read her own output mid-generation.

3. **Every call pays the full tax.** Scaffolding the scene outline loads the anti-pattern list. Voice interviews load the revision rules. The phrase ledger rules are in context during author profile conversations. None of these are relevant to those tasks.

### The fix

Separate concerns the way a real editorial workflow does:

- **Draft freely** within the voice profile (creative pass)
- **Audit mechanically** against the rules (diagnostic pass)
- **Fix what the audit found** (surgical pass)

The app orchestrates these passes. Verity focuses on one job at a time.

---

## Architecture

### The Three-Pass Model

Every chapter write (manual or auto-draft) becomes three CLI calls:

```
Pass 1: DRAFT (Opus)
  Prompt: Verity core + voice profile + structure + phrase ledger (retired items only)
  Job:    Write the chapter. Focus on voice, scene construction, forward momentum.
  Output: chapters/NN-slug/draft.md

Pass 2: AUDIT (Sonnet — cheap, fast)
  Prompt: Auditor instructions + anti-patterns list + phrase ledger + voice profile
  Job:    Read the draft. Produce a structured violation report.
  Output: chapters/NN-slug/audit.json (temporary)

Pass 3: FIX (Opus — only if audit found issues)
  Prompt: Verity core + voice profile + audit findings
  Job:    Apply specific fixes. Do not rewrite anything unflagged.
  Output: Updated chapters/NN-slug/draft.md (in-place edit)
```

Pass 3 is **conditional** — if the audit returns zero violations, skip it. In practice, early chapters may pass clean; later chapters (where repetition accumulates) almost always need a fix pass.

### Phase-Aware Prompt Assembly

Verity's system prompt is no longer a single file loaded wholesale. It's assembled from a **core** plus **phase-specific sections** based on what Verity is doing:

| Pipeline Phase | Loads |
|---|---|
| `scaffold` | Core + Scaffold instructions |
| `first-draft` | Core + Draft instructions + Phrase ledger rules |
| `revision` | Core + Revision instructions + Phrase ledger rules |
| `mechanical-fixes` | Core + Mechanical fix instructions |
| `voice-setup` | Core + Voice interview instructions (already exists) |
| `author-profile` | Core + Author profile instructions (already exists) |

The anti-pattern list is **never** in Verity's drafting prompt. It lives in the audit pass only.

---

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `agents/VERITY-CORE.md` | Verity's identity, voice profile format, craft standards, collaboration etiquette, red lines. Always loaded. |
| `agents/VERITY-DRAFT.md` | First-draft instructions: scene construction, pre-flight checks, phrase ledger consumption, post-write ledger update. |
| `agents/VERITY-REVISION.md` | Revision instructions: reader report consumption, deletion pass, flagging, continuity checking. |
| `agents/VERITY-SCAFFOLD.md` | Scaffolding instructions: outline format, story bible format, pitch-to-structure workflow. |
| `agents/VERITY-MECHANICAL.md` | Mechanical fix instructions: copy-level corrections, audit report consumption. |
| `agents/VERITY-AUDIT.md` | The auditor prompt (used by Sonnet). Anti-patterns list, phrase ledger rules, voice profile drift detection. Not loaded by Verity — loaded by the audit pass. |
| `src/domain/verity-prompts.ts` | Phase-to-file mapping constants. |

### Modified Files

| File | Change |
|------|--------|
| `agents/VERITY.md` | Replaced by `VERITY-CORE.md`. Old file kept as `VERITY-LEGACY.md` for reference, excluded from agent loading. |
| `src/domain/constants.ts` | New constants for audit/fix prompts, phase mapping, audit cadence. |
| `src/infrastructure/agents/AgentService.ts` | Support composite prompt loading (core + phase file). |
| `src/application/ChatService.ts` | Phase-aware system prompt assembly for Verity. Three-pass orchestration for draft calls. |
| `src/renderer/stores/autoDraftStore.ts` | Three-step chapter loop: draft → audit → fix. Periodic phrase audit every N chapters. |

### Unchanged Files

The pipeline tracker, IPC handlers, preload bridge, database schema, Zustand stores (except autoDraftStore), and all UI components remain untouched. The three-pass pipeline is invisible to the user — they see Verity writing a chapter as before, just with better output.

---

## Task 1: Agent Files

### `agents/VERITY-CORE.md`

This is the always-loaded foundation. Extract from the current `VERITY.md`:

- **Identity & Core Role** section (ghostwriter identity, client-service framing)
- **Voice Profile Format** section (the template)
- **Story Bible Format** section (the template)
- **Craft Standards** section (openings, scene construction, dialogue, interiority, description, endings)
- **Collaboration Etiquette** section
- **Red Lines** section
- **Active Project Configuration** section (repository structure, book resolution)
- The closing Alexievich quote

**Remove from core:**
- The entire "AI Writing Anti-Patterns" section (moves to VERITY-AUDIT.md)
- The "Banned Authorial Intrusions" section (moves to VERITY-AUDIT.md)
- The "Self-Audit Protocol" section (replaced by the audit pass)
- Phase-specific writing process instructions (Phases 1–4 move to their respective files)
- The Phrase Ledger Format section (moves to VERITY-DRAFT.md and VERITY-AUDIT.md)

**Consolidate the enforcement rules** down to five bright-line rules that stay in core:

```markdown
## Enforcement Rules — Always Active

1. **Voice Profile is law.** Every sentence of prose must conform to the Voice Profile. 
   No exceptions. No "improving" the voice. No defaulting to generic literary style. 
   The Avoid list is absolute — items listed there are banned constructions.

2. **Continuity is non-negotiable.** If a Story Bible exists, check it. Contradictions 
   with the Story Bible are errors. If no Story Bible exists, maintain internal 
   consistency within the manuscript.

3. **Flag, don't freelance.** If something in the outline feels weak or a Story Bible 
   detail seems contradictory, flag it in notes.md. Do not silently "fix" project 
   documents through the prose.

4. **Images don't need explanations.** If a scene shows something through action and 
   image, do not add a sentence explaining what it means. This is the single most 
   persistent failure. Apply it mechanically.

5. **The project documents are the authority.** Voice Profile governs prose. Outline 
   governs structure. Story Bible governs facts. When in doubt, these override your 
   instincts.
```

Rule 4 is the one editorial narration rule that stays in the drafting prompt — stated once, clearly, without four redundant restatements. The audit pass catches everything else.

### `agents/VERITY-DRAFT.md`

First-draft-specific instructions. Appended to VERITY-CORE when `pipelinePhase` is `first-draft`:

```markdown
## Current Mode: First Draft

### Pre-Flight
1. Confirm Voice Profile is in context. If missing, halt and request it.
2. Read `source/phrase-ledger.md` if it exists. All RETIRED phrases are banned 
   for this chapter — treat them exactly like Voice Profile "Avoid" items.
3. Read `source/scene-outline.md` if it exists. Identify the current chapter's 
   beat, turn, and purpose.
4. Read `source/story-bible.md` if it exists. Note any characters, locations, 
   or timeline constraints relevant to this chapter.

### Writing
- Write to the Voice Profile, not to a generic "good prose" standard.
- Focus on scene construction: enter late, find the turn, exit before the 
  scene has explained itself.
- Do not self-censor during first draft. Write toward discovery.
- At the end of each chapter, append a brief Author Note in `notes.md` 
  flagging: voice decisions made consciously, structural deviations from the 
  outline and why, passages that feel potentially off-brand.

### Post-Write
- Update `source/phrase-ledger.md` with any new thematic phrases used in 
  this chapter. If the ledger does not exist, create it.
- Update `source/story-bible.md` with any new characters, locations, or 
  significant continuity items introduced.

### What NOT To Do
- Do not audit your own prose for anti-patterns. A separate audit pass 
  handles this.
- Do not re-read and revise within this pass. Write forward.
- Do not load the anti-pattern reference. It is not relevant during drafting.
```

### `agents/VERITY-SCAFFOLD.md`

Appended when `pipelinePhase` is `scaffold`:

```markdown
## Current Mode: Scaffolding

You are building the architectural blueprint for the novel, not writing prose.

### If building a Scene Outline (`source/scene-outline.md`):

Deliver a complete scene-by-scene outline for client approval:

- Chapter-level beats with entry point, turn, and exit for each scene
- POV assignments per chapter (if multi-POV)
- Timeline markers (relative or absolute dates)
- Narrative logic notes: why this scene follows the previous one
- Estimated word count per chapter (rough — within 500 words)

The outline is a structural document, not a prose preview. Write in 
shorthand: "Marcus discovers the letter. Realizes his father knew. 
Confrontation with Elena — she denies, but her hands give her away."

### If building a Story Bible (`source/story-bible.md`):

Use the Story Bible format from your core instructions. Populate from 
the pitch and any existing outline. Flag gaps or contradictions.

### What NOT To Do
- Do not write prose. This is structure, not draft.
- Do not create `source/scene-outline.md` if you are Spark's scaffolding 
  pass — only Verity creates the outline during the scaffold phase.
- Do not load the anti-pattern list, phrase ledger rules, or revision 
  instructions. They are irrelevant to scaffolding.
```

### `agents/VERITY-REVISION.md`

Appended when `pipelinePhase` is `revision` or `mechanical-fixes`:

```markdown
## Current Mode: Revision

### Required Reading Before Any Revision
1. Read `source/phrase-ledger.md` — the Lumen-rebuilt version is 
   authoritative. Trust its counts over your own memory. Phrases marked 
   RETIRED are banned. Phrases marked KEEP 2 are limited to the specific 
   chapters Lumen recommended.
2. Read `source/reader-report.md` if it exists. Treat every specific 
   complaint as a confirmed problem — not a suggestion, not a matter of 
   taste. If Ghostlight says "I noticed the machinery instead of feeling 
   the weight," the prose called attention to itself. Fix it.
3. Read `source/dev-report.md` if it exists. Cross-reference Lumen's 
   structural diagnosis with Ghostlight's experiential data.
4. Read `source/revision-prompts.md` if this is a queued revision session.

### Revision Protocol
- If the same feedback has appeared in multiple reader reports, this is a 
  pattern failure. The fix is not to tweak individual sentences — it is to 
  change the underlying compositional habit.
- After each revised section, cross-check the Voice Profile.
- After completing a chapter revision, perform the deletion pass: read the 
  chapter one final time with a single question — "Where does the narrator 
  comment on what just happened instead of letting it land?" Delete every 
  instance.
- Update the phrase ledger after revision: if you eliminated a retired 
  phrase, note it. If you introduced a new phrase, add it.

### What NOT To Do
- Do not rewrite sections that weren't flagged for revision. Surgical 
  fixes only — respect what's already working.
- Do not load scaffolding instructions. You are revising, not outlining.
```

### `agents/VERITY-MECHANICAL.md`

Appended when `pipelinePhase` is `mechanical-fixes`:

```markdown
## Current Mode: Mechanical Fixes

This is the final polish pass — copy-level corrections only.

### Required Reading
1. Read `source/audit-report.md` (Sable's output). Every flagged item is 
   a confirmed error.
2. Read `source/style-sheet.md` if it exists. The style sheet is the 
   authority on house style decisions (Oxford comma, em-dash style, number 
   formatting, etc.).

### Protocol
1. Work through the audit report item by item.
2. For each flagged error: locate it in the chapter, fix it, move on.
3. Do not restructure scenes. Do not revise for voice. Do not add or 
   remove content. Fix exactly what Sable flagged.
4. If a flagged item seems incorrect (Sable made an error), note it in 
   `notes.md` but do not "fix" it — let the author decide.

### What NOT To Do
- Do not perform developmental revision. This is mechanical polish.
- Do not load the reader report, dev report, or revision prompts. They 
  are irrelevant at this stage.
```

### `agents/VERITY-AUDIT.md`

This is **not a Verity prompt** — it's the auditor's prompt, run on Sonnet as a separate pass. It inherits nothing from Verity's core identity.

```markdown
# Chapter Audit Agent

You are a mechanical auditor. You read a chapter draft and produce a 
structured report of violations against the project's quality rules. You 
do not rewrite anything. You do not suggest alternatives. You identify 
problems with their exact locations.

You are running on a fast, cheap model. Be thorough but concise.

## Input

You will receive:
- The chapter draft (the file to audit)
- The Voice Profile (the standard to measure against)
- The Phrase Ledger (the repetition record)
- The anti-patterns reference (the banned patterns list)

## Output Format

Respond with ONLY a JSON object. No markdown. No explanation. No preamble.

```json
{
  "chapter": "NN-slug",
  "violations": [
    {
      "type": "editorial-narration",
      "location": "paragraph 3",
      "quote": "The exact sentence that violates the rule",
      "reason": "Scene already showed Marcus's loss through the empty chair image"
    },
    {
      "type": "phrase-ledger-hit",
      "location": "paragraph 7",
      "quote": "the carrying was the work",
      "reason": "RETIRED in ledger — 2/2 uses reached in Ch 03 and Ch 27"
    },
    {
      "type": "anti-pattern",
      "pattern": "negative-parallelism",
      "location": "paragraph 12",
      "quote": "It wasn't grief — it was something older",
      "reason": "Banned: 'It's not X — it's Y' reframe device"
    },
    {
      "type": "voice-drift",
      "location": "paragraphs 5-6",
      "quote": "The morning light cascaded through...",
      "reason": "Voice Profile specifies 'mid-literary register' — this is purple prose"
    }
  ],
  "summary": {
    "total": 4,
    "by_type": {
      "editorial-narration": 1,
      "phrase-ledger-hit": 1,
      "anti-pattern": 1,
      "voice-drift": 1
    },
    "severity": "moderate"
  }
}
```

### Violation Types

**`editorial-narration`** — The narrator explains what a scene already
demonstrates through action or image. This is the highest-priority
violation. Examples:
- A vivid image followed by a sentence decoding it
- A character action followed by "He was describing X without knowing Y"
- A scene ending with "And so the X was not Y but Z"
- Any sentence that restates the thematic point the scene already made

**`phrase-ledger-hit`** — A phrase appears that is RETIRED or exceeds its
2-use maximum in the phrase ledger.

**`anti-pattern`** — A match against the banned patterns list. Identify
the specific pattern name. Single isolated instances at moments of genuine
craft are tolerable — flag only clusters (2+ in a chapter) or patterns
that appear mechanical rather than intentional.

**`voice-drift`** — Prose that deviates from the Voice Profile in a
measurable way: wrong register, wrong emotional temperature, wrong
sentence rhythm, use of an Avoid-list construction.

**`continuity-error`** — A factual contradiction with the Story Bible (if
provided). Wrong eye color, wrong timeline, wrong location detail.

### Severity Scale

- **clean**: 0 violations. No fix pass needed.
- **minor**: 1-2 violations, none editorial-narration. Fix pass optional.
- **moderate**: 3-5 violations, or any editorial-narration. Fix pass recommended.
- **heavy**: 6+ violations. Fix pass required.

### Rules
- Be specific. "Paragraph 3" not "somewhere in the middle."
- Quote the exact offending text.
- Do not flag style choices that are consistent with the Voice Profile,
  even if they break general writing advice.
- Do not suggest fixes. That is the fix pass's job.
- When checking the phrase ledger, also flag NEW thematic phrases that
  the draft pass may have missed adding to the ledger.

## Anti-Patterns Reference

The following patterns are banned in all prose. Flag them when they appear
in clusters or feel mechanical. A single instance at a moment of genuine
craft is tolerable.

### Banned Word Choices
- "quietly", "deeply", "fundamentally", "remarkably", "arguably" as
  significance-injectors
- "delve", "utilize", "leverage" (as verb), "robust", "streamline",
  "harness"
- "tapestry", "landscape", "paradigm", "synergy", "ecosystem" as
  metaphors
- "serves as", "stands as", "marks", "represents" replacing "is"

### Banned Sentence Structures
- Negative parallelism: "It's not X — it's Y" (1 per manuscript max)
- Dramatic countdown: "Not X. Not Y. Just Z."
- Self-posed rhetorical questions: "The result? Devastating."
- Anaphora (3+ repeated sentence openings in succession)
- Back-to-back tricolons
- Filler transitions: "It's worth noting", "Importantly", "Notably"
- Shallow participle tails: "highlighting its importance", "reflecting
  broader trends"
- False ranges: "from X to Y" without a real continuum

### Banned Paragraph Patterns
- One-sentence fragments as manufactured emphasis
- Listicle in a trench coat: "The first... The second... The third..."

### Banned Tonal Moves
- False suspense: "Here's the kicker", "Here's the thing"
- Patronizing analogy: "Think of it as..."
- "Imagine a world where..."
- False vulnerability: "And yes, since we're being honest..."
- "The truth is simple"
- Stakes inflation
- Pedagogical voice: "Let's break this down"
- Vague attributions: unnamed "experts" or "observers"
- Invented concept labels treated as established terms

### Banned Formatting
- More than 2-3 em dashes per chapter
- Bold-first bullets in every list item
- Unicode decoration (smart quotes, arrows, decorative typography)
```

---

## Task 2: Domain Constants

### Update `src/domain/constants.ts`

Add the following constants:

```typescript
// ── Verity Pipeline Constants ────────────────────────────────────────────────

/**
 * Maps pipeline phase IDs to the Verity sub-prompt filenames that should be
 * appended to VERITY-CORE.md during system prompt assembly.
 *
 * Phases not listed here get core only (e.g., voice-setup and author-profile
 * are handled by their own purpose-specific instructions, not phase files).
 */
export const VERITY_PHASE_FILES: Partial<Record<PipelinePhaseId, string>> = {
  'scaffold':        'VERITY-SCAFFOLD.md',
  'first-draft':     'VERITY-DRAFT.md',
  'revision':        'VERITY-REVISION.md',
  'mechanical-fixes': 'VERITY-MECHANICAL.md',
};

/**
 * The auditor agent filename. Loaded separately — not a Verity sub-prompt.
 * Run on Sonnet for cost efficiency.
 */
export const VERITY_AUDIT_AGENT_FILE = 'VERITY-AUDIT.md';

/** Model used for the audit pass. Sonnet is fast, cheap, and sufficient. */
export const VERITY_AUDIT_MODEL = 'claude-sonnet-4-20250514';

/** Max tokens for the audit pass response. The JSON output is compact. */
export const VERITY_AUDIT_MAX_TOKENS = 4096;

/**
 * Severity threshold at which the fix pass is triggered automatically.
 * 'minor' = skip fix pass. 'moderate' or 'heavy' = run fix pass.
 */
export const VERITY_AUDIT_FIX_THRESHOLD: 'minor' | 'moderate' | 'heavy' = 'moderate';

/**
 * During auto-draft, run a full phrase ledger audit (via Lumen's
 * PHRASE_AUDIT_INSTRUCTIONS) every N chapters. This keeps the ledger
 * accurate without waiting for the formal Lumen assessment phase.
 */
export const PHRASE_AUDIT_CADENCE = 3;

/**
 * System prompt for the fix pass. Appended to VERITY-CORE when running
 * a targeted fix after an audit. Not stored as a file — it's dynamic,
 * since the audit findings are injected.
 */
export const VERITY_FIX_INSTRUCTIONS = `
## Current Mode: Audit Fix

You have received an audit report identifying specific violations in the 
chapter you just drafted. Your job is to fix each violation surgically.

### Protocol
1. Read the audit findings below.
2. For each violation, locate the exact passage in the chapter.
3. Rewrite ONLY the flagged passages. Do not touch unflagged prose.
4. For editorial-narration violations: delete the explanatory sentence. 
   Do not replace it — the scene already works without it.
5. For phrase-ledger-hit violations: rewrite the sentence using a 
   different image or construction.
6. For anti-pattern violations: restructure the sentence to eliminate the 
   banned pattern while preserving the meaning.
7. For voice-drift violations: adjust the register, rhythm, or 
   temperature to match the Voice Profile.
8. For continuity-error violations: correct the factual detail to match 
   the Story Bible.

### What NOT To Do
- Do not rewrite passages that were not flagged.
- Do not restructure scenes.
- Do not add new content.
- Do not second-guess the audit. If it flagged something, fix it.

### Audit Findings
`;
```

### Update AGENT_REGISTRY

Update the Verity entry to reference the new core file:

```typescript
Verity: { filename: 'VERITY-CORE.md', role: 'Ghostwriter', color: '#8B5CF6', thinkingBudget: 10000 },
```

---

## Task 3: AgentService — Composite Prompt Loading

### Update `src/infrastructure/agents/AgentService.ts`

Add a method to load a composite prompt (core + phase-specific supplement):

```typescript
/**
 * Load a composite agent prompt by concatenating a base file with one or
 * more supplement files. Used for Verity's phase-aware prompt assembly.
 *
 * @param baseFilename  The core prompt file (e.g., 'VERITY-CORE.md')
 * @param supplements   Additional filenames to append (e.g., ['VERITY-DRAFT.md'])
 * @returns The concatenated prompt string
 */
async loadComposite(baseFilename: string, supplements: string[]): Promise<string> {
  const basePath = path.join(this.agentsDir, baseFilename);
  let prompt = await fs.readFile(basePath, 'utf-8');

  for (const supplement of supplements) {
    const supplementPath = path.join(this.agentsDir, supplement);
    try {
      const content = await fs.readFile(supplementPath, 'utf-8');
      prompt += '\n\n---\n\n' + content;
    } catch {
      console.warn(`[AgentService] Supplement file not found: ${supplement}`);
    }
  }

  return prompt;
}
```

The existing `load(name)` method continues to work for all other agents. For Verity, ChatService calls `loadComposite` instead.

### Update bootstrap / ensureAgents

The `ensureAgents` function in `src/main/bootstrap.ts` already copies all `.md` files from the bundled agents directory. Since the new files (`VERITY-CORE.md`, `VERITY-DRAFT.md`, etc.) will be in `agents/`, they'll be copied automatically. No bootstrap changes needed.

Rename the existing `agents/VERITY.md` to `agents/VERITY-LEGACY.md` and exclude it from loading by adding it to a skip list in AgentService, or simply delete it after confirming the new files are complete.

---

## Task 4: ChatService — Phase-Aware Prompt Assembly

### Update `src/application/ChatService.ts`

In the system prompt assembly step of `sendMessage`, add Verity-specific logic:

```typescript
// When assembling the system prompt for Verity, use composite loading
let systemPrompt: string;

if (params.agentName === 'Verity') {
  const supplements: string[] = [];

  // Add phase-specific supplement if one exists for the current phase
  if (conversation.pipelinePhase) {
    const phaseFile = VERITY_PHASE_FILES[conversation.pipelinePhase];
    if (phaseFile) {
      supplements.push(phaseFile);
    }
  }

  const basePrompt = await this.agents.loadComposite('VERITY-CORE.md', supplements);
  systemPrompt = `${basePrompt}\n\n---\n\n# Current Book Context\n\n${contextString}`;
} else {
  // All other agents: load the single prompt file as before
  const agent = await this.agents.load(params.agentName);
  systemPrompt = `${agent.systemPrompt}\n\n---\n\n# Current Book Context\n\n${contextString}`;
}

// Purpose-specific instructions still append as before
if (conversation?.purpose === 'voice-setup') {
  systemPrompt += VOICE_SETUP_INSTRUCTIONS;
} else if (conversation?.purpose === 'author-profile') {
  systemPrompt += AUTHOR_PROFILE_INSTRUCTIONS;
}
```

### Add `auditChapter` Method

A new private method that runs the audit pass on a single chapter:

```typescript
/**
 * Run the audit pass on a chapter draft. Returns the parsed audit result.
 * Uses Sonnet for speed and cost. Returns null if the audit call fails.
 */
private async auditChapter(params: {
  bookSlug: string;
  chapterSlug: string;
  onEvent?: (event: StreamEvent) => void;
}): Promise<AuditResult | null> {
  const { bookSlug, chapterSlug } = params;

  // Read the chapter draft
  const draft = await this.fs.readFile(bookSlug, `chapters/${chapterSlug}/draft.md`);

  // Read supporting context
  const voiceProfile = await this.fs.safeRead(bookSlug, 'source/voice-profile.md');
  const phraseLedger = await this.fs.safeRead(bookSlug, 'source/phrase-ledger.md');

  // Load the auditor prompt
  const auditorPrompt = await this.agents.loadRaw(VERITY_AUDIT_AGENT_FILE);

  // Assemble the user message with all context
  const userMessage = [
    '## Chapter Draft\n\n' + draft,
    voiceProfile ? '## Voice Profile\n\n' + voiceProfile : '',
    phraseLedger ? '## Phrase Ledger\n\n' + phraseLedger : '',
  ].filter(Boolean).join('\n\n---\n\n');

  try {
    const response = await this.claude.sendOneShot({
      model: VERITY_AUDIT_MODEL,
      systemPrompt: auditorPrompt,
      userMessage,
      maxTokens: VERITY_AUDIT_MAX_TOKENS,
    });

    // Parse JSON from response — strip markdown fences if present
    const clean = response.replace(/```json\s*|```/g, '').trim();
    return JSON.parse(clean) as AuditResult;
  } catch (err) {
    console.warn(`[ChatService] Audit failed for ${chapterSlug}:`, err);
    return null;
  }
}
```

### Add `fixChapter` Method

A private method that runs the fix pass with audit findings:

```typescript
/**
 * Run the fix pass on a chapter using audit findings. Verity edits the
 * draft in-place to address each violation.
 */
private async fixChapter(params: {
  bookSlug: string;
  chapterSlug: string;
  auditResult: AuditResult;
  conversationId: string;
  sessionId: string;
  onEvent: (event: StreamEvent) => void;
}): Promise<void> {
  const { bookSlug, chapterSlug, auditResult, conversationId, sessionId, onEvent } = params;

  const appSettings = await this.settings.load();
  const thinkingBudget = appSettings.enableThinking ? 8000 : undefined;

  // Build the fix prompt with audit findings
  const auditJson = JSON.stringify(auditResult.violations, null, 2);
  const fixInstructions = VERITY_FIX_INSTRUCTIONS + '\n```json\n' + auditJson + '\n```';

  // Load Verity core + the fix instructions
  const corePrompt = await this.agents.loadComposite('VERITY-CORE.md', []);
  const systemPrompt = corePrompt + '\n\n---\n\n' + fixInstructions;

  const userMessage = `Fix the ${auditResult.violations.length} violations identified by the audit in chapters/${chapterSlug}/draft.md. Edit the file in place. Do not rewrite unflagged prose.`;

  // Save synthetic messages
  this.db.saveMessage({
    conversationId,
    role: 'user',
    content: `[Auto-fix: ${auditResult.violations.length} violations in ${chapterSlug}]`,
    thinking: '',
  });

  await this.claude.sendMessage({
    model: appSettings.model, // Opus for fix pass — needs creative judgment
    systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: appSettings.maxTokens,
    thinkingBudget,
    bookSlug,
    sessionId,
    conversationId: `${conversationId}-fix`,
    onEvent: (event: StreamEvent) => {
      if (event.type === 'status' || event.type === 'progressStage' || event.type === 'filesChanged') {
        onEvent(event);
      }
      if (event.type === 'done') {
        this.usage.recordUsage({
          conversationId,
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          thinkingTokens: event.thinkingTokens,
          model: appSettings.model,
        });
      }
    },
  });
}
```

---

## Task 5: Domain Type for Audit Results

### Update `src/domain/types.ts`

Add the audit result types:

```typescript
// === Verity Audit ===

export type AuditViolationType =
  | 'editorial-narration'
  | 'phrase-ledger-hit'
  | 'anti-pattern'
  | 'voice-drift'
  | 'continuity-error';

export type AuditViolation = {
  type: AuditViolationType;
  location: string;
  quote: string;
  reason: string;
  pattern?: string;       // for anti-pattern type: which specific pattern
};

export type AuditSeverity = 'clean' | 'minor' | 'moderate' | 'heavy';

export type AuditResult = {
  chapter: string;
  violations: AuditViolation[];
  summary: {
    total: number;
    by_type: Partial<Record<AuditViolationType, number>>;
    severity: AuditSeverity;
  };
};
```

---

## Task 6: Auto-Draft Store — Three-Pass Loop

### Update `src/renderer/stores/autoDraftStore.ts`

Replace the single-call chapter loop with a three-step loop.

#### Update `AUTO_DRAFT_PROMPT`

The draft prompt stays the same — it's the user message sent to Verity, not the system prompt. The system prompt is now assembled by ChatService using the composite loading.

#### Update the chapter loop

Inside the `while` loop, after detecting a new chapter was written (`countAfter > countBefore`):

```typescript
if (countAfter > countBefore) {
  const newChapters = countAfter - countBefore;
  patch({ chaptersWritten: (session()?.chaptersWritten ?? 0) + newChapters });

  // ── Pass 2: Audit ──────────────────────────────────────────────
  if (!session()?.stopRequested) {
    onEvent({ type: 'status', message: 'Auditing chapter...' });

    try {
      const auditResult = await window.novelEngine.verity.auditChapter(
        bookSlug,
        newChapterSlug, // need to detect which chapter was just written
      );

      if (auditResult && shouldFix(auditResult.summary.severity)) {
        // ── Pass 3: Fix ──────────────────────────────────────────
        onEvent({ type: 'status', message: `Fixing ${auditResult.summary.total} issues...` });

        await window.novelEngine.verity.fixChapter(
          bookSlug,
          newChapterSlug,
          conversationId,
        );
      }
    } catch (err) {
      // Audit/fix failure is non-fatal — the draft is still valid
      console.warn('[auto-draft] Audit/fix pass failed:', err);
    }
  }

  // ── Periodic phrase audit ─────────────────────────────────────
  const totalChapters = session()?.chaptersWritten ?? 0;
  if (totalChapters > 0 && totalChapters % PHRASE_AUDIT_CADENCE === 0) {
    if (!session()?.stopRequested) {
      onEvent({ type: 'status', message: 'Rebuilding phrase ledger...' });
      try {
        await window.novelEngine.verity.runPhraseAudit(bookSlug);
      } catch {
        console.warn('[auto-draft] Periodic phrase audit failed');
      }
    }
  }

  // Existing: refresh pipeline, word count, etc.
  usePipelineStore.getState().loadPipeline(bookSlug);
  // ...
}
```

#### Helper: `shouldFix`

```typescript
function shouldFix(severity: string): boolean {
  // Fix on 'moderate' or 'heavy'. Skip on 'clean' or 'minor'.
  return severity === 'moderate' || severity === 'heavy';
}
```

#### Detecting the new chapter slug

After a chapter is written, the auto-draft loop needs to know which chapter was just created. Compare the chapter list before and after:

```typescript
// Before the send:
const chaptersBefore = await window.novelEngine.books.wordCount(bookSlug);
const slugsBefore = new Set(chaptersBefore.map(c => c.slug));

// After the send (chapter count increased):
const chaptersAfter = await window.novelEngine.books.wordCount(bookSlug);
const newChapterSlug = chaptersAfter.find(c => !slugsBefore.has(c.slug))?.slug;
```

If `newChapterSlug` is undefined (shouldn't happen if count increased), skip the audit pass.

---

## Task 7: IPC + Preload Wiring

### Update `src/main/ipc/handlers.ts`

Add handlers for the new Verity pipeline operations:

```typescript
ipcMain.handle('verity:auditChapter', (_, bookSlug: string, chapterSlug: string) =>
  services.chat.auditChapter({ bookSlug, chapterSlug }),
);

ipcMain.handle('verity:fixChapter', (_, bookSlug: string, chapterSlug: string, conversationId: string) =>
  services.chat.fixChapter({
    bookSlug,
    chapterSlug,
    conversationId,
    sessionId: nanoid(),
    onEvent: () => {}, // Background task — events not surfaced to renderer
  }),
);

ipcMain.handle('verity:runPhraseAudit', (_, bookSlug: string) =>
  services.chat.runPhraseAudit({
    bookSlug,
    appSettings: await services.settings.load(),
    onEvent: () => {},
    sessionId: nanoid(),
  }),
);
```

### Update `src/preload/index.ts`

Add the `verity` namespace to the bridge:

```typescript
verity: {
  auditChapter: (bookSlug: string, chapterSlug: string): Promise<AuditResult | null> =>
    ipcRenderer.invoke('verity:auditChapter', bookSlug, chapterSlug),
  fixChapter: (bookSlug: string, chapterSlug: string, conversationId: string): Promise<void> =>
    ipcRenderer.invoke('verity:fixChapter', bookSlug, chapterSlug, conversationId),
  runPhraseAudit: (bookSlug: string): Promise<void> =>
    ipcRenderer.invoke('verity:runPhraseAudit', bookSlug),
},
```

Add `AuditResult` to the `import type` list.

---

## Task 8: Agent File Migration

### Rename and Archive

1. Copy `agents/VERITY.md` → `agents/VERITY-LEGACY.md`
2. Create the five new agent files as specified in Task 1
3. Delete `agents/VERITY.md` (the registry now points to `VERITY-CORE.md`)

### Update `ensureAgents` skip list

In `src/main/bootstrap.ts`, add `VERITY-LEGACY.md` to the skip list so it isn't restored on startup:

```typescript
const SKIP_FILES = new Set(['VERITY-LEGACY.md']);
```

Or simply don't include it in the bundled agents directory for production builds.

---

## Token Budget Impact

Approximate token counts for each configuration:

| Configuration | Current | After Refactor |
|---|---|---|
| Verity scaffolding | ~4,500 (full prompt) | ~1,800 (core + scaffold) |
| Verity first draft | ~4,500 (full prompt) | ~2,200 (core + draft) |
| Verity revision | ~4,500 (full prompt) | ~2,400 (core + revision) |
| Verity mechanical fixes | ~4,500 (full prompt) | ~2,000 (core + mechanical) |
| Verity voice setup | ~4,500 + voice instructions | ~1,800 + voice instructions |
| Audit pass (Sonnet) | N/A | ~2,500 (auditor + anti-patterns) |
| Fix pass (Opus) | N/A | ~2,000 (core + fix instructions + findings) |

Net effect: Verity's per-call system prompt shrinks by ~40-60% depending on phase. The audit and fix passes add ~2 extra calls per chapter during auto-draft, but on cheaper models (Sonnet for audit) and smaller prompts (fix pass only loads violations, not the full anti-pattern list).

---

## Cost Impact

Per chapter during auto-draft (approximate):

| | Current | After Refactor |
|---|---|---|
| Draft call | 1× Opus, ~4,500 system tokens | 1× Opus, ~2,200 system tokens |
| Audit call | — | 1× Sonnet, ~2,500 system tokens |
| Fix call | — | 0-1× Opus, ~2,000 system tokens |
| **Total calls** | **1** | **2-3** |
| **Opus calls** | **1** | **1-2** |
| **Sonnet calls** | **0** | **1** |

The Sonnet audit call is ~10× cheaper than an Opus call. The fix pass only fires when the audit finds moderate+ issues. For a 30-chapter novel, expect ~40-50% of chapters to need a fix pass in the first draft (decreasing as the voice profile stabilizes). Net cost increase: ~15-25% per chapter, buying significantly better output quality.

---

## Verification

1. **Compilation**: `npx tsc --noEmit` passes with all changes
2. **Layer boundaries**: No new cross-layer imports. AgentService stays in infrastructure. ChatService stays in application. Auto-draft store stays in renderer.
3. **Scaffolding**: Start a scaffold conversation with Verity. Verify the system prompt contains VERITY-CORE + VERITY-SCAFFOLD but NOT the anti-patterns list, phrase ledger rules, or revision instructions.
4. **First draft (manual)**: Start a first-draft conversation. Verify VERITY-CORE + VERITY-DRAFT are loaded. Write a chapter manually. No audit runs (audit is auto-draft only for manual writing).
5. **Auto-draft loop**: Start auto-draft on a book with 3+ outlined chapters.
    - Chapter 1: draft → audit → fix (if needed) → phrase ledger update
    - Chapter 2: draft → audit → fix (if needed) → phrase ledger update
    - Chapter 3: draft → audit → fix (if needed) → phrase ledger update → **full phrase audit** (cadence = 3)
6. **Audit output**: Inspect the `audit.json` returned by the Sonnet call. Confirm it's valid JSON with the expected structure.
7. **Fix pass gating**: If audit returns `severity: 'minor'`, verify the fix pass is skipped. If `severity: 'moderate'`, verify the fix pass runs.
8. **Voice setup**: Start a voice-setup conversation. Verify VERITY-CORE + VOICE_SETUP_INSTRUCTIONS are loaded (no phase file).
9. **Backward compatibility**: All existing conversations continue to work. The pipeline tracker is unchanged. File detection gates are unchanged.
10. **Agent restoration**: Delete a Verity sub-prompt file. Restart the app. Verify `ensureAgents` restores it from the bundled copy.