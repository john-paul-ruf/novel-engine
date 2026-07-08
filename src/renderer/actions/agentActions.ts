import { useBookStore } from '../stores/bookStore';
import { useChatStore } from '../stores/chatStore';
import { useModalChatStore } from '../stores/modalChatStore';
import { useRevisionQueueStore } from '../stores/revisionQueueStore';
import { openConversationInWorkspace } from '../stores/workspaceStore';

/**
 * Shared agent-action triggers — one code path each for the command palette
 * and the workbench phase-header quick actions. Extracted from the legacy
 * Sidebar button files (HotTakeButton / AdhocRevisionButton / VoiceSetupButton)
 * when SESSION-14 deleted them.
 */

/**
 * Start a Hot Take session for the active book and show it in the workspace
 * chat pane (hot-take conversations carry no pipeline-phase tag, so they use
 * the ad-hoc conversation slot). No-ops when there is no active book or a
 * stream is already running.
 */
export async function startHotTake(): Promise<void> {
  const { activeSlug } = useBookStore.getState();
  const { isStreaming, loadConversations, setActiveConversation, attachToExternalStream } =
    useChatStore.getState();
  if (!activeSlug || isStreaming) return;

  try {
    const { conversationId, callId } = await window.novelEngine.hotTake.start(activeSlug);

    await loadConversations(activeSlug);
    await setActiveConversation(conversationId);
    attachToExternalStream(callId, conversationId);
    openConversationInWorkspace(conversationId);
  } catch (error) {
    console.error('Failed to start hot take:', error);
  }
}

/**
 * Open the shared revision queue modal (RevisionQueueModal, mounted in
 * AppLayout) for the active book. No-ops when there is no active book.
 */
export function openAdhocRevisions(): void {
  const { activeSlug } = useBookStore.getState();
  if (!activeSlug) return;
  useRevisionQueueStore.getState().openModal(activeSlug);
}

/**
 * Open the voice-profile setup ChatModal for the active book.
 * No-ops without a book.
 */
export async function openVoiceSetup(): Promise<void> {
  const { activeSlug } = useBookStore.getState();
  if (!activeSlug) return;
  await useModalChatStore.getState().open('voice-setup', activeSlug);
}
