import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MotifLedgerService } from './MotifLedgerService';
import {
  makeFakeFs,
  makeFakeRegistry,
  makeFakeSettings,
  makeModelInfo,
  makeScriptedProvider,
  type FakeFileSystem,
  type ScriptedProvider,
} from '../test/fakes';
import { DEFAULT_SETTINGS } from '@domain/constants';

const CANONICAL = {
  systems: [{ id: 's1', name: 'Mirrors', description: 'd', components: ['A'], arcTrajectory: 't' }],
  entries: [
    {
      id: 'e1',
      character: 'A',
      phrase: 'threadbare silence',
      description: '',
      systemId: 's1',
      firstAppearance: 'Ch 2',
      occurrences: ['02-two', '05-five'],
      notes: '',
    },
  ],
  structuralDevices: [],
  foreshadows: [],
  minorCharacters: [],
  flaggedPhrases: [],
  auditLog: [{ id: 'a1', chapterSlug: '02-two', auditedAt: '2026-01-01', entriesAdded: 1, entriesUpdated: 0, notes: '' }],
};

let fs: FakeFileSystem;
let provider: ScriptedProvider;
let service: MotifLedgerService;
let callbackStatuses: string[];

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  fs = makeFakeFs({}, { bookSlug: 'book' });
  provider = makeScriptedProvider();
  service = new MotifLedgerService(
    fs,
    makeFakeRegistry(provider, { models: [makeModelInfo(DEFAULT_SETTINGS.model)] }),
    makeFakeSettings()
  );
  callbackStatuses = [];
  service.setNormalizationCallback((status) => callbackStatuses.push(status));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('load', () => {
  it('returns an empty ledger for missing or hopelessly malformed files', async () => {
    const empty = await service.load('book');
    expect(empty).toEqual({
      systems: [],
      entries: [],
      structuralDevices: [],
      foreshadows: [],
      minorCharacters: [],
      flaggedPhrases: [],
      auditLog: [],
    });

    fs.files.set('book/source/motif-ledger.json', 'not json at all {{{');
    expect((await service.load('book')).entries).toEqual([]);
    expect(provider.calls.length).toBe(0); // no CLI involved
  });

  it('parses canonical ledgers, filling defaults for missing optional fields', async () => {
    fs.files.set(
      'book/source/motif-ledger.json',
      JSON.stringify({ ...CANONICAL, flaggedPhrases: [{ phrase: 'echo', category: 'nonsense' }] })
    );

    const ledger = await service.load('book');

    expect(ledger.entries[0]).toMatchObject({ phrase: 'threadbare silence', systemId: 's1' });
    expect(ledger.auditLog[0].chapterSlug).toBe('02-two');
    // Unknown category falls back to 'crutch'; missing id is generated
    expect(ledger.flaggedPhrases[0]).toMatchObject({ phrase: 'echo', category: 'crutch', alternatives: [] });
    expect(ledger.flaggedPhrases[0].id.length).toBeGreaterThan(0);
    expect(callbackStatuses).toEqual([]); // no normalization for canonical shapes
  });

  it('repairs missing commas between pretty-printed objects', async () => {
    const broken = [
      '{',
      '  "systems": [',
      '    {',
      '      "id": "s1", "name": "A", "description": "", "components": [], "arcTrajectory": ""',
      '    }',
      '    {',
      '      "id": "s2", "name": "B", "description": "", "components": [], "arcTrajectory": ""',
      '    }',
      '  ],',
      '  "entries": []',
      '}',
    ].join('\n');
    fs.files.set('book/source/motif-ledger.json', broken);

    const ledger = await service.load('book');

    expect(ledger.systems.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('normalizes non-canonical shapes via the CLI and persists the result', async () => {
    fs.files.set(
      'book/source/motif-ledger.json',
      JSON.stringify({
        systems: [{ id: 's1', name: 'Mirrors', associatedCharacters: ['A'], thematicFunction: 'duality' }],
        entries: [],
      })
    );
    provider.scriptNext([
      { type: 'textDelta', text: '```json\n' + JSON.stringify(CANONICAL) + '\n```' },
      { type: 'done', inputTokens: 1, outputTokens: 1, thinkingTokens: 0, filesTouched: {} },
    ]);

    const ledger = await service.load('book');

    expect(ledger.systems[0].components).toEqual(['A']);
    expect(callbackStatuses).toEqual(['started', 'done']);

    const call = provider.calls[0];
    expect(call.maxTurns).toBe(1);
    expect(call.systemPrompt).toContain('JSON schema normalizer');

    // Normalized result persisted back to disk in canonical form
    const saved = JSON.parse(fs.files.get('book/source/motif-ledger.json')!);
    expect(saved.systems[0].arcTrajectory).toBe('t');
  });

  it('falls back to best-effort parsing when normalization fails', async () => {
    fs.files.set(
      'book/source/motif-ledger.json',
      JSON.stringify({
        systems: [{ id: 's1', name: 'Mirrors', associatedCharacters: ['A'] }],
        entries: [{ id: 'e1', name: 'named not phrased', system: 's1' }],
      })
    );
    provider.setImpl(async () => {
      throw new Error('CLI unavailable');
    });

    const ledger = await service.load('book');

    expect(callbackStatuses).toEqual(['started', 'error', 'done']);
    // Best-effort mapping: entry 'name' becomes the phrase
    expect(ledger.entries[0].phrase).toBe('named not phrased');
    expect(ledger.systems[0].name).toBe('Mirrors');
  });
});

describe('save + audit tracking', () => {
  it('save writes pretty-printed canonical JSON that round-trips', async () => {
    await service.save('book', CANONICAL);

    const raw = fs.files.get('book/source/motif-ledger.json')!;
    expect(raw).toContain('\n  "systems"');

    const reloaded = await service.load('book');
    expect(reloaded).toEqual(CANONICAL);
  });

  it('getUnauditedChapters lists chapter dirs missing from the audit log', async () => {
    await service.save('book', CANONICAL); // auditLog covers 02-two
    fs.files.set('book/chapters/02-two/draft.md', 'x');
    fs.files.set('book/chapters/03-three/draft.md', 'x');
    fs.files.set('book/chapters/05-five/draft.md', 'x');

    expect(await service.getUnauditedChapters('book')).toEqual(['03-three', '05-five']);

    const bare = makeFakeFs({}, { bookSlug: 'bare' });
    const bareService = new MotifLedgerService(bare, makeFakeRegistry(provider), makeFakeSettings());
    expect(await bareService.getUnauditedChapters('bare')).toEqual([]);
  });
});
