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
  Ghostlight: { filename: 'GHOSTLIGHT.md', role: 'First Reader',          color: '#06B6D4', thinkingBudget: 6000, maxTurns: 15 },
  Lumen:      { filename: 'LUMEN.md',      role: 'Developmental Editor',  color: '#10B981', thinkingBudget: 16000, maxTurns: 15 },
  Sable:      { filename: 'SABLE.md',      role: 'Copy Editor',           color: '#EF4444', thinkingBudget: 4000, maxTurns: 20 },
  Forge:      { filename: 'FORGE.md',      role: 'Task Master',           color: '#F97316', thinkingBudget: 8000, maxTurns: 10 },
  Quill:      { filename: 'QUILL.md',      role: 'Publisher',             color: '#6366F1', thinkingBudget: 4000, maxTurns: 8 },
  Wrangler:   { filename: 'WRANGLER.md',   role: 'Revision Plan Parser',  color: '#71717A', thinkingBudget: 4000, maxTurns: 3 },
};

/** Reserved book slug used for Pitch Room conversations and draft files. */
export const PITCH_ROOM_SLUG = '__pitch-room__';

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
];

// Default settings
export const DEFAULT_SETTINGS: AppSettings = {
  hasClaudeCli: false,
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
  ],
  Lumen: [
    { label: 'Full assessment', prompt: 'Run the full developmental assessment. Read the entire manuscript, apply all seven lenses, and produce the complete report with pacing map, scene necessity audit, and revision roadmap. Write it to source/dev-report.md.' },
    { label: 'Pacing & scenes', prompt: 'Focus on Lens 4 (Pacing & Momentum) and Lens 5 (Scene Necessity). Read the manuscript, produce the pacing map and scene audit table, and flag any sagging sections or underperforming scenes.' },
    { label: 'Character arcs', prompt: 'Focus on Lens 2 (Protagonist Arc) and Lens 3 (Supporting Cast). Map the protagonist\'s internal trajectory and assess every significant supporting character\'s function. Flag arc stalls, unearned transformations, and redundant characters.' },
  ],
  Sable: [
    { label: 'Copy edit', prompt: 'Copy edit the full manuscript. Read every chapter in order, audit for grammar, consistency, and mechanical issues, then produce the audit report and write it to source/audit-report.md. Build or update the style sheet at source/style-sheet.md.' },
    { label: 'Build style sheet', prompt: 'Read the manuscript and build a style sheet — catalog all character name spellings, place names, hyphenation choices, number formatting, recurring constructions, and any inconsistencies. Write it to source/style-sheet.md.' },
  ],
  Forge: [
    { label: 'Create revision plan', prompt: 'Read source/reader-report.md and source/dev-report.md. Synthesize both into a prioritized revision plan with phased tasks and session prompts for Verity. Write the task list to source/project-tasks.md and the session prompts to source/revision-prompts.md.' },
    { label: 'Plan copy fixes', prompt: 'Read source/audit-report.md. Create a fix plan with session prompts for Verity to implement the mechanical fixes. Write tasks to source/project-tasks.md and session prompts to source/revision-prompts.md.' },
    { label: 'Plan from my feedback', prompt: 'I have specific revisions I want made. Here\'s what I need changed:\n\n' },
  ],
  Quill: [
    { label: 'Prepare for publication', prompt: 'Audit the build outputs in dist/. Generate publication metadata — title, subtitle, description, keywords, categories, and back-cover copy. Flag any remaining issues. Write metadata to source/metadata.md.' },
    { label: 'Generate metadata', prompt: 'Read the manuscript and pitch. Generate publication metadata — title, subtitle, description, keywords, BISAC categories, comp titles, and back-cover copy. Write it to source/metadata.md.' },
  ],
};

// Token estimation: ~4 chars per token for English
export const CHARS_PER_TOKEN = 4;
// Opus context window
export const MAX_CONTEXT_TOKENS = 200_000;
// Reserve for response + system prompt overhead
export const CONTEXT_RESERVE_TOKENS = 14_000;

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

