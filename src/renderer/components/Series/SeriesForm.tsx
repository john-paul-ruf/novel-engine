import { useEffect, useRef, useState } from 'react';

type SeriesFormProps = {
  mode: 'create' | 'edit';
  initialName?: string;
  initialDescription?: string;
  onSubmit: (name: string, description: string) => void;
  onCancel: () => void;
};

export function SeriesForm({
  mode,
  initialName = '',
  initialDescription = '',
  onSubmit,
  onCancel,
}: SeriesFormProps): React.ReactElement {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName) {
      onSubmit(trimmedName, description.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="series-name" className="block text-xs font-medium text-zinc-400 mb-1">
          Series Name
        </label>
        <input
          ref={inputRef}
          id="series-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. The Stormlight Archive"
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label htmlFor="series-description" className="block text-xs font-medium text-zinc-400 mb-1">
          Description (optional)
        </label>
        <textarea
          id="series-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A brief description of the series..."
          rows={3}
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 outline-none focus:border-blue-500 resize-none"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!name.trim()}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mode === 'create' ? 'Create Series' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
