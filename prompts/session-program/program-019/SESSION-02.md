# SESSION-02 — QueryService: Tracker I/O, Target CRUD, Query Letter Generation

> **Program:** Novel Engine
> **Feature:** query-manager
> **Modules:** M08 (application)
> **Depends on:** SESSION-01
> **Estimated effort:** 30 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M01 | domain | `src/domain/types.ts`, `src/domain/interfaces.ts`, `src/domain/constants.ts` | Types from SESSION-01 |
| M08 | application | `src/application/ChatService.ts` (sendMessage, createConversation patterns), `src/application/PipelineService.ts` (file I/O patterns) | Patterns for agent invocation and file operations |
| M05 | filesystem | `src/infrastructure/filesystem/FileSystemService.ts` (via IFileSystemService interface) | File read/write API |

## Context

With the domain types in place (SESSION-01), we now implement the `QueryService` application service. This service:
- Parses/serializes the `source/query-tracker.md` file (YAML front matter + markdown sections)
- Manages the `source/query-letters/` directory for individual letter files
- Generates personalized query letters by invoking Quill via `IChatService.sendMessage`
- Depends on `IFileSystemService`, `IChatService`, `IAgentService`, `ISettingsService`, `IProviderRegistry`

The tracker file format uses a simple markdown structure with `## [Name] — {Status}` sections, each followed by bullet-point metadata. The parser must be robust — it may encounter hand-edited files.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/application/QueryService.ts` | Create | Full service implementation |
| `src/application/index.ts` | Modify | Add `QueryService` export |

## Implementation

### 1. Read the existing application barrel and ChatService

Read `src/application/index.ts` to see the export pattern.
Read `src/application/ChatService.ts` (first ~100 lines) to study how `sendMessage` and `createConversation` work — QueryService will call these to generate query letters via Quill.

### 2. Create `src/application/QueryService.ts`

```typescript
import type {
  IFileSystemService,
  IChatService,
  IAgentService,
  ISettingsService,
  IProviderRegistry,
  IQueryService,
} from '@domain/interfaces';
import type {
  QueryTracker,
  QueryTarget,
  QueryStatus,
  QueryLetter,
  StreamEvent,
  AgentName,
} from '@domain/types';
import { nanoid } from 'nanoid';

const TRACKER_PATH = 'source/query-tracker.md';
const LETTERS_DIR = 'source/query-letters';

/** Minimum word count for the tracker file to be considered substantive */
const MIN_TRACKER_WORDS = 50;

export class QueryService implements IQueryService {
  constructor(
    private fs: IFileSystemService,
    private chat: IChatService,
    private agents: IAgentService,
    private settings: ISettingsService,
    private providerRegistry: IProviderRegistry,
  ) {}

  async loadTracker(bookSlug: string): Promise<QueryTracker> {
    try {
      const exists = await this.fs.fileExists(bookSlug, TRACKER_PATH);
      if (!exists) {
        return { bookSlug, lastUpdated: new Date().toISOString(), targets: [] };
      }
      const content = await this.fs.readFile(bookSlug, TRACKER_PATH);
      return this.parseTrackerContent(bookSlug, content);
    } catch (err) {
      console.error('[QueryService] Failed to load tracker:', err);
      return { bookSlug, lastUpdated: new Date().toISOString(), targets: [] };
    }
  }

  async saveTracker(bookSlug: string, tracker: QueryTracker): Promise<void> {
    const content = this.serializeTracker(bookSlug, tracker);
    await this.fs.writeFile(bookSlug, TRACKER_PATH, content);
  }

  async addTarget(
    bookSlug: string,
    target: Omit<QueryTarget, 'id' | 'queryLetterPath' | 'submittedDate' | 'responseDate'>,
  ): Promise<QueryTarget> {
    const tracker = await this.loadTracker(bookSlug);
    const newTarget: QueryTarget = {
      ...target,
      id: nanoid(),
      queryLetterPath: null,
      submittedDate: null,
      responseDate: null,
    };
    tracker.targets.push(newTarget);
    tracker.lastUpdated = new Date().toISOString();
    await this.saveTracker(bookSlug, tracker);
    return newTarget;
  }

  async updateTargetStatus(
    bookSlug: string,
    targetId: string,
    status: QueryStatus,
    responseDate?: string,
  ): Promise<void> {
    const tracker = await this.loadTracker(bookSlug);
    const target = tracker.targets.find((t) => t.id === targetId);
    if (!target) throw new Error(`Query target not found: ${targetId}`);
    target.status = status;
    if (responseDate) target.responseDate = responseDate;
    if (status === 'queried' && !target.submittedDate) {
      target.submittedDate = new Date().toISOString();
    }
    tracker.lastUpdated = new Date().toISOString();
    await this.saveTracker(bookSlug, tracker);
  }

