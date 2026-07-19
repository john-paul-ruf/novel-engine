import { describe, it, expect, beforeEach } from 'vitest';
import type { MotifLedger } from '@domain/types';
import { useMotifLedgerStore } from './motifLedgerStore';
import { installNovelEngineMock, type NovelEngineMock } from '../../test/novelEngineMock';
import { resetStoresBeforeEach } from '../../test/resetStores';

resetStoresBeforeEach(useMotifLedgerStore);

function makeLedger(overrides: Partial<MotifLedger> = {}): MotifLedger {
  return {
    systems: [
      { id: 'sys-1', name: 'Storms', description: '', components: ['rain'], arcTrajectory: '' },
    ],
    entries: [
      {
        id: 'ent-1',
        character: 'Mara',
        phrase: 'counting thunder',
        description: '',
        systemId: 'sys-1',
        firstAppearance: '01-one',
        occurrences: ['01-one'],
        notes: '',
      },
    ],
    structuralDevices: [],
    foreshadows: [],
    minorCharacters: [],
    flaggedPhrases: [],
    auditLog: [],
    ...overrides,
  };
}

let mock: NovelEngineMock;

beforeEach(() => {
  mock = installNovelEngineMock();
});

async function loadLedger(ledger = makeLedger()): Promise<void> {
  mock.motifLedger.load.mockResolvedValue(ledger);
  await useMotifLedgerStore.getState().load('book-a');
}

