import { useCallback, useState } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useViewStore } from '../stores/viewStore';

/**
 * Chapter Deep Dive — triggers a scoped Lumen analysis of a chapter draft.
 * Extracted verbatim from FilesView.handleDeepDive so the manuscript rail and
 * the legacy Files view share one path (the Files call site goes in S14).
 */
export function useChapterDeepDive(activeSlug: string): {
  deepDive: (chapterSlug: string) => Promise<void>;
  isDeepDiving: boolean;
} {
  const { navigate } = useViewStore();
  const [isDeepDiving, setIsDeepDiving] = useState(false);

  const deepDive = useCallback(
    async (chapterSlug: string) => {
      if (!activeSlug || !chapterSlug) return;

      setIsDeepDiving(true);
      try {
        const callId = crypto.randomUUID();

        // Create the Lumen conversation in the chatStore (sets activeConversation)
        await useChatStore.getState().createConversation('Lumen', activeSlug, null, 'pipeline');
        const { activeConversation } = useChatStore.getState();
        if (!activeConversation) return;
        const conversationId = activeConversation.id;

        // Attach stream listener before firing so we don't miss early events
        useChatStore.getState().attachToExternalStream(callId, conversationId);

        // Navigate to chat — ChatView will mount with the active Lumen conversation
        navigate('chat');

        // Fire and forget — stream events arrive via chat:streamEvent broadcast
        void window.novelEngine.chat.deepDive({
          bookSlug: activeSlug,
          chapterSlug,
          conversationId,
          callId,
        });
      } catch (err) {
        console.error('[DeepDive] Failed:', err);
      } finally {
        setIsDeepDiving(false);
      }
    },
    [activeSlug, navigate],
  );

  return { deepDive, isDeepDiving };
}
