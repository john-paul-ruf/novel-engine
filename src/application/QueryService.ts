import type {
  IFileSystemService,
  IChatService,
  IQueryService,
} from '@domain/interfaces';
import type {
  QueryTracker,
  QueryTarget,
  QueryStatus,
  QueryLetter,
  QueryResearchResult,
  QueryFieldFillResult,
  QueryFillableField,
  StreamEvent,
} from '@domain/types';
import { nanoid } from 'nanoid';

const TRACKER_PATH = 'source/query-tracker.md';
const LETTERS_DIR = 'source/query-letters';

export class QueryService implements IQueryService {
  constructor(
    private fs: IFileSystemService,
    private chat: IChatService,
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
    const content = this.serializeTracker(tracker);
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

    const prompt = this.buildGeneratePrompt(target);

    const conversation = await this.chat.createConversation({
      bookSlug,
      agentName: 'Quill',
      pipelinePhase: 'query-agents',
      purpose: 'pipeline',
    });

    const { changedFiles } = await this.chat.sendMessage({
      agentName: 'Quill',
      message: prompt,
      conversationId: conversation.id,
      bookSlug,
      onEvent,
    });

    let letterContent: string;
    const letterWrittenByAgent = changedFiles.some((f) => f.includes(letterPath));

    if (letterWrittenByAgent) {
      letterContent = await this.fs.readFile(bookSlug, letterPath);
    } else {
      const messages = await this.chat.getMessages(conversation.id);
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
      letterContent = lastAssistant?.content ?? '';
      await this.fs.writeFile(bookSlug, letterPath, letterContent);
    }

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

  async researchTargets(
    bookSlug: string,
    onEvent: (event: StreamEvent) => void,
  ): Promise<QueryResearchResult> {
    const conversation = await this.chat.createConversation({
      bookSlug,
      agentName: 'Quill',
      pipelinePhase: 'query-agents',
      purpose: 'pipeline',
    });

    const prompt = this.buildResearchPrompt();

    await this.chat.sendMessage({
      agentName: 'Quill',
      message: prompt,
      conversationId: conversation.id,
      bookSlug,
      onEvent,
    });

    const updatedTracker = await this.loadTracker(bookSlug);
    const targetNames = updatedTracker.targets.map((t) => t.name);

    return {
      addedTargets: updatedTracker.targets.length,
      targetNames,
      conversationId: conversation.id,
    };
  }

  async fillTargetField(
    bookSlug: string,
    targetId: string,
    field: QueryFillableField,
    onEvent: (event: StreamEvent) => void,
  ): Promise<QueryFieldFillResult> {
    const tracker = await this.loadTracker(bookSlug);
    const target = tracker.targets.find((t) => t.id === targetId);
    if (!target) throw new Error(`Query target not found: ${targetId}`);

    const oldValue = String(target[field] ?? '');

    const conversation = await this.chat.createConversation({
      bookSlug,
      agentName: 'Quill',
      pipelinePhase: 'query-agents',
      purpose: 'pipeline',
    });

    const prompt = this.buildFieldFillPrompt(target, field);

    await this.chat.sendMessage({
      agentName: 'Quill',
      message: prompt,
      conversationId: conversation.id,
      bookSlug,
      onEvent,
    });

    const updatedTracker = await this.loadTracker(bookSlug);
    const updatedTarget = updatedTracker.targets.find((t) => t.id === targetId);
    const newValue = updatedTarget ? String(updatedTarget[field] ?? '') : oldValue;

    return {
      targetId,
      field,
      oldValue,
      newValue,
      conversationId: conversation.id,
    };
  }

  // ── Private: Parsing ──────────────────────────────────────────────────

  private parseTrackerContent(bookSlug: string, content: string): QueryTracker {
    const sectionRegex = /^## \[(.+?)\]\s*—\s*(.+?)$/gm;
    const rawPositions: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = sectionRegex.exec(content)) !== null) {
      rawPositions.push(m.index);
    }

