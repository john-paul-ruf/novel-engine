import { useEffect, useState } from 'react';
import { useBookStore } from '../../stores/bookStore';
import { useViewStore } from '../../stores/viewStore';

export function RevisionQueueButton() {
  const { activeSlug } = useBookStore();
  const { navigate, currentView } = useViewStore();
  const [hasRevisionPlan, setHasRevisionPlan] = useState(false);

  useEffect(() => {
    if (!activeSlug) {
      setHasRevisionPlan(false);
      return;
    }

    Promise.all([
      window.novelEngine.files.exists(activeSlug, 'source/project-tasks.md'),
      window.novelEngine.files.exists(activeSlug, 'source/revision-prompts.md'),
    ]).then(([hasTasks, hasPrompts]) => {
      setHasRevisionPlan(hasTasks || hasPrompts);
    });
  }, [activeSlug]);

  if (!hasRevisionPlan) return null;

  return (
    <button
      onClick={() => navigate('revision-queue')}
      className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
        currentView === 'revision-queue'
          ? 'text-orange-300 bg-zinc-800/70'
          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
      }`}
    >
      <span className="text-orange-400">&#9881;</span>
      <span>Revision Queue</span>
    </button>
  );
}
