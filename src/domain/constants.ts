/**
 * NOTE: Some constants in this file are imported by the renderer layer
 * (value imports, not type-only). Permitted for pure data constants
 * with zero Node.js dependencies. See docs/architecture/ARCHITECTURE.md.
 */
import type { AgentName, AgentMeta, AuditSeverity, CreativeAgentName, PipelinePhaseId, AppSettings, ProviderId, ProviderConfig } from './types';

// === Per-Agent Read Guidance ===

export type ReadGuidance = {
  alwaysRead: string[];
  readIfRelevant: string[];
  neverRead: string[];
};

export const AGENT_READ_GUIDANCE: Record<CreativeAgentName, ReadGuidance> = {
  Spark: {
    alwaysRead: ['author-profile.md'],
    readIfRelevant: ['source/pitch.md', 'series-bible.md'],
    neverRead: ['chapters/', 'source/reader-report.md', 'source/dev-report.md', 'source/audit-report.md'],
  },
  Verity: {
    alwaysRead: ['source/voice-profile.md', 'source/motif-ledger.json'],
    readIfRelevant: ['source/pitch.md', 'source/scene-outline.md', 'source/story-bible.md', 'author-profile.md', 'source/revision-prompts.md', 'series-bible.md'],
    neverRead: ['source/reader-report.md', 'source/dev-report.md', 'source/audit-report.md'],
  },
  Ghostlight: {
    alwaysRead: [],
    readIfRelevant: ['series-bible.md'],
    neverRead: ['source/pitch.md', 'source/scene-outline.md', 'source/story-bible.md', 'author-profile.md', 'source/voice-profile.md', 'source/dev-report.md'],
  },
  Lumen: {
    alwaysRead: ['source/reader-report.md'],
    readIfRelevant: ['source/scene-outline.md', 'source/story-bible.md', 'source/pitch.md', 'source/motif-ledger.json', 'series-bible.md'],
    neverRead: ['author-profile.md', 'source/revision-prompts.md'],
  },
  Sable: {
    alwaysRead: ['source/style-sheet.md', 'source/story-bible.md'],
    readIfRelevant: ['source/motif-ledger.json', 'series-bible.md'],
    neverRead: ['source/scene-outline.md', 'source/pitch.md', 'author-profile.md', 'source/reader-report.md', 'source/dev-report.md'],
  },
  Forge: {
    alwaysRead: ['source/dev-report.md'],
    readIfRelevant: ['source/reader-report.md', 'source/audit-report.md', 'source/scene-outline.md', 'series-bible.md'],
    neverRead: ['chapters/', 'author-profile.md'],
  },
  Quill: {
    alwaysRead: ['author-profile.md'],
    readIfRelevant: ['source/story-bible.md', 'source/pitch.md', 'series-bible.md'],
    neverRead: ['chapters/', 'source/reader-report.md', 'source/dev-report.md'],
  },
};

// Agent metadata (everything except the systemPrompt, which comes from files)
export const AGENT_REGISTRY: Record<AgentName, Omit<AgentMeta, 'name'>> = {
  Spark:      { filename: 'SPARK.md',      role: 'Story Pitch',           color: '#F59E0B', thinkingBudget: 4000, maxTurns: 5 },
  Verity:     { filename: 'VERITY-CORE.md', role: 'Ghostwriter',           color: '#8B5CF6', thinkingBudget: 10000, maxTurns: 30 },
  Ghostlight: { filename: 'GHOSTLIGHT.md', role: 'First Reader',          color: '#06B6D4', thinkingBudget: 6000, maxTurns: 50 },
  Lumen:      { filename: 'LUMEN.md',      role: 'Developmental Editor',  color: '#10B981', thinkingBudget: 16000, maxTurns: 50 },
  Sable:      { filename: 'SABLE.md',      role: 'Copy Editor',           color: '#EF4444', thinkingBudget: 4000, maxTurns: 20 },
  Forge:      { filename: 'FORGE.md',      role: 'Task Master',           color: '#F97316', thinkingBudget: 8000, maxTurns: 10 },
  Quill:      { filename: 'QUILL.md',      role: 'Publisher',             color: '#6366F1', thinkingBudget: 4000, maxTurns: 8 },
  Wrangler:   { filename: 'WRANGLER.md',   role: 'Revision Plan Parser',  color: '#71717A', thinkingBudget: 4000, maxTurns: 3 },
  Helper:     { filename: 'HELPER.md',    role: 'Help & FAQ',            color: '#3B82F6', thinkingBudget: 2000, maxTurns: 5 },
};

/** Reserved book slug used for Pitch Room conversations and draft files. */
export const PITCH_ROOM_SLUG = '__pitch-room__';

/** Reserved book slug used for Helper agent conversations. */
export const HELPER_SLUG = '__helper__';

// Creative agents only — excludes Wrangler (used for UI agent lists)
export const CREATIVE_AGENT_NAMES: CreativeAgentName[] = ['Spark', 'Verity', 'Ghostlight', 'Lumen', 'Sable', 'Forge', 'Quill'];

// Pipeline phase definitions (order matters — it IS the pipeline)
export const PIPELINE_PHASES: { id: PipelinePhaseId; label: string; agent: AgentName | null; description: string }[] = [
  { id: 'pitch',              label: 'Story Pitch',           agent: 'Spark',      description: 'Discover and pitch your story concept' },
  { id: 'scaffold',           label: 'Story Scaffold',        agent: 'Verity',     description: 'Build the scene outline and story bible from the pitch' },
  { id: 'first-draft',        label: 'First Draft',           agent: 'Verity',     description: 'Write the complete first draft chapter by chapter' },
  { id: 'first-read',         label: 'First Read',            agent: 'Ghostlight', description: 'Cold read for reader experience feedback' },
  { id: 'first-assessment',   label: 'Structural Assessment', agent: 'Lumen',      description: 'Diagnose structural strengths and weaknesses' },
  { id: 'revision-plan-1',    label: 'Revision Plan',         agent: 'Forge',      description: 'Synthesize feedback into a revision task list' },
  { id: 'revision',           label: 'Revision',              agent: 'Verity',     description: 'Implement structural changes' },
  { id: 'second-read',        label: 'Second Read',           agent: 'Ghostlight', description: 'Read the revised manuscript' },
  { id: 'second-assessment',  label: 'Second Assessment',     agent: 'Lumen',      description: 'Verify revisions and assess readiness' },
  { id: 'copy-edit',          label: 'Copy Edit',             agent: 'Sable',      description: 'Grammar, consistency, and mechanical polish' },
  { id: 'revision-plan-2',    label: 'Fix Planning',          agent: 'Forge',      description: 'Plan copy-level fixes' },
  { id: 'mechanical-fixes',   label: 'Mechanical Fixes',      agent: 'Verity',     description: 'Implement copy-level fixes' },
  { id: 'build',              label: 'Build',                 agent: null,          description: 'Generate DOCX, EPUB, and PDF' },
  { id: 'publish',            label: 'Publish & Audit',       agent: 'Quill',      description: 'Audit outputs and prepare metadata' },
];