  async removeTarget(bookSlug: string, targetId: string): Promise<void> {
    const tracker = await this.loadTracker(bookSlug);
    const target = tracker.targets.find((t) => t.id === targetId);
    if (target?.queryLetterPath) {
      try {
        await this.fs.deleteFile(bookSlug, target.queryLetterPath);
      } catch {
        // Letter may already be deleted — not an error
      }
    }
    tracker.targets = tracker.targets.filter((t) => t.id !== targetId);
    tracker.lastUpdated = new Date().toISOString();
    await this.saveTracker(bookSlug, tracker);
  }

  async generateQueryLetter(
    bookSlug: string,
    targetId: string,
    onEvent: (event: StreamEvent) => void,
  ): Promise<QueryLetter> {
    const tracker = await this.loadTracker(bookSlug);
    const target = tracker.targets.find((t) => t.id === targetId);
    if (!target) throw new Error(`Query target not found: ${targetId}`);

    const targetSlug = this.slugify(target.name);
    const letterPath = `${LETTERS_DIR}/${targetSlug}.md`;

    // Build the prompt for Quill using the target's personalization notes
    const prompt = this.buildGeneratePrompt(target);

    // Create a conversation for Quill in the query-agents pipeline phase
    const conversation = await this.chat.createConversation({
      bookSlug,
      agentName: 'Quill',
      pipelinePhase: 'query-agents',
      purpose: 'pipeline',
    });

    // Send the generation prompt via chat service (streams via onEvent)
    const { changedFiles } = await this.chat.sendMessage({
      agentName: 'Quill',
      message: prompt,
      conversationId: conversation.id,
      bookSlug,
      onEvent,
    });

    // Check if Quill wrote the letter file via tool-use
    let letterContent: string;
    const letterWrittenByAgent = changedFiles.some((f) => f.includes(letterPath));

    if (letterWrittenByAgent) {
      letterContent = await this.fs.readFile(bookSlug, letterPath);
    } else {
      // Non-tool-use path: extract from chat response
      const messages = await this.chat.getMessages(conversation.id);
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
      letterContent = lastAssistant?.content ?? '';
      // Write the extracted content to the letter file
      await this.fs.writeFile(bookSlug, letterPath, letterContent);
    }

    // Update the tracker entry with the letter path
    target.queryLetterPath = letterPath;
    tracker.lastUpdated = new Date().toISOString();
    await this.saveTracker(bookSlug, tracker);

    return {
      targetName: target.name,
      targetSlug,
      filePath: letterPath,
      content: letterContent,
      generatedAt: new Date().toISOString(),
    };
  }

  async listQueryLetters(bookSlug: string): Promise<QueryLetter[]> {
    try {
      const entries = await this.fs.listDirectory(bookSlug, LETTERS_DIR);
      const letters: QueryLetter[] = [];
      for (const entry of entries) {
        if (entry.isDirectory || !entry.name.endsWith('.md')) continue;
        const targetSlug = entry.name.replace(/\.md$/, '');
        const content = await this.fs.readFile(bookSlug, entry.path);
        letters.push({
          targetName: this.unslugify(targetSlug),
          targetSlug,
          filePath: entry.path,
          content,
          generatedAt: null,
        });
      }
      return letters;
    } catch {
      return [];
    }
  }

  async readQueryLetter(bookSlug: string, targetSlug: string): Promise<string> {
    return this.fs.readFile(bookSlug, `${LETTERS_DIR}/${targetSlug}.md`);
  }

  async saveQueryLetter(bookSlug: string, targetSlug: string, content: string): Promise<void> {
    const letterPath = `${LETTERS_DIR}/${targetSlug}.md`;
    await this.fs.writeFile(bookSlug, letterPath, content);

    // Update the tracker if this target doesn't have a letter path yet
    const tracker = await this.loadTracker(bookSlug);
    const target = tracker.targets.find(
      (t) => this.slugify(t.name) === targetSlug,
    );
    if (target && !target.queryLetterPath) {
      target.queryLetterPath = letterPath;
      tracker.lastUpdated = new Date().toISOString();
      await this.saveTracker(bookSlug, tracker);
    }
  }

  // ── Private: Parsing ──────────────────────────────────────────────────

