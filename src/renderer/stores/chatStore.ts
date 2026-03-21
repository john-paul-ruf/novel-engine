import { create } from 'zustand';
import type { AgentName, Conversation, ConversationPurpose, Message, PipelinePhase, PipelinePhaseId, StreamEvent, UsageRecord } from '@domain/types';
import { randomRespondingStatus } from '@domain/constants';
import { useBookStore } from './bookStore';
import { useFileChangeStore } from './fileChangeStore';
import { usePipelineStore } from './pipelineStore';
import { useViewStore } from './viewStore';
import { streamRouter } from './streamRouter';

type ChatState = {
  activeConversation: Conversation | null;
  conversations: Conversation[];
  messages: Message[];
  isStreaming: boolean;
  isThinking: boolean;
  streamBuffer: string;
  thinkingBuffer: string;
  statusMessage: string;
  conversationUsage: UsageRecord[] | null;

  // Tool activity tracking
  toolActivity: string[];                     // file paths written during current streaming response
  lastChangedFiles: string[];                 // files changed in the last completed interaction
  messageToolActivity: Record<string, string[]>;  // maps message IDs to files written during generation

  // Pipeline lock state
  pipelineLocked: boolean;
  lockedAgentName: AgentName | null;
  lockedPhaseId: PipelinePhaseId | null;

  loadConversations: (bookSlug: string) => Promise<void>;
  createConversation: (agentName: AgentName, bookSlug: string, phase: PipelinePhaseId | null, purpose?: ConversationPurpose) => Promise<void>;
  setActiveConversation: (conversationId: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;

  // Pipeline lock actions
  setPipelineLock: (locked: boolean) => void;
  syncWithPipeline: (activePhase: PipelinePhase | null) => void;
  switchBook: (newBookSlug: string) => Promise<void>;

  _handleStreamEvent: (event: StreamEvent) => void;
  _cleanupListener: (() => void) | null;
  _cleanupFilesChanged: (() => void) | null;
  initStreamListener: () => void;
  destroyStreamListener: () => void;
  recoverActiveStream: () => Promise<void>;
};

export const useChatStore = create<ChatState>((set, get) => ({
  activeConversation: null,
  conversations: [],
  messages: [],
  isStreaming: false,
  isThinking: false,
  streamBuffer: '',
  thinkingBuffer: '',
  statusMessage: '',
  conversationUsage: null,
  toolActivity: [],
  lastChangedFiles: [],
  messageToolActivity: {},
  pipelineLocked: true,
  lockedAgentName: null,
  lockedPhaseId: null,
  _cleanupListener: null,
  _cleanupFilesChanged: null,

  loadConversations: async (bookSlug: string) => {
    try {
      const conversations = await window.novelEngine.chat.getConversations(bookSlug);
      set({ conversations });

      // Restore previously active conversation from localStorage
      const savedId = localStorage.getItem('novel-engine-active-conversation');
      if (savedId && conversations.some((c) => c.id === savedId)) {
        get().setActiveConversation(savedId);
      }
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

      // Persist active conversation so it survives refresh
      localStorage.setItem('novel-engine-active-conversation', conversation.id);
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

      // Persist active conversation so it survives refresh
      localStorage.setItem('novel-engine-active-conversation', conversationId);
    } catch (error) {
      console.error('Failed to set active conversation:', error);
    }
  },

  sendMessage: async (content: string) => {
    const { activeConversation } = get();
    if (!activeConversation) return;

    const bookSlug = useBookStore.getState().activeSlug;
    const { id: conversationId, agentName } = activeConversation;

    // Ensure stream events are routed to the main chat store
    streamRouter.target = 'main';

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
      toolActivity: [],
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
        toolActivity: [],
      }));
    }
  },

  deleteConversation: async (conversationId: string) => {
    try {
      await window.novelEngine.chat.deleteConversation(conversationId);
      const { activeConversation } = get();
      const wasActive = activeConversation?.id === conversationId;
      set((state) => ({
        conversations: state.conversations.filter((c) => c.id !== conversationId),
        activeConversation: wasActive ? null : activeConversation,
        messages: wasActive ? [] : state.messages,
      }));

      // Clear persisted conversation if we just deleted the active one
      if (wasActive) {
        localStorage.removeItem('novel-engine-active-conversation');
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  },

  setPipelineLock: (locked: boolean) => {
    set({ pipelineLocked: locked });
  },

  syncWithPipeline: (activePhase: PipelinePhase | null) => {
    const lockedAgentName = activePhase?.agent ?? null;
    const lockedPhaseId = activePhase?.id ?? null;

    set({ lockedAgentName, lockedPhaseId });

    const { pipelineLocked, activeConversation, conversations } = get();

    // If locked and current conversation doesn't match the active phase, auto-switch
    if (pipelineLocked && lockedAgentName && lockedPhaseId) {
      const currentMatchesPhase =
        activeConversation?.agentName === lockedAgentName &&
        activeConversation?.pipelinePhase === lockedPhaseId &&
        activeConversation?.purpose === 'pipeline';

      if (!currentMatchesPhase) {
        // Find the most recent conversation for this agent + phase
        const match = conversations.find(
          (c) =>
            c.agentName === lockedAgentName &&
            c.pipelinePhase === lockedPhaseId &&
            c.purpose === 'pipeline',
        );
        if (match) {
          get().setActiveConversation(match.id);
        } else {
          // No existing conversation — clear active so the empty state shows
          set({ activeConversation: null, messages: [] });
        }
      }
    }
  },

  switchBook: async (newBookSlug: string) => {
    // Clear persisted conversation — it belongs to the old book
    localStorage.removeItem('novel-engine-active-conversation');

    // Step 1: Navigate to the chat view so the user lands on the conversation
    // regardless of which view they were on (wrangler loading, files, build, etc.)
    useViewStore.getState().navigate('chat');

    // Step 2: Clear all chat state immediately
    set({
      activeConversation: null,
      conversations: [],
      messages: [],
      isStreaming: false,
      isThinking: false,
      streamBuffer: '',
      thinkingBuffer: '',
      conversationUsage: null,
      toolActivity: [],
      lastChangedFiles: [],
      messageToolActivity: {},
    });

    // Step 3: Load conversations for the new book and activate the latest one
    try {
      const conversations = await window.novelEngine.chat.getConversations(newBookSlug);
      set({ conversations });

      // Auto-select the most recent conversation (list is sorted newest-first)
      if (conversations.length > 0) {
        await get().setActiveConversation(conversations[0].id);
      }
    } catch (error) {
      console.error('Failed to load conversations for new book:', error);
    }
  },

  _handleStreamEvent: (event: StreamEvent) => {
    if (streamRouter.target !== 'main') return;

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
        // No-op: transitions handled by blockStart
        break;

      case 'toolUse':
        if (event.tool.status === 'complete' && event.tool.filePath) {
          set((state) => ({
            toolActivity: [...state.toolActivity, event.tool.filePath!],
          }));
        }
        break;

      case 'filesChanged':
        set({ lastChangedFiles: event.paths });
        break;

      case 'done': {
        const doneConversationId = activeConversation?.id ?? null;

        if (doneConversationId) {
          const currentToolActivity = get().toolActivity;

          Promise.all([
            window.novelEngine.chat.getMessages(doneConversationId),
            window.novelEngine.usage.byConversation(doneConversationId),
          ]).then(([messages, usage]) => {
            // Guard: only update if the user hasn't navigated away
            const stillActive = get().activeConversation?.id === doneConversationId;
            if (!stillActive) return;

            // Associate tool activity with the last assistant message
            const lastAssistantMessage = messages.filter((m) => m.role === 'assistant').pop();
            const updatedToolActivity: Record<string, string[]> = {};
            if (lastAssistantMessage && currentToolActivity.length > 0) {
              updatedToolActivity[lastAssistantMessage.id] = currentToolActivity;
            }

            set((state) => ({
              messages,
              conversationUsage: usage,
              isStreaming: false,
              isThinking: false,
              streamBuffer: '',
              thinkingBuffer: '',
              statusMessage: '',
              messageToolActivity: {
                ...state.messageToolActivity,
                ...updatedToolActivity,
              },
              toolActivity: [],
              lastChangedFiles: [],
            }));
          }).catch((error) => {
            console.error('Failed to reload messages after done:', error);
            // Only clear streaming state if still on the same conversation
            if (get().activeConversation?.id === doneConversationId) {
              set({
                isStreaming: false,
                isThinking: false,
                streamBuffer: '',
                thinkingBuffer: '',
                statusMessage: '',
                toolActivity: [],
                lastChangedFiles: [],
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
            toolActivity: [],
            lastChangedFiles: [],
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
            toolActivity: [],
          };
        });
        break;
    }
  },

  initStreamListener: () => {
    const { _cleanupListener, _cleanupFilesChanged, _handleStreamEvent } = get();
    if (_cleanupListener) {
      _cleanupListener();
    }
    if (_cleanupFilesChanged) {
      _cleanupFilesChanged();
    }

    const cleanup = window.novelEngine.chat.onStreamEvent(_handleStreamEvent);

    // Register listener for file change notifications — triggers pipeline + file UI refresh.
    // The event now carries the bookSlug of the book whose files changed, so we
    // refresh the correct book's pipeline rather than always using activeSlug.
    const cleanupFilesChanged = window.novelEngine.chat.onFilesChanged((_paths, changedBookSlug) => {
      const { activeSlug } = useBookStore.getState();

      // Refresh the pipeline for the book whose files actually changed.
      // This silently updates the cache if it's a background book, or
      // updates the displayed pipeline if it's the active book.
      const targetSlug = changedBookSlug || activeSlug;
      if (targetSlug) {
        usePipelineStore.getState().loadPipeline(targetSlug);
      }

      // Only bump file-change revision and word count if the active book changed.
      // This prevents the Files view and word counter from flashing for the wrong book.
      if (activeSlug && (!changedBookSlug || changedBookSlug === activeSlug)) {
        useFileChangeStore.getState().notifyChange();
        useBookStore.getState().refreshWordCount();
      }
    });

    set({ _cleanupListener: cleanup, _cleanupFilesChanged: cleanupFilesChanged });
  },

  destroyStreamListener: () => {
    const { _cleanupListener, _cleanupFilesChanged } = get();
    if (_cleanupListener) {
      _cleanupListener();
    }
    if (_cleanupFilesChanged) {
      _cleanupFilesChanged();
    }
    set({ _cleanupListener: null, _cleanupFilesChanged: null });
  },

  /**
   * Check the main process for an in-flight CLI stream and restore
   * streaming UI state so the user sees the active request after refresh.
   */
  recoverActiveStream: async () => {
    try {
      const active = await window.novelEngine.chat.getActiveStream();
      if (!active) return;

      // The main process has an active stream — restore the streaming UI.
      // Load the conversation and its messages so the user sees context.
      const conversations = get().conversations;
      const conversation = conversations.find((c) => c.id === active.conversationId) ?? null;

      if (conversation) {
        const messages = await window.novelEngine.chat.getMessages(active.conversationId);
        set({
          activeConversation: conversation,
          messages,
          isStreaming: true,
          streamBuffer: '',
          thinkingBuffer: '',
          statusMessage: randomRespondingStatus(),
        });
      } else {
        // Conversation not in the loaded list (e.g. different book) — just flag streaming
        set({
          isStreaming: true,
          streamBuffer: '',
          thinkingBuffer: '',
          statusMessage: randomRespondingStatus(),
        });
      }
    } catch (error) {
      console.error('Failed to recover active stream:', error);
    }
  },
}));
