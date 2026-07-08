import { useEffect, useState } from 'react';
import { useBookStore } from '../../../stores/bookStore';
import { useFileChangeStore } from '../../../stores/fileChangeStore';
import { Icon } from '../../common/Icon';
import { ProseViewer, useBookFile } from '../../common/ProseViewer';
import type { CompanionDocRequest } from '../CompanionPane';

/** Same inventory SourcePanel exposes (order per the workbench design). */
const SOURCE_DOCS = [
  { path: 'source/pitch.md', label: 'Pitch', description: 'The core story concept' },
  { path: 'source/scene-outline.md', label: 'Scene Outline', description: 'Scene-by-scene story structure' },
  { path: 'source/story-bible.md', label: 'Story Bible', description: 'Characters, world, and lore' },
  { path: 'source/voice-profile.md', label: 'Voice Profile', description: 'Your writing voice DNA' },
] as const;

type DocStatus = { exists: boolean; wordCount: number };

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

/**
 * Source docs reader: compact doc chips + typeset viewer. Statuses refresh on
 * file changes (same inventory/word-count logic as the legacy SourcePanel).
 */
export function SourcesTab({ request }: { request: CompanionDocRequest | null }): React.ReactElement {
  const activeSlug = useBookStore((s) => s.activeSlug);
  const revision = useFileChangeStore((s) => s.revision);
  const [statuses, setStatuses] = useState<Record<string, DocStatus>>({});
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!activeSlug) return;
    let cancelled = false;

    Promise.all(
      SOURCE_DOCS.map(async (doc) => {
        try {
          const exists = await window.novelEngine.files.exists(activeSlug, doc.path);
          let wordCount = 0;
          if (exists) {
            try {
              wordCount = countWords(await window.novelEngine.files.read(activeSlug, doc.path));
            } catch {
              // Exists but unreadable — treat as 0 words
            }
          }
          return [doc.path, { exists, wordCount }] as const;
        } catch {
          return [doc.path, { exists: false, wordCount: 0 }] as const;
        }
      }),
    ).then((entries) => {
      if (!cancelled) setStatuses(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [activeSlug, revision]);

  // Book switch → reset; default to the first existing doc once statuses load.
  useEffect(() => {
    setSelected(null);
  }, [activeSlug]);

  useEffect(() => {
    if (selected !== null) return;
    const firstExisting = SOURCE_DOCS.find((doc) => statuses[doc.path]?.exists);
    if (firstExisting) setSelected(firstExisting.path);
  }, [statuses, selected]);

  // Phase-header artifact chips route here.
  useEffect(() => {
    if (request?.tab === 'sources') setSelected(request.path);
  }, [request]);

  const selectedDoc = SOURCE_DOCS.find((doc) => doc.path === selected) ?? null;
  const selectedStatus = selected ? statuses[selected] : undefined;
  const { content, loading, error } = useBookFile(
    activeSlug,
    selectedStatus?.exists ? selected : null,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Doc chips */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-ne-line-soft px-3 py-2">
        {SOURCE_DOCS.map((doc) => {
          const status = statuses[doc.path];
          const isSelected = doc.path === selected;
          return (
            <button
              key={doc.path}
              onClick={() => setSelected(doc.path)}
              title={
                status?.exists
                  ? `${doc.description} · ${status.wordCount.toLocaleString()} words`
                  : `${doc.description} — not created yet`
              }
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors ${
                isSelected
                  ? 'border-ne-brass/60 bg-ne-brass-dim text-ne-ink'
                  : status?.exists
                    ? 'border-ne-line bg-ne-bg2 text-ne-ink-dim hover:border-ne-brass/50 hover:text-ne-ink'
                    : 'border-ne-line-soft bg-ne-bg1 text-ne-ink-faint hover:text-ne-ink-dim'
              }`}
            >
              {status?.exists && (
                <Icon name="check" size={10} strokeWidth={2.4} className="text-ne-lumen" />
              )}
              {doc.label}
            </button>
          );
        })}
      </div>

      {/* Viewer */}
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6 pb-14">
        {!selectedDoc ? (
          <div className="pt-8 text-center text-sm text-ne-ink-faint">
            No source documents yet.
          </div>
        ) : selectedStatus && !selectedStatus.exists ? (
          <div className="pt-8 text-center">
            <p className="text-sm text-ne-ink-dim">{selectedDoc.label} — not created yet</p>
            <p className="mt-2 text-xs text-ne-ink-faint">
              {selectedDoc.path === 'source/voice-profile.md'
                ? 'Set up your voice profile from the command palette (⌘K).'
                : `${selectedDoc.description}. It appears here once written.`}
            </p>
          </div>
        ) : error ? (
          <div className="pt-8 text-center text-sm text-ne-ink-faint">{error}</div>
        ) : loading ? (
          <div className="pt-8 text-center text-sm text-ne-ink-faint">Loading…</div>
        ) : (
          <ProseViewer content={content} />
        )}
      </div>
    </div>
  );
}
