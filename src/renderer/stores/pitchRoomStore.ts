import { create } from 'zustand';
import type { PitchDraft, Conversation, Message, StreamEvent, BookMeta, ShelvedPitchMeta } from '@domain/types';
import { PITCH_ROOM_SLUG, randomRespondingStatus } from '@domain/constants';
import { streamRouter } from './streamRouter';
import { useBookStore } from './bookStore';
import { useViewStore } from './viewStore';

type PitchRoomState = {
  drafts: PitchDraft[];
  activeConversation: Conversation | null;
  messages: Message[];
  isStreaming: boolean;
  isThinking: boolean;
  streamBuffer: string;
  thinkingBuffer: string;
  statusMessage: string;
  loading: boolean;

  // Actions
  loadDrafts: () => Promise<void>;
  startNewPitch: () => Promise<void>;
  selectDraft: (conversationId: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  promoteToBook: (conversationId: string) => Promise<BookMeta>;
  shelveDraft: (conversationId: string, logline?: string) => Promise<ShelvedPitchMeta>;
  discardDraft: (conversationId: string) => Promise<void>;
  refreshDrafts: () => Promise<void>;

  _handleStreamEvent: (event: StreamEvent) => void;
};

export const usePitchRoomStore = create<PitchRoomState>((set, get) => ({
  drafts: [],
  activeConversation: null,
  messages: [],
  isStreaming: false,
  isThinking: false,
  streamBuffer: '',
  thinkingBuffer: '',
  statusMessage: '',
  loading: false,

  loadDrafts: async () => {
    set({ loading: true });
    try {
      const [drafts, conversations] = await Promise.all([
        window.novelEngine.pitchRoom.listDrafts(),
        window.novelEngine.chat.getConversations(PITCH_ROOM_SLUG),
      ]);

      // Merge conversation data with draft data — a conversation may exist
      // without a draft folder (if Spark hasn't written any files yet)
      const draftMap = new Map(drafts.map((d) => [d.conversationId, d]));
      const mergedDrafts: PitchDraft[] = [];

      for (const conv of conversations) {
        if (conv.purpose !== 'pitch-room') continue;
        const existing = draftMap.get(conv.id);
        mergedDrafts.push({
          conversationId: conv.id,
          title: existing?.title || conv.title || 'Untitled Draft',
          hasPitch: existing?.hasPitch ?? false,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
        });
      }

      set({ drafts: mergedDrafts, loading: false });
    } catch (error) {
      console.error('Failed to load pitch drafts:', error);
      set({ loading: false });
    }
  },

  startNewPitch: async () => {
    try {
      const conversation = await window.novelEngine.chat.createConversation({
        bookSlug: PITCH_ROOM_SLUG,
        agentName: 'Spark',
        pipelinePhase: null,
        purpose: 'pitch-room',
      });

      set((state) => ({
        activeConversation: conversation,
        messages: [],
        drafts: [
          {
            conversationId: conversation.id,
            title: 'Untitled Draft',
            hasPitch: false,
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt,
          },
          ...state.drafts,
        ],
      }));
    } catch (error) {
      console.error('Failed to start new pitch:', error);
    }
  },

  selectDraft: async (conversationId: string) => {
    try {
      const messages = await window.novelEngine.chat.getMessages(conversationId);
      const conversations = await window.novelEngine.chat.getConversations(PITCH_ROOM_SLUG);
      const conversation = conversations.find((c) => c.id === conversationId) ?? null;

      set({
        activeConversation: conversation,
        messages,
        streamBuffer: '',
        thinkingBuffer: '',
        isStreaming: false,
        isThinking: false,
        statusMessage: '',
      });
    } catch (error) {
      console.error('Failed to select draft:', error);
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

  promoteToBook: async (conversationId: string) => {
    const meta = await window.novelEngine.pitchRoom.promote(conversationId);

    // Switch to the new book
    await useBookStore.getState().setActiveBook(meta.slug);
    useViewStore.getState().navigate('chat');

    // Remove draft from local state
    set((state) => ({
      drafts: state.drafts.filter((d) => d.conversationId !== conversationId),
      activeConversation: state.activeConversation?.id === conversationId ? null : state.activeConversation,
      messages: state.activeConversation?.id === conversationId ? [] : state.messages,
    }));

    return meta;
  },

  shelveDraft: async (conversationId: string, logline?: string) => {
    const meta = await window.novelEngine.pitchRoom.shelve(conversationId, logline);

    // Remove draft from local state
    set((state) => ({
      drafts: state.drafts.filter((d) => d.conversationId !== conversationId),
      activeConversation: state.activeConversation?.id === conversationId ? null : state.activeConversation,
      messages: state.activeConversation?.id === conversationId ? [] : state.messages,
    }));

    return meta;
  },

  discardDraft: async (conversationId: string) => {
    await window.novelEngine.pitchRoom.discard(conversationId);

    set((state) => {
      const remaining = state.drafts.filter((d) => d.conversationId !== conversationId);
      const wasActive = state.activeConversation?.id === conversationId;

      return {
        drafts: remaining,
        activeConversation: wasActive ? null : state.activeConversation,
        messages: wasActive ? [] : state.messages,
      };
    });
  },

  refreshDrafts: async () => {
    await get().loadDrafts();
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

            // Refresh drafts to pick up any newly written pitch.md
            get().refreshDrafts();
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
