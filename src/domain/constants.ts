import type { AgentName, AgentMeta, CreativeAgentName, PipelinePhaseId, AppSettings } from './types';

// === Per-Agent Read Guidance ===

export type ReadGuidance = {
  alwaysRead: string[];
  readIfRelevant: string[];
  neverRead: string[];
};

export const AGENT_READ_GUIDANCE: Record<CreativeAgentName, ReadGuidance> = {
  Spark: {
    alwaysRead: ['author-profile.md'],
    readIfRelevant: ['source/pitch.md'],
    neverRead: ['chapters/', 'source/reader-report.md', 'source/dev-report.md', 'source/audit-report.md'],
  },
  Verity: {
    alwaysRead: ['source/voice-profile.md'],
    readIfRelevant: ['source/pitch.md', 'source/scene-outline.md', 'source/story-bible.md', 'author-profile.md', 'source/revision-prompts.md'],
    neverRead: ['source/reader-report.md', 'source/dev-report.md', 'source/audit-report.md'],
  },
  Ghostlight: {
    alwaysRead: [],
    readIfRelevant: [],
    neverRead: ['source/pitch.md', 'source/scene-outline.md', 'source/story-bible.md', 'author-profile.md', 'source/voice-profile.md', 'source/dev-report.md'],
  },
  Lumen: {
    alwaysRead: ['source/reader-report.md'],
    readIfRelevant: ['source/scene-outline.md', 'source/story-bible.md', 'source/pitch.md'],
    neverRead: ['author-profile.md', 'source/revision-prompts.md'],
  },
  Sable: {
    alwaysRead: ['source/style-sheet.md', 'source/story-bible.md'],
    readIfRelevant: [],
    neverRead: ['source/scene-outline.md', 'source/pitch.md', 'author-profile.md', 'source/reader-report.md', 'source/dev-report.md'],
  },
  Forge: {
    alwaysRead: ['source/dev-report.md'],
    readIfRelevant: ['source/reader-report.md', 'source/audit-report.md', 'source/scene-outline.md'],
    neverRead: ['chapters/', 'author-profile.md'],
  },
  Quill: {
    alwaysRead: ['author-profile.md'],
    readIfRelevant: ['source/story-bible.md', 'source/pitch.md'],
    neverRead: ['chapters/', 'source/reader-report.md', 'source/dev-report.md'],
  },
};

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
  model: 'claude-sonnet-4-20250514',
  maxTokens: 8192,
  enableThinking: false,
  thinkingBudget: 5000,
  autoCollapseThinking: true,
  enableNotifications: true,
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

// === Fun Status Messages ===
// Shown while waiting for AI responses — rotated randomly for variety

const STATUS_PREPARING = [
  'Preparing context…',
  'Gathering ingredients…',
  'Setting the table…',
  'Warming up the oven…',
  'Sharpening the quill…',
  'Brewing the ink…',
  'Tuning the instruments…',
  'Unfurling the scrolls…',
  'Stoking the creative fires…',
  'Lining up the dominoes…',
  'Threading the needle…',
  'Mixing the palette…',
  'Calibrating the muse…',
  'Dusting off the manuscript…',
  'Loading the kiln…',
] as const;

const STATUS_WAITING = [
  'Waiting for response…',
  'Baking your story…',
  'Simmering the plot…',
  'Letting the ideas rise…',
  'Marinating the prose…',
  'Kneading the narrative…',
  'Steeping the subtext…',
  'Whipping up some magic…',
  'Slow-roasting the drama…',
  'Folding in the details…',
  'Reducing the sauce…',
  'Glazing the final draft…',
  'Tempering the dialogue…',
  'Proofing the dough…',
  'Caramelizing the conflict…',
] as const;

const STATUS_RESPONDING = [
  'Responding…',
  'Plating the words…',
  'Pouring the first draft…',
  'Uncorking the story…',
  'Fresh out of the oven…',
  'Serving it up…',
  'Words incoming…',
  'Ink hitting the page…',
  'The muse speaks…',
  'Assembling the prose…',
  'Composing a reply…',
  'Setting type…',
  'Here it comes…',
  'Spinning the yarn…',
  'Rolling out the words…',
] as const;