/**
 * Maps pipeline phases to the output file(s) each agent is expected to write.
 *
 * Used by:
 * - Post-stream file extraction: when a non-tool-use provider finishes a
 *   pipeline conversation, the response text is written to these paths.
 * - Capability guard: ChatService warns the user when the active provider
 *   lacks tool-use and these files will be auto-extracted instead.
 *
 * Phases not listed here have no extractable single-file output (e.g.
 * 'first-draft' writes to chapters/, 'revision' modifies existing chapters,
 * 'build' is a system operation).
 */
export const PHASE_OUTPUT_FILES: Partial<Record<PipelinePhaseId, string[]>> = {
  'pitch':             ['source/pitch.md'],
  'scaffold':          ['source/scene-outline.md'],
  'first-read':        ['source/reader-report.md'],
  'first-assessment':  ['source/dev-report.md'],
  'revision-plan-1':   ['source/project-tasks.md', 'source/revision-prompts.md'],
  'second-read':       ['source/reader-report.md'],
  'second-assessment': ['source/dev-report.md'],
  'copy-edit':         ['source/audit-report.md'],
  'revision-plan-2':   ['source/project-tasks.md', 'source/revision-prompts.md'],
  'publish':           ['source/metadata.md'],
};

/**
 * @deprecated Use `BUILT_IN_PROVIDER_CONFIGS[0].models` or
 * `IProviderRegistry.listAllModels()` instead. Retained for backward
 * compatibility until the renderer SettingsView is updated.
 */
export const AVAILABLE_MODELS = [
  { id: 'claude-opus-4-20250514',   label: 'Claude Opus 4',   description: 'Best quality — recommended for all agents' },
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', description: 'Faster and cheaper — good for copy editing' },
] as const;

/** The built-in Claude CLI provider ID. Always present, cannot be removed. */
export const CLAUDE_CLI_PROVIDER_ID: ProviderId = 'claude-cli';

/** Reserved provider ID for OpenCode CLI (future implementation). */
export const OPENCODE_CLI_PROVIDER_ID: ProviderId = 'opencode-cli';

/** Built-in Ollama CLI provider ID. Always present if CLI is detected. */
export const OLLAMA_CLI_PROVIDER_ID: ProviderId = 'ollama-cli';

/** Built-in llama-server provider ID. Always present, enabled when server is reachable. */
export const LLAMA_SERVER_PROVIDER_ID: ProviderId = 'llama-server';

/** Default provider configurations shipped with the app. */
export const BUILT_IN_PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    id: CLAUDE_CLI_PROVIDER_ID,
    type: 'claude-cli',
    name: 'Claude CLI',
    enabled: true,
    isBuiltIn: true,
    models: [
      {
        id: 'claude-opus-4-20250514',
        label: 'Claude Opus 4',
        description: 'Best quality — recommended for all agents',
        providerId: CLAUDE_CLI_PROVIDER_ID,
        contextWindow: 200_000,
        supportsThinking: true,
        supportsToolUse: true,
      },
      {
        id: 'claude-sonnet-4-20250514',
        label: 'Claude Sonnet 4',
        description: 'Faster and cheaper — good for copy editing',
        providerId: CLAUDE_CLI_PROVIDER_ID,
        contextWindow: 200_000,
        supportsThinking: true,
        supportsToolUse: true,
      },
    ],
    defaultModel: 'claude-opus-4-20250514',
    capabilities: ['text-completion', 'tool-use', 'thinking', 'streaming'],
  },
  {
    id: OLLAMA_CLI_PROVIDER_ID,
    type: 'ollama-cli',
    name: 'Ollama CLI',
    enabled: false, // enabled dynamically when CLI is detected
    isBuiltIn: true,
    models: [], // populated at runtime via `ollama list`
    capabilities: ['text-completion', 'streaming', 'tool-use'],
  },
  {
    id: LLAMA_SERVER_PROVIDER_ID,
    type: 'llama-server',
    name: 'llama-server',
    enabled: false, // enabled dynamically when server is reachable
    isBuiltIn: true,
    baseUrl: 'http://127.0.0.1:8080',
    models: [], // populated at runtime via /v1/models
    capabilities: ['text-completion', 'streaming', 'tool-use'],
  },
];

// Default settings
export const DEFAULT_SETTINGS: AppSettings = {
  hasClaudeCli: false,
  hasOllamaCli: false,
  model: 'claude-sonnet-4-20250514',
  maxTokens: 8192,
  enableThinking: false,
  thinkingBudget: 5000,
  overrideThinkingBudget: false,
  autoCollapseThinking: true,
  enableNotifications: true,
  theme: 'dark',
  initialized: false,
  authorName: '',
  providers: BUILT_IN_PROVIDER_CONFIGS,
  activeProviderId: CLAUDE_CLI_PROVIDER_ID,
  completedTours: [],
  savedPrompts: [],
};

// === Agent Quick Actions ===
// Pre-built prompts shown in a dropdown next to the chat input, per agent.

export type QuickAction = {
  label: string;     // short label shown in the dropdown
  prompt: string;    // the full text inserted into the chat input
};

