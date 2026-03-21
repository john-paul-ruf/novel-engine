import { useState, useEffect, useRef, useCallback } from 'react';
import { marked } from 'marked';
import { useBookStore } from '../../stores/bookStore';

type FileEditorProps = {
  filePath: string;
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  onClose: () => void;
};

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

export function FileEditor({
  filePath,
  initialContent,
  onSave,
  onClose,
}: FileEditorProps): React.ReactElement {
  const { activeSlug } = useBookStore();
  const [content, setContent] = useState(initialContent);
  const [savedContent, setSavedContent] = useState(initialContent);
  const [showPreview, setShowPreview] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasUnsavedChanges = content !== savedContent;

  // Reset content when file changes
  useEffect(() => {
    setContent(initialContent);
    setSavedContent(initialContent);
    setSaveStatus('idle');
  }, [initialContent, filePath]);

  // Save handler
  const handleSave = useCallback(async () => {
    if (!hasUnsavedChanges) return;

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
  }, [content, hasUnsavedChanges, onSave]);

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
  contentRef.current = content;
  savedContentRef.current = savedContent;

  // Auto-save on unmount if there are unsaved changes
  useEffect(() => {
    return () => {
      if (contentRef.current !== savedContentRef.current && activeSlug) {
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
      <div className="shrink-0 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-6 py-2">
        <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <span className="text-zinc-800 dark:text-zinc-200 font-medium">{fileName}</span>
          {hasUnsavedChanges && (
            <span className="text-amber-600 dark:text-amber-400" title="Unsaved changes">
              ●
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Word count */}
          <span className="text-xs text-zinc-500">
            {wordCount.toLocaleString()} words
          </span>

          {/* Preview toggle */}
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={`rounded px-2.5 py-1 text-xs transition-colors ${
              showPreview
                ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:text-zinc-200'
            }`}
          >
            Preview
          </button>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={!hasUnsavedChanges || saveStatus === 'saving'}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saveStatus === 'saving'
              ? 'Saving...'
              : saveStatus === 'saved'
                ? 'Saved ✓'
                : 'Save'}
          </button>

          {/* Cancel button */}
          <button
            onClick={onClose}
            className="rounded bg-zinc-100 dark:bg-zinc-800 px-3 py-1 text-xs text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Editor area */}
      <div className="flex flex-1 min-h-0">
        {/* Textarea */}
        <div className={`flex-1 min-w-0 ${showPreview ? 'border-r border-zinc-200 dark:border-zinc-800' : ''}`}>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-full bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 font-mono text-sm p-6 resize-none outline-none border-none placeholder-zinc-400 dark:placeholder-zinc-600"
            placeholder="Start writing..."
            spellCheck={false}
          />
        </div>

        {/* Preview pane */}
        {showPreview && (
          <div className="flex-1 min-w-0 overflow-y-auto p-6">
            <div
              className="prose dark:prose-invert prose-zinc max-w-none"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
