import { create } from 'zustand';
import type {
  MotifLedger,
  MotifSystem,
  MotifEntry,
  StructuralDevice,
  ForeshadowEntry,
  MinorCharacterMotif,
  FlaggedPhrase,
  LedgerAuditRecord,
} from '@domain/types';

type LedgerTab = 'systems' | 'entries' | 'structural' | 'foreshadow' | 'minor' | 'flagged' | 'audit';

type MotifLedgerState = {
  ledger: MotifLedger | null;
  activeTab: LedgerTab;
  isLoading: boolean;
  isNormalizing: boolean;
  isDirty: boolean;
  isSaving: boolean;
  error: string | null;
  unauditedChapters: string[];

  setTab: (tab: LedgerTab) => void;
  load: (bookSlug: string) => Promise<void>;
  save: (bookSlug: string) => Promise<void>;
  loadUnauditedChapters: (bookSlug: string) => Promise<void>;
  setNormalizing: (val: boolean) => void;

  // Systems
  addSystem: (system: MotifSystem) => void;
  updateSystem: (id: string, partial: Partial<MotifSystem>) => void;
  removeSystem: (id: string) => void;

  // Entries
  addEntry: (entry: MotifEntry) => void;
  updateEntry: (id: string, partial: Partial<MotifEntry>) => void;
  removeEntry: (id: string) => void;

  // Structural devices
  addStructuralDevice: (device: StructuralDevice) => void;
  updateStructuralDevice: (id: string, partial: Partial<StructuralDevice>) => void;
  removeStructuralDevice: (id: string) => void;

  // Foreshadows
  addForeshadow: (entry: ForeshadowEntry) => void;
  updateForeshadow: (id: string, partial: Partial<ForeshadowEntry>) => void;
  removeForeshadow: (id: string) => void;

  // Minor characters
  addMinorCharacter: (entry: MinorCharacterMotif) => void;
  updateMinorCharacter: (id: string, partial: Partial<MinorCharacterMotif>) => void;
  removeMinorCharacter: (id: string) => void;

  // Flagged phrases
  addFlaggedPhrase: (entry: FlaggedPhrase) => void;
  updateFlaggedPhrase: (id: string, partial: Partial<FlaggedPhrase>) => void;
  removeFlaggedPhrase: (id: string) => void;

  // Audit log
  addAuditRecord: (record: LedgerAuditRecord) => void;
  removeAuditRecord: (id: string) => void;
};

function updateLedger(
  state: MotifLedgerState,
  updater: (ledger: MotifLedger) => MotifLedger,
): Partial<MotifLedgerState> {
  if (!state.ledger) return {};
  return { ledger: updater(state.ledger), isDirty: true };
}

