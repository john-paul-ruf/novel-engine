import { create } from 'zustand';
import type { AgentName, Conversation, ConversationPurpose, Message, PipelinePhaseId, StreamEvent, UsageRecord } from '@domain/types';
import { useBookStore } from './bookStore';

type ChatState = {
  activeConversation: Conversation | null;
  conversations: Conversation[];
  messages: Message[];
  isStreaming: boolean;
  isThinking: boolean;
  streamBuffer: string;
  thinkingBuffer: string;
  conversationUsage: UsageRecord[] | null;

  loadConversations: (bookSlug: string) => Promise<void>;
  createConversation: (agentName: AgentName, bookSlug: string, phase: PipelinePhaseId | null, purpose?: ConversationPurpose) => Promise<void>;
  setActiveConversation: (conversationId: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;

  _handleStreamEvent: (event: StreamEvent) => void;
  _cleanupListener: (() => void) | null;
  initStreamListener: () => void;
  destroyStreamListener: () => void;
};

export const useChatStore = create<ChatState>((set, get) => ({
  activeConversation: null,
  conversations: [],
  messages: [],
  isStreaming: false,
  isThinking: false,
  streamBuffer: '',
  thinkingBuffer: '',
  conversationUsage: null,
  _cleanupListener: null,

  loadConversations: async (bookSlug: string) => {
    try {
      const conversations = await window.novelEngine.chat.getConversations(bookSlug);
      set({ conversations });
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  },

  createConversation: async (agentName: AgentName, bookSlug: string, phase: PipelinePhaseId | null, purpose: ConversationPurpose = 'pipeline') => {
    try {
      const conversation = await window.novelEngine.chat.createConversation({
        bookSlug,
        agentName,
        pipelinePhase: phase,
        purpose,
      });
      set((state) => ({
        activeConversation: conversation,
        conversations: [conversation, ...state.conversations],
        messages: [],
      }));
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  },

  setActiveConversation: async (conversationId: string) => {
    try {
      const [messages, usage] = await Promise.all([
        window.novelEngine.chat.getMessages(conversationId),
        window.novelEngine.usage.byConversation(conversationId),
      ]);
      const { conversations } = get();
      const conversation = conversations.find((c) => c.id === conversationId) ?? null;
      set({ activeConversation: conversation, messages, conversationUsage: usage });
    } catch (error) {
      console.error('Failed to set active conversation:', error);
    }
  },

  sendMessage: async (content: string) => {
    const { activeConversation } = get();
    if (!activeConversation) return;

    const bookSlug = useBookStore.getState().activeSlug;
    const { id: conversationId, agentName } = activeConversation;

    // Optimistic update: add user message immediately
    const tempMessage: Message = {
      id: 'temp-' + Date.now(),
      role: 'user',
      content,
      thinking: '',
      conversationId,
      timestamp: new Date().toISOString(),
    };

    set((state) => ({
      messages: [...state.messages, tempMessage],
      isStreaming: true,
      streamBuffer: '',
      thinkingBuffer: '',
    }));

    try {
      await window.novelEngine.chat.send({
        agentName,
        message: content,
        conversationId,
        bookSlug,
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage: Message = {
        id: 'error-' + Date.now(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to send message'}`,
        thinking: '',
        conversationId,
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

  deleteConversation: async (conversationId: string) => {
    try {
      await window.novelEngine.chat.deleteConversation(conversationId);
      const { activeConversation } = get();
      set((state) => ({
        conversations: state.conversations.filter((c) => c.id !== conversationId),
        activeConversation: activeConversation?.id === conversationId ? null : activeConversation,
        messages: activeConversation?.id === conversationId ? [] : state.messages,
      }));
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  },

  _handleStreamEvent: (event: StreamEvent) => {
    const { activeConversation } = get();

    switch (event.type) {
      case 'blockStart':
        if (event.blockType === 'thinking') {
          set({ isThinking: true, isStreaming: true });
        } else if (event.blockType === 'text') {
          set({ isThinking: false });
        }
        break;

      case 'thinkingDelta':
        set((state) => ({ thinkingBuffer: state.thinkingBuffer + event.text }));
        break;

      case 'textDelta':
        set((state) => ({ streamBuffer: state.streamBuffer + event.text }));
        break;

      case 'blockEnd':
        // No-op: transitions handled by blockStart
        break;

      case 'done':
        if (activeConversation) {
          Promise.all([
            window.novelEngine.chat.getMessages(activeConversation.id),
            window.novelEngine.usage.byConversation(activeConversation.id),
          ]).then(([messages, usage]) => {
            set({
              messages,
              conversationUsage: usage,
              isStreaming: false,
              isThinking: false,
              streamBuffer: '',
              thinkingBuffer: '',
            });
          }).catch((error) => {
            console.error('Failed to reload messages after done:', error);
            set({
              isStreaming: false,
              isThinking: false,
              streamBuffer: '',
              thinkingBuffer: '',
            });
          });
        } else {
          set({
            isStreaming: false,
            isThinking: false,
            streamBuffer: '',
            thinkingBuffer: '',
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
            conversationId: activeConversation?.id ?? '',
            timestamp: new Date().toISOString(),
          };
          return {
            messages: [...state.messages, errorMessage],
            isStreaming: false,
            isThinking: false,
            streamBuffer: '',
            thinkingBuffer: '',
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
      set({ _cleanupListener: null });
    }
  },
}));
