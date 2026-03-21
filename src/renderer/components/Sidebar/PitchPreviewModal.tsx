import { useEffect, useRef } from 'react';
import { marked } from 'marked';
import { usePitchShelfStore } from '../../stores/pitchShelfStore';

export function PitchPreviewModal(): React.ReactElement | null {
  const { previewPitch, previewLoading, closePreview } = usePitchShelfStore();
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!previewPitch) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePreview();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [previewPitch, closePreview]);

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      closePreview();
    }
  };

  if (!previewPitch && !previewLoading) return null;

  const renderedHtml = previewPitch
    ? (marked.parse(previewPitch.content, { async: false }) as string)
    : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {previewPitch?.title || 'Loading...'}
          </h2>
          <button
            onClick={closePreview}
            className="text-zinc-400 hover:text-zinc-200 text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {previewLoading ? (
            <div className="text-center text-sm text-zinc-500">Loading pitch...</div>
          ) : (
            <div
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-zinc-200 dark:border-zinc-800 px-5 py-3">
          <button
            onClick={closePreview}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