export const useMotifLedgerStore = create<MotifLedgerState>()((set, get) => ({
  ledger: null,
  activeTab: 'systems',
  isLoading: false,
  isNormalizing: false,
  isDirty: false,
  isSaving: false,
  error: null,
  unauditedChapters: [],

  setTab: (tab) => set({ activeTab: tab }),
  setNormalizing: (val) => set({ isNormalizing: val }),

  load: async (bookSlug) => {
    set({ isLoading: true, error: null });
    try {
      const ledger = await window.novelEngine.motifLedger.load(bookSlug);
      set({ ledger, isLoading: false, isDirty: false });
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  save: async (bookSlug) => {
    const { ledger } = get();
    if (!ledger) return;
    set({ isSaving: true, error: null });
    try {
      await window.novelEngine.motifLedger.save(bookSlug, ledger);
      set({ isSaving: false, isDirty: false });
    } catch (err) {
      set({ error: String(err), isSaving: false });
    }
  },

  loadUnauditedChapters: async (bookSlug) => {
    try {
      const chapters = await window.novelEngine.motifLedger.getUnauditedChapters(bookSlug);
      set({ unauditedChapters: chapters });
    } catch {
      set({ unauditedChapters: [] });
    }
  },

  // Systems
  addSystem: (system) => set((s) => updateLedger(s, (l) => ({ ...l, systems: [...l.systems, system] }))),
  updateSystem: (id, partial) => set((s) => updateLedger(s, (l) => ({
    ...l,
    systems: l.systems.map((sys) => (sys.id === id ? { ...sys, ...partial } : sys)),
  }))),
  removeSystem: (id) => set((s) => updateLedger(s, (l) => ({
    ...l,
    systems: l.systems.filter((sys) => sys.id !== id),
    entries: l.entries.map((e) => (e.systemId === id ? { ...e, systemId: null } : e)),
  }))),

  // Entries
  addEntry: (entry) => set((s) => updateLedger(s, (l) => ({ ...l, entries: [...l.entries, entry] }))),
  updateEntry: (id, partial) => set((s) => updateLedger(s, (l) => ({
    ...l,
    entries: l.entries.map((e) => (e.id === id ? { ...e, ...partial } : e)),
  }))),
  removeEntry: (id) => set((s) => updateLedger(s, (l) => ({
    ...l,
    entries: l.entries.filter((e) => e.id !== id),
  }))),

  // Structural devices
  addStructuralDevice: (device) => set((s) => updateLedger(s, (l) => ({
    ...l,
    structuralDevices: [...l.structuralDevices, device],
  }))),
  updateStructuralDevice: (id, partial) => set((s) => updateLedger(s, (l) => ({
    ...l,
    structuralDevices: l.structuralDevices.map((d) => (d.id === id ? { ...d, ...partial } : d)),
  }))),
  removeStructuralDevice: (id) => set((s) => updateLedger(s, (l) => ({
    ...l,
    structuralDevices: l.structuralDevices.filter((d) => d.id !== id),
  }))),

  // Foreshadows
  addForeshadow: (entry) => set((s) => updateLedger(s, (l) => ({
    ...l,
    foreshadows: [...l.foreshadows, entry],
  }))),
  updateForeshadow: (id, partial) => set((s) => updateLedger(s, (l) => ({
    ...l,
    foreshadows: l.foreshadows.map((f) => (f.id === id ? { ...f, ...partial } : f)),
  }))),
  removeForeshadow: (id) => set((s) => updateLedger(s, (l) => ({
    ...l,
    foreshadows: l.foreshadows.filter((f) => f.id !== id),
  }))),

  // Minor characters
  addMinorCharacter: (entry) => set((s) => updateLedger(s, (l) => ({
    ...l,
    minorCharacters: [...l.minorCharacters, entry],
  }))),
  updateMinorCharacter: (id, partial) => set((s) => updateLedger(s, (l) => ({
    ...l,
    minorCharacters: l.minorCharacters.map((m) => (m.id === id ? { ...m, ...partial } : m)),
  }))),
  removeMinorCharacter: (id) => set((s) => updateLedger(s, (l) => ({
    ...l,
    minorCharacters: l.minorCharacters.filter((m) => m.id !== id),
  }))),

  // Flagged phrases
  addFlaggedPhrase: (entry) => set((s) => updateLedger(s, (l) => ({
    ...l,
    flaggedPhrases: [...l.flaggedPhrases, entry],
  }))),
  updateFlaggedPhrase: (id, partial) => set((s) => updateLedger(s, (l) => ({
    ...l,
    flaggedPhrases: l.flaggedPhrases.map((p) => (p.id === id ? { ...p, ...partial } : p)),
  }))),
  removeFlaggedPhrase: (id) => set((s) => updateLedger(s, (l) => ({
    ...l,
    flaggedPhrases: l.flaggedPhrases.filter((p) => p.id !== id),
  }))),

  // Audit log
  addAuditRecord: (record) => set((s) => updateLedger(s, (l) => ({
    ...l,
    auditLog: [...l.auditLog, record],
  }))),
  removeAuditRecord: (id) => set((s) => updateLedger(s, (l) => ({
    ...l,
    auditLog: l.auditLog.filter((r) => r.id !== id),
  }))),
}));
