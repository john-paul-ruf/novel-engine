import { useCallback, useEffect, useState } from 'react';
import { useBookStore } from '../../stores/bookStore';
import { useChatStore } from '../../stores/chatStore';
import { useViewStore } from '../../stores/viewStore';
import { useFileChangeStore } from '../../stores/fileChangeStore';
import { Tooltip } from '../common/Tooltip';

export function HotTakeButton({ compact = false }: { compact?: boolean } = {}): React.ReactElement | null {
  const activeSlug = useBookStore((s) => s.activeSlug);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const attachToExternalStream = useChatStore((s) => s.attachToExternalStream);
  const navigate = useViewStore((s) => s.navigate);
  const fileRevision = useFileChangeStore((s) => s.revision);
  const [hasChapters, setHasChapters] = useState(false);

  useEffect(() => {
    if (!activeSlug) {
      setHasChapters(false);
      return;
    }
    window.novelEngine.files.listDir(activeSlug, 'chapters').then((entries) => {
      const hasDrafts = entries.some(
        (e) => e.isDirectory && e.children?.some((c) => c.name === 'draft.md'),
      );
      setHasChapters(hasDrafts);
    }).catch(() => setHasChapters(false));
  }, [activeSlug, fileRevision]);

  const handleClick = useCallback(async () => {
    if (!activeSlug || isStreaming) return;

    try {
      const { conversationId, callId } = await window.novelEngine.hotTake.start(activeSlug);

      await loadConversations(activeSlug);
      await setActiveConversation(conversationId);
      attachToExternalStream(callId, conversationId);
      navigate('chat');
    } catch (error) {
      console.error('Failed to start hot take:', error);
    }
  }, [activeSlug, isStreaming, loadConversations, setActiveConversation, attachToExternalStream, navigate]);

  if (!activeSlug || !hasChapters) return null;

  if (compact) {
    return (
      <button
        onClick={handleClick}
        disabled={isStreaming}
        className="no-drag flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs text-cyan-600 dark:text-cyan-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-cyan-700 dark:hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-500" />
        <span>Hot Take</span>
      </button>
    );
  }

  return (
    <Tooltip content="Get Ghostlight's unfiltered first impression of your manuscript" placement="right">
    <button
      onClick={handleClick}
      disabled={isStreaming}
      className="flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 text-cyan-600 dark:text-cyan-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-cyan-700 dark:hover:text-cyan-300"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-4 w-4"
      >
        <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
        <path
          fillRule="evenodd"
          d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
          clipRule="evenodd"
        />
      </svg>
      <span>Hot Take</span>
    </button>
    </Tooltip>
  );
}