export const AGENT_QUICK_ACTIONS: Record<CreativeAgentName, QuickAction[]> = {
  Spark: [
    { label: 'Pitch me a story', prompt: 'Pitch me a story. Ask me questions to discover what I\'m drawn to — genre, themes, emotions, a character, a "what if." When the concept crystallizes, produce a full pitch card and write it to source/pitch.md.' },
    { label: 'I have an idea...', prompt: 'I have a story idea. Here it is:' },
    { label: 'Revisit the pitch', prompt: 'Read the current pitch in source/pitch.md. Let\'s refine it — something isn\'t clicking yet. Ask me what feels off, then revise and rewrite the pitch file.' },
  ],
  Verity: [
    { label: 'Next chapter', prompt: 'Write the next chapter of this novel according to the scene outline.\nInstructions:\n1. Read source/scene-outline.md to identify all planned chapters in order.\n2. Check the chapters/ directory to see which chapters already have a draft.md.\n3. Find the next chapter that is missing a draft.md and write the complete prose for it as chapters/[NN-slug]/draft.md. Use the correct zero-padded chapter number and a descriptive slug.\n4. After writing the chapter, update source/story-bible.md to record any new characters, locations, or significant plot developments introduced.\n5. If all chapters in the scene outline already have draft files, tell me the draft is complete.' },
    { label: 'Build scene outline', prompt: 'Read the pitch in source/pitch.md and build a complete scene outline. Create a chapter-by-chapter structural plan with scene beats, POV, and dramatic purpose for each chapter. Write it to source/scene-outline.md.' },
    { label: 'Build story bible', prompt: 'Read the pitch in source/pitch.md and the scene outline in source/scene-outline.md. Build the story bible — characters (with arcs, wants, needs, flaws), key relationships, world rules, locations, and timeline. Write it to source/story-bible.md.' },
    { label: 'Revise chapter...', prompt: 'Revise chapter' },
  ],
  Ghostlight: [
    { label: 'Read the manuscript', prompt: 'Read the full manuscript from beginning to end — every chapter in order. Then produce your reader report and write it to source/reader-report.md. Give me your honest, unfiltered experience as a first reader.' },
    { label: 'Hot Take', prompt: '__HOT_TAKE__' },
    // ── Granular passes (manual fallback for multi-call orchestration) ──
    { label: 'Read first half', prompt: 'Read the first half of the manuscript chapters (by word count). Track your engagement, emotions, clarity, pull quotes, drift points, and running questions for each chapter. Write your chapter-by-chapter tracker to source/.scratch/ghostlight-read-1.md.' },
    { label: 'Read second half', prompt: 'Read the second half of the manuscript chapters (by word count). Read source/.scratch/ghostlight-read-1.md first to recall your experience from the first batch. Continue tracking for each chapter. Write your tracker to source/.scratch/ghostlight-read-2.md.' },
    { label: 'Synthesize report', prompt: 'Synthesize the final Reader Report. Read source/.scratch/ghostlight-read-1.md and source/.scratch/ghostlight-read-2.md. Combine into the complete reader report with engagement map, emotional arc, running questions, prediction log, strongest/weakest moments, and overall verdict. Write to source/reader-report.md.' },
  ],
  Lumen: [
    { label: 'Full assessment', prompt: 'Run the full developmental assessment. Read the entire manuscript, apply all seven lenses, and produce the complete report with pacing map, scene necessity audit, and revision roadmap. Write it to source/dev-report.md.' },
    { label: 'Pacing & scenes', prompt: 'Focus on Lens 4 (Pacing & Momentum) and Lens 5 (Scene Necessity). Read the manuscript, produce the pacing map and scene audit table, and flag any sagging sections or underperforming scenes.' },
    { label: 'Character arcs', prompt: 'Focus on Lens 2 (Protagonist Arc) and Lens 3 (Supporting Cast). Map the protagonist\'s internal trajectory and assess every significant supporting character\'s function. Flag arc stalls, unearned transformations, and redundant characters.' },
    // ── Granular passes (manual fallback for multi-call orchestration) ──
    // Step 1: Read the manuscript in batches, building structural tracking notes
    { label: 'Read first half', prompt: 'Read the first half of the manuscript chapters (by word count) as a developmental editor. For each chapter, track: premise signals, protagonist arc beats, supporting cast function, pacing (tempo/tension), scene purpose, prose/craft notes, thematic markers, and key quotes. Write your structural tracking notes to source/.scratch/lumen-read-1.md.' },
    { label: 'Read second half', prompt: 'Read the second half of the manuscript chapters (by word count) as a developmental editor. First read source/.scratch/lumen-read-1.md to carry forward your observations. Continue tracking for each chapter: premise signals, protagonist arc beats, supporting cast, pacing, scene purpose, prose/craft, thematic markers, and key quotes. Write to source/.scratch/lumen-read-2.md.' },
    // Step 2: Analyze tracking notes through lenses (do NOT re-read chapters)
    { label: 'Lenses 1–3: Structure', prompt: 'Run Lenses 1–3 only. Do NOT read manuscript chapters — read ONLY the tracking note files in source/.scratch/ that start with lumen-read-. Analyze Premise & Promise, Protagonist Arc, and Supporting Cast from your structural notes. Write your analysis to source/.scratch/lumen-lenses-1-3.md. Do not produce the final dev report.' },
    { label: 'Lenses 4–5: Pacing', prompt: 'Run Lenses 4–5 only. Do NOT read manuscript chapters — read ONLY the tracking note files in source/.scratch/ that start with lumen-read-, plus source/.scratch/lumen-lenses-1-3.md for context. Produce the pacing map and scene necessity audit from your structural notes. Write to source/.scratch/lumen-lenses-4-5.md. Do not produce the final dev report.' },
    { label: 'Lenses 6–7: Craft', prompt: 'Run Lenses 6–7 only. Do NOT read manuscript chapters — read ONLY the tracking note files in source/.scratch/ that start with lumen-read-, plus source/.scratch/lumen-lenses-1-3.md and source/.scratch/lumen-lenses-4-5.md for context. Analyze Prose & Craft and Thematic Integration from your structural notes. Write to source/.scratch/lumen-lenses-6-7.md. Do not produce the final dev report.' },
    { label: 'Synthesize report', prompt: 'Synthesize the final Developmental Assessment. Read source/.scratch/lumen-lenses-1-3.md, source/.scratch/lumen-lenses-4-5.md, and source/.scratch/lumen-lenses-6-7.md. Do NOT read manuscript chapters. Produce the complete dev report with all 7 lenses, pacing map, scene audit table, and revision roadmap. Write to source/dev-report.md.' },
  ],
  Sable: [
    { label: 'Copy edit', prompt: 'Copy edit the full manuscript. Read every chapter in order, audit for grammar, consistency, and mechanical issues, then produce the audit report and write it to source/audit-report.md. Build or update the style sheet at source/style-sheet.md.' },
    { label: 'Build style sheet', prompt: 'Read the manuscript and build a style sheet — catalog all character name spellings, place names, hyphenation choices, number formatting, recurring constructions, and any inconsistencies. Write it to source/style-sheet.md.' },
    // ── Granular passes (manual fallback for multi-call orchestration) ──
    { label: 'Pass 1: Style Sheet', prompt: 'Run Pass 1: Style Sheet Construction & Consistency. Read the manuscript chapters in order. Build (or update) the Style Sheet at source/style-sheet.md. Flag every spelling, capitalization, hyphenation, and formatting deviation. Write findings to source/.scratch/sable-pass-1.md. Do not produce the final audit report.' },
    { label: 'Pass 2: Continuity', prompt: 'Run Pass 2: Continuity & Facts. Read the manuscript chapters. Cross-reference against the Story Bible. Track character details, timeline, geography, and object continuity. Flag contradictions. Read source/.scratch/sable-pass-1.md to avoid duplicates. Write findings to source/.scratch/sable-pass-2.md.' },
    { label: 'Pass 3: Grammar', prompt: 'Run Pass 3: Grammar & Mechanics. Read the manuscript chapters. Audit for grammar, punctuation, syntax. Cross-reference the Voice Profile for intentional choices. Give dialogue punctuation a focused sub-pass. Write findings to source/.scratch/sable-pass-3.md.' },
    { label: 'Pass 4: Repetition', prompt: 'Run Pass 4: Repetition & Word-Level Issues. Read the manuscript. Flag unintentional repetition, echo words, crutch words (with frequency counts), and malapropisms. Check Voice Profile "Avoid" list. Write findings to source/.scratch/sable-pass-4.md.' },
    { label: 'Pass 5: Formatting', prompt: 'Run Pass 5: Formatting & Production. Read the manuscript. Verify chapter headings, scene breaks, check for stray placeholders, verify part.txt dividers, flag formatting issues. Write findings to source/.scratch/sable-pass-5.md.' },
    { label: 'Synthesize report', prompt: 'Synthesize the final Copy Edit Audit Report. Read all five pass results: source/.scratch/sable-pass-1.md through source/.scratch/sable-pass-5.md. Combine into one structured audit report with summary, findings by chapter, global findings, and queries for author. Write to source/audit-report.md. Update source/style-sheet.md if needed.' },
  ],
  Forge: [
    { label: 'Create revision plan', prompt: 'Read source/reader-report.md and source/dev-report.md. Synthesize both into a prioritized revision plan with phased tasks and session prompts for Verity. Write the task list to source/project-tasks.md and the session prompts to source/revision-prompts.md.' },
    { label: 'Plan copy fixes', prompt: 'Read source/audit-report.md. Create a fix plan with session prompts for Verity to implement the mechanical fixes. Write tasks to source/project-tasks.md and session prompts to source/revision-prompts.md.' },
    { label: 'Plan from my feedback', prompt: 'I have specific revisions I want made. Here\'s what I need changed:\n\n' },
  ],
  Quill: [
    { label: 'Prepare for publication', prompt: 'Audit the build outputs in dist/. Generate publication metadata — title, subtitle, description, keywords, categories, and back-cover copy. Flag any remaining issues. Write metadata to source/metadata.md.' },
    { label: 'Generate metadata', prompt: 'Read the manuscript and pitch. Generate publication metadata — title, subtitle, description, keywords, BISAC categories, comp titles, and back-cover copy. Write it to source/metadata.md.' },
    { label: 'Query Letter (Traditional)', prompt: `Write a professional query letter for traditional publishing submission.

A query letter is approximately 250-300 words and has three parts:
1. Hook + premise (one compelling paragraph that introduces protagonist, inciting incident, and stakes)
2. Plot summary (one paragraph: setup, conflict, midpoint, climax hint — no spoilers on resolution)
3. Brief bio + comp titles (your relevant credentials and 2-3 recent comparable titles)

Read the pitch, story bible, and voice profile for context. Write the letter in first person as the author. Output to source/query-letter.md.` },
    { label: 'Synopsis (Traditional)', prompt: `Write a full-plot synopsis for traditional publishing.

A synopsis is 1-2 pages (400-800 words). Unlike a query letter, it does NOT withhold the ending — agents need to know the full arc.

Include:
- Protagonist introduction and core want/need
- Inciting incident
- Key turning points and midpoint
- Climax and resolution
- Protagonist's arc and change

Read the full manuscript and scene outline. Write in present tense, third person. Output to source/synopsis.md.` },
  ],
};