describe('motifLedgerStore', () => {
  it('load populates the ledger and clears dirty/loading', async () => {
    await loadLedger();

    const state = useMotifLedgerStore.getState();
    expect(state.ledger?.systems).toHaveLength(1);
    expect(state.isLoading).toBe(false);
    expect(state.isDirty).toBe(false);
    expect(state.error).toBeNull();
  });

  it('load failure stores the stringified error', async () => {
    mock.motifLedger.load.mockRejectedValue(new Error('corrupt ledger'));

    await useMotifLedgerStore.getState().load('book-a');

    expect(useMotifLedgerStore.getState().error).toContain('corrupt ledger');
    expect(useMotifLedgerStore.getState().isLoading).toBe(false);
  });

  it('save writes the current ledger and clears the dirty flag; no-op without a ledger', async () => {
    await useMotifLedgerStore.getState().save('book-a');
    expect(mock.motifLedger.save).not.toHaveBeenCalled();

    await loadLedger();
    useMotifLedgerStore.getState().addSystem({
      id: 'sys-2', name: 'Mirrors', description: '', components: [], arcTrajectory: '',
    });
    expect(useMotifLedgerStore.getState().isDirty).toBe(true);

    await useMotifLedgerStore.getState().save('book-a');

    expect(mock.motifLedger.save).toHaveBeenCalledWith(
      'book-a',
      useMotifLedgerStore.getState().ledger,
    );
    expect(useMotifLedgerStore.getState().isDirty).toBe(false);
  });

  it('save failure sets the error and keeps the ledger dirty', async () => {
    await loadLedger();
    useMotifLedgerStore.getState().setTab('entries');
    useMotifLedgerStore.getState().removeEntry('ent-1');
    mock.motifLedger.save.mockRejectedValue(new Error('disk full'));

    await useMotifLedgerStore.getState().save('book-a');

    expect(useMotifLedgerStore.getState().error).toContain('disk full');
    expect(useMotifLedgerStore.getState().isDirty).toBe(true);
    expect(useMotifLedgerStore.getState().activeTab).toBe('entries');
  });

  it('loadUnauditedChapters populates the list and falls back to [] on failure', async () => {
    mock.motifLedger.getUnauditedChapters.mockResolvedValue(['02-two', '03-three']);
    await useMotifLedgerStore.getState().loadUnauditedChapters('book-a');
    expect(useMotifLedgerStore.getState().unauditedChapters).toEqual(['02-two', '03-three']);

    mock.motifLedger.getUnauditedChapters.mockRejectedValue(new Error('nope'));
    await useMotifLedgerStore.getState().loadUnauditedChapters('book-a');
    expect(useMotifLedgerStore.getState().unauditedChapters).toEqual([]);
  });

  it('CRUD actions are no-ops until a ledger is loaded', () => {
    useMotifLedgerStore.getState().addEntry({
      id: 'x', character: '', phrase: '', description: '', systemId: null,
      firstAppearance: '', occurrences: [], notes: '',
    });

    expect(useMotifLedgerStore.getState().ledger).toBeNull();
    expect(useMotifLedgerStore.getState().isDirty).toBe(false);
  });

  it('removing a system detaches its entries (systemId → null) and marks dirty', async () => {
    await loadLedger();

    useMotifLedgerStore.getState().removeSystem('sys-1');

    const ledger = useMotifLedgerStore.getState().ledger!;
    expect(ledger.systems).toEqual([]);
    expect(ledger.entries[0].systemId).toBeNull();
    expect(useMotifLedgerStore.getState().isDirty).toBe(true);
  });

  it('add/update/remove cover every ledger collection', async () => {
    await loadLedger();
    const store = useMotifLedgerStore.getState();

    store.updateSystem('sys-1', { name: 'Tempests' });
    store.addEntry({
      id: 'ent-2', character: 'Jun', phrase: 'salt air', description: '', systemId: null,
      firstAppearance: '02-two', occurrences: [], notes: '',
    });
    store.updateEntry('ent-2', { notes: 'recurring' });
    store.addStructuralDevice({
      id: 'dev-1', name: 'Cold opens', deviceType: 'chapter-opening', description: '',
      pattern: '', chapters: [], notes: '',
    });
    store.updateStructuralDevice('dev-1', { pattern: 'weather report' });
    store.addForeshadow({
      id: 'fs-1', description: 'the locked drawer', plantedIn: '01-one',
      expectedPayoff: 'reveal letters', expectedPayoffIn: '20-twenty', status: 'planted', notes: '',
    });
    store.updateForeshadow('fs-1', { status: 'paid-off' });
    store.addMinorCharacter({ id: 'mc-1', character: 'Ferryman', motifs: 'coins', notes: '' });
    store.updateMinorCharacter('mc-1', { motifs: 'coins, rope' });
    store.addFlaggedPhrase({
      id: 'fp-1', phrase: 'she let out a breath', category: 'crutch', alternatives: [], notes: '',
    });
    store.updateFlaggedPhrase('fp-1', { category: 'retired' });
    store.addAuditRecord({
      id: 'ar-1', chapterSlug: '01-one', auditedAt: '2026-01-01', entriesAdded: 1,
      entriesUpdated: 0, notes: '',
    });

    let ledger = useMotifLedgerStore.getState().ledger!;
    expect(ledger.systems[0].name).toBe('Tempests');
    expect(ledger.entries.find((e) => e.id === 'ent-2')?.notes).toBe('recurring');
    expect(ledger.structuralDevices[0].pattern).toBe('weather report');
    expect(ledger.foreshadows[0].status).toBe('paid-off');
    expect(ledger.minorCharacters[0].motifs).toBe('coins, rope');
    expect(ledger.flaggedPhrases[0].category).toBe('retired');
    expect(ledger.auditLog).toHaveLength(1);

    store.removeEntry('ent-2');
    store.removeStructuralDevice('dev-1');
    store.removeForeshadow('fs-1');
    store.removeMinorCharacter('mc-1');
    store.removeFlaggedPhrase('fp-1');
    store.removeAuditRecord('ar-1');

    ledger = useMotifLedgerStore.getState().ledger!;
    expect(ledger.entries.map((e) => e.id)).toEqual(['ent-1']);
    expect(ledger.structuralDevices).toEqual([]);
    expect(ledger.foreshadows).toEqual([]);
    expect(ledger.minorCharacters).toEqual([]);
    expect(ledger.flaggedPhrases).toEqual([]);
    expect(ledger.auditLog).toEqual([]);
    expect(useMotifLedgerStore.getState().isDirty).toBe(true);
  });

  it('setTab and setNormalizing are plain state switches', () => {
    useMotifLedgerStore.getState().setTab('flagged');
    expect(useMotifLedgerStore.getState().activeTab).toBe('flagged');

    useMotifLedgerStore.getState().setNormalizing(true);
    expect(useMotifLedgerStore.getState().isNormalizing).toBe(true);
  });
});
