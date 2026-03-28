import { useState } from 'react';
import { useMotifLedgerStore } from '../../stores/motifLedgerStore';

function generateId(): string {
  return crypto.randomUUID();
}

export function AuditLogTab(): React.ReactElement {
  const { ledger, unauditedChapters, addAuditRecord, removeAuditRecord } = useMotifLedgerStore();
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState({ chapterSlug: '', entriesAdded: '0', entriesUpdated: '0', notes: '' });

  const auditLog = ledger?.auditLog ?? [];

  const resetDraft = () => {
    setDraft({ chapterSlug: '', entriesAdded: '0', entriesUpdated: '0', notes: '' });
    setIsAdding(false);
  };

  const handleAdd = () => {
    if (!draft.chapterSlug.trim()) return;
    addAuditRecord({
      id: generateId(),
      chapterSlug: draft.chapterSlug.trim(),
      auditedAt: new Date().toISOString(),
      entriesAdded: parseInt(draft.entriesAdded, 10) || 0,
      entriesUpdated: parseInt(draft.entriesUpdated, 10) || 0,
      notes: draft.notes.trim(),
    });
    resetDraft();
  };

  const sorted = [...auditLog].sort((a, b) => (b.auditedAt ?? '').localeCompare(a.auditedAt ?? ''));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Audit Log</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            After each chapter draft, re-read with the ledger open. What's in this chapter that isn't in the ledger?
          </p>
        </div>
        {!isAdding && (
          <button onClick={() => setIsAdding(true)} className="rounded bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600">+ Log Audit</button>
        )}
      </div>

      {unauditedChapters.length > 0 && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            {unauditedChapters.length} chapter{unauditedChapters.length > 1 ? 's' : ''} not yet audited:
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {unauditedChapters.map((slug) => (
              <span key={slug} className="inline-block rounded bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">{slug}</span>
            ))}
          </div>
        </div>
      )}

      {isAdding && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Chapter Slug</label>
            {unauditedChapters.length > 0 ? (
              <select value={draft.chapterSlug} onChange={(e) => setDraft((d) => ({ ...d, chapterSlug: e.target.value }))} className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100">
                <option value="">Select a chapter...</option>
                {unauditedChapters.map((slug) => <option key={slug} value={slug}>{slug}</option>)}
              </select>
            ) : (
              <input value={draft.chapterSlug} onChange={(e) => setDraft((d) => ({ ...d, chapterSlug: e.target.value }))} placeholder="e.g. 01-the-beginning" className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Entries Added</label>
              <input type="number" min="0" value={draft.entriesAdded} onChange={(e) => setDraft((d) => ({ ...d, entriesAdded: e.target.value }))} className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Entries Updated</label>
              <input type="number" min="0" value={draft.entriesUpdated} onChange={(e) => setDraft((d) => ({ ...d, entriesUpdated: e.target.value }))} className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Notes</label>
            <textarea value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} rows={2} placeholder="What was found that wasn't in the ledger" className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} className="rounded bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600">Log</button>
            <button onClick={resetDraft} className="rounded border border-zinc-300 dark:border-zinc-600 px-3 py-1 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">Cancel</button>
          </div>
        </div>
      )}

      {sorted.length === 0 && !isAdding && <p className="text-sm text-zinc-400 dark:text-zinc-500 italic">No audits recorded yet.</p>}

      {sorted.map((record) => (
        <div key={record.id} className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{record.chapterSlug}</span>
                <span className="text-xs text-zinc-400 dark:text-zinc-500">{new Date(record.auditedAt).toLocaleDateString()}</span>
              </div>
              <div className="mt-1 flex gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                <span>+{record.entriesAdded} added</span>
                <span>~{record.entriesUpdated} updated</span>
              </div>
            </div>
            <button onClick={() => removeAuditRecord(record.id)} className="rounded px-2 py-0.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700">Delete</button>
          </div>
          {record.notes && <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500 italic">{record.notes}</p>}
        </div>
      ))}
    </div>
  );
}