    const targets: QueryTarget[] = [];
    for (let i = 0; i < rawPositions.length; i++) {
      const startPos = rawPositions[i];
      const endPos = i + 1 < rawPositions.length ? rawPositions[i + 1] : content.length;
      const section = content.slice(startPos, endPos);
      const headerMatch = section.match(/^## \[(.+?)\]\s*—\s*(.+?)$/m);
      if (!headerMatch) continue;
      const name = headerMatch[1].trim();
      const status = headerMatch[2].trim();
      const body = section.slice(headerMatch[0].length);

      targets.push({
        id: this.extractField(body, 'id') ?? nanoid(),
        name,
        type: (this.extractField(body, 'type') ?? 'agent') as QueryTarget['type'],
        contact: this.extractField(body, 'contact') ?? '',
        method: (this.extractField(body, 'method') ?? 'email') as QueryTarget['method'],
        status: this.parseStatus(status),
        queryLetterPath: this.extractField(body, 'query-letter') ?? null,
        submittedDate: this.extractField(body, 'submitted') ?? null,
        responseDate: this.extractField(body, 'response-date') ?? null,
        notes: this.extractField(body, 'notes') ?? '',
        link: this.extractField(body, 'link') ?? '',
        personalizationNotes: this.extractField(body, 'personalization') ?? '',
      });
    }

    return {
      bookSlug,
      lastUpdated: new Date().toISOString(),
      targets,
    };
  }

  private serializeTracker(tracker: QueryTracker): string {
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
    const regex = new RegExp(`- \\*\\*${fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^:]*:\\*\\*\\s*(.*)`, 'i');
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

  private buildResearchPrompt(): string {
    return `Research submission targets for this book.

Read about.json for genre, subgenre, audience, and comp titles. Read source/story-bible.md and source/pitch-card.md if they exist for context on the book's themes and market positioning.

Use WebSearch to find literary agents and publishers who represent or publish books in this genre. Search for:
- "literary agents [genre]" and "[genre] literary agents seeking new clients"
- Manuscript Wish List (MSWL) entries matching this book's genre and themes
- Publisher's Marketplace listings for recent deals in this genre
- QueryTracker.net agent profiles active in this genre

For each viable target found (aim for 5–10), add an entry to source/query-tracker.md following the existing format. Include:
- Agent/publisher name
- Type (agent, publisher, or platform)
- Contact (email or submission URL from their listing)
- Method (email, form, or query-manager)
- Link to their profile/agency page
- Personalization notes: what they're looking for, why this book fits their list, specific MSWL items aligned with the book

Append new entries to any existing content in source/query-tracker.md. Do not remove existing targets. Use the same markdown format as existing entries:

## [Target Name] — drafting
- **Type:** agent
- **Contact:** [email or URL]
- **Method:** email
- **ID:** [generated id]
- **Submitted:**
- **Response Date:**
- **Query Letter:**
- **Personalization:** [why this book fits]
- **Notes:**
- **Link:** [profile URL]

Focus on agents and publishers that are actively accepting submissions in this genre as of today.`;
  }

  private buildFieldFillPrompt(target: QueryTarget, field: QueryFillableField): string {
    const fieldDescriptions: Record<QueryFillableField, string> = {
      contact: 'the submission email address or form URL',
      method: 'the submission method (email, form, query-manager, or other)',
      link: 'a URL to their agent/publisher profile or agency page',
      personalizationNotes: 'what this target is looking for, why this book fits their list, specific MSWL or interview quotes that align',
      notes: 'any special submission instructions, exclusivity requirements, or notable details',
    };

    return `Research and fill the "${field}" field for ${target.name} (${target.type}).

Target context:
- Name: ${target.name}
- Type: ${target.type}
- Current contact: ${target.contact}
- Current link: ${target.link}

Use WebSearch to find ${fieldDescriptions[field]} for ${target.name}.

After researching, update the "${field}" field for ${target.name} in source/query-tracker.md. Only change that one field — do not modify any other fields or targets. Write the updated value using the same markdown format:

- **${this.fieldToLabel(field)}:** [new value]

where the field label matches the existing format in the file.`;
  }

  private fieldToLabel(field: QueryFillableField): string {
    const map: Record<QueryFillableField, string> = {
      contact: 'Contact',
      method: 'Method',
      link: 'Link',
      personalizationNotes: 'Personalization',
      notes: 'Notes',
    };
    return map[field];
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