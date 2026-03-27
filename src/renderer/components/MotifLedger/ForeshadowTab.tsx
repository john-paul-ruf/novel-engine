import { useState } from 'react';
import { useMotifLedgerStore } from '../../stores/motifLedgerStore';
import type { ForeshadowStatus } from '@domain/types';

function generateId(): string {
  return crypto.randomUUID();
}

type ForeshadowDraft = {
  description: string;
  plantedIn: string;
  expectedPayoff: string;
  expectedPayoffIn: string;
  status: ForeshadowStatus;
  notes: string;
};

const EMPTY_DRAFT: ForeshadowDraft = {
  description: '', plantedIn: '', expectedPayoff: '', expectedPayoffIn: '', status: 'planted', notes: '',
};

const STATUS_COLORS: Record<ForeshadowStatus, string> = {
  planted: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
  'paid-off': 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
  abandoned: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400',
};

export function ForeshadowTab(): React.ReactElement {
  const { ledger, addForeshadow, updateForeshadow, removeForeshadow } = useMotifLedgerStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState<ForeshadowDraft>(EMPTY_DRAFT);

  const foreshadows = ledger?.foreshadows ?? [];

  const resetDraft = () => { setDraft(EMPTY_DRAFT); setIsAdding(false); setEditingId(null); };

  const handleAdd = () => {
    if (!draft.description.trim()) return;
    addForeshadow({
      id: generateId(),
      description: draft.description.trim(),
      plantedIn: draft.plantedIn.trim(),
      expectedPayoff: draft.expectedPayoff.trim(),
      expectedPayoffIn: draft.expectedPayoffIn.trim(),
      status: draft.status,
      notes: draft.notes.trim(),
    });
    resetDraft();
  };

  const startEdit = (id: string) => {
    const f = foreshadows.find((x) => x.id === id);
    if (!f) return;
    setEditingId(id);
    setIsAdding(false);
    setDraft({ description: f.description, plantedIn: f.plantedIn, expectedPayoff: f.expectedPayoff, expectedPayoffIn: f.expectedPayoffIn, status: f.status, notes: f.notes });
  };

  const handleUpdate = () => {
    if (!editingId || !draft.description.trim()) return;
    updateForeshadow(editingId, {
      description: draft.description.trim(),
      plantedIn: draft.plantedIn.trim(),
      expectedPayoff: draft.expectedPayoff.trim(),
      expectedPayoffIn: draft.expectedPayoffIn.trim(),
      status: draft.status,
      notes: draft.notes.trim(),
    });
    resetDraft();
  };

  const planted = foreshadows.filter((f) => f.status === 'planted');
  const paidOff = foreshadows.filter((f) => f.status === 'paid-off');
  const abandoned = foreshadows.filter((f) => f.status === 'abandoned');

  const renderCard = (f: typeof foreshadows[0]) => (
    <div key={f.id} className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <span className={`text-xs font-medium rounded px-2 py-0.5 ${STATUS_COLORS[f.status]}`}>{f.status}</span>
          <p className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">{f.description}</p>
        </div>
        <div className="ml-2 flex gap-1 shrink-0">
          <button onClick={() => startEdit(f.id)} className="rounded px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300">Edit</button>
          <button onClick={() => removeForeshadow(f.id)} className="rounded px-2 py-0.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700">Delete</button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500 dark:text-zinc-400">
        {f.plantedIn && <span>Planted: {f.plantedIn}</span>}
        {f.expectedPayoff && <span>Payoff: {f.expectedPayoff}</span>}
        {f.expectedPayoffIn && <span>Expected in: {f.expectedPayoffIn}</span>}
      </div>
      {f.notes && <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500 italic">{f.notes}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Foreshadow Registry</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Narrative debts — planted threads and unwritten parallels the text is building toward.</p>
        </div>
        {!isAdding && !editingId && (
          <button onClick={() => { setIsAdding(true); setEditingId(null); }} className="rounded bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600">+ Add Thread</button>
        )}
      </div>

      {(isAdding || editingId) && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Description</label>
            <textarea value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} placeholder="The consumed woman as Kael's preview" rows={2} className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Planted In</label>
              <input value={draft.plantedIn} onChange={(e) => setDraft((d) => ({ ...d, plantedIn: e.target.value }))} placeholder="Ch 5" className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Expected Payoff</label>
              <input value={draft.expectedPayoff} onChange={(e) => setDraft((d) => ({ ...d, expectedPayoff: e.target.value }))} placeholder="Kael realizes the parallel" className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Expected In</label>
              <input value={draft.expectedPayoffIn} onChange={(e) => setDraft((d) => ({ ...d, expectedPayoffIn: e.target.value }))} placeholder="Ch 20-22" className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Status</label>
            <select value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as ForeshadowStatus }))} className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100">
              <option value="planted">Planted</option>
              <option value="paid-off">Paid Off</option>
              <option value="abandoned">Abandoned</option>
            </select>
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

      {foreshadows.length === 0 && !isAdding && <p className="text-sm text-zinc-400 dark:text-zinc-500 italic">No foreshadow threads registered yet.</p>}

      {planted.length > 0 && (
        <div>
          <h4 className="text-xs font-medium uppercase tracking-wider text-amber-500 dark:text-amber-400 mb-2">Planted ({planted.length})</h4>
          <div className="space-y-3">{planted.map(renderCard)}</div>
        </div>
      )}
      {paidOff.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-medium uppercase tracking-wider text-green-500 dark:text-green-400 mb-2">Paid Off ({paidOff.length})</h4>
          <div className="space-y-3">{paidOff.map(renderCard)}</div>
        </div>
      )}
      {abandoned.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-400 mb-2">Abandoned ({abandoned.length})</h4>
          <div className="space-y-3">{abandoned.map(renderCard)}</div>
        </div>
      )}
    </div>
  );
}
