import { useCallback } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useBookStore } from '../../stores/bookStore';
import { useViewStore } from '../../stores/viewStore';

export function VoiceSetupButton(): React.ReactElement | null {
  const activeSlug = useBookStore((s) => s.activeSlug);
  const conversations = useChatStore((s) => s.conversations);
  const createConversation = useChatStore((s) => s.createConversation);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const navigate = useViewStore((s) => s.navigate);

  const handleClick = useCallback(async () => {
    if (!activeSlug) return;

    // Check if there's already a voice-setup conversation for this book
    const existing = conversations.find(
      (c) => c.bookSlug === activeSlug && c.purpose === 'voice-setup',
    );

    if (existing) {
      // Resume existing conversation
      await setActiveConversation(existing.id);
    } else {
      // Create new voice-setup conversation with Verity
      await createConversation('Verity', activeSlug, null, 'voice-setup');
    }
    navigate('chat');
  }, [activeSlug, conversations, createConversation, setActiveConversation, navigate]);

  if (!activeSlug) return null;

  return (
    <button
      onClick={handleClick}
      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800/50 hover:text-zinc-200"
    >
      <span className="text-purple-400">🎙</span>
      <span>Set Up Voice Profile</span>
    </button>
  );
}
