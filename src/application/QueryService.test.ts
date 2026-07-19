import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IChatService } from '@domain/interfaces';
import type { Conversation, Message, QueryTarget, StreamEvent } from '@domain/types';
import { QueryService } from './QueryService';
import { makeFakeFs, type FakeFileSystem } from '../test/fakes';

type SendScript = (params: { message: string; conversationId: string; onEvent: (e: StreamEvent) => void }) => Promise<{ changedFiles: string[] }>;

let fs: FakeFileSystem;
let sendScripts: SendScript[];
let assistantReplies: Map<string, string>;
let conversationCount: number;
let service: QueryService;

function makeChatFake(): IChatService {
  return {
    createConversation: async (params: { bookSlug: string; agentName: string }) => {
      conversationCount++;
      return {
        id: `conv-${conversationCount}`,
        bookSlug: params.bookSlug,
        agentName: params.agentName,
        pipelinePhase: 'query-agents',
        purpose: 'pipeline',
        title: '',
        createdAt: '',
        updatedAt: '',
      } as Conversation;
    },
    sendMessage: async (params: { message: string; conversationId: string; onEvent: (e: StreamEvent) => void }) => {
      const script = sendScripts.shift();
      return script ? script(params) : { changedFiles: [] };
    },
    getMessages: async (conversationId: string): Promise<Message[]> => {
      const reply = assistantReplies.get(conversationId);
      return reply
        ? [{ id: 'm1', conversationId, role: 'assistant', content: reply, thinking: '', timestamp: '' }]
        : [];
    },
  } as unknown as IChatService;
}

const TRACKER_ENTRY = [
  '## [Jane Doe] — drafting',
  '- **Type:** agent',
  '- **Contact:** jane@lit.com',
  '- **Method:** email',
  '- **ID:** target-1',
  '- **Submitted:**',
  '- **Response Date:**',
  '- **Query Letter:**',
  '- **Personalization:** Loves fantasy.',
  '- **Notes:** Query only.',
  '- **Link:** https://lit.com/jane',
  '',
].join('\n');

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  fs = makeFakeFs({}, { bookSlug: 'book' });
  sendScripts = [];
  assistantReplies = new Map();
  conversationCount = 0;
  service = new QueryService(fs, makeChatFake());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('tracker parsing + persistence', () => {
  it('returns an empty tracker when the file is missing', async () => {
    expect(await service.loadTracker('book')).toMatchObject({ bookSlug: 'book', targets: [] });
  });

  it('parses canonical, bracketless, and hyphen-separated headings', async () => {
    fs.files.set(
      'book/source/query-tracker.md',
      [
        TRACKER_ENTRY,
        '## Bracketless Agency – queried',
        '- **ID:** target-2',
        '',
        '## [Jean-Luc Agency] - partial request',
        '- **ID:** target-3',
        '',
      ].join('\n')
    );

    const tracker = await service.loadTracker('book');

    expect(tracker.targets.map((t) => [t.name, t.status])).toEqual([
      ['Jane Doe', 'drafting'],
      ['Bracketless Agency', 'queried'],
      ['Jean-Luc Agency', 'partial-request'],
    ]);
    expect(tracker.targets[0]).toMatchObject({
      id: 'target-1',
      contact: 'jane@lit.com',
      method: 'email',
      personalizationNotes: 'Loves fantasy.',
      link: 'https://lit.com/jane',
    });
  });

  it('addTarget serializes back to the canonical bracketed format', async () => {
    await service.addTarget('book', {
      name: 'New Agent',
      type: 'agent',
      contact: 'new@ag.com',
      method: 'form',
      status: 'drafting',
      notes: '',
      link: '',
      personalizationNotes: 'MSWL match',
    } as Omit<QueryTarget, 'id' | 'queryLetterPath' | 'submittedDate' | 'responseDate'>);

    const raw = fs.files.get('book/source/query-tracker.md')!;
    expect(raw).toContain('## [New Agent] — drafting');
    expect(raw).toContain('- **Personalization:** MSWL match');

    const reloaded = await service.loadTracker('book');
    expect(reloaded.targets.length).toBe(1);
    expect(reloaded.targets[0].name).toBe('New Agent');
  });

  it('updateTargetStatus stamps submittedDate on queried; unknown ids throw', async () => {
    fs.files.set('book/source/query-tracker.md', TRACKER_ENTRY);

    await service.updateTargetStatus('book', 'target-1', 'queried');
    const tracker = await service.loadTracker('book');
    expect(tracker.targets[0].status).toBe('queried');
    expect(tracker.targets[0].submittedDate).toBeTruthy();

    await expect(service.updateTargetStatus('book', 'ghost', 'queried')).rejects.toThrow(/not found/);
  });

  it('removeTarget drops the entry (letter cleanup is dead code — see round-trip bug)', async () => {
    fs.files.set('book/source/query-tracker.md', TRACKER_ENTRY.replace('- **Query Letter:**', '- **Query Letter:** source/query-letters/jane-doe.md'));
    fs.files.set('book/source/query-letters/jane-doe.md', 'Dear Jane');

    await service.removeTarget('book', 'target-1');

    expect((await service.loadTracker('book')).targets).toEqual([]);
    // BUG (recorded in STATE.md): extractField('query-letter') never matches the
    // serialized "Query Letter:" label, so queryLetterPath parses as null and the
    // letter file is never deleted.
    expect(fs.files.has('book/source/query-letters/jane-doe.md')).toBe(true);
  });

  it('archives unparseable tracker content before overwriting (clobber guard)', async () => {
    fs.files.set('book/source/query-tracker.md', 'free-form notes the agent wrote without headings');

    await service.saveTracker('book', { bookSlug: 'book', lastUpdated: new Date().toISOString(), targets: [] });

    const archives = [...fs.files.keys()].filter((k) => k.includes('query-tracker-unparsed-'));
    expect(archives.length).toBe(1);
    expect(fs.files.get(archives[0])).toContain('free-form notes');
  });
});

