# Session 27 — Agent Self-Read: Kill the Wrangler, Let Agents Read Their Own Context

## Context

Novel Engine Electron app. Sessions 01–26 built the complete app including the Context Wrangler (Session 08), context assembly pipeline (ManifestBuilder, PlanExecutor, TokenEstimator), and agent tool use (Session 25).

**The Problem:** Every agent interaction currently follows a **three-step** pipeline:

1. **ManifestBuilder** reads ALL book files from disk and measures token counts (~50ms)
2. **Wrangler call** — a full Claude Sonnet API round-trip to decide what context the agent should see (**3–8 seconds of pure overhead**)
3. **PlanExecutor** loads the selected files into a giant system prompt string, optionally calling Sonnet again for summarization (**0–8 more seconds**)

Only THEN does the actual agent call begin, with a **bloated system prompt** stuffed with 20K–50K tokens of pre-loaded book content.

**The Realization:** Session 25 gave agents full Read/Write/Edit/LS tool access. The Wrangler was an AI call whose entire purpose was deciding what files the agent should see. But now agents can read files themselves. The Wrangler is redundant — the agent's own intelligence replaces it.

**The Fix:** Replace the fat context assembly pipeline with a **lean file manifest** in the system prompt. Give agents a listing of what files exist (with sizes), and let them `Read` the files they need. Eliminate the Wrangler call, PlanExecutor, ManifestBuilder (content loading), and summarization calls entirely.

### Speed Impact

| Step | Before | After |
|------|--------|-------|
| Manifest build | ~50ms (reads all files) | ~10ms (file listing only) |
| Wrangler API call | 3–8s | **eliminated** |
| Summarization calls | 0–8s each | **eliminated** |
| System prompt size | 20K–50K tokens | ~500–1000 tokens |
| Total pre-call overhead | **3–16 seconds** | **<100ms** |

---

## Design

### Before vs After

| Before (Context Wrangler) | After (Agent Self-Read) |
|---|---|
| ManifestBuilder reads all files, measures tokens | Lightweight directory listing only |
| Wrangler CLI call decides what to include (3–8s) | No Wrangler call — agent decides |
| PlanExecutor loads files into system prompt | Files NOT in system prompt |
| Optional summarization CLI calls (3–8s each) | No summarization calls |
| System prompt: 20K–50K tokens of book content | System prompt: ~500 token file manifest |
| Agent gets pre-digested context | Agent reads what it needs via Read tool |
| Two API calls per interaction (Wrangler + Agent) | One API call per interaction |

### What the Agent Gets Instead

The system prompt now includes a **File Manifest** section — a lightweight table of what exists in the book directory:

```markdown
## Active Book

- **Title**: The Last Garden
- **Author**: Jane Doe
- **Status**: first-draft
- **Chapters**: 12
- **Total words**: 48,200

## Project Files

The following files exist in this book's directory. Use the **Read** tool to load any files you need for this task. Do not guess at file contents — read them.

| File | Words |
|------|-------|
| `source/pitch.md` | 2,450 |
| `source/voice-profile.md` | 1,200 |
| `source/scene-outline.md` | 5,800 |
| `chapters/01-the-awakening/draft.md` | 4,200 |
| `chapters/01-the-awakening/notes.md` | 350 |
...
```

The agent's own intelligence — guided by its agent prompt (which already describes its role) and per-agent read guidance — decides which files to read.

### Per-Agent Read Guidance

Each creative agent gets a brief hint so it knows which files are most relevant:

```markdown
## Context Loading Guidance

Based on your role, here is guidance on which files to read:

- **Always read**: `source/voice-profile.md`
- **Read if relevant to this task**: `source/pitch.md`, `source/scene-outline.md`, ...
- **Skip** (not your domain): `source/reader-report.md`, `source/dev-report.md`
```

These are the same per-agent rules that were in the Wrangler's logic, presented directly to the agent as guidance.

### Conversation Compaction — Simplified

The Wrangler also managed conversation compaction via AI summarization calls. Replace with simple deterministic truncation — no AI call needed:

| Turns | Strategy |
|-------|----------|
| ≤ 20 | Keep all messages as-is |
| 21–40 | Keep last 8 turns, prepend context note |
| > 40 | Keep last 6 turns, prepend context note |

### RevisionQueueService Impact

