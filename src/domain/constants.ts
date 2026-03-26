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
  Wrangler:   { filename: 'WRANGLER.md',   role: 'Context Planner',       color: '#71717A', thinkingBudget: 4000 },
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
  'Stretching the canvas…',
  'Sorting the library…',
  'Lighting the lantern…',
  'Oiling the gears…',
  'Setting the stage…',
  'Clearing the desk…',
  'Weighing the words…',
  'Mapping the territory…',
  'Plotting the course…',
  'Cracking the spine…',
  'Annotating the margins…',
  'Trimming the wick…',
  'Centering the clay…',
  'Winding the clock…',
  'Consulting the oracle…',
  'Priming the pump…',
  'Counting the syllables…',
  'Polishing the lens…',
  'Arranging the notes…',
  'Pressing the flowers…',
  'Checking the index cards…',
  'Laying the groundwork…',
  'Folding the paper cranes…',
  'Reading the room…',
  'Sharpening the chisel…',
  'Drawing the curtain…',
  'Dipping the candle…',
  'Laying the first stone…',
  'Steeping the tea…',
  'Charting the stars…',
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
  'Letting the flavors meld…',
  'Resting the dough…',
  'Emulsifying the themes…',
  'Clarifying the broth…',
  'Seasoning to taste…',
  'Curing in the dark…',
  'Cold-smoking the subplots…',
  'Fermenting the backstory…',
  'Whisking in the symbolism…',
  'Poaching the plot points…',
  'Braising the first act…',
  'Candying the climax…',
  'Infusing the atmosphere…',
  'Pressing the cider…',
  'Pickling the side characters…',
  'Blooming the spices…',
  'Deglazing the pan…',
  'Aerating the narrative…',
  'Chilling the tension…',
  'Flambéing the finale…',
  'Crisping the edges…',
  'Soaking the chapters…',
  'Distilling the essence…',
  'Resting the roast…',
  'Torching the crème brûlée…',
  'Brining the dialogue…',
  'Rendering the drama…',
  'Blanching the exposition…',
  'Churning the plot butter…',
  'Charring the second act…',
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
  'Garnishing the plate…',
  'Ringing the bell…',
  'Words take flight…',
  'The pen moves…',
  'Thoughts crystallize…',
  'Lines are forming…',
  'The story unfolds…',
  'Sentences arrive…',
  'The voice emerges…',
  'Prose flows…',
  'Letters find their place…',
  'Dishing it up…',
  'Hot off the press…',
  'Fresh from the forge…',
  'Delivering the goods…',
  'Arriving on the page…',
  'Making its entrance…',
  'The draft descends…',
  'Weaving the final thread…',
  'The chapter breathes…',
  'Laying down the prose…',
  'A story takes shape…',
  'Transcribing the dream…',
  'The narrative lands…',
  'Pulling back the curtain…',
  'Bringing it to the table…',
  'Straight from the source…',
  'Pages materialize…',
  'The words are here…',
  'Committing to the page…',
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

// === Pitch Room Flavor Text ===
// Shown in the empty state of the Pitch Room — rotated for personality

const PITCH_ROOM_FLAVOR = [
  'Every great novel starts with a "what if…"',
  'Spark is ready. Got a story itching to be told?',
  'The blank page isn\'t empty — it\'s full of possibility.',
  'What world are we building today?',
  'A character walks into a room. What happens next?',
  'The best ideas sound a little crazy at first.',
  'Tell me about the book only you can write.',
  'Genre? Mood? A single image? Start anywhere.',
  'No commitment, no pressure — just ideas.',
  'Every bestseller was once a weird thought at 2 AM.',
  'Let\'s find the story that won\'t leave you alone.',
  'The muse is in. Take a seat.',
  'What story has been keeping you up at night?',
  'Pitch me something wild.',
  'First thought, best thought. What have you got?',
  'The Pitch Room is open. Spark is listening.',
] as const;

/** Returns a random Pitch Room flavor line for the empty state. */
export function randomPitchRoomFlavor(): string {
  return pickRandom(PITCH_ROOM_FLAVOR);
}

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

