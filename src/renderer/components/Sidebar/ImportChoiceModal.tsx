type ImportChoiceModalProps = {
  onClose: () => void;
  onImportBook: () => void;
  onImportSeries: () => void;
};

export function ImportChoiceModal({
  onClose,
  onImportBook,
  onImportSeries,
}: ImportChoiceModalProps): React.ReactElement {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-96 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 p-5 shadow-xl">
        <h3 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Import</h3>
        <div className="flex gap-3">
          <button
            onClick={() => {
              onImportBook();
              onClose();
            }}
            className="flex flex-1 flex-col items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 p-4 transition-colors hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/20"
          >
            <span className="text-2xl">📘</span>
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Single Book</span>
            <span className="text-xs text-zinc-500">Import a manuscript from a folder</span>
          </button>
          <button
            onClick={() => {
              onImportSeries();
              onClose();
            }}
            className="flex flex-1 flex-col items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 p-4 transition-colors hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/20"
          >
            <span className="text-2xl">📚</span>
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Series</span>
            <span className="text-xs text-zinc-500">Import multiple books as a series</span>
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