`RevisionQueueService` has two Wrangler dependencies:
1. **`contextWrangler.assemble()`** (line 184) — used to build context for Verity revision sessions. Replace with the new `ContextBuilder`.
2. **`sendOneShot` with `WRANGLER_SESSION_PARSE_PROMPT`** (line 77) — used to parse Forge's revision plans. This is a **separate concern** that has nothing to do with context assembly. Keep `WRANGLER_SESSION_PARSE_PROMPT` and `WRANGLER_MODEL` for this purpose.

---

## Task 1: Add New Types, Remove Wrangler Types

### Update `src/domain/types.ts`

**Add** these new types:

```typescript
export type FileManifestItem = {
  path: string;           // relative to book root, e.g. "source/pitch.md"
  wordCount: number;      // approximate word count
};

export type ProjectManifest = {
  meta: BookMeta;
  files: FileManifestItem[];
  chapterCount: number;
  totalWordCount: number;
};
```

**Remove** these Wrangler-specific types (verify each is no longer referenced after all changes):

- `WranglerInput`
- `WranglerPlan`
- `WranglerFileDirective`
- `WranglerSummarizeDirective`
- `WranglerExcludeDirective`
- `WranglerChapterDirective`
- `WranglerChapterExclude`
- `FileManifestEntry`
- `ChapterManifestEntry`
- `ConversationManifest`
- `ContextBudget`
- `ChapterStrategy`
- `ConversationStrategy`

**Simplify** `ContextDiagnostics`:

```typescript
export type ContextDiagnostics = {
  filesAvailable: string[];         // files listed in the manifest
  conversationTurnsSent: number;
  conversationTurnsDropped: number;
  manifestTokenEstimate: number;    // how many tokens the manifest section uses
};
```

**Simplify** `AssembledContext` — remove `projectContext` (no longer a giant string of pre-loaded content):

```typescript
export type AssembledContext = {
  systemPrompt: string;                                    // agent prompt + manifest + guidance
  conversationMessages: { role: MessageRole; content: string }[];
  diagnostics: ContextDiagnostics;
};
```

**Keep** `BookContext` for now — check if `IFileSystemService.loadBookContext()` is used outside of `ManifestBuilder`. If it's used elsewhere (e.g., file browser, pipeline detection), keep both the type and the method. If only `ManifestBuilder` used it, it can be removed.

---

## Task 2: Update Domain Interfaces

### Update `src/domain/interfaces.ts`

**Remove** the `IContextWrangler` interface entirely.

**Add** to `IFileSystemService`:

```typescript
// Project manifest (lightweight file listing with word counts)
getProjectManifest(slug: string): Promise<ProjectManifest>;
```

Import `ProjectManifest` from types.

---

## Task 3: Update Constants

### Update `src/domain/constants.ts`

**Remove** (only if NOT used by `RevisionQueueService`):
- `WRANGLER_MAX_TOKENS`
- `SUMMARIZATION_MAX_TOKENS`
- `WRANGLER_RECENT_TURN_COUNT`

**Keep** (still used by `RevisionQueueService` for parsing Forge output):
- `WRANGLER_MODEL`
- `WRANGLER_SESSION_PARSE_PROMPT`

**Keep** (still generally useful):
- `CHARS_PER_TOKEN`
- `MAX_CONTEXT_TOKENS`
- `AGENT_RESPONSE_BUFFER`
- `FILE_MANIFEST_KEYS`

**Add** per-agent read guidance:

```typescript
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
```

---

## Task 4: Create ContextBuilder

### Create `src/application/ContextBuilder.ts`

A **pure utility class** — no infrastructure dependencies, no async AI calls. Imports only from domain types and constants, plus `TokenEstimator`.

