import { useState, useEffect, useRef, useCallback } from 'react';
import { marked } from 'marked';
import { useBookStore } from '../../stores/bookStore';
import { VersionHistoryPanel } from './VersionHistoryPanel';

type FileEditorProps = {
  filePath: string;
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  onClose: () => void;
  /** Read-only mode: textarea locked, save + unmount-autosave no-ops. */
  disabled?: boolean;
};

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

export function FileEditor({
  filePath,
  initialContent,
  onSave,
  onClose,
  disabled = false,
}: FileEditorProps): React.ReactElement {
  const { activeSlug } = useBookStore();
  const [content, setContent] = useState(initialContent);
  const [savedContent, setSavedContent] = useState(initialContent);
  const [showPreview, setShowPreview] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasUnsavedChanges = content !== savedContent;

  // Reset content and close history when file changes
  useEffect(() => {
    setContent(initialContent);
    setSavedContent(initialContent);
    setSaveStatus('idle');
    setShowHistory(false);
  }, [initialContent, filePath]);

  // Save handler
  const handleSave = useCallback(async () => {
    if (disabled || !hasUnsavedChanges) return;

    setSaveStatus('saving');
    try {
      await onSave(content);
      setSavedContent(content);
      setSaveStatus('saved');

      // Clear "saved" indicator after 2 seconds
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        setSaveStatus('idle');
      }, 2000);
    } catch (err) {
      console.error('Failed to save file:', err);
      setSaveStatus('idle');
    }
  }, [content, hasUnsavedChanges, onSave, disabled]);

  // Keyboard shortcut: Cmd/Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  // Clean up save timeout
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // Use refs to capture latest values for auto-save on unmount
  const contentRef = useRef(content);
  const savedContentRef = useRef(savedContent);
  const disabledRef = useRef(disabled);
  contentRef.current = content;
  savedContentRef.current = savedContent;
  disabledRef.current = disabled;

  // Auto-save on unmount if there are unsaved changes (never while disabled —
  // writing during an active agent call would race the agent's own writes)
  useEffect(() => {
    return () => {
      if (!disabledRef.current && contentRef.current !== savedContentRef.current && activeSlug) {
        window.novelEngine.files
          .write(activeSlug, filePath, contentRef.current)
          .catch((err) => console.error('Auto-save failed:', err));
      }
    };
  }, [activeSlug, filePath]);

  const fileName = filePath.split('/').pop() ?? filePath;
  const wordCount = countWords(content);
  const previewHtml = showPreview ? (marked.parse(content) as string) : '';

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center justify-between border-b border-ne-line-soft px-6 py-2">
        <div className="flex items-center gap-2 text-sm text-ne-ink-dim">
          <span className="text-ne-ink font-medium">{fileName}</span>
          {hasUnsavedChanges && (
            <span className="text-ne-forge" title="Unsaved changes">
              ●
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Word count */}
          <span className="text-xs text-ne-ink-faint">
            {wordCount.toLocaleString()} words
          </span>

          {/* Preview toggle */}
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={`rounded px-2.5 py-1 text-xs transition-colors ${
              showPreview
                ? 'border border-ne-brass/60 bg-ne-brass-dim text-ne-ink'
                : 'border border-ne-line bg-ne-bg2 text-ne-ink-dim hover:text-ne-ink'
            }`}
          >
            Preview
          </button>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={disabled || !hasUnsavedChanges || saveStatus === 'saving'}
            className="rounded bg-ne-brass px-3 py-1 text-xs font-medium text-ne-bg0 transition-colors hover:bg-ne-brass-hi disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saveStatus === 'saving'
              ? 'Saving...'
              : saveStatus === 'saved'
                ? 'Saved ✓'
                : 'Save'}
          </button>

          {/* History toggle */}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`rounded px-2.5 py-1 text-xs transition-colors ${
              showHistory
                ? 'border border-ne-brass/60 bg-ne-brass-dim text-ne-ink'
                : 'border border-ne-line bg-ne-bg2 text-ne-ink-dim hover:text-ne-ink'
            }`}
            title="Version history"
          >
            <svg className="w-3.5 h-3.5 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            History
          </button>

          {/* Cancel button */}
          <button
            onClick={onClose}
            className="rounded bg-ne-bg2 px-3 py-1 text-xs text-ne-ink-dim transition-colors hover:text-ne-ink"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Editor area + optional history panel */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Editor content */}
        <div className={`flex flex-col overflow-hidden ${showHistory ? 'w-1/2' : 'flex-1'}`}>
          <div className="flex flex-1 min-h-0">
            {/* Textarea */}
            <div className={`flex-1 min-w-0 ${showPreview ? 'border-r border-ne-line-soft' : ''}`}>
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                readOnly={disabled}
                className={`w-full h-full bg-ne-bg0 text-ne-ink font-mono text-sm p-6 resize-none outline-none border-none placeholder-ne-ink-faint ${disabled ? 'opacity-60' : ''}`}
                placeholder="Start writing..."
                spellCheck={false}
              />
            </div>

            {/* Preview pane */}
            {showPreview && (
              <div className="flex-1 min-w-0 overflow-y-auto p-6">
                <div
                  className="prose max-w-none [--tw-prose-body:var(--ne-ink)] [--tw-prose-headings:var(--ne-ink)] [--tw-prose-bold:var(--ne-ink)] [--tw-prose-links:var(--ne-quill)] [--tw-prose-code:var(--ne-ink-dim)] [--tw-prose-quotes:var(--ne-ink-dim)] [--tw-prose-quote-borders:var(--ne-line)] [--tw-prose-counters:var(--ne-ink-dim)] [--tw-prose-bullets:var(--ne-ink-faint)] [--tw-prose-hr:var(--ne-line)] [--tw-prose-pre-bg:var(--ne-bg2)] [--tw-prose-pre-code:var(--ne-ink-dim)] [--tw-prose-th-borders:var(--ne-line)] [--tw-prose-td-borders:var(--ne-line-soft)]"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Version history panel */}
        {showHistory && activeSlug && (
          <div className="w-1/2 border-l border-ne-line">
            <VersionHistoryPanel
              bookSlug={activeSlug}
              filePath={filePath}
              onClose={() => setShowHistory(false)}
              onReverted={() => {
                window.novelEngine.files.read(activeSlug, filePath).then((newContent) => {
                  setContent(newContent);
                  setSavedContent(newContent);
                }).catch((err) => console.error('Failed to reload after revert:', err));
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