export const PITCH_ROOM_INSTRUCTIONS = `

---

## Current Mode: Pitch Room

You are in the Pitch Room — a free brainstorming space where the author explores story ideas without commitment. There is no book yet. Your job is to help them discover and develop a compelling story concept.

**Your approach:**
1. Start by understanding what the author is drawn to — genre, themes, emotions, a character, a scene, a "what if"
2. Ask probing questions to uncover the story's core tension and emotional engine
3. Help them find the hook — the thing that makes this story impossible to put down
4. When the concept crystallizes, produce a **full pitch card** including:
   - Title
   - Logline (one sentence)
   - Genre and tone
   - Core conflict
   - Main characters (2-3)
   - The emotional question at the heart of the story
   - Opening hook

When the pitch is ready, write it to \`source/pitch.md\` using the Write tool. Use exactly this path — the app relies on it to detect when a pitch is ready. Do NOT use a custom filename or write to the root directory.

**Important:** You can explore multiple directions in a single conversation. If an idea isn't working, pivot freely. The Pitch Room is for exploration, not commitment.

## Pitch Actions

After writing the pitch card to \`source/pitch.md\`, you can signal what should happen next by writing an \`_action.json\` file. The app will pick this up automatically and execute the action. You decide the right moment — when the author says they're done, when the pitch is clearly ready, or when they want to move on.

**Available actions:**

- **Make it a book:** \`{"action": "make-book"}\` — Creates a real book project from this pitch, copies the pitch into it, and switches the app to the new book. Use this when the author is committed and ready to start writing.

- **Shelve for later:** \`{"action": "shelve", "logline": "one-sentence summary"}\` — Saves the pitch to the shelf for future use and clears the draft. Use this when the idea is good but the author isn't ready to commit, or when they want to park it and explore something else.

- **Discard:** \`{"action": "discard"}\` — Deletes the draft and conversation. Use this when the author explicitly wants to throw it away, or when the brainstorm went nowhere and they want a clean slate.

Only write \`_action.json\` when you have a clear signal from the author about what they want to do. Don't presume — if you're unsure, ask. But when they say "let's do it", "shelve this one", or "trash it" — act.
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

export const HOT_TAKE_INSTRUCTIONS = `You are giving a HOT TAKE — an informal, off-the-record assessment.

INSTRUCTIONS:
1. Use the Read tool to read every chapter draft file in the chapters/ directory, in order. Read them one at a time, start to finish, like a reader would.
2. Do NOT read any source documents (pitch, outline, bible, reports). This is a cold read — you know nothing about the book going in.
3. After reading the entire manuscript, respond with AT MOST five paragraphs.
4. Do NOT write any files. Do NOT use the Write or Edit tools. No reader-report.md, no artifacts. Your response lives in chat only.

RESPONSE FORMAT:
  1. **Gut reaction** — Your immediate emotional response. Did it grab you? Where did you zone out?
  2. **What's working** — The strongest elements. Be specific: name scenes, characters, lines.
  3. **What's not working** — The weakest elements. Don't soften it. Name the problems.
  4. **The big question** — The single most important thing the author needs to address.
  5. **Verdict** — One sentence. Would you keep reading? Would you recommend it?

TONE:
- This is a hot take, not a formal report. Write like a smart friend who just read the draft, not like an editor writing a letter. Be human about it.
- Do NOT hedge with "it depends on your goals" or "this is subjective." Have an opinion.`;

export const HOT_TAKE_MODEL = 'claude-opus-4-20250514';

export const ADHOC_REVISION_INSTRUCTIONS = `

---

## Current Mode: Direct Feedback

The author is giving you direct revision instructions. Use **Direct Feedback Mode** as described in your system instructions.

Key reminders:
- Read the author's feedback carefully. Use the Read tool to examine the relevant chapters.
- Produce \`source/project-tasks.md\` and \`source/revision-prompts.md\` following your standard formats.
- If existing plan files have pending work, ASK the author whether to append or replace before writing.
- Match the plan's weight to the feedback's weight — don't over-engineer small requests.
- After writing both files, confirm: how many tasks, how many sessions, and a brief summary.`;

export const REVISION_VERIFICATION_PROMPT = `

---

## Current Task: Revision Verification

All revision sessions have been completed. The author wants a final check-in before moving on.

Your job:
1. Read \`source/project-tasks.md\` to see the full task list and what was marked done
2. Skim through the chapters that were revised to confirm the work feels right
3. Give the author a brief, honest assessment: does the manuscript feel solid after these revisions?
4. Flag anything that feels off, unfinished, or introduced by the revisions
5. Ask the author if there's anything else they want to address before moving on

Keep it conversational. This isn't a formal audit — it's a final gut-check with the author before they advance the pipeline.
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