// Token estimation: ~4 chars per token for English
export const CHARS_PER_TOKEN = 4;
// Opus context window
export const MAX_CONTEXT_TOKENS = 200_000;
// Reserve for response + system prompt overhead
export const CONTEXT_RESERVE_TOKENS = 14_000;

// === Model Pricing (USD per 1M tokens at API rates — used for cost estimation) ===

export type ModelPricing = {
  inputPer1M: number;
  outputPer1M: number;
};

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-opus-4-20250514': { inputPer1M: 15, outputPer1M: 75 },
  'claude-sonnet-4-20250514': { inputPer1M: 3, outputPer1M: 15 },
};

// === Dynamic Turn Budget ===

/**
 * Turn budget thresholds — expressed as fractions of the total context window.
 * The compactor uses the *remaining* token budget (after system prompt, thinking,
 * and response reserve are subtracted) to decide how many turns to keep.
 *
 * - GENEROUS: > 40% of window is free → keep all turns (strip old thinking)
 * - MODERATE: 20–40% free → keep last 6–8 turns, prepend a summary note
 * - TIGHT:    10–20% free → keep last 3–4 turns, prepend a summary note
 * - CRITICAL: < 10% free → keep only current turn + brief recap
 */
export const TURN_BUDGET_THRESHOLDS = {
  /** Above this fraction → keep all turns */
  generous: 0.40,
  /** Above this fraction → keep 6–8 recent turns */
  moderate: 0.20,
  /** Above this fraction → keep 3–4 recent turns */
  tight: 0.10,
  /** Below tight → emergency mode, 1 turn + recap */
} as const;

