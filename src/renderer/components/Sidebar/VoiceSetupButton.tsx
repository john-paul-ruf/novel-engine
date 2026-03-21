import { useCallback } from 'react';
import { useBookStore } from '../../stores/bookStore';
import { useModalChatStore } from '../../stores/modalChatStore';

export function VoiceSetupButton(): React.ReactElement | null {
  const activeSlug = useBookStore((s) => s.activeSlug);
  const openModal = useModalChatStore((s) => s.open);

  const handleClick = useCallback(async () => {
    if (!activeSlug) return;
    await openModal('voice-setup', activeSlug);
  }, [activeSlug, openModal]);

  if (!activeSlug) return null;

  return (
    <button
      onClick={handleClick}
      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-500 dark:text-zinc-400 transition-colors hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:text-zinc-200"
    >
      <span className="text-purple-600 dark:text-purple-400">🎙</span>
      <span>Set Up Voice Profile</span>
    </button>
  );
}
