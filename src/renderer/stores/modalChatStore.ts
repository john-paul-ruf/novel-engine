import { create } from 'zustand';
import type { Conversation, ConversationPurpose, Message, StreamEvent } from '@domain/types';
import { randomRespondingStatus } from '@domain/statusMessages';

type ModalChatState = {
  // Visibility
  isOpen: boolean;
  purpose: ConversationPurpose | null;
  bookSlug: string;

  // Conversation state
  conversation: Conversation | null;
  messages: Message[];
  isStreaming: boolean;
  isThinking: boolean;
  streamBuffer: string;
  thinkingBuffer: string;
  statusMessage: string;

  // Actions
  open: (purpose: ConversationPurpose, bookSlug: string) => Promise<void>;
  close: () => void;
  sendMessage: (content: string, thinkingBudgetOverride?: number) => Promise<void>;

  // Call scoping — prevents cross-book stream bleed
  _activeCallId: string | null;

  // Stream handling (internal)
  _handleStreamEvent: (event: StreamEvent) => void;
  _cleanupListener: (() => void) | null;
  initStreamListener: () => void;
  destroyStreamListener: () => void;
};

export const useModalChatStore = create<ModalChatState>((set, get) => ({
  isOpen: false,
  purpose: null,
  bookSlug: '',
  conversation: null,
  messages: [],
  isStreaming: false,
  isThinking: false,
  streamBuffer: '',
  thinkingBuffer: '',
  statusMessage: '',
  _activeCallId: null,
  _cleanupListener: null,

  open: async (purpose: ConversationPurpose, bookSlug: string) => {
    try {
      const conversations = await window.novelEngine.chat.getConversations(bookSlug);
      const existing = conversations.find(
        (c) => c.purpose === purpose && c.bookSlug === bookSlug,
      );

      if (existing) {
        const messages = await window.novelEngine.chat.getMessages(existing.id);
        set({
          isOpen: true,
          purpose,
          bookSlug,
          conversation: existing,
          messages,
        });
      } else {
        const conversation = await window.novelEngine.chat.createConversation({
          bookSlug,
          agentName: 'Verity',
          pipelinePhase: null,
          purpose,
        });
        set({
          isOpen: true,
          purpose,
          bookSlug,
          conversation,
          messages: [],
        });
      }
    } catch (error) {
      console.error('Failed to open modal chat:', error);
    }
  },

  close: () => {
    const { isStreaming } = get();
    if (isStreaming) return;
    set({ isOpen: false });
  },

  sendMessage: async (content: string, thinkingBudgetOverride?: number) => {
    const { conversation, bookSlug } = get();
    if (!conversation) return;

    const tempMessage: Message = {
      id: 'temp-' + Date.now(),
      role: 'user',
      content,
      thinking: '',
      conversationId: conversation.id,
      timestamp: new Date().toISOString(),
    };

    const callId = crypto.randomUUID();

    set((state) => ({
      messages: [...state.messages, tempMessage],
      isStreaming: true,
      streamBuffer: '',
      thinkingBuffer: '',
      statusMessage: randomRespondingStatus(),
      _activeCallId: callId,
    }));

    try {
      await window.novelEngine.chat.send({
        agentName: conversation.agentName,
        message: content,
        conversationId: conversation.id,
        bookSlug,
        thinkingBudgetOverride,
        callId,
      });
    } catch (error) {
      console.error('Failed to send modal message:', error);
      const errorMessage: Message = {
        id: 'error-' + Date.now(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to send message'}`,
        thinking: '',
        conversationId: conversation.id,
        timestamp: new Date().toISOString(),
      };
      set((state) => ({
        messages: [...state.messages, errorMessage],
        isStreaming: false,
        isThinking: false,
        streamBuffer: '',
        thinkingBuffer: '',
      }));
    }
  },

  _handleStreamEvent: (event: StreamEvent) => {
    const enriched = event as StreamEvent & { callId?: string; conversationId?: string };
    const callId = enriched.callId;
    if (callId && callId.startsWith('rev:')) return;

    const { _activeCallId, conversation, isStreaming } = get();

    // Primary guard: callId matching — UUID per send, prevents cross-call bleed
    if (_activeCallId && callId && callId !== _activeCallId) return;

    // Secondary guard: when no call is active, reject stale events
    if (!_activeCallId && !isStreaming) return;

    // Conversation scope: only process events belonging to our conversation
    if (enriched.conversationId && conversation && enriched.conversationId !== conversation.id) return;

    switch (event.type) {
      case 'status':
        set({ statusMessage: event.message });
        break;

      case 'blockStart':
        if (event.blockType === 'thinking') {
          set({ isThinking: true, isStreaming: true, statusMessage: '' });
        } else if (event.blockType === 'text') {
          set({ isThinking: false, statusMessage: '' });
        }
        break;

      case 'thinkingDelta':
        set((state) => ({ thinkingBuffer: state.thinkingBuffer + event.text }));
        break;

      case 'textDelta':
        set((state) => ({ streamBuffer: state.streamBuffer + event.text }));
        break;

      case 'blockEnd':
        break;

      case 'toolUse':
        break;

      case 'filesChanged':
        break;

      case 'done':
        if (conversation) {
          window.novelEngine.chat.getMessages(conversation.id)
            .then((messages) => {
              set({
                messages,
                isStreaming: false,
                isThinking: false,
                streamBuffer: '',
                thinkingBuffer: '',
                statusMessage: '',
                _activeCallId: null,
              });
                    })
            .catch((error) => {
              console.error('Failed to reload modal messages after done:', error);
              set({
                isStreaming: false,
                isThinking: false,
                streamBuffer: '',
                thinkingBuffer: '',
                statusMessage: '',
                _activeCallId: null,
              });
                    });
        } else {
          set({
            isStreaming: false,
            isThinking: false,
            streamBuffer: '',
            thinkingBuffer: '',
            statusMessage: '',
            _activeCallId: null,
          });
            }
        break;

      case 'error':
        set((state) => {
          const errorMessage: Message = {
            id: 'error-' + Date.now(),
            role: 'assistant',
            content: `Error: ${event.message}`,
            thinking: '',
            conversationId: conversation?.id ?? '',
            timestamp: new Date().toISOString(),
          };
          return {
            messages: [...state.messages, errorMessage],
            isStreaming: false,
            isThinking: false,
            streamBuffer: '',
            thinkingBuffer: '',
            statusMessage: '',
            _activeCallId: null,
          };
        });
          break;
    }
  },

  initStreamListener: () => {
    const { _cleanupListener, _handleStreamEvent } = get();
    if (_cleanupListener) {
      _cleanupListener();
    }
    const cleanup = window.novelEngine.chat.onStreamEvent(_handleStreamEvent);
    set({ _cleanupListener: cleanup });
  },

  destroyStreamListener: () => {
    const { _cleanupListener } = get();
    if (_cleanupListener) {
      _cleanupListener();
    }
    set({ _cleanupListener: null });
  },
}));
