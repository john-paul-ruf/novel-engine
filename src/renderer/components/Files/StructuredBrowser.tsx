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
