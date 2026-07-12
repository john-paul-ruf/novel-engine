import { useState } from 'react';
import { useQueryStore } from '../../stores/queryStore';
import type { QueryTargetType, QuerySubmissionMethod } from '@domain/types';

export function AddTargetForm({
  bookSlug,
  onDone,
}: {
  bookSlug: string;
  onDone: () => void;
}): React.ReactElement {
  const addTarget = useQueryStore((s) => s.addTarget);
  const [name, setName] = useState('');
  const [type, setType] = useState<QueryTargetType>('agent');
  const [contact, setContact] = useState('');
  const [method, setMethod] = useState<QuerySubmissionMethod>('email');
  const [link, setLink] = useState('');
  const [personalization, setPersonalization] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!name.trim()) return;
    await addTarget(bookSlug, {
      name: name.trim(),
      type,
      contact: contact.trim(),
      method,
      status: 'drafting',
      link: link.trim(),
      personalizationNotes: personalization.trim(),
      notes: notes.trim(),
    });
    onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="mb-4 rounded-[13px] border border-ne-brass/30 bg-ne-bg1 p-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-ne-ink-faint">Name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Agent / Publisher name"
            className="mt-1 w-full rounded-md border border-ne-line bg-ne-bg0 px-3 py-2 text-sm text-ne-ink focus:outline-none focus:border-ne-brass"
            required
          />
        </div>
        <div>
          <label className="text-xs text-ne-ink-faint">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as QueryTargetType)}
            className="mt-1 w-full rounded-md border border-ne-line bg-ne-bg0 px-3 py-2 text-sm text-ne-ink focus:outline-none focus:border-ne-brass"
          >
            <option value="agent">Agent</option>
            <option value="publisher">Publisher</option>
            <option value="platform">Platform</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-ne-ink-faint">Contact</label>
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="email or URL"
            className="mt-1 w-full rounded-md border border-ne-line bg-ne-bg0 px-3 py-2 text-sm text-ne-ink focus:outline-none focus:border-ne-brass"
          />
        </div>
        <div>
          <label className="text-xs text-ne-ink-faint">Method</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as QuerySubmissionMethod)}
            className="mt-1 w-full rounded-md border border-ne-line bg-ne-bg0 px-3 py-2 text-sm text-ne-ink focus:outline-none focus:border-ne-brass"
          >
            <option value="email">Email</option>
            <option value="form">Form</option>
            <option value="query-manager">Query Manager</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="text-xs text-ne-ink-faint">Link (agent profile / publisher page)</label>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://..."
            className="mt-1 w-full rounded-md border border-ne-line bg-ne-bg0 px-3 py-2 text-sm text-ne-ink focus:outline-none focus:border-ne-brass"
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-ne-ink-faint">Personalization Notes</label>
          <textarea
            value={personalization}
            onChange={(e) => setPersonalization(e.target.value)}
            placeholder="What to emphasize for this target (MSWL, comp alignment, specific interests)"
            rows={2}
            className="mt-1 w-full rounded-md border border-ne-line bg-ne-bg0 px-3 py-2 text-sm text-ne-ink focus:outline-none focus:border-ne-brass"
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-ne-ink-faint">Notes</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Exclusivity, special instructions, etc."
            className="mt-1 w-full rounded-md border border-ne-line bg-ne-bg0 px-3 py-2 text-sm text-ne-ink focus:outline-none focus:border-ne-brass"
          />
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="submit" className="rounded-lg bg-ne-brass px-4 py-2 text-sm font-medium text-ne-bg0 transition-colors hover:bg-ne-brass-hi">
          Add Target
        </button>
        <button type="button" onClick={onDone} className="rounded-lg border border-ne-line px-4 py-2 text-sm text-ne-ink-dim transition-colors hover:bg-ne-bg2">
          Cancel
        </button>
      </div>
    </form>
  );
}