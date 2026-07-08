import { useCallback, useState } from 'react';
import { useChatStore } from '../stores/chatStore';
import { openConversationInWorkspace } from '../stores/workspaceStore';

/**
 * Chapter Deep Dive — triggers a scoped Lumen analysis of a chapter draft.
 * Extracted from the legacy FilesView.handleDeepDive (deleted in SESSION-14);
 * the conversation is untagged, so it lands in the workspace chat pane via
 * the ad-hoc conversation slot.
 */
export function useChapterDeepDive(activeSlug: string): {
  deepDive: (chapterSlug: string) => Promise<void>;
  isDeepDiving: boolean;
} {
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

        // Show the active Lumen conversation in the workspace chat pane
        openConversationInWorkspace(conversationId);

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
    [activeSlug],
  );

  return { deepDive, isDeepDiving };
}
