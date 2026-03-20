import type { AgentName, AgentMeta, CreativeAgentName, PipelinePhaseId, AppSettings, OutputTarget } from './types';

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

// Maps pipeline phase to one or more target files where agent output can be saved.
// When a phase has multiple targets, the UI shows one save button per target so the
// user can save different assistant messages to different files.
// Example: Verity's scaffold phase produces both a scene outline and a story bible —
// the user clicks "Save as Scene Outline" on one message and "Save as Story Bible" on another.
export const AGENT_OUTPUT_TARGETS: Partial<Record<PipelinePhaseId, OutputTarget[]>> = {
  'pitch':              [{ targetPath: 'source/pitch.md',            description: 'Save as Pitch' }],
  'scaffold':           [
                          { targetPath: 'source/scene-outline.md',   description: 'Save as Scene Outline' },
                          { targetPath: 'source/story-bible.md',     description: 'Save as Story Bible' },
                        ],
  'first-draft':        [{ targetPath: 'chapters/{slug}/draft.md',   description: 'Save as Chapter Draft', isChapter: true }],
  'first-read':         [{ targetPath: 'source/reader-report.md',    description: 'Save as Reader Report' }],
  'first-assessment':   [{ targetPath: 'source/dev-report.md',       description: 'Save as Dev Report' }],
  'revision-plan-1':    [{ targetPath: 'source/project-tasks.md',    description: 'Save as Project Tasks' }],
  'revision':           [{ targetPath: 'chapters/{slug}/draft.md',   description: 'Save as Revised Chapter', isChapter: true }],
  'second-read':        [{ targetPath: 'source/reader-report.md',    description: 'Save as Reader Report (v2)' }],
  'second-assessment':  [{ targetPath: 'source/dev-report.md',       description: 'Save as Dev Report (v2)' }],
  'copy-edit':          [{ targetPath: 'source/audit-report.md',     description: 'Save as Audit Report' }],
  'revision-plan-2':    [{ targetPath: 'source/revision-prompts.md', description: 'Save as Revision Prompts' }],
  'mechanical-fixes':   [{ targetPath: 'chapters/{slug}/draft.md',   description: 'Save as Fixed Chapter', isChapter: true }],
  'publish':            [{ targetPath: 'source/metadata.md',         description: 'Save as Metadata' }],
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

When you present the final Voice Profile, tell the author they can save it using the "Save as Voice Profile" button below your message.
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
    { "number": 0, "name": "Author Decisions", "taskCount": 4, "completedCount": 2 },
    { "number": 1, "name": "Structural Revision", "taskCount": 8, "completedCount": 0 }
  ]
}

## Rules

1. Each session's "prompt" field must contain the EXACT text to send to Verity — preserve formatting, @chapter references, instructions, and approval gates verbatim. Do not summarize or rewrite.
2. Extract task numbers from the prose. Forge uses patterns like "Tasks 7, 8, and 12" or "Task 21" or numbered lists like "7. Task title".
3. Identify the model from Forge's assignment. Look for "Model: Opus", "Sonnet", "(analytical — Sonnet)", etc. Default to "opus" if unclear.
4. Extract chapter references from @chapter paths or "Ch 5-6" patterns.
5. For completedTaskNumbers, find all tasks in project-tasks.md marked with "- [x]".
6. Count phases by their Phase headers in project-tasks.md.
7. Session order must match the order in revision-prompts.md.
8. If no revision-prompts.md content is provided, return { "sessions": [], "totalTasks": N, "completedTaskNumbers": [...], "phases": [...] } with just the project-tasks.md data.
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

When you present the final Author Profile, tell the author they can save it using the "Save as Author Profile" button below your message.
`;

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
