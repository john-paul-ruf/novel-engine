import { create } from 'zustand';
import type { Conversation, Message, StreamEvent } from '@domain/types';
import { PITCH_ROOM_SLUG, randomRespondingStatus } from '@domain/constants';

type PitchRoomState = {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: Message[];
  isStreaming: boolean;
  isThinking: boolean;
  streamBuffer: string;
  thinkingBuffer: string;
  statusMessage: string;
  loading: boolean;

  // Actions
  loadConversations: () => Promise<void>;
  setActiveConversation: (conversationId: string) => Promise<void>;
  startNewConversation: () => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  ensureConversation: () => Promise<void>;
  sendMessage: (content: string, thinkingBudgetOverride?: number) => Promise<void>;

  _activeCallId: string | null;
  _handleStreamEvent: (event: StreamEvent) => void;
};

export const usePitchRoomStore = create<PitchRoomState>((set, get) => ({
  conversations: [],
  activeConversation: null,
  messages: [],
  isStreaming: false,
  isThinking: false,
  streamBuffer: '',
  thinkingBuffer: '',
  statusMessage: '',
  loading: false,
  _activeCallId: null,

  loadConversations: async () => {
    try {
      const conversations = await window.novelEngine.chat.getConversations(PITCH_ROOM_SLUG);
      const pitchConversations = conversations.filter((c) => c.purpose === 'pitch-room');
      set({ conversations: pitchConversations });
    } catch (error) {
      console.error('Failed to load pitch room conversations:', error);
    }
  },

  setActiveConversation: async (conversationId: string) => {
    try {
      const messages = await window.novelEngine.chat.getMessages(conversationId);
      const conversation = get().conversations.find((c) => c.id === conversationId) ?? null;
      set({ activeConversation: conversation, messages });
    } catch (error) {
      console.error('Failed to switch pitch room conversation:', error);
    }
  },

  startNewConversation: async () => {
    try {
      const conversation = await window.novelEngine.chat.createConversation({
        bookSlug: PITCH_ROOM_SLUG,
        agentName: 'Spark',
        pipelinePhase: null,
        purpose: 'pitch-room',
      });
      set((state) => ({
        conversations: [conversation, ...state.conversations],
        activeConversation: conversation,
        messages: [],
      }));
    } catch (error) {
      console.error('Failed to create new pitch room conversation:', error);
    }
  },

  deleteConversation: async (conversationId: string) => {
    try {
      await window.novelEngine.chat.deleteConversation(conversationId);
      const { activeConversation, conversations } = get();
      const wasActive = activeConversation?.id === conversationId;
      const remaining = conversations.filter((c) => c.id !== conversationId);

      if (wasActive) {
        // Switch to the next most recent, or clear
        if (remaining.length > 0) {
          const next = remaining[0];
          const messages = await window.novelEngine.chat.getMessages(next.id);
          set({ conversations: remaining, activeConversation: next, messages });
        } else {
          set({ conversations: remaining, activeConversation: null, messages: [] });
        }
      } else {
        set({ conversations: remaining });
      }
    } catch (error) {
      console.error('Failed to delete pitch room conversation:', error);
    }
  },

  ensureConversation: async () => {
    // If already loaded, skip
    if (get().activeConversation || get().loading) return;

    set({ loading: true });
    try {
      // Load all pitch-room conversations
      const allConversations = await window.novelEngine.chat.getConversations(PITCH_ROOM_SLUG);
      const pitchConversations = allConversations.filter((c) => c.purpose === 'pitch-room');

      if (pitchConversations.length > 0) {
        // Select the most recent
        const latest = pitchConversations[0];
        const messages = await window.novelEngine.chat.getMessages(latest.id);
        set({
          conversations: pitchConversations,
          activeConversation: latest,
          messages,
          loading: false,
        });
      } else {
        // Create the first pitch room conversation
        const conversation = await window.novelEngine.chat.createConversation({
          bookSlug: PITCH_ROOM_SLUG,
          agentName: 'Spark',
          pipelinePhase: null,
          purpose: 'pitch-room',
        });
        set({
          conversations: [conversation],
          activeConversation: conversation,
          messages: [],
          loading: false,
        });
      }
    } catch (error) {
      console.error('Failed to ensure pitch room conversation:', error);
      set({ loading: false });
    }
  },

  sendMessage: async (content: string, thinkingBudgetOverride?: number) => {
    const { activeConversation } = get();
    if (!activeConversation) return;

    const { id: conversationId, agentName } = activeConversation;

    const callId = crypto.randomUUID();

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
      _activeCallId: callId,
    }));

    try {
      await window.novelEngine.chat.send({
        agentName,
        message: content,
        conversationId,
        bookSlug: PITCH_ROOM_SLUG,
        thinkingBudgetOverride,
        callId,
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

  _handleStreamEvent: (event: StreamEvent) => {
    const enriched = event as StreamEvent & { callId?: string; conversationId?: string };
    const callId = enriched.callId;
    if (callId && callId.startsWith('rev:')) return;

    const { _activeCallId, activeConversation, isStreaming } = get();

    // Primary guard: callId matching — UUID per send, prevents cross-call bleed
    if (_activeCallId && callId && callId !== _activeCallId) return;

    // Secondary guard: when no call is active, reject stale events
    if (!_activeCallId) {
      if (!isStreaming) return;
      // Accept events only for the active conversation during recovery
      if (enriched.conversationId && activeConversation && enriched.conversationId !== activeConversation.id) return;
    }

    // Conversation scope: only process events belonging to our conversation
    if (enriched.conversationId && activeConversation && enriched.conversationId !== activeConversation.id) return;

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
          // Reload messages and refresh the conversation list (title may have updated)
          Promise.all([
            window.novelEngine.chat.getMessages(doneConversationId),
            window.novelEngine.chat.getConversations(PITCH_ROOM_SLUG),
          ]).then(([messages, allConversations]) => {
            const stillActive = get().activeConversation?.id === doneConversationId;
            if (!stillActive) return;

            const pitchConversations = allConversations.filter((c) => c.purpose === 'pitch-room');
            set({
              messages,
              conversations: pitchConversations,
              isStreaming: false,
              isThinking: false,
              streamBuffer: '',
              thinkingBuffer: '',
              statusMessage: '',
              _activeCallId: null,
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
                _activeCallId: null,
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
            _activeCallId: null,
          });
        }
        break;
      }

      // pitchOutcome is no longer emitted — pitch actions (make-book, shelve,
      // discard) are user-initiated only via the pitch room UI controls.

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
            _activeCallId: null,
          };
        });
        break;
    }
  },
}));