/**
 * How many recent turns to keep at each compaction level.
 * "turns" means individual messages (both user and assistant).
 */
export const TURN_KEEP_COUNTS = {
  /** Moderate budget — keep this many recent turns */
  moderate: 8,
  /** Tight budget — keep this many recent turns */
  tight: 4,
  /** Critical budget — keep only this many (the current exchange) */
  critical: 2,
} as const;

// === Wrangler Model (used by RevisionQueueService for parsing Forge output) ===

// The model used for parsing revision plans (cheap and fast)
export const WRANGLER_MODEL = 'claude-sonnet-4-20250514';

// Per-agent expected response sizes (tokens) — used for response buffer calculation
export const AGENT_RESPONSE_BUFFER: Record<AgentName, number> = {
  Spark:      4000,
  Verity:     10000,
  Ghostlight: 12000,
  Lumen:      12000,
  Sable:      10000,
  Forge:      8000,
  Quill:      6000,
  Wrangler:   2000,
  Helper:     2000,
};

export const HOT_TAKE_MODEL = 'claude-opus-4-20250514';

// Canonical file manifest keys — maps internal keys to display paths.
// NOTE: paths are relative to the book root EXCEPT authorProfile which lives in
// {userDataDir}/author-profile.md.
export const FILE_MANIFEST_KEYS: { key: string; path: string }[] = [
  { key: 'voiceProfile',    path: 'source/voice-profile.md' },
  { key: 'sceneOutline',    path: 'source/scene-outline.md' },
  { key: 'storyBible',      path: 'source/story-bible.md' },
  { key: 'pitch',           path: 'source/pitch.md' },
  { key: 'authorProfile',   path: 'author-profile.md' },
  { key: 'seriesBible',     path: 'series-bible.md' },  // resolved to absolute path at runtime
  { key: 'readerReport',    path: 'source/reader-report.md' },
  { key: 'devReport',       path: 'source/dev-report.md' },
  { key: 'auditReport',     path: 'source/audit-report.md' },
  { key: 'revisionPrompts', path: 'source/revision-prompts.md' },
  { key: 'styleSheet',      path: 'source/style-sheet.md' },
  { key: 'projectTasks',    path: 'source/project-tasks.md' },
  { key: 'motifLedger',     path: 'source/motif-ledger.json' },
  { key: 'metadata',        path: 'source/metadata.md' },
];

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
export const VERITY_LEDGER_FILE = 'VERITY-LEDGER.md';

export const VERITY_AUDIT_AGENT_FILE = 'VERITY-AUDIT.md';

/** Model used for the audit pass. Sonnet is fast, cheap, and sufficient. */
export const VERITY_AUDIT_MODEL = 'claude-sonnet-4-20250514';

/** Max tokens for the audit pass response. The JSON output is compact. */
export const VERITY_AUDIT_MAX_TOKENS = 4096;

/**
 * Severity threshold at which the fix pass is triggered automatically.
 * 'minor' = skip fix pass. 'moderate' or 'heavy' = run fix pass.
 */
export const VERITY_AUDIT_FIX_THRESHOLD: AuditSeverity = 'moderate';

/**
 * During auto-draft, run a motif/phrase audit (via Lumen's
 * MOTIF-AUDIT.md agent file) every N chapters. This keeps the motif
 * ledger's flaggedPhrases section accurate without waiting for the
 * formal Lumen assessment phase.
 */
export const MOTIF_AUDIT_CADENCE = 3;

// === Multi-Call Orchestration Step Schemas ===
//
// Agents listed here have their pipeline work broken into multiple smaller
// CLI calls by MultiCallOrchestrator. Each step is a separate sendMessage
// call with a focused prompt and bounded context. Intermediate results go
// to source/.scratch/ and are cleaned up after synthesis.
//
// Agents NOT listed (Spark, Verity, Forge, Quill, etc.) run as a single call.

import type { MultiCallStep } from '@domain/types';

/** Scratch directory for intermediate multi-call outputs. */
export const MULTI_CALL_SCRATCH_DIR = 'source/.scratch';

/**
 * Target word count per read batch for dynamic (Ghostlight) steps.
 *
 * The orchestrator computes how many read batches are needed by dividing
 * the total manuscript word count by this target. For a 102K-word manuscript,
 * this yields ~4 batches of ~25K words each — manageable for Ollama models
 * with 128K–262K token context windows.
 *
 * Lower values = more batches = smaller context per call = slower but safer.
 * Higher values = fewer batches = larger context = faster but may stall.
 *
 * At 30K words/batch, a 102K-word manuscript produces ~4 batches instead of ~7.
 * Each batch is still well within the 128K token context of most models
 * (~30K words ≈ ~40K tokens of manuscript content).
 */
export const MULTI_CALL_TARGET_WORDS_PER_BATCH = 30_000;

/**
 * Sable (Copy Edit) — 6 steps: 5 audit passes + synthesis.
 *
 * Each pass reads the full manuscript but focuses on one error category.
 * The synthesis step reads all 5 scratch files and writes the final report.
 */
