import { useEffect, useCallback } from 'react';
import { useMotifLedgerStore } from '../../stores/motifLedgerStore';
import { useBookStore } from '../../stores/bookStore';
import { SystemsTab } from './SystemsTab';
import { EntriesTab } from './EntriesTab';
import { StructuralTab } from './StructuralTab';
import { ForeshadowTab } from './ForeshadowTab';
import { MinorCharactersTab } from './MinorCharactersTab';
import { FlaggedPhrasesTab } from './FlaggedPhrasesTab';
import { AuditLogTab } from './AuditLogTab';

const TABS = [
  { id: 'systems' as const, label: 'Systems', key: 'systems' as const },
  { id: 'entries' as const, label: 'Entries', key: 'entries' as const },
  { id: 'structural' as const, label: 'Structural', key: 'structuralDevices' as const },
  { id: 'foreshadow' as const, label: 'Foreshadow', key: 'foreshadows' as const },
  { id: 'minor' as const, label: 'Minor Chars', key: 'minorCharacters' as const },
  { id: 'flagged' as const, label: 'Flagged', key: 'flaggedPhrases' as const },
  { id: 'audit' as const, label: 'Audit Log', key: 'auditLog' as const },
] as const;

export function MotifLedgerView(): React.ReactElement {
  const activeSlug = useBookStore((s) => s.activeSlug);
  const books = useBookStore((s) => s.books);
  const { ledger, activeTab, isLoading, isDirty, isSaving, error, load, save, setTab, loadUnauditedChapters } = useMotifLedgerStore();

  const activeBook = books.find((b) => b.slug === activeSlug);

  useEffect(() => {
    if (activeSlug) {
      load(activeSlug);
      loadUnauditedChapters(activeSlug);
    }
  }, [activeSlug, load, loadUnauditedChapters]);

  const handleSave = useCallback(() => {
    if (activeSlug) save(activeSlug);
  }, [activeSlug, save]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty && activeSlug) handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isDirty, activeSlug, handleSave]);

  if (!activeSlug || !activeBook) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-400 dark:text-zinc-500">
        <p className="text-sm">Select a book to view its motif ledger.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Motif Ledger</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {activeBook.title} — motif systems, character entries, structural devices, narrative threads
            </p>
          </div>
          <div className="flex items-center gap-3">
            {error && <span className="text-xs text-red-500">{error}</span>}
            {isDirty && <span className="text-xs text-amber-500 dark:text-amber-400">Unsaved changes</span>}
            <button
              onClick={handleSave}
              disabled={!isDirty || isSaving}
              className={`rounded px-4 py-1.5 text-sm font-medium transition-colors ${
                isDirty ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
              }`}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
        <div className="mt-4 flex gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const count = ledger ? (ledger[tab.key] as unknown[]).length : 0;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className={`ml-1.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] ${
                    isActive
                      ? 'bg-zinc-700 dark:bg-zinc-300 text-zinc-200 dark:text-zinc-700'
                      : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'
                  }`}>{count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-zinc-400 dark:text-zinc-500">Loading ledger...</p>
          </div>
        ) : (
          <>
            {activeTab === 'systems' && <SystemsTab />}
            {activeTab === 'entries' && <EntriesTab />}
            {activeTab === 'structural' && <StructuralTab />}
            {activeTab === 'foreshadow' && <ForeshadowTab />}
            {activeTab === 'minor' && <MinorCharactersTab />}
            {activeTab === 'flagged' && <FlaggedPhrasesTab />}
            {activeTab === 'audit' && <AuditLogTab />}
          </>
        )}
      </div>
    </div>
  );
}
