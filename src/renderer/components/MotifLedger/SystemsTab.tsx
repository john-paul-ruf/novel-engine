import { useState } from 'react';
import { useMotifLedgerStore } from '../../stores/motifLedgerStore';

function generateId(): string {
  return crypto.randomUUID();
}

export function SystemsTab(): React.ReactElement {
  const { ledger, addSystem, updateSystem, removeSystem } = useMotifLedgerStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', description: '', components: '', arcTrajectory: '' });

  const systems = ledger?.systems ?? [];

  const resetDraft = () => {
    setDraft({ name: '', description: '', components: '', arcTrajectory: '' });
    setIsAdding(false);
    setEditingId(null);
  };

  const handleAdd = () => {
    if (!draft.name.trim()) return;
    addSystem({
      id: generateId(),
      name: draft.name.trim(),
      description: draft.description.trim(),
      components: draft.components.split(',').map((s) => s.trim()).filter(Boolean),
      arcTrajectory: draft.arcTrajectory.trim(),
    });
    resetDraft();
  };

  const startEdit = (id: string) => {
    const sys = systems.find((s) => s.id === id);
    if (!sys) return;
    setEditingId(id);
    setIsAdding(false);
    setDraft({
      name: sys.name ?? '',
      description: sys.description ?? '',
      components: (sys.components ?? []).join(', '),
      arcTrajectory: sys.arcTrajectory ?? '',
    });
  };

  const handleUpdate = () => {
    if (!editingId || !draft.name.trim()) return;
    updateSystem(editingId, {
      name: draft.name.trim(),
      description: draft.description.trim(),
      components: draft.components.split(',').map((s) => s.trim()).filter(Boolean),
      arcTrajectory: draft.arcTrajectory.trim(),
    });
    resetDraft();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Motif Systems</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Named groups of related motifs that track a system's arc, not just its instances.
          </p>
        </div>
        {!isAdding && !editingId && (
          <button
            onClick={() => { setIsAdding(true); setEditingId(null); }}
            className="rounded bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600"
          >
            + Add System
          </button>
        )}
      </div>

      {(isAdding || editingId) && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">System Name</label>
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="e.g. The Teeth System"
              className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Description</label>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="What this system encompasses — modes, patterns, relationships"
              rows={2}
              className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Components (comma-separated)</label>
            <input
              value={draft.components}
              onChange={(e) => setDraft((d) => ({ ...d, components: e.target.value }))}
              placeholder="sound/touch/count/weight, the knife, the three seconds"
              className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Arc Trajectory</label>
            <textarea
              value={draft.arcTrajectory}
              onChange={(e) => setDraft((d) => ({ ...d, arcTrajectory: e.target.value }))}
              placeholder="How this system evolves across the manuscript"
              rows={2}
              className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={editingId ? handleUpdate : handleAdd}
              className="rounded bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600"
            >
              {editingId ? 'Update' : 'Add'}
            </button>
            <button
              onClick={resetDraft}
              className="rounded border border-zinc-300 dark:border-zinc-600 px-3 py-1 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {systems.length === 0 && !isAdding && (
        <p className="text-sm text-zinc-400 dark:text-zinc-500 italic">No motif systems defined yet.</p>
      )}

      {systems.map((sys) => (
        <div
          key={sys.id}
          className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{sys.name}</h4>
              {sys.description && (
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{sys.description}</p>
              )}
            </div>
            <div className="ml-2 flex gap-1 shrink-0">
              <button
                onClick={() => startEdit(sys.id)}
                className="rounded px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                Edit
              </button>
              <button
                onClick={() => removeSystem(sys.id)}
                className="rounded px-2 py-0.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700"
              >
                Delete
              </button>
            </div>
          </div>
          {(sys.components ?? []).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {(sys.components ?? []).map((c, i) => (
                <span
                  key={i}
                  className="inline-block rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-400"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
          {sys.arcTrajectory && (
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 italic">
              Arc: {sys.arcTrajectory}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