function pickRandom(pool: readonly string[]): string {
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Returns a random fun status message for the "preparing context" phase. */
export function randomPreparingStatus(): string {
  return pickRandom(STATUS_PREPARING);
}

/** Returns a random fun status message for the "waiting for response" phase. */
export function randomWaitingStatus(): string {
  return pickRandom(STATUS_WAITING);
}

/** Returns a random fun status message for the "responding" phase (shown in renderer stores). */
export function randomRespondingStatus(): string {
  return pickRandom(STATUS_RESPONDING);
}

// Token estimation: ~4 chars per token for English
export const CHARS_PER_TOKEN = 4;
// Opus context window
export const MAX_CONTEXT_TOKENS = 200_000;
// Reserve for response + system prompt overhead
export const CONTEXT_RESERVE_TOKENS = 14_000;

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

// Purpose-specific prompt additions — appended to Verity's system prompt for special conversations
export const VOICE_SETUP_INSTRUCTIONS = `

---

## Current Task: Voice Profile Setup

The author wants to establish or refine their voice profile for this book. This is your most important onboarding task — every sentence of prose you write later will be measured against this profile.

**If no writing samples are available**, conduct your Voice Interview:

1. Ask the author to respond to these four prompts (one at a time, conversationally — don't dump all four at once):
   - "Describe a room you spent a lot of time in as a child."
   - "Tell me about a moment when you felt completely out of place."
   - "What's something most people get wrong about a topic you know well?"
   - "Finish this sentence without thinking: 'The trouble with getting what you want is...'"

2. After receiving responses, analyze them for all Voice Profile dimensions:
   - Sentence Rhythm
   - Vocabulary Register
   - Dialogue Style
   - Emotional Temperature
   - Interiority Depth
   - Punctuation Habits
   - Structural Instincts
   - Tonal Anchors
   - Avoid list

3. Produce a **complete Voice Profile** in the standard format (the format defined in your Voice Profile Format section). Present it to the author for validation.

**If writing samples are provided**, skip the interview and analyze the samples directly. Then produce the Voice Profile.

**If an existing voice profile is already loaded in context**, help the author refine it. Ask what feels wrong or incomplete. Update specific dimensions based on their feedback.

When you present the final Voice Profile, write it to \`source/voice-profile.md\` using the Write tool.
`;

export const WRANGLER_SESSION_PARSE_PROMPT = `You are parsing Forge's revision plan output into a structured JSON execution plan.

You will receive the contents of two files:
1. **revision-prompts.md** — Contains session prompts for Verity, each with a session header, task descriptions, chapter references, model assignment, and instructions.
2. **project-tasks.md** — Contains a phased task checklist with numbered tasks using "- [ ]" (incomplete) and "- [x]" (complete) markers.

## Your Job

Parse both documents and return a single JSON object. No markdown. No explanation. Just the JSON.

## Output Format

{
  "sessions": [
    {
      "index": 1,
      "title": "Short descriptive title for this session",
      "chapters": ["20-the-departure", "21-crossroads"],
      "taskNumbers": [1, 2, 3, 4, 5, 6],
      "model": "sonnet",
      "prompt": "The EXACT full session prompt text to send to Verity — everything between one session header and the next. Preserve all formatting, chapter references, and instructions verbatim.",
      "notes": "Brief note: Read-only audit, produces catalog."
    }
  ],
  "totalTasks": 47,
  "completedTaskNumbers": [3, 7, 12],
  "phases": [
    { "number": 0, "name": "Author Decisions", "taskCount": 4, "completedCount": 2, "taskNumbers": [1, 2, 3, 4] },
    { "number": 1, "name": "Structural Revision", "taskCount": 8, "completedCount": 0, "taskNumbers": [5, 6, 7, 8, 9, 10, 11, 12] }
  ]
}

## Rules

1. Each session's "prompt" field must contain the EXACT text to send to Verity — preserve formatting, @chapter references, instructions, and approval gates verbatim. Do not summarize or rewrite.
2. Extract task numbers from the prose. Forge uses patterns like "Tasks 7, 8, and 12" or "Task 21" or numbered lists like "7. Task title".
3. Identify the model from Forge's assignment. Look for "Model: Opus", "Sonnet", "(analytical — Sonnet)", etc. Default to "opus" if unclear.
4. Extract chapter references from @chapter paths or "Ch 5-6" patterns.
5. For completedTaskNumbers, find all tasks in project-tasks.md marked with "- [x]".
6. For phases:
   - Extract phase structure from "## Phase N:" headers in project-tasks.md
   - Include taskNumbers array for each phase (all numbered tasks under that phase header)
   - Count completedCount as the number of tasks in taskNumbers that appear in completedTaskNumbers
7. Session headers can appear in these formats in revision-prompts.md: "## SESSION 1:", "## Session 1:", "### SESSION 1:", "### Session 1:". Match case-insensitively and extract everything between the session header and the next session header (or end of file) as the prompt text.
8. Session order must match the order in revision-prompts.md.
9. If no revision-prompts.md content is provided, return { "sessions": [], "totalTasks": N, "completedTaskNumbers": [...], "phases": [...] } with just the project-tasks.md data.
`;

export const AUTHOR_PROFILE_INSTRUCTIONS = `

---

## Current Task: Author Profile Setup

The author wants to create or refine their author profile — their creative DNA document. This is a global document that follows them across all books and helps every agent understand who they are as a writer.

Help them articulate (conversationally — draw this out naturally, don't interrogate):

- **Genres and forms** — What do they write? Why those genres? What draws them?
- **Influences** — Which authors, filmmakers, musicians, or artists shaped their creative instincts?
- **Themes** — What questions or obsessions keep showing up in their work?
- **Voice identity** — How would they describe their writing to a stranger? What's the "feel"?
- **Process** — How do they write? Pantser or plotter? Morning or midnight? Music or silence?
- **What makes them unique** — What perspective, experience, or obsession do they bring that no one else can?
- **Aspirations** — What kind of writer do they want to become? What's the gap between where they are and where they want to be?

When you have enough material, produce a polished **Author Profile** document — a 300–600 word creative self-portrait that any agent could read and immediately understand this writer's identity, instincts, and ambitions.

If an existing author profile is loaded in context, help refine it. Ask what's changed, what's missing, what no longer feels true.

When you present the final Author Profile, write it to the author-profile.md file using the Write tool.
`;

// Canonical file manifest keys — maps internal keys to display paths.
// NOTE: paths are relative to the book root EXCEPT authorProfile which lives in
// {userDataDir}/author-profile.md.
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
