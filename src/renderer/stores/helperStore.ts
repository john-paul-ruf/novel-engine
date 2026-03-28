import { create } from 'zustand';
import type { Conversation, Message, StreamEvent } from '@domain/types';
import { randomRespondingStatus } from '@domain/statusMessages';
import { createStreamHandler } from './streamHandler';

type HelperState = {
  // Visibility
  isOpen: boolean;

  // Conversation state
  conversation: Conversation | null;
  messages: Message[];
  isStreaming: boolean;
  isThinking: boolean;
  streamBuffer: string;
  thinkingBuffer: string;
  statusMessage: string;
  isLoading: boolean;

  // Actions
  toggle: () => void;
  open: () => Promise<void>;
  close: () => void;
  sendMessage: (content: string) => Promise<void>;
  abort: () => void;
  resetConversation: () => Promise<void>;

  // Call scoping
  _activeCallId: string | null;

  // Stream handling (internal)
  _handleStreamEvent: (event: StreamEvent) => void;
  _cleanupListener: (() => void) | null;
  initStreamListener: () => void;
  destroyStreamListener: () => void;
};

export const useHelperStore = create<HelperState>((set, get) => ({
  // Initial state
  isOpen: false,
  conversation: null,
  messages: [],
  isStreaming: false,
  isThinking: false,
  streamBuffer: '',
  thinkingBuffer: '',
  statusMessage: '',
  isLoading: false,
  _activeCallId: null,
  _cleanupListener: null,

  toggle: () => {
    const { isOpen, open, close } = get();
    if (isOpen) {
      close();
    } else {
      open();
    }
  },

  open: async () => {
    set({ isOpen: true, isLoading: true });
    try {
      const conversation = await window.novelEngine.helper.getOrCreateConversation();
      const messages = await window.novelEngine.helper.getMessages(conversation.id);
      set({ conversation, messages, isLoading: false });
    } catch (error) {
      console.error('Failed to open helper:', error);
      set({ isLoading: false });
    }
  },

  close: () => {
    const { isStreaming } = get();
    if (isStreaming) {
      // Don't close while streaming — will resolve when done
      return;
    }
    set({ isOpen: false });
  },

  sendMessage: async (content: string) => {
    const { conversation } = get();
    if (!conversation) return;

    const callId = crypto.randomUUID();
    const tempMessage: Message = {
      id: 'temp-' + Date.now(),
      role: 'user',
      content,
      thinking: '',
      conversationId: conversation.id,
      timestamp: new Date().toISOString(),
    };

    set((state) => ({
      messages: [...state.messages, tempMessage],
      isStreaming: true,
      streamBuffer: '',
      thinkingBuffer: '',
      statusMessage: randomRespondingStatus(),
      _activeCallId: callId,
    }));

    try {
      await window.novelEngine.helper.send({
        message: content,
        conversationId: conversation.id,
        callId,
      });
    } catch (error) {
      console.error('Failed to send helper message:', error);
      set((state) => ({
        messages: state.messages.filter(m => m.id !== tempMessage.id),
        isStreaming: false,
        isThinking: false,
        streamBuffer: '',
        thinkingBuffer: '',
        _activeCallId: null,
      }));
    }
  },

  abort: () => {
    const { conversation } = get();
    if (conversation) {
      window.novelEngine.helper.abort(conversation.id);
    }
  },

  resetConversation: async () => {
    try {
      await window.novelEngine.helper.reset();
      set({
        conversation: null,
        messages: [],
        isStreaming: false,
        isThinking: false,
        streamBuffer: '',
        thinkingBuffer: '',
        statusMessage: '',
        _activeCallId: null,
      });
    } catch (error) {
      console.error('Failed to reset helper conversation:', error);
    }
  },

  _handleStreamEvent: (() => {
    let handler: ((event: StreamEvent) => void) | null = null;
    return (event: StreamEvent) => {
      if (!handler) {
        handler = createStreamHandler({
          getActiveCallId: () => useHelperStore.getState()._activeCallId,
          getIsStreaming: () => useHelperStore.getState().isStreaming,
          getActiveConversationId: () => useHelperStore.getState().conversation?.id ?? null,
          alwaysCheckConversationId: true,

          onStatus: (message) => useHelperStore.setState({ statusMessage: message }),
          onBlockStart: (blockType) => {
            if (blockType === 'thinking') {
              useHelperStore.setState({ isThinking: true, statusMessage: '' });
            } else if (blockType === 'text') {
              useHelperStore.setState({ isThinking: false, statusMessage: '' });
            }
          },
          onThinkingDelta: (text) => useHelperStore.setState((s) => ({ thinkingBuffer: s.thinkingBuffer + text })),
          onTextDelta: (text) => useHelperStore.setState((s) => ({ streamBuffer: s.streamBuffer + text })),

          onDone: () => {
            const { conversation } = useHelperStore.getState();
            if (conversation) {
              window.novelEngine.helper.getMessages(conversation.id)
                .then((messages) => {
                  useHelperStore.setState({
                    messages,
                    isStreaming: false,
                    isThinking: false,
                    streamBuffer: '',
                    thinkingBuffer: '',
                    statusMessage: '',
                    _activeCallId: null,
                  });
                })
                .catch(() => {
                  useHelperStore.setState({
                    isStreaming: false,
                    isThinking: false,
                    streamBuffer: '',
                    thinkingBuffer: '',
                    statusMessage: '',
                    _activeCallId: null,
                  });
                });
            } else {
              useHelperStore.setState({
                isStreaming: false,
                isThinking: false,
                streamBuffer: '',
                thinkingBuffer: '',
                statusMessage: '',
                _activeCallId: null,
              });
            }
          },

          onError: (message) => {
            useHelperStore.setState((state) => ({
              messages: [...state.messages, {
                id: 'error-' + Date.now(),
                role: 'assistant' as const,
                content: `Error: ${message}`,
                thinking: '',
                conversationId: state.conversation?.id ?? '',
                timestamp: new Date().toISOString(),
              }],
              isStreaming: false,
              isThinking: false,
              streamBuffer: '',
              thinkingBuffer: '',
              statusMessage: '',
              _activeCallId: null,
            }));
          },
        });
      }
      handler(event);
    };
  })(),

  initStreamListener: () => {
    const { _cleanupListener, _handleStreamEvent } = get();
    if (_cleanupListener) _cleanupListener();
    const cleanup = window.novelEngine.chat.onStreamEvent(_handleStreamEvent);
    set({ _cleanupListener: cleanup });
  },

  destroyStreamListener: () => {
    const { _cleanupListener } = get();
    if (_cleanupListener) _cleanupListener();
    set({ _cleanupListener: null });
  },
}));