describe('letter generation', () => {
  beforeEach(() => {
    fs.files.set('book/source/query-tracker.md', TRACKER_ENTRY);
  });

  it('reads the agent-written letter and links it to the target', async () => {
    sendScripts.push(async () => {
      await fs.writeFile('book', 'source/query-letters/jane-doe.md', 'Dear Jane, my novel...');
      return { changedFiles: ['source/query-letters/jane-doe.md'] };
    });

    const letter = await service.generateQueryLetter('book', 'target-1', () => undefined);

    expect(letter).toMatchObject({
      targetName: 'Jane Doe',
      targetSlug: 'jane-doe',
      filePath: 'source/query-letters/jane-doe.md',
      content: 'Dear Jane, my novel...',
    });
    // The path is serialized to disk…
    expect(fs.files.get('book/source/query-tracker.md')).toContain(
      '- **Query Letter:** source/query-letters/jane-doe.md'
    );
    // …but is lost on reload (field-label round-trip bug, recorded in STATE.md)
    expect((await service.loadTracker('book')).targets[0].queryLetterPath).toBeNull();
  });

  it('falls back to the last assistant message when the agent wrote no file', async () => {
    sendScripts.push(async (params) => {
      assistantReplies.set(params.conversationId, 'Chat-only letter body.');
      return { changedFiles: [] };
    });

    const letter = await service.generateQueryLetter('book', 'target-1', () => undefined);

    expect(letter.content).toBe('Chat-only letter body.');
    expect(fs.files.get('book/source/query-letters/jane-doe.md')).toBe('Chat-only letter body.');
  });

  it('saveQueryLetter links an existing target without a letter; list/read round-trip', async () => {
    await service.saveQueryLetter('book', 'jane-doe', 'Manual letter.');

    expect(fs.files.get('book/source/query-tracker.md')).toContain(
      '- **Query Letter:** source/query-letters/jane-doe.md'
    );
    expect(await service.readQueryLetter('book', 'jane-doe')).toBe('Manual letter.');

    const letters = await service.listQueryLetters('book');
    expect(letters).toEqual([
      expect.objectContaining({ targetName: 'Jane Doe', targetSlug: 'jane-doe', content: 'Manual letter.' }),
    ]);
  });
});

describe('research + field fill', () => {
  it('counts targets the agent appended to the tracker', async () => {
    fs.files.set('book/source/query-tracker.md', TRACKER_ENTRY);
    sendScripts.push(async () => {
      const existing = fs.files.get('book/source/query-tracker.md')!;
      fs.files.set(
        'book/source/query-tracker.md',
        existing + '\n## [Fresh Find] — drafting\n- **ID:** target-new\n- **Type:** agent\n'
      );
      return { changedFiles: ['source/query-tracker.md'] };
    });

    const result = await service.researchTargets('book', () => undefined);

    expect(result.addedTargets).toBe(1);
    expect(result.targetNames).toEqual(['Fresh Find']);
    expect(result.warning).toBeUndefined();
  });

  it('throws on a stream error with zero results, warns on format drift', async () => {
    sendScripts.push(async (params) => {
      params.onEvent({ type: 'error', message: 'CLI died' });
      return { changedFiles: [] };
    });
    await expect(service.researchTargets('book', () => undefined)).rejects.toThrow(/Target research failed: CLI died/);

    // Format drift: file changed but nothing parseable was added
    sendScripts.push(async () => {
      fs.files.set('book/source/query-tracker.md', '### Agents I found\nJane Roe — looks promising\n');
      return { changedFiles: ['source/query-tracker.md'] };
    });
    const events: StreamEvent[] = [];
    const drifted = await service.researchTargets('book', (e) => events.push(e));

    expect(drifted.addedTargets).toBe(0);
    expect(drifted.warning).toContain('non-standard heading format');
    expect(events.some((e) => e.type === 'status' && e.message.includes('non-standard heading'))).toBe(true);
  });

  it('fillTargetField reports old and new values after the agent edits the tracker', async () => {
    // Placeholder value (not empty): an EMPTY field value makes extractField's
    // `\s*(.*)` swallow the following line — quirk recorded in STATE.md.
    fs.files.set('book/source/query-tracker.md', TRACKER_ENTRY.replace('- **Contact:** jane@lit.com', '- **Contact:** TBD'));
    sendScripts.push(async () => {
      const updated = fs.files.get('book/source/query-tracker.md')!
        .replace('- **Contact:** TBD', '- **Contact:** submissions@janedoe.lit');
      fs.files.set('book/source/query-tracker.md', updated);
      return { changedFiles: ['source/query-tracker.md'] };
    });

    const result = await service.fillTargetField('book', 'target-1', 'contact', () => undefined);

    expect(result).toMatchObject({
      targetId: 'target-1',
      field: 'contact',
      oldValue: 'TBD',
      newValue: 'submissions@janedoe.lit',
    });

    await expect(service.fillTargetField('book', 'ghost', 'contact', () => undefined)).rejects.toThrow(/not found/);
  });
});