export const SABLE_MULTI_CALL_STEPS: MultiCallStep[] = [
  {
    id: 'sable-pass-1',
    label: 'Style Sheet & Consistency',
    promptTemplate: `Run Pass 1: Style Sheet Construction & Consistency.

Read the manuscript chapters in order. Build (or update) the Style Sheet at source/style-sheet.md. Flag every spelling, capitalization, hyphenation, and formatting deviation you find.

Write your findings to source/.scratch/sable-pass-1.md in the audit report format (chapter-by-chapter findings). Include the Style Sheet status at the top.

Do NOT produce the final audit report yet — this is pass 1 of 5.`,
    scratchFile: 'source/.scratch/sable-pass-1.md',
    maxTurns: 10,
    isSynthesis: false,
  },
  {
    id: 'sable-pass-2',
    label: 'Continuity & Facts',
    promptTemplate: `Run Pass 2: Continuity & Facts.

Read the manuscript chapters. Cross-reference against the Story Bible (if it exists). Track character details, timeline, geography, and object continuity. Flag contradictions and impossibilities.

Read source/.scratch/sable-pass-1.md to see what Pass 1 already found — do not duplicate those findings.

Write your findings to source/.scratch/sable-pass-2.md in the audit report format.

Do NOT produce the final audit report yet — this is pass 2 of 5.`,
    scratchFile: 'source/.scratch/sable-pass-2.md',
    maxTurns: 10,
    isSynthesis: false,
  },
  {
    id: 'sable-pass-3',
    label: 'Grammar & Mechanics',
    promptTemplate: `Run Pass 3: Grammar & Mechanics.

Read the manuscript chapters. Audit for grammar, punctuation, syntax, and sentence-level correctness. Cross-reference the Voice Profile to avoid flagging intentional style choices. Give dialogue punctuation its own focused sub-pass.

Write your findings to source/.scratch/sable-pass-3.md in the audit report format.

Do NOT produce the final audit report yet — this is pass 3 of 5.`,
    scratchFile: 'source/.scratch/sable-pass-3.md',
    maxTurns: 10,
    isSynthesis: false,
  },
  {
    id: 'sable-pass-4',
    label: 'Repetition & Word-Level',
    promptTemplate: `Run Pass 4: Repetition & Word-Level Issues.

Read the manuscript chapters. Flag unintentional repetition, echo words, crutch words (with frequency counts), and malapropisms. Check for Voice Profile "Avoid" list items.

Write your findings to source/.scratch/sable-pass-4.md in the audit report format.

Do NOT produce the final audit report yet — this is pass 4 of 5.`,
    scratchFile: 'source/.scratch/sable-pass-4.md',
    maxTurns: 10,
    isSynthesis: false,
  },
  {
    id: 'sable-pass-5',
    label: 'Formatting & Production',
    promptTemplate: `Run Pass 5: Formatting & Production.

Read the manuscript chapters. Verify chapter heading format, scene break consistency, check for stray placeholder text, verify part.txt dividers, and flag formatting issues (double spaces, dash types, quote styles, markup artifacts).

Write your findings to source/.scratch/sable-pass-5.md in the audit report format.

Do NOT produce the final audit report yet — this is pass 5 of 5.`,
    scratchFile: 'source/.scratch/sable-pass-5.md',
    maxTurns: 10,
    isSynthesis: false,
  },
  {
    id: 'sable-synthesis',
    label: 'Synthesize Audit Report',
    promptTemplate: `Synthesize the final Copy Edit Audit Report.

**IMPORTANT**: Do NOT read any manuscript chapters. Do NOT use the Read tool on any chapters/ files. The pass results already contain all findings.

Read ONLY these five pass result files (use the Read tool on each one):
- source/.scratch/sable-pass-1.md (Style Sheet & Consistency)
- source/.scratch/sable-pass-2.md (Continuity & Facts)
- source/.scratch/sable-pass-3.md (Grammar & Mechanics)
- source/.scratch/sable-pass-4.md (Repetition & Word-Level)
- source/.scratch/sable-pass-5.md (Formatting & Production)

After reading all five files, IMMEDIATELY write the final report using the Write tool. Do not read any other files.

Combine all findings into one structured audit report following the format in your system instructions. Include:
- Summary with total counts by severity
- Findings by chapter (merged from all passes)
- Global findings
- Queries for author

Write the final report to source/audit-report.md.
Also update source/style-sheet.md if Pass 1 built or modified it.`,
    scratchFile: null,
    outputFile: 'source/audit-report.md',
    maxTurns: 12,
    isSynthesis: true,
  },
];

/**
 * Lumen (Developmental Editor) — 7 steps: N read batches + 3 lens analyses + synthesis.
 *
 * Uses the same sip-and-track pattern as Ghostlight:
 *   1. Dynamic read batches (~25K words each) produce structural tracking notes
 *   2. Three lens-group steps analyze the tracking notes (never re-read chapters)
 *   3. Synthesis step combines all analyses into the final dev report
 *
 * The read batches have `dynamic: true` — the orchestrator expands them
 * based on actual manuscript word count (e.g. 102K words → 4 read batches).
 */