```typescript
import type {
  AgentName,
  AssembledContext,
  ContextDiagnostics,
  CreativeAgentName,
  Message,
  MessageRole,
  ProjectManifest,
} from '@domain/types';
import { AGENT_READ_GUIDANCE, CREATIVE_AGENT_NAMES } from '@domain/constants';
import { TokenEstimator } from './context/TokenEstimator';

/**
 * ContextBuilder — Builds a lean system prompt with a file manifest
 * and compacts conversation history using simple heuristic rules.
 *
 * Replaces the entire ContextWrangler → ManifestBuilder → PlanExecutor pipeline.
 * No AI calls. No file content loading. Just metadata assembly + conversation truncation.
 */
export class ContextBuilder {
  private tokenEstimator = new TokenEstimator();

  /**
   * Build the assembled context for an agent interaction.
   */
  build(params: {
    agentName: AgentName;
    agentSystemPrompt: string;
    manifest: ProjectManifest;
    messages: Message[];
    purposeInstructions?: string;
  }): AssembledContext {
    const { agentName, agentSystemPrompt, manifest, messages, purposeInstructions } = params;

    // 1. Build file manifest section
    const manifestSection = this.buildManifestSection(manifest);

    // 2. Build read guidance section (only for creative agents)
    const guidanceSection = this.buildReadGuidance(agentName);

    // 3. Build file-writing instructions
    const writeInstructions = this.buildFileWriteInstructions();

    // 4. Assemble full system prompt
    const sections = [agentSystemPrompt, '---', manifestSection];
    if (guidanceSection) sections.push(guidanceSection);
    sections.push(writeInstructions);
    if (purposeInstructions) sections.push(purposeInstructions);

    const systemPrompt = sections.join('\n\n');

    // 5. Compact conversation history
    const conversationMessages = this.compactConversation(messages);

    // 6. Build diagnostics
    const addedContent = [manifestSection, guidanceSection ?? '', writeInstructions].join('\n');
    const manifestTokens = this.tokenEstimator.estimate(addedContent);

    const diagnostics: ContextDiagnostics = {
      filesAvailable: manifest.files.map((f) => f.path),
      conversationTurnsSent: conversationMessages.length,
      conversationTurnsDropped: messages.length - conversationMessages.length,
      manifestTokenEstimate: manifestTokens,
    };

    return { systemPrompt, conversationMessages, diagnostics };
  }

  /**
   * Build the file manifest section.
   * Lists all files with word counts so the agent knows what's available to Read.
   */
  private buildManifestSection(manifest: ProjectManifest): string {
    const lines: string[] = [];
    lines.push('## Active Book');
    lines.push('');
    lines.push(`- **Title**: ${manifest.meta.title}`);
    lines.push(`- **Author**: ${manifest.meta.author}`);
    lines.push(`- **Status**: ${manifest.meta.status}`);
    lines.push(`- **Chapters**: ${manifest.chapterCount}`);
    lines.push(`- **Total words**: ${manifest.totalWordCount.toLocaleString()}`);
    lines.push('');
    lines.push('## Project Files');
    lines.push('');
    lines.push('The following files exist in this book\'s directory. Use the **Read** tool to load any files you need for this task. Do not guess at file contents — read them.');
    lines.push('');

    if (manifest.files.length === 0) {
      lines.push('*No files yet — this is a new book.*');
    } else {
      lines.push('| File | Words |');
      lines.push('|------|-------|');
      for (const file of manifest.files) {
        lines.push(`| \`${file.path}\` | ${file.wordCount.toLocaleString()} |`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Build per-agent read guidance so the agent knows which files
   * are most relevant to its role.
   */
  private buildReadGuidance(agentName: AgentName): string | null {
    if (!CREATIVE_AGENT_NAMES.includes(agentName as CreativeAgentName)) return null;

    const guidance = AGENT_READ_GUIDANCE[agentName as CreativeAgentName];
    if (!guidance) return null;

    const lines: string[] = [];
    lines.push('## Context Loading Guidance');
    lines.push('');
    lines.push('Based on your role, here is guidance on which files to read:');
    lines.push('');

    if (guidance.alwaysRead.length > 0) {
      lines.push(`- **Always read**: ${guidance.alwaysRead.map((f) => `\`${f}\``).join(', ')}`);
    }
    if (guidance.readIfRelevant.length > 0) {
      lines.push(`- **Read if relevant to this task**: ${guidance.readIfRelevant.map((f) => `\`${f}\``).join(', ')}`);
    }
    if (guidance.neverRead.length > 0) {
      lines.push(`- **Skip** (not your domain): ${guidance.neverRead.map((f) => `\`${f}\``).join(', ')}`);
    }

    lines.push('');
    lines.push('Read the files you need before responding. Use the LS tool to explore chapter directories if needed.');

    return lines.join('\n');
  }

  /**
   * Standard file-writing instructions appended to every agent's system prompt.
   */
  private buildFileWriteInstructions(): string {
    return `## File Writing

You have direct access to read and write files in this book's directory. When the author approves your output, **write it to the appropriate file** — do not just display it in chat.

Key file paths:
- \`source/pitch.md\` — the approved pitch document
- \`source/voice-profile.md\` — the voice profile
- \`source/scene-outline.md\` — the scene-by-scene outline
- \`source/story-bible.md\` — characters, world, lore
- \`source/reader-report.md\` — Ghostlight's reader report
- \`source/dev-report.md\` — Lumen's development report
- \`source/audit-report.md\` — Sable's copy-edit audit
- \`source/project-tasks.md\` — Forge's revision task breakdown
- \`source/revision-prompts.md\` — Forge's per-chapter revision prompts
- \`source/style-sheet.md\` — Sable's style consistency rules
- \`source/metadata.md\` — Quill's publication metadata
- \`chapters/NN-slug/draft.md\` — chapter prose (Verity writes these)
- \`chapters/NN-slug/notes.md\` — chapter notes

**Rules:**
- Always ask for explicit approval before writing/overwriting a file
- For chapters, use the format \`chapters/NN-slug-name/draft.md\`
- Write complete files — never partial updates unless using the Edit tool for targeted fixes
`;
  }

  /**
   * Compact conversation history using simple heuristic rules.
   * No AI calls — just truncation with a context note.
   */
  compactConversation(
    messages: Message[],
  ): { role: MessageRole; content: string }[] {
    const totalTurns = messages.length;

    // Short conversations: keep everything
    if (totalTurns <= 20) {
      return messages.map((m) => ({ role: m.role, content: m.content }));
    }

    // Medium conversations: keep last 8 turns with a note
    if (totalTurns <= 40) {
      const keepCount = 8;
      const droppedCount = totalTurns - keepCount;
      const recent = messages.slice(-keepCount);
      return [
        {
          role: 'user' as MessageRole,
          content: `[${droppedCount} earlier messages omitted for context efficiency. Read the conversation from this point.]`,
        },
        {
          role: 'assistant' as MessageRole,
          content: 'Understood. Continuing from our recent conversation.',
        },
        ...recent.map((m) => ({ role: m.role, content: m.content })),
      ];
    }

    // Long conversations: keep last 6 turns with a note
    const keepCount = 6;
    const droppedCount = totalTurns - keepCount;
    const recent = messages.slice(-keepCount);
    return [
      {
        role: 'user' as MessageRole,
        content: `[${droppedCount} earlier messages omitted for context efficiency. This is a long conversation — focus on the most recent context.]`,
      },
      {
        role: 'assistant' as MessageRole,
        content: 'Understood. Continuing with the recent context.',
      },
      ...recent.map((m) => ({ role: m.role, content: m.content })),
    ];
  }
}
```

---

## Task 5: Implement getProjectManifest in FileSystemService

### Update `src/infrastructure/filesystem/FileSystemService.ts`

Add the `getProjectManifest` method. This reads the file system to build a lightweight listing — it reads file sizes but NOT full file contents (only enough to count words).

```typescript
async getProjectManifest(slug: string): Promise<ProjectManifest> {
  const meta = await this.getBookMeta(slug);
  const files: FileManifestItem[] = [];

  // Check each known source file
  const sourceFiles = [
    'source/pitch.md',
    'source/voice-profile.md',
    'source/scene-outline.md',
    'source/story-bible.md',
    'source/reader-report.md',
    'source/dev-report.md',
    'source/audit-report.md',
    'source/revision-prompts.md',
    'source/style-sheet.md',
    'source/project-tasks.md',
    'source/metadata.md',
    'about.json',
  ];

  for (const filePath of sourceFiles) {
    try {
      const exists = await this.fileExists(slug, filePath);
      if (exists) {
        const content = await this.readFile(slug, filePath);
        const wordCount = content.split(/\s+/).filter(Boolean).length;
        files.push({ path: filePath, wordCount });
      }
    } catch {
      // Skip files that can't be read
    }
  }

  // Check author-profile.md (lives in userData root, not book dir)
  try {
    const authorProfilePath = path.join(this.userDataDir, 'author-profile.md');
    const content = await fs.readFile(authorProfilePath, 'utf-8');
    if (content.trim()) {
      const wordCount = content.split(/\s+/).filter(Boolean).length;
      files.push({ path: 'author-profile.md', wordCount });
    }
  } catch {
    // No author profile yet — that's fine
  }

  // List chapter directories and their files
  let chapterCount = 0;
  let totalWordCount = 0;

  try {
    const chaptersDir = path.join(this.booksDir, slug, 'chapters');
    const entries = await fs.readdir(chaptersDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      chapterCount++;

      for (const fileName of ['draft.md', 'notes.md']) {
        const relativePath = `chapters/${entry.name}/${fileName}`;
        try {
          const exists = await this.fileExists(slug, relativePath);
          if (exists) {
            const content = await this.readFile(slug, relativePath);
            const wc = content.split(/\s+/).filter(Boolean).length;
            files.push({ path: relativePath, wordCount: wc });
            if (fileName === 'draft.md') totalWordCount += wc;
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
  } catch {
    // No chapters directory yet — that's fine for a new book
  }

  // Add source file word counts to total
  totalWordCount += files
    .filter((f) => f.path.startsWith('source/'))
    .reduce((sum, f) => sum + f.wordCount, 0);

  return { meta, files, chapterCount, totalWordCount };
}
```

Import `FileManifestItem` and `ProjectManifest` from `@domain/types`.

---

## Task 6: Rewrite ChatService

### Update `src/application/ChatService.ts`

**Replace** `IContextWrangler` dependency with `IFileSystemService` and `ContextBuilder`.

**New constructor:**

```typescript
import { ContextBuilder } from './ContextBuilder';

export class ChatService {
  private lastDiagnostics: ContextDiagnostics | null = null;
  private contextBuilder = new ContextBuilder();

  constructor(
    private settings: ISettingsService,
    private agents: IAgentService,
    private db: IDatabaseService,
    private claude: IClaudeClient,
    private fs: IFileSystemService,        // NEW — replaces IContextWrangler
    private usage: UsageService,
  ) {}
```

**Updated `sendMessage` — the key change:**

Replace the Wrangler assembly block (steps 5b–7) with:

```typescript
// Step 5b: Build lightweight manifest (fast — just file listing)
onEvent({ type: 'status', message: 'Preparing context…' });
const manifest = await this.fs.getProjectManifest(bookSlug);

// Step 6: Get conversation messages from DB
const messages = this.db.getMessages(conversationId);

// Step 7: Determine purpose-specific instructions
let purposeInstructions: string | undefined;
if (conversation?.purpose === 'voice-setup') {
  purposeInstructions = VOICE_SETUP_INSTRUCTIONS;
} else if (conversation?.purpose === 'author-profile') {
  purposeInstructions = AUTHOR_PROFILE_INSTRUCTIONS;
}

// Step 7b: Build context using the lean ContextBuilder
const assembled = this.contextBuilder.build({
  agentName,
  agentSystemPrompt: agent.systemPrompt,
  manifest,
  messages,
  purposeInstructions,
});

// Step 8: Store diagnostics
this.lastDiagnostics = assembled.diagnostics;

// Step 9: Call the agent — ONE call, no Wrangler pre-call
onEvent({ type: 'status', message: 'Waiting for response…' });
let responseBuffer = '';
let thinkingBuffer = '';

await this.claude.sendMessage({
  model: appSettings.model,
  systemPrompt: assembled.systemPrompt,
  messages: assembled.conversationMessages,
  maxTokens: appSettings.maxTokens,
  thinkingBudget,
  bookSlug,
  onEvent: (event: StreamEvent) => {
    // Accumulate + forward (same as before)
    if (event.type === 'textDelta') {
      responseBuffer += event.text;
    } else if (event.type === 'thinkingDelta') {
      thinkingBuffer += event.text;
    } else if (event.type === 'done') {
      this.db.saveMessage({
        conversationId,
        role: 'assistant',
        content: responseBuffer,
        thinking: thinkingBuffer,
      });
      this.usage.recordUsage({
        conversationId,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        thinkingTokens: event.thinkingTokens,
        model: appSettings.model,
      });
    }
    onEvent(event);
  },
});
```

**Remove:**
- `IContextWrangler` import
- `contextWrangler` constructor parameter
- The old `contextWrangler.assemble()` call
- The old `systemPrompt = agent.systemPrompt + projectContext` concatenation
- The `buildFileInstructions` method (if it exists from Session 25 — now in ContextBuilder)

---

## Task 7: Update RevisionQueueService

### Update `src/application/RevisionQueueService.ts`

**Replace** `IContextWrangler` dependency with `IFileSystemService` and `ContextBuilder`.

At line 184, replace:

```typescript
// Before:
const assembled = await this.contextWrangler.assemble({
  agentName: 'Verity' as AgentName,
  userMessage: session.prompt,
  conversationId: conversation.id,
  bookSlug: plan.bookSlug,
});
const systemPrompt = `${verity.systemPrompt}\n\n---\n\n# Current Book Context\n\n${assembled.projectContext}`;

// After:
const manifest = await this.fs.getProjectManifest(plan.bookSlug);
const messages = this.db.getMessages(conversation.id);
const contextBuilder = new ContextBuilder();
const assembled = contextBuilder.build({
  agentName: 'Verity' as AgentName,
  agentSystemPrompt: verity.systemPrompt,
  manifest,
  messages,
});
const systemPrompt = assembled.systemPrompt;
```

Update constructor to accept `IFileSystemService` instead of `IContextWrangler`. Remove `IContextWrangler` import.

---

## Task 8: Update Composition Root

### Update `src/main/index.ts`

**Remove:**
- `ContextWrangler` import and instantiation
- `IContextWrangler` injection into `ChatService` and `RevisionQueueService`

**Update** service construction:

```typescript
// Before:
const contextWrangler = new ContextWrangler(settings, agents, db, filesystem, claude);
const chat = new ChatService(settings, agents, db, claude, contextWrangler, usage);
const revisionQueue = new RevisionQueueService(chat, agents, db, settings, claude, contextWrangler);

// After:
const chat = new ChatService(settings, agents, db, claude, filesystem, usage);
const revisionQueue = new RevisionQueueService(chat, agents, db, settings, claude, filesystem);
```

---

## Task 9: Delete Dead Code

### Delete these files:

1. **`src/application/ContextWrangler.ts`**
2. **`src/application/context/ManifestBuilder.ts`**
3. **`src/application/context/PlanExecutor.ts`**

### Keep:

- **`src/application/context/TokenEstimator.ts`** — still used by `ContextBuilder`

### Delete agent file:

- **`agents/WRANGLER.md`** — no longer needed for context planning. The `WRANGLER_SESSION_PARSE_PROMPT` constant (used by `RevisionQueueService`) is self-contained and doesn't reference this file.

### Update barrel exports:

**`src/application/index.ts`:**
- Remove `ContextWrangler` export
- Add `ContextBuilder` export

---

## Task 10: Update Diagnostics in UI

### Check and update renderer components that display `ContextDiagnostics`

The diagnostics type changed. Search for references to the old fields and update:

**Old fields (removed):**
- `filesIncluded` → replaced by `filesAvailable`
- `filesExcluded` → removed (agent decides what to read)
- `filesSummarized` → removed (no summarization)
- `chapterStrategy` → removed
- `chaptersIncluded` → removed
- `chaptersExcluded` → removed
- `conversationStrategy` → removed
- `wranglerReasoning` → removed
- `totalTokensUsed` → replaced by `manifestTokenEstimate`
- `budgetRemaining` → removed
- `wranglerCostTokens` → removed

**New fields:**
- `filesAvailable` — list of files the agent can read
- `conversationTurnsSent`
- `conversationTurnsDropped`
- `manifestTokenEstimate`

Update any component that renders these fields (likely in `ChatView` or a diagnostics panel). If the diagnostics display shows "Wrangler reasoning" or "Files included/excluded", simplify it to just show "Files available" and "Conversation turns".

---

## Task 11: Optionally Simplify loadBookContext

### Check `IFileSystemService.loadBookContext` usage

Search for `loadBookContext` across the codebase. If it's only called from:
- `ManifestBuilder` (being deleted) → remove it from the interface and implementation
- Other places → keep it

If removing, also remove the `BookContext` type from `types.ts` if nothing else uses it.

---

## Summary of Changes by File

| File | Change |
|------|--------|
| `src/domain/types.ts` | Add `FileManifestItem`, `ProjectManifest`; simplify `ContextDiagnostics`, `AssembledContext`; remove Wrangler types |
| `src/domain/interfaces.ts` | Remove `IContextWrangler`; add `getProjectManifest` to `IFileSystemService` |
| `src/domain/constants.ts` | Remove unused Wrangler constants; add `ReadGuidance` type and `AGENT_READ_GUIDANCE` |
| `src/application/ContextBuilder.ts` | **NEW** — lean system prompt builder + conversation compaction |
| `src/application/ChatService.ts` | Replace `IContextWrangler` with `IFileSystemService` + `ContextBuilder` |
| `src/application/RevisionQueueService.ts` | Replace `IContextWrangler` with `IFileSystemService` + `ContextBuilder` |
| `src/application/ContextWrangler.ts` | **DELETE** |
| `src/application/context/ManifestBuilder.ts` | **DELETE** |
| `src/application/context/PlanExecutor.ts` | **DELETE** |
| `src/application/context/TokenEstimator.ts` | KEEP (unchanged) |
| `src/application/index.ts` | Update barrel exports |
| `src/infrastructure/filesystem/FileSystemService.ts` | Add `getProjectManifest` method |
| `src/main/index.ts` | Remove `ContextWrangler`; update `ChatService` and `RevisionQueueService` construction |
| `agents/WRANGLER.md` | **DELETE** |
| Renderer diagnostics components | Update to match simplified `ContextDiagnostics` |

---

## Architecture Notes

- **Layer boundaries preserved.** `ContextBuilder` is a pure application-layer utility — imports only from domain (types + constants) and `TokenEstimator`. No infrastructure dependencies, no AI calls.
- **No AI calls for context assembly.** The Wrangler pipeline (1–3 Sonnet API calls per message, 3–16 seconds) is replaced by zero API calls (<100ms).
- **Conversation compaction is deterministic.** Simple turn-count-based truncation. Predictable, instant, free.
- **The agent is smarter than the Wrangler.** The creative agent (Opus) reading files itself with full task context makes better decisions about what's relevant than a cheap Sonnet call with a truncated manifest.
- **RevisionQueueService updated.** It switches from `IContextWrangler.assemble()` to `ContextBuilder.build()` + `IFileSystemService.getProjectManifest()`. The `WRANGLER_SESSION_PARSE_PROMPT` for parsing Forge's output is a separate concern and remains unchanged.
- **`BookContext` lifecycle.** If `loadBookContext` is no longer used, it and its type can be cleaned up. If used elsewhere, it stays.

---

## Verification

1. **Speed test:**
   - Send a message to Spark on a book with several source files
   - The "Preparing context…" status should flash briefly (<100ms) — no Wrangler call
   - The agent should start responding faster than before (no 3–8s pre-call overhead)
   - Total time from send to first token should be noticeably faster

2. **Agent reads files:**
   - In the chat, observe tool activity showing the agent using Read to load files it needs
   - Spark should Read `author-profile.md` before responding (per its guidance)
   - Verity should Read `source/voice-profile.md` and relevant chapters
   - Ghostlight should Read chapter drafts for cold-reading (full-read behavior)

3. **File manifest in system prompt:**
   - Check the diagnostics panel — `filesAvailable` should list all existing files
   - `manifestTokenEstimate` should be ~500–1000 tokens (much less than the old 20K–50K)

4. **Conversation compaction:**
   - Create a conversation with > 20 messages
   - Verify that older messages are dropped and a context note is prepended
   - The agent should still respond coherently about recent topics

5. **Revision queue still works:**
   - Load a book with revision-prompts.md and project-tasks.md
   - Parse the revision plan — should still work (uses `sendOneShot` with `WRANGLER_SESSION_PARSE_PROMPT`)
   - Run a revision session — should use the new `ContextBuilder` instead of `ContextWrangler`

6. **No Wrangler references (except revision parsing):**
   - `grep -r "ContextWrangler\|IContextWrangler\|ManifestBuilder\|PlanExecutor" src/` returns nothing
   - `grep -r "WranglerPlan\|WranglerInput\|WranglerFileDirective" src/` returns nothing
   - `WRANGLER_MODEL` and `WRANGLER_SESSION_PARSE_PROMPT` remain (used by revision queue only)

7. **Compilation:**
   - `npx tsc --noEmit` passes with zero errors
   - No unused imports or dead code warnings
