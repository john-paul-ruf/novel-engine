import { useState } from 'react';
import { useMotifLedgerStore } from '../../stores/motifLedgerStore';
import type { FlaggedPhraseCategory } from '@domain/types';

function generateId(): string {
  return crypto.randomUUID();
}

type PhraseDraft = {
  phrase: string;
  category: FlaggedPhraseCategory;
  alternatives: string;
  limit: string;
  limitChapters: string;
  notes: string;
};

const EMPTY_DRAFT: PhraseDraft = {
  phrase: '', category: 'limited', alternatives: '', limit: '', limitChapters: '', notes: '',
};

const CATEGORY_COLORS: Record<FlaggedPhraseCategory, string> = {
  retired: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
  limited: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
  crutch: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400',
  'anti-pattern': 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400',
};

export function FlaggedPhrasesTab(): React.ReactElement {
  const { ledger, addFlaggedPhrase, updateFlaggedPhrase, removeFlaggedPhrase } = useMotifLedgerStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState<PhraseDraft>(EMPTY_DRAFT);

  const phrases = ledger?.flaggedPhrases ?? [];

  const resetDraft = () => { setDraft(EMPTY_DRAFT); setIsAdding(false); setEditingId(null); };

  const handleAdd = () => {
    if (!draft.phrase.trim()) return;
    addFlaggedPhrase({
      id: generateId(),
      phrase: draft.phrase.trim(),
      category: draft.category,
      alternatives: draft.alternatives.split(',').map((s) => s.trim()).filter(Boolean),
      limit: draft.limit ? parseInt(draft.limit, 10) : undefined,
      limitChapters: draft.limitChapters ? draft.limitChapters.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      notes: draft.notes.trim(),
    });
    resetDraft();
  };

  const startEdit = (id: string) => {
    const p = phrases.find((x) => x.id === id);
    if (!p) return;
    setEditingId(id);
    setIsAdding(false);
    setDraft({
      phrase: p.phrase,
      category: p.category,
      alternatives: p.alternatives.join(', '),
      limit: p.limit !== undefined ? String(p.limit) : '',
      limitChapters: p.limitChapters?.join(', ') ?? '',
      notes: p.notes,
    });
  };

  const handleUpdate = () => {
    if (!editingId || !draft.phrase.trim()) return;
    updateFlaggedPhrase(editingId, {
      phrase: draft.phrase.trim(),
      category: draft.category,
      alternatives: draft.alternatives.split(',').map((s) => s.trim()).filter(Boolean),
      limit: draft.limit ? parseInt(draft.limit, 10) : undefined,
      limitChapters: draft.limitChapters ? draft.limitChapters.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      notes: draft.notes.trim(),
    });
    resetDraft();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Flagged Phrases</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Retired, limited, crutch, and anti-pattern phrases. Used by Verity's audit system.</p>
        </div>
        {!isAdding && !editingId && (
          <button onClick={() => { setIsAdding(true); setEditingId(null); }} className="rounded bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600">+ Add Phrase</button>
        )}
      </div>

      {(isAdding || editingId) && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Phrase</label>
              <input value={draft.phrase} onChange={(e) => setDraft((d) => ({ ...d, phrase: e.target.value }))} placeholder="e.g. 'a beat passed'" className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Category</label>
              <select value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as FlaggedPhraseCategory }))} className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100">
                <option value="retired">Retired (never use)</option>
                <option value="limited">Limited (use sparingly)</option>
                <option value="crutch">Crutch (author tendency)</option>
                <option value="anti-pattern">Anti-pattern</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Alternatives (comma-separated)</label>
            <input value={draft.alternatives} onChange={(e) => setDraft((d) => ({ ...d, alternatives: e.target.value }))} placeholder="silence held, the moment stretched" className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" />
          </div>
          {draft.category === 'limited' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Max Uses</label>
                <input type="number" value={draft.limit} onChange={(e) => setDraft((d) => ({ ...d, limit: e.target.value }))} placeholder="e.g. 3" className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Limit Chapters</label>
                <input value={draft.limitChapters} onChange={(e) => setDraft((d) => ({ ...d, limitChapters: e.target.value }))} placeholder="Ch 1, Ch 15" className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" />
              </div>
            </div>
          )}
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

      {phrases.length === 0 && !isAdding && <p className="text-sm text-zinc-400 dark:text-zinc-500 italic">No flagged phrases yet.</p>}

      {phrases.map((p) => (
        <div key={p.id} className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium rounded px-2 py-0.5 ${CATEGORY_COLORS[p.category]}`}>{p.category}</span>
                <span className="text-sm font-mono font-semibold text-zinc-900 dark:text-zinc-100">"{p.phrase}"</span>
              </div>
            </div>
            <div className="ml-2 flex gap-1 shrink-0">
              <button onClick={() => startEdit(p.id)} className="rounded px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300">Edit</button>
              <button onClick={() => removeFlaggedPhrase(p.id)} className="rounded px-2 py-0.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700">Delete</button>
            </div>
          </div>
          {p.alternatives.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Alt:</span>
              {p.alternatives.map((a, i) => <span key={i} className="inline-block rounded bg-green-50 dark:bg-green-900/20 px-2 py-0.5 text-xs text-green-600 dark:text-green-400">{a}</span>)}
            </div>
          )}
          {p.limit !== undefined && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Max: {p.limit}{p.limitChapters?.length ? ` (in ${p.limitChapters.join(', ')})` : ''}</p>}
          {p.notes && <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500 italic">{p.notes}</p>}
        </div>
      ))}
    </div>
  );
}