export const LUMEN_MULTI_CALL_STEPS: MultiCallStep[] = [
  // ── Dynamic read batches (expanded at runtime by word count) ──
  // Template: 2 read steps that get expanded to N batches.
  // The orchestrator uses the first dynamic step as the template.
  {
    id: 'lumen-read-1',
    label: 'Read First Half',
    promptTemplate: `Read the following manuscript chapters as a developmental editor, building structural tracking notes.

{{CHAPTER_LIST}}

**Instructions:**
1. Use the **Read** tool on each chapter file listed above, one at a time, in order.
2. After reading ALL chapters in this batch, use the **Write** tool to create the tracker file.

For each chapter, track these structural elements in concise bullet form:
- **Premise signals**: What is promised/delivered? Genre contract beats.
- **Protagonist arc beats**: Want/need, internal state, turning points, growth/regression moments.
- **Supporting cast function**: Each named character's role (foil, catalyst, mirror, etc.), arc beats.
- **Pacing**: Scene tempo (fast/medium/slow), tension level (1–5), momentum direction.
- **Scene purpose**: What each scene accomplishes. Flag scenes doing < 2 jobs.
- **Prose & craft notes**: Voice consistency, POV discipline, dialogue authenticity, standout passages.
- **Thematic markers**: Motifs, symbols, thematic statements — organic or forced?
- **Key quotes**: 1–2 pull quotes per chapter that exemplify strengths or weaknesses.

**IMPORTANT: You MUST use the Write tool to create \`source/.scratch/lumen-read-1.md\` before finishing.** Do not end without writing the file.

Do NOT read any reference docs (pitch, story-bible, etc.) — focus only on the chapters listed above.
Do NOT write any analysis or dev report yet — this is a reading pass only.`,
    scratchFile: 'source/.scratch/lumen-read-1.md',
    maxTurns: 15,
    isSynthesis: false,
    dynamic: true,
    thinkingBudgetOverride: 0,
    lightweightPrompt: true,
  },
  {
    id: 'lumen-read-2',
    label: 'Read Second Half',
    promptTemplate: `Continue reading manuscript chapters as a developmental editor, building structural tracking notes.

{{CHAPTER_LIST}}

**Instructions:**
1. Use the **Read** tool on \`source/.scratch/lumen-read-1.md\` to recall your structural notes from the previous batch.
2. Use the **Read** tool on each chapter file listed above, one at a time, in order.
3. After reading ALL chapters in this batch, use the **Write** tool to create the tracker file.

For each chapter, track in concise bullet form:
- **Premise signals**: What is promised/delivered? Genre contract beats.
- **Protagonist arc beats**: Want/need, internal state, turning points, growth/regression moments.
- **Supporting cast function**: Each named character's role, arc beats.
- **Pacing**: Scene tempo (fast/medium/slow), tension level (1–5), momentum direction.
- **Scene purpose**: What each scene accomplishes. Flag scenes doing < 2 jobs.
- **Prose & craft notes**: Voice consistency, POV discipline, dialogue authenticity, standout passages.
- **Thematic markers**: Motifs, symbols, thematic statements — organic or forced?
- **Key quotes**: 1–2 pull quotes per chapter that exemplify strengths or weaknesses.

**IMPORTANT: You MUST use the Write tool to create \`source/.scratch/lumen-read-2.md\` before finishing.** Do not end without writing the file.

Do NOT read any reference docs or other files — focus only on the chapters listed above and the prior batch tracker.
Do NOT write any analysis or dev report yet — this is a reading pass only.`,
    scratchFile: 'source/.scratch/lumen-read-2.md',
    maxTurns: 15,
    isSynthesis: false,
    dynamic: true,
    thinkingBudgetOverride: 0,
    lightweightPrompt: true,
  },
  // ── Lens analysis steps (work from tracking notes, NOT raw chapters) ──
  // These three lens groups are INDEPENDENT — they all read from tracking notes
  // and don't depend on each other. They run sequentially.
  {
    id: 'lumen-lenses-1-3',
    label: 'Lenses 1–3: Premise, Protagonist & Cast',
    promptTemplate: `Run Lenses 1–3 of the developmental assessment.

**IMPORTANT**: Do NOT read any manuscript chapters. Do NOT use the Read tool on any chapters/ files. Your structural tracking notes already contain everything you need.

Read ONLY these tracking note files (use the Read tool on each one):
{{READ_TRACKER_FILES}}

These contain your chapter-by-chapter structural observations from the reading passes.

After reading all tracking files, analyze:
- **Lens 1: Premise & Promise** — What does the manuscript promise (genre, hook, central question)? Does it deliver? Where does the contract strengthen or weaken?
- **Lens 2: Protagonist Arc** — Map the protagonist's internal trajectory from your tracked arc beats. Is the change earned? Where are the turning points? Any stalls or jumps?
- **Lens 3: Supporting Cast** — Using your tracked cast observations, does every significant character justify their page time? Who serves as foil, catalyst, mirror? Any redundant or underused characters?

Write your analysis to source/.scratch/lumen-lenses-1-3.md using the assessment framework from your system instructions.

Do NOT produce the final dev report yet — this is lens group 1 of 3.`,
    scratchFile: 'source/.scratch/lumen-lenses-1-3.md',
    maxTurns: 10,
    isSynthesis: false,
  },
  {
    id: 'lumen-lenses-4-5',
    label: 'Lenses 4–5: Pacing & Scenes',
    promptTemplate: `Run Lenses 4–5 of the developmental assessment.

**IMPORTANT**: Do NOT read any manuscript chapters. Do NOT use the Read tool on any chapters/ files. Your structural tracking notes already contain everything you need.

Read ONLY these tracking note files (use the Read tool on each one):
{{READ_TRACKER_FILES}}

Focus on the **Pacing** and **Scene purpose** fields in each chapter's tracking notes.

After reading all tracking files, analyze:
- **Lens 4: Pacing & Momentum** — Using your tracked pacing data (tempo, tension levels, momentum), produce a **pacing map** (table: chapter | tempo | tension | momentum | notes). Flag sags, rushes, and structural dead zones.
- **Lens 5: Scene Necessity** — Using your tracked scene purposes, produce a **scene audit table** (chapter | scene | jobs performed | verdict). Flag underperformers (scenes doing < 2 jobs) and dead weight.

Write your analysis (including the pacing map and scene audit table) to source/.scratch/lumen-lenses-4-5.md.

Do NOT produce the final dev report yet — this is lens group 2 of 3.`,
    scratchFile: 'source/.scratch/lumen-lenses-4-5.md',
    maxTurns: 10,
    isSynthesis: false,
  },
  {
    id: 'lumen-lenses-6-7',
    label: 'Lenses 6–7: Craft & Theme',
    promptTemplate: `Run Lenses 6–7 of the developmental assessment.

**IMPORTANT**: Do NOT read any manuscript chapters. Do NOT use the Read tool on any chapters/ files. Your structural tracking notes already contain everything you need.

Read ONLY these tracking note files (use the Read tool on each one):
{{READ_TRACKER_FILES}}

Focus on the **Prose & craft notes** and **Thematic markers** fields in each chapter's tracking notes.

After reading all tracking files, analyze:
- **Lens 6: Prose & Craft** — Using your tracked prose/craft notes, assess voice consistency, POV discipline, dialogue authenticity, sensory detail quality. Quote specific examples from your tracking notes.
- **Lens 7: Thematic Integration** — Using your tracked thematic markers, does the theme emerge organically? Over-signaled or under-developed? How do motifs and symbols evolve across the narrative?

Write your analysis to source/.scratch/lumen-lenses-6-7.md.

Do NOT produce the final dev report yet — this is lens group 3 of 3.`,
    scratchFile: 'source/.scratch/lumen-lenses-6-7.md',
    maxTurns: 10,
    isSynthesis: false,
  },
  // ── Synthesis (reads all lens analyses, writes final report) ──
  {
    id: 'lumen-synthesis',
    label: 'Synthesize Dev Report',
    promptTemplate: `Synthesize the final Developmental Assessment Report.

**IMPORTANT**: Do NOT read any manuscript chapters. Do NOT use the Read tool on any chapters/ files. The lens analyses already contain everything you need.

Read ONLY these analysis files (use the Read tool on each one):
- source/.scratch/lumen-lenses-1-3.md (Premise, Protagonist Arc, Supporting Cast)
- source/.scratch/lumen-lenses-4-5.md (Pacing & Scene Necessity — includes pacing map and scene audit table)
- source/.scratch/lumen-lenses-6-7.md (Prose Craft & Thematic Integration)

After reading all three files, IMMEDIATELY write the final report using the Write tool. Do not read any other files.

Produce the complete developmental report following the format in your system instructions:
- Executive summary (what's working, what's not, why)
- All 7 lens sections (consolidated from the three analyses)
- Pacing map
- Scene necessity audit table
- Prioritized revision roadmap

Write the final report to source/dev-report.md.`,
    scratchFile: null,
    outputFile: 'source/dev-report.md',
    maxTurns: 10,
    isSynthesis: true,
  },
];

