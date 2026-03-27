import { useState } from 'react';
import { useMotifLedgerStore } from '../../stores/motifLedgerStore';

function generateId(): string {
  return crypto.randomUUID();
}

type DeviceDraft = {
  name: string;
  deviceType: string;
  description: string;
  pattern: string;
  chapters: string;
  notes: string;
};

const EMPTY_DRAFT: DeviceDraft = {
  name: '', deviceType: 'countdown', description: '', pattern: '', chapters: '', notes: '',
};

const DEVICE_TYPES = ['countdown', 'chapter-structure', 'pov-pattern', 'framing-device', 'recurring-format', 'other'];

export function StructuralTab(): React.ReactElement {
  const { ledger, addStructuralDevice, updateStructuralDevice, removeStructuralDevice } = useMotifLedgerStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState<DeviceDraft>(EMPTY_DRAFT);

  const devices = ledger?.structuralDevices ?? [];

  const resetDraft = () => { setDraft(EMPTY_DRAFT); setIsAdding(false); setEditingId(null); };

  const handleAdd = () => {
    if (!draft.name.trim()) return;
    addStructuralDevice({
      id: generateId(),
      name: draft.name.trim(),
      deviceType: draft.deviceType,
      description: draft.description.trim(),
      pattern: draft.pattern.trim(),
      chapters: draft.chapters.split(',').map((s) => s.trim()).filter(Boolean),
      notes: draft.notes.trim(),
    });
    resetDraft();
  };

  const startEdit = (id: string) => {
    const d = devices.find((x) => x.id === id);
    if (!d) return;
    setEditingId(id);
    setIsAdding(false);
    setDraft({ name: d.name, deviceType: d.deviceType, description: d.description, pattern: d.pattern, chapters: d.chapters.join(', '), notes: d.notes });
  };

  const handleUpdate = () => {
    if (!editingId || !draft.name.trim()) return;
    updateStructuralDevice(editingId, {
      name: draft.name.trim(),
      deviceType: draft.deviceType,
      description: draft.description.trim(),
      pattern: draft.pattern.trim(),
      chapters: draft.chapters.split(',').map((s) => s.trim()).filter(Boolean),
      notes: draft.notes.trim(),
    });
    resetDraft();
  };

  const formFields = (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Device Name</label>
          <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="e.g. Days to Thaen Mor countdown" className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Type</label>
          <select value={draft.deviceType} onChange={(e) => setDraft((d) => ({ ...d, deviceType: e.target.value }))} className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100">
            {DEVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Description</label>
        <textarea value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} rows={2} className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Pattern</label>
        <input value={draft.pattern} onChange={(e) => setDraft((d) => ({ ...d, pattern: e.target.value }))} placeholder="e.g. Opens each chapter, Eddin/Maren alternating" className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Chapters (comma-separated)</label>
        <input value={draft.chapters} onChange={(e) => setDraft((d) => ({ ...d, chapters: e.target.value }))} className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" />
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
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Structural Devices</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Compositional motifs not owned by any character: countdowns, chapter structures, POV patterns, framing devices.</p>
        </div>
        {!isAdding && !editingId && (
          <button onClick={() => { setIsAdding(true); setEditingId(null); }} className="rounded bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600">+ Add Device</button>
        )}
      </div>
      {(isAdding || editingId) && formFields}
      {devices.length === 0 && !isAdding && <p className="text-sm text-zinc-400 dark:text-zinc-500 italic">No structural devices defined yet.</p>}
      {devices.map((device) => (
        <div key={device.id} className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium rounded bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 text-purple-600 dark:text-purple-400">{device.deviceType}</span>
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{device.name}</span>
              </div>
              {device.description && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{device.description}</p>}
            </div>
            <div className="ml-2 flex gap-1 shrink-0">
              <button onClick={() => startEdit(device.id)} className="rounded px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300">Edit</button>
              <button onClick={() => removeStructuralDevice(device.id)} className="rounded px-2 py-0.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700">Delete</button>
            </div>
          </div>
          {device.pattern && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Pattern: {device.pattern}</p>}
          {device.chapters.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {device.chapters.map((c, i) => <span key={i} className="inline-block rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-400">{c}</span>)}
            </div>
          )}
          {device.notes && <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500 italic">{device.notes}</p>}
        </div>
      ))}
    </div>
  );
}
