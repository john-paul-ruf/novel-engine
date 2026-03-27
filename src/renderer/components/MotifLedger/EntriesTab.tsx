import { useState, useMemo } from 'react';
import { useMotifLedgerStore } from '../../stores/motifLedgerStore';

function generateId(): string {
  return crypto.randomUUID();
}

type EntryDraft = {
  character: string;
  phrase: string;
  description: string;
  systemId: string;
  firstAppearance: string;
  occurrences: string;
  notes: string;
};

const EMPTY_DRAFT: EntryDraft = {
  character: '', phrase: '', description: '', systemId: '',
  firstAppearance: '', occurrences: '', notes: '',
};

export function EntriesTab(): React.ReactElement {
  const { ledger, addEntry, updateEntry, removeEntry } = useMotifLedgerStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState<EntryDraft>(EMPTY_DRAFT);
  const [filterCharacter, setFilterCharacter] = useState('');
  const [filterSystem, setFilterSystem] = useState('');

  const entries = ledger?.entries ?? [];
  const systems = ledger?.systems ?? [];

  const characters = useMemo(() => {
    const set = new Set(entries.map((e) => e.character));
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    let result = entries;
    if (filterCharacter) result = result.filter((e) => e.character === filterCharacter);
    if (filterSystem === '__none__') result = result.filter((e) => !e.systemId);
    else if (filterSystem) result = result.filter((e) => e.systemId === filterSystem);
    return result;
  }, [entries, filterCharacter, filterSystem]);

  const resetDraft = () => {
    setDraft(EMPTY_DRAFT);
    setIsAdding(false);
    setEditingId(null);
  };

  const handleAdd = () => {
    if (!draft.character.trim() || !draft.phrase.trim()) return;
    addEntry({
      id: generateId(),
      character: draft.character.trim(),
      phrase: draft.phrase.trim(),
      description: draft.description.trim(),
      systemId: draft.systemId || null,
      firstAppearance: draft.firstAppearance.trim(),
      occurrences: draft.occurrences.split(',').map((s) => s.trim()).filter(Boolean),
      notes: draft.notes.trim(),
    });
    resetDraft();
  };

  const startEdit = (id: string) => {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    setEditingId(id);
    setIsAdding(false);
    setDraft({
      character: entry.character,
      phrase: entry.phrase,
      description: entry.description,
      systemId: entry.systemId ?? '',
      firstAppearance: entry.firstAppearance,
      occurrences: entry.occurrences.join(', '),
      notes: entry.notes,
    });
  };

  const handleUpdate = () => {
    if (!editingId || !draft.character.trim() || !draft.phrase.trim()) return;
    updateEntry(editingId, {
      character: draft.character.trim(),
      phrase: draft.phrase.trim(),
      description: draft.description.trim(),
      systemId: draft.systemId || null,
      firstAppearance: draft.firstAppearance.trim(),
      occurrences: draft.occurrences.split(',').map((s) => s.trim()).filter(Boolean),
      notes: draft.notes.trim(),
    });
    resetDraft();
  };

  const systemName = (id: string | null) => {
    if (!id) return null;
    return systems.find((s) => s.id === id)?.name ?? null;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Character Motif Entries</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Individual phrases, images, and tics — each tagged to a character and optionally to a parent system.
          </p>
        </div>
        {!isAdding && !editingId && (
          <button
            onClick={() => { setIsAdding(true); setEditingId(null); }}
            className="rounded bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600"
          >
            + Add Entry
          </button>
        )}
      </div>

      {entries.length > 0 && !isAdding && !editingId && (
        <div className="flex gap-3">
          <select
            value={filterCharacter}
            onChange={(e) => setFilterCharacter(e.target.value)}
            className="rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300"
          >
            <option value="">All Characters</option>
            {characters.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={filterSystem}
            onChange={(e) => setFilterSystem(e.target.value)}
            className="rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300"
          >
            <option value="">All Systems</option>
            <option value="__none__">Unassigned</option>
            {systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}

      {(isAdding || editingId) && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Character</label>
              <input
                value={draft.character}
                onChange={(e) => setDraft((d) => ({ ...d, character: e.target.value }))}
                placeholder="e.g. Kael"
                className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Parent System</label>
              <select
                value={draft.systemId}
                onChange={(e) => setDraft((d) => ({ ...d, systemId: e.target.value }))}
                className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100"
              >
                <option value="">None</option>
                {systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Phrase / Image</label>
            <input
              value={draft.phrase}
              onChange={(e) => setDraft((d) => ({ ...d, phrase: e.target.value }))}
              placeholder="e.g. Teeth clicking"
              className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Description</label>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="What this motif conveys"
              rows={2}
              className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">First Appearance</label>
              <input
                value={draft.firstAppearance}
                onChange={(e) => setDraft((d) => ({ ...d, firstAppearance: e.target.value }))}
                placeholder="e.g. Ch 3"
                className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Occurrences (comma-separated)</label>
              <input
                value={draft.occurrences}
                onChange={(e) => setDraft((d) => ({ ...d, occurrences: e.target.value }))}
                placeholder="Ch 3, Ch 7, Ch 12"
                className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Notes</label>
            <textarea
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              rows={2}
              className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={editingId ? handleUpdate : handleAdd} className="rounded bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600">
              {editingId ? 'Update' : 'Add'}
            </button>
            <button onClick={resetDraft} className="rounded border border-zinc-300 dark:border-zinc-600 px-3 py-1 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              Cancel
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 && !isAdding && (
        <p className="text-sm text-zinc-400 dark:text-zinc-500 italic">
          {entries.length === 0 ? 'No entries yet.' : 'No entries match the current filters.'}
        </p>
      )}

      {filtered.map((entry) => (
        <div key={entry.id} className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-zinc-600 dark:text-zinc-400">{entry.character}</span>
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{entry.phrase}</span>
              </div>
              {entry.description && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{entry.description}</p>}
            </div>
            <div className="ml-2 flex gap-1 shrink-0">
              <button onClick={() => startEdit(entry.id)} className="rounded px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300">Edit</button>
              <button onClick={() => removeEntry(entry.id)} className="rounded px-2 py-0.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700">Delete</button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            {systemName(entry.systemId) && (
              <span className="rounded bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 text-blue-600 dark:text-blue-400">{systemName(entry.systemId)}</span>
            )}
            {entry.firstAppearance && <span>First: {entry.firstAppearance}</span>}
            {entry.occurrences.length > 0 && <span>Occurs: {entry.occurrences.join(', ')}</span>}
          </div>
          {entry.notes && <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500 italic">{entry.notes}</p>}
        </div>
      ))}
    </div>
  );
}
