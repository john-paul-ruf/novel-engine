import { create } from 'zustand';
import type { Conversation, Message, StreamEvent, PitchOutcome } from '@domain/types';
import { PITCH_ROOM_SLUG, randomRespondingStatus } from '@domain/constants';
import { streamRouter } from './streamRouter';

type PitchRoomState = {
  activeConversation: Conversation | null;
  messages: Message[];
  isStreaming: boolean;
  isThinking: boolean;
  streamBuffer: string;
  thinkingBuffer: string;
  statusMessage: string;
  loading: boolean;

  // Outcome state — set when Spark signals a pitch action
  lastOutcome: { action: PitchOutcome; bookSlug?: string; title?: string } | null;

  // Actions
  ensureConversation: () => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  clearOutcome: () => void;

  _handleStreamEvent: (event: StreamEvent) => void;
};

export const usePitchRoomStore = create<PitchRoomState>((set, get) => ({
  activeConversation: null,
  messages: [],
  isStreaming: false,
  isThinking: false,
  streamBuffer: '',
  thinkingBuffer: '',
  statusMessage: '',
  loading: false,
  lastOutcome: null,

  ensureConversation: async () => {
    // If already loaded, skip
    if (get().activeConversation || get().loading) return;

    set({ loading: true });
    try {
      // Look for an existing pitch-room conversation
      const conversations = await window.novelEngine.chat.getConversations(PITCH_ROOM_SLUG);
      const pitchConv = conversations.find((c) => c.purpose === 'pitch-room');

      if (pitchConv) {
        const messages = await window.novelEngine.chat.getMessages(pitchConv.id);
        set({ activeConversation: pitchConv, messages, loading: false });
      } else {
        // Create one — this is the single pitch room conversation
        const conversation = await window.novelEngine.chat.createConversation({
          bookSlug: PITCH_ROOM_SLUG,
          agentName: 'Spark',
          pipelinePhase: null,
          purpose: 'pitch-room',
        });
        set({ activeConversation: conversation, messages: [], loading: false });
      }
    } catch (error) {
      console.error('Failed to ensure pitch room conversation:', error);
      set({ loading: false });
    }
  },

  sendMessage: async (content: string) => {
    const { activeConversation } = get();
    if (!activeConversation) return;

    const { id: conversationId, agentName } = activeConversation;

    // Route stream events to the pitch room store
    streamRouter.target = 'pitch-room';

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
      statusMessage: randomRespondingStatus(),
    }));

    try {
      await window.novelEngine.chat.send({
        agentName,
        message: content,
        conversationId,
        bookSlug: PITCH_ROOM_SLUG,
      });
    } catch (error) {
      console.error('Failed to send pitch room message:', error);
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

  clearOutcome: () => {
    set({ lastOutcome: null });
  },

  _handleStreamEvent: (event: StreamEvent) => {
    if (streamRouter.target !== 'pitch-room') return;

    const { activeConversation } = get();

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

      case 'done': {
        const doneConversationId = activeConversation?.id ?? null;

        if (doneConversationId) {
          window.novelEngine.chat.getMessages(doneConversationId).then((messages) => {
            const stillActive = get().activeConversation?.id === doneConversationId;
            if (!stillActive) return;

            set({
              messages,
              isStreaming: false,
              isThinking: false,
              streamBuffer: '',
              thinkingBuffer: '',
              statusMessage: '',
            });
          }).catch((error) => {
            console.error('Failed to reload messages after done:', error);
            if (get().activeConversation?.id === doneConversationId) {
              set({
                isStreaming: false,
                isThinking: false,
                streamBuffer: '',
                thinkingBuffer: '',
                statusMessage: '',
              });
            }
          });
        } else {
          set({
            isStreaming: false,
            isThinking: false,
            streamBuffer: '',
            thinkingBuffer: '',
            statusMessage: '',
          });
        }
        break;
      }

      case 'pitchOutcome': {
        // Spark signaled a pitch action — the backend already executed it.
        // Store the outcome so the PitchRoomView can react (navigate, toast, etc.)
        set({
          lastOutcome: {
            action: event.action,
            bookSlug: event.bookSlug,
            title: event.title,
          },
          // Clear the conversation state — the draft/conversation was cleaned up
          activeConversation: null,
          messages: [],
        });
        break;
      }

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
            statusMessage: '',
          };
        });
        break;
    }
  },
}));