/**
 * Ghostlight (First Reader) — 3 steps: 2 chapter batches + synthesis.
 *
 * The chapter split is dynamic — determined at runtime by word count
 * targeting ~50K words per batch. The `dynamic` flag tells the orchestrator
 * to inject chapter paths into the promptTemplate at runtime.
 */
export const GHOSTLIGHT_MULTI_CALL_STEPS: MultiCallStep[] = [
  {
    id: 'ghostlight-read-1',
    label: 'Read First Half',
    promptTemplate: `Read the first batch of manuscript chapters (listed below) as a first reader.

{{CHAPTER_LIST}}

**Instructions:**
1. Use the **Read** tool on each chapter file listed above, one at a time, in order.
2. After reading each chapter, note your real-time reaction (see tracker fields below).
3. After reading ALL chapters in this batch, use the **Write** tool to create the tracker file.

Track your real-time experience for each chapter:
- Engagement level (1–5)
- Emotional beat
- Clarity issues
- Pull quote
- Drift points
- Running questions

**IMPORTANT: You MUST use the Write tool to create \`source/.scratch/ghostlight-read-1.md\` before finishing.** Do not end without writing the file.

Do NOT write the reader report yet — this is batch 1 of 2.`,
    scratchFile: 'source/.scratch/ghostlight-read-1.md',
    maxTurns: 15,
    isSynthesis: false,
    dynamic: true,
    thinkingBudgetOverride: 0,
    lightweightPrompt: true,
  },
  {
    id: 'ghostlight-read-2',
    label: 'Read Second Half',
    promptTemplate: `Read the second batch of manuscript chapters (listed below) as a first reader, continuing from where you left off.

{{CHAPTER_LIST}}

**Instructions:**
1. Use the **Read** tool on \`source/.scratch/ghostlight-read-1.md\` to recall your experience from the first batch — carry forward your running questions and engagement trajectory.
2. Use the **Read** tool on each chapter file listed above, one at a time, in order.
3. After reading ALL chapters in this batch, use the **Write** tool to create the tracker file.

Continue tracking for each chapter:
- Engagement level (1–5)
- Emotional beat
- Clarity issues
- Pull quote
- Drift points
- Running questions (noting which earlier questions got answered)

**IMPORTANT: You MUST use the Write tool to create \`source/.scratch/ghostlight-read-2.md\` before finishing.** Do not end without writing the file.

Do NOT write the reader report yet — this is batch 2 of 2.`,
    scratchFile: 'source/.scratch/ghostlight-read-2.md',
    maxTurns: 15,
    isSynthesis: false,
    dynamic: true,
    thinkingBudgetOverride: 0,
    lightweightPrompt: true,
  },
  {
    id: 'ghostlight-synthesis',
    label: 'Synthesize Reader Report',
    promptTemplate: `Synthesize the final Reader Report from your reading experience.

**IMPORTANT**: Do NOT read any manuscript chapters. Do NOT use the Read tool on any chapters/ files. Your batch notes already contain everything you need.

Read ONLY these batch tracker files (use the Read tool on each one):
- source/.scratch/ghostlight-read-1.md (first half)
- source/.scratch/ghostlight-read-2.md (second half)

After reading both files, IMMEDIATELY write the final report using the Write tool. Do not read any other files.

Produce the complete reader report following the format in your system instructions:
- Chapter-by-chapter engagement map
- Emotional arc of the read
- Running questions resolved and unresolved
- Prediction log
- Strongest and weakest moments
- Overall reader verdict

Write the final report to source/reader-report.md.`,
    scratchFile: null,
    outputFile: 'source/reader-report.md',
    maxTurns: 15,
    isSynthesis: true,
  },
];

/**
 * Registry mapping agents to their multi-call step schemas.
 * Agents not in this map run as a single call (existing behavior).
 *
 * Forge is intentionally excluded — it reads 2 small reports and writes
 * 2 files, well within a single call's capacity.
 */
export const AGENT_MULTI_CALL_STEPS: Partial<Record<CreativeAgentName, MultiCallStep[]>> = {
  Sable: SABLE_MULTI_CALL_STEPS,
  Lumen: LUMEN_MULTI_CALL_STEPS,
  Ghostlight: GHOSTLIGHT_MULTI_CALL_STEPS,
};

