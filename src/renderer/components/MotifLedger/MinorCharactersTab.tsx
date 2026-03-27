import { useState } from 'react';
import { useMotifLedgerStore } from '../../stores/motifLedgerStore';

function generateId(): string {
  return crypto.randomUUID();
}

type MinorDraft = { character: string; motifs: string; notes: string };
const EMPTY_DRAFT: MinorDraft = { character: '', motifs: '', notes: '' };

export function MinorCharactersTab(): React.ReactElement {
  const { ledger, addMinorCharacter, updateMinorCharacter, removeMinorCharacter } = useMotifLedgerStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState<MinorDraft>(EMPTY_DRAFT);

  const minors = ledger?.minorCharacters ?? [];

  const resetDraft = () => { setDraft(EMPTY_DRAFT); setIsAdding(false); setEditingId(null); };

  const handleAdd = () => {
    if (!draft.character.trim()) return;
    addMinorCharacter({ id: generateId(), character: draft.character.trim(), motifs: draft.motifs.trim(), notes: draft.notes.trim() });
    resetDraft();
  };

  const startEdit = (id: string) => {
    const m = minors.find((x) => x.id === id);
    if (!m) return;
    setEditingId(id);
    setIsAdding(false);
    setDraft({ character: m.character, motifs: m.motifs, notes: m.notes });
  };

  const handleUpdate = () => {
    if (!editingId || !draft.character.trim()) return;
    updateMinorCharacter(editingId, { character: draft.character.trim(), motifs: draft.motifs.trim(), notes: draft.notes.trim() });
    resetDraft();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Minor Characters</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Low-bar catch-all for characters who don't warrant full entry sections. Prevents them falling through the cracks.
          </p>
        </div>
        {!isAdding && !editingId && (
          <button onClick={() => { setIsAdding(true); setEditingId(null); }} className="rounded bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600">+ Add Character</button>
        )}
      </div>

      {(isAdding || editingId) && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Character Name</label>
            <input value={draft.character} onChange={(e) => setDraft((d) => ({ ...d, character: e.target.value }))} placeholder="e.g. Fen, Thessen, Pell" className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Motifs / Identifying Traits</label>
            <textarea value={draft.motifs} onChange={(e) => setDraft((d) => ({ ...d, motifs: e.target.value }))} placeholder="Key phrases, images, or behaviors" rows={3} className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Notes</label>
            <textarea value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} rows={2} className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" />
          </div>
          <div className="flex gap-2">
            <button onClick={editingId ? handleUpdate : handleAdd} className="rounded bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600">{editingId ? 'Update' : 'Add'}</button>
            <button onClick={resetDraft} className="rounded border border-zinc-300 dark:border-zinc-600 px-3 py-1 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">Cancel</button>
          </div>
        </div>
      )}

      {minors.length === 0 && !isAdding && <p className="text-sm text-zinc-400 dark:text-zinc-500 italic">No minor characters tracked yet.</p>}

      {minors.map((m) => (
        <div key={m.id} className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{m.character}</h4>
              {m.motifs && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{m.motifs}</p>}
            </div>
            <div className="ml-2 flex gap-1 shrink-0">
              <button onClick={() => startEdit(m.id)} className="rounded px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300">Edit</button>
              <button onClick={() => removeMinorCharacter(m.id)} className="rounded px-2 py-0.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700">Delete</button>
            </div>
          </div>
          {m.notes && <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500 italic">{m.notes}</p>}
        </div>
      ))}
    </div>
  );
}
