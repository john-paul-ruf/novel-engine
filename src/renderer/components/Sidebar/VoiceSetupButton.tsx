import { useBookStore } from '../../stores/bookStore';
import { useModalChatStore } from '../../stores/modalChatStore';
import { Tooltip } from '../common/Tooltip';

/**
 * Open the voice-profile setup ChatModal for the active book. Shared by the
 * command palette, the workbench phase-header quick action, and the legacy
 * sidebar button below (deleted in SESSION-14). No-ops without a book.
 */
export async function openVoiceSetup(): Promise<void> {
  const { activeSlug } = useBookStore.getState();
  if (!activeSlug) return;
  await useModalChatStore.getState().open('voice-setup', activeSlug);
}

export function VoiceSetupButton(): React.ReactElement | null {
  const activeSlug = useBookStore((s) => s.activeSlug);

  if (!activeSlug) return null;

  return (
    <Tooltip content="Set up your writing voice profile with Verity" placement="right">
    <button
      onClick={() => void openVoiceSetup()}
      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-500 dark:text-zinc-400 transition-colors hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-zinc-200"
    >
      <span className="text-purple-600 dark:text-purple-400">🎙</span>
      <span>Set Up Voice Profile</span>
    </button>
    </Tooltip>
  );
}
