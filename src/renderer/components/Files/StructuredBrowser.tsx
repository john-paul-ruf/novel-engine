import { CollapsibleSection } from './CollapsibleSection';
import { SourcePanel } from './SourcePanel';
import { AgentOutputPanel } from './AgentOutputPanel';
import { ChaptersPanel } from './ChaptersPanel';

type StructuredBrowserProps = {
  activeSlug: string;
  onFileSelect: (path: string) => void;
};

export function StructuredBrowser({
  activeSlug,
  onFileSelect,
}: StructuredBrowserProps): React.ReactElement {
  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      {/* Book Info card — quick access to about.json */}
      <div className="mb-6">
        <button
          onClick={() => onFileSelect('about.json')}
          className="group w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-4 text-left transition-colors hover:border-zinc-400 dark:hover:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800/80"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">📘</span>
            <div>
              <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Book Info</div>
              <div className="text-xs text-zinc-500">Edit title, author, status, and cover image</div>
            </div>
          </div>
        </button>
      </div>

      <CollapsibleSection title="Source" badge="Story foundation">
        <SourcePanel
          activeSlug={activeSlug}
          onFileSelect={onFileSelect}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Agent Output" badge="Reports & feedback">
        <AgentOutputPanel
          activeSlug={activeSlug}
          onFileSelect={onFileSelect}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Chapters" badge="Manuscript">
        <ChaptersPanel
          activeSlug={activeSlug}
          onFileSelect={onFileSelect}
        />
      </CollapsibleSection>
    </div>
  );
}
