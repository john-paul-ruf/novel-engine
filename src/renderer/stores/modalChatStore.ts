import { create } from 'zustand';
import type { Conversation, ConversationPurpose, Message, StreamEvent } from '@domain/types';
import { randomRespondingStatus } from '@domain/statusMessages';
import { createStreamHandler } from './streamHandler';

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
  _closeRequested: boolean;

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
  _closeRequested: false,
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
          _closeRequested: false,
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
          _closeRequested: false,
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
    if (isStreaming) {
      set({ _closeRequested: true });
      return;
    }
    set({ isOpen: false, _closeRequested: false });
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
        messages: [...state.messages.filter(m => m.id !== tempMessage.id), errorMessage],
        isStreaming: false,
        isThinking: false,
        streamBuffer: '',
        thinkingBuffer: '',
        _activeCallId: null,
      }));
    }
  },

  _handleStreamEvent: (() => {
    let handler: ((event: StreamEvent) => void) | null = null;
    return (event: StreamEvent) => {
      if (!handler) {
        handler = createStreamHandler({
    getActiveCallId: () => useModalChatStore.getState()._activeCallId,
    getIsStreaming: () => useModalChatStore.getState().isStreaming,
    getActiveConversationId: () => useModalChatStore.getState().conversation?.id ?? null,
    alwaysCheckConversationId: true,

    onStatus: (message) => useModalChatStore.setState({ statusMessage: message }),
    onBlockStart: (blockType) => {
      if (blockType === 'thinking') {
        useModalChatStore.setState({ isThinking: true, isStreaming: true, statusMessage: '' });
      } else if (blockType === 'text') {
        useModalChatStore.setState({ isThinking: false, statusMessage: '' });
      }
    },
    onThinkingDelta: (text) => useModalChatStore.setState((s) => ({ thinkingBuffer: s.thinkingBuffer + text })),
    onTextDelta: (text) => useModalChatStore.setState((s) => ({ streamBuffer: s.streamBuffer + text })),

    onDone: () => {
      const { conversation, _closeRequested } = useModalChatStore.getState();
      const closeFields = _closeRequested ? { isOpen: false, _closeRequested: false } : {};
      if (conversation) {
        window.novelEngine.chat.getMessages(conversation.id)
          .then((messages) => {
            useModalChatStore.setState({
              messages,
              isStreaming: false,
              isThinking: false,
              streamBuffer: '',
              thinkingBuffer: '',
              statusMessage: '',
              _activeCallId: null,
              ...closeFields,
            });
          })
          .catch((error) => {
            console.error('Failed to reload modal messages after done:', error);
            useModalChatStore.setState({
              isStreaming: false,
              isThinking: false,
              streamBuffer: '',
              thinkingBuffer: '',
              statusMessage: '',
              _activeCallId: null,
              ...closeFields,
            });
          });
      } else {
        useModalChatStore.setState({
          isStreaming: false,
          isThinking: false,
          streamBuffer: '',
          thinkingBuffer: '',
          statusMessage: '',
          _activeCallId: null,
          ...closeFields,
        });
      }
    },

    onError: (message) => {
      const { _closeRequested } = useModalChatStore.getState();
      const closeFields = _closeRequested ? { isOpen: false, _closeRequested: false } : {};
      useModalChatStore.setState((state) => {
        const errorMessage: Message = {
          id: 'error-' + Date.now(),
          role: 'assistant',
          content: `Error: ${message}`,
          thinking: '',
          conversationId: useModalChatStore.getState().conversation?.id ?? '',
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
          ...closeFields,
        };
      });
    },
        });
      }
      handler(event);
    };
  })(),

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