  private parseTrackerContent(bookSlug: string, content: string): QueryTracker {
    // Parse sections matching `## [Target Name] — {Status}`
    const targetRegex = /^## \[(.+?)\]\s*—\s*(.+?)$/gm;
    const targets: QueryTarget[] = [];
    let match: RegExpExecArray | null;

    while ((match = targetRegex.exec(content)) !== null) {
      const name = match[1].trim();
      const status = this.parseStatus(match[2].trim());
      const sectionStart = match.index + match[0].length;
      // Find the next section or EOF
      const nextMatch = targetRegex.exec(content);
      const sectionEnd = nextMatch ? nextMatch.index : content.length;
      targetRegex.lastIndex = match.index + match[0].length; // reset lastIndex
      const sectionBody = content.slice(sectionStart, sectionEnd);

      targets.push({
        id: this.extractField(sectionBody, 'id') ?? nanoid(),
        name,
        type: (this.extractField(sectionBody, 'type') as 'agent' | 'publisher' | 'platform') ?? 'agent',
        contact: this.extractField(sectionBody, 'contact') ?? '',
        method: (this.extractField(sectionBody, 'method') as QueryTarget['method']) ?? 'email',
        status,
        queryLetterPath: this.extractField(sectionBody, 'query-letter') ?? null,
        submittedDate: this.extractField(sectionBody, 'submitted-date') ?? null,
        responseDate: this.extractField(sectionBody, 'response-date') ?? null,
        notes: this.extractField(sectionBody, 'notes') ?? '',
        link: this.extractField(sectionBody, 'link') ?? '',
        personalizationNotes: this.extractField(sectionBody, 'personalization') ?? '',
      });
    }

    return {
      bookSlug,
      lastUpdated: new Date().toISOString(),
      targets,
    };
  }

  private serializeTracker(bookSlug: string, tracker: QueryTracker): string {
    const lines: string[] = [
      '---',
      `last_updated: ${tracker.lastUpdated.split('T')[0]}`,
      `total_targets: ${tracker.targets.length}`,
      '---',
      '',
      `# Query Tracker`,
      '',
    ];

    for (const target of tracker.targets) {
      lines.push(
        `## [${target.name}] — ${target.status}`,
        `- **Type:** ${target.type}`,
        `- **Contact:** ${target.contact}`,
        `- **Method:** ${target.method}`,
        `- **ID:** ${target.id}`,
        `- **Submitted:** ${target.submittedDate ?? ''}`,
        `- **Response Date:** ${target.responseDate ?? ''}`,
        `- **Query Letter:** ${target.queryLetterPath ?? ''}`,
        `- **Personalization:** ${target.personalizationNotes}`,
        `- **Notes:** ${target.notes}`,
        `- **Link:** ${target.link}`,
        '',
      );
    }

    return lines.join('\n');
  }

  private extractField(text: string, fieldName: string): string | null {
    const regex = new RegExp(`- \\*\\*${fieldName}[^:]*:\\*\\*\\s*(.+)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : null;
  }

  private parseStatus(s: string): QueryStatus {
    const normalized = s.toLowerCase().replace(/\s+/g, '-');
    const valid: QueryStatus[] = ['drafting', 'queried', 'partial-request', 'full-request', 'offer', 'rejected', 'withdrawn'];
    return valid.includes(normalized as QueryStatus) ? normalized as QueryStatus : 'drafting';
  }

  private buildGeneratePrompt(target: QueryTarget): string {
    return `Write a personalized query letter for ${target.name} (${target.type}).

Target details:
- Name: ${target.name}
- Type: ${target.type}
- Contact: ${target.contact}
- Personalization notes: ${target.personalizationNotes}
- Submission method: ${target.method}

A query letter is approximately 250-300 words with three parts:
1. Hook + premise — one compelling paragraph introducing protagonist, inciting incident, and stakes
2. Plot summary — one paragraph: setup, conflict, midpoint, climax hint (no spoiler on resolution)
3. Brief bio + comp titles — your relevant credentials and 2-3 recent comparable titles

Personalize this letter for ${target.name}. Reference their specific interests or preferences noted above. Adjust the tone to match what this agent/publisher is known to represent.

Read the pitch, story bible, and voice profile for context. Write the letter in first person as the author. Output to ${LETTERS_DIR}/${this.slugify(target.name)}.md.`;
  }

  private slugify(name: string): string {
    return name.toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private unslugify(slug: string): string {
    return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
```

### 3. Update `src/application/index.ts`

Read the existing barrel. Add:

```typescript
export { QueryService } from './QueryService';
```

## Verification

1. Run `npx tsc --noEmit` — must pass with zero errors
2. Verify `QueryService` implements `IQueryService` (type errors will catch if not)
3. Verify the class is exported from `src/application/index.ts`
4. Verify `parseTrackerContent` correctly handles a sample tracker markdown string
5. Verify `serializeTracker` produces valid markdown with the expected section format
6. Verify `buildGeneratePrompt` produces a prompt that references the target's personalization notes

## State Update

Update `prompts/session-program/program-019/STATE.md`:
- Set SESSION-02 status to `done`
- Add completion date
- Add handoff notes: QueryService is ready for IPC wiring in SESSION-03