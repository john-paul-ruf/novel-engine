import type { AgentName, AgentMeta, CreativeAgentName, PipelinePhaseId, AppSettings } from './types';

// Agent metadata (everything except the systemPrompt, which comes from files)
export const AGENT_REGISTRY: Record<AgentName, Omit<AgentMeta, 'name'>> = {
  Spark:      { filename: 'SPARK.md',      role: 'Story Pitch',           color: '#F59E0B', thinkingBudget: 8000 },
  Verity:     { filename: 'VERITY.md',     role: 'Ghostwriter',           color: '#8B5CF6', thinkingBudget: 10000 },
  Ghostlight: { filename: 'GHOSTLIGHT.md', role: 'First Reader',          color: '#06B6D4', thinkingBudget: 6000 },
  Lumen:      { filename: 'LUMEN.md',      role: 'Developmental Editor',  color: '#10B981', thinkingBudget: 16000 },
  Sable:      { filename: 'SABLE.md',      role: 'Copy Editor',           color: '#EF4444', thinkingBudget: 4000 },
  Forge:      { filename: 'FORGE.MD',      role: 'Task Master',           color: '#F97316', thinkingBudget: 8000 },
  Quill:      { filename: 'Quill.md',      role: 'Publisher',             color: '#6366F1', thinkingBudget: 4000 },
  Wrangler:   { filename: 'WRANGLER.md',   role: 'Context Planner',       color: '#71717A', thinkingBudget: 0 },
};

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

// Default settings
export const DEFAULT_SETTINGS: AppSettings = {
  hasClaudeCli: false,
  model: 'claude-opus-4-20250514',
  maxTokens: 8192,
  enableThinking: true,
  thinkingBudget: 10000,
  autoCollapseThinking: true,
  theme: 'dark',
  initialized: false,
  authorName: '',
};

// Model pricing (per million tokens)
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-20250514':   { input: 15, output: 75 },
  'claude-sonnet-4-20250514': { input: 3,  output: 15 },
};

// Available models for the settings dropdown
export const AVAILABLE_MODELS = [
  { id: 'claude-opus-4-20250514',   label: 'Claude Opus 4',   description: 'Best quality — recommended for all agents' },
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', description: 'Faster and cheaper — good for copy editing' },
] as const;

// Token estimation: ~4 chars per token for English
export const CHARS_PER_TOKEN = 4;
// Opus context window
export const MAX_CONTEXT_TOKENS = 200_000;
// Reserve for response + system prompt overhead
export const CONTEXT_RESERVE_TOKENS = 14_000;

// === Context Wrangler Configuration ===

// The model used for the Wrangler's planning call (cheap and fast)
export const WRANGLER_MODEL = 'claude-sonnet-4-20250514';
// Max tokens for the Wrangler's response (JSON plan)
export const WRANGLER_MAX_TOKENS = 2048;
// Max tokens for summarization calls
export const SUMMARIZATION_MAX_TOKENS = 4096;

// How many recent conversation turns to always count as "recent"
export const WRANGLER_RECENT_TURN_COUNT = 4;

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

// Canonical file manifest keys — maps to BookContext field keys and display paths.
// NOTE: paths are relative to the book root EXCEPT authorProfile which lives in
// {userDataDir}/author-profile.md. The ManifestBuilder (Session 08) looks up content
// by key from BookContext (which loadBookContext already loaded from the correct location),
// NOT by reading from this path directly.
export const FILE_MANIFEST_KEYS: { key: string; path: string }[] = [
  { key: 'voiceProfile',    path: 'source/voice-profile.md' },
  { key: 'sceneOutline',    path: 'source/scene-outline.md' },
  { key: 'storyBible',      path: 'source/story-bible.md' },
  { key: 'pitch',           path: 'source/pitch.md' },
  { key: 'authorProfile',   path: 'author-profile.md' },
  { key: 'readerReport',    path: 'source/reader-report.md' },
  { key: 'devReport',       path: 'source/dev-report.md' },
  { key: 'auditReport',     path: 'source/audit-report.md' },
  { key: 'revisionPrompts', path: 'source/revision-prompts.md' },
  { key: 'styleSheet',      path: 'source/style-sheet.md' },
  { key: 'projectTasks',    path: 'source/project-tasks.md' },
  { key: 'metadata',        path: 'source/metadata.md' },
];
