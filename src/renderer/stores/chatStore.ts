import { create } from 'zustand';
import type { AgentName, Conversation, ConversationPurpose, Message, PipelinePhaseId, ProgressStage, StreamEvent, StreamSessionRecord, TimestampedToolUse, UsageRecord } from '@domain/types';
import { randomRespondingStatus } from '@domain/statusMessages';
import { createStreamHandler } from './streamHandler';
import { useBookStore } from './bookStore';
import { useFileChangeStore } from './fileChangeStore';
import { usePipelineStore } from './pipelineStore';
import { useAutoDraftStore } from './autoDraftStore';

// ── Per-book conversation persistence ────────────────────────────────────────
// Each book remembers which conversation was last active, so switching back
// restores the exact conversation — not just "most recent."

function saveBookConversation(bookSlug: string, conversationId: string): void {
  localStorage.setItem(`novel-engine-convo:${bookSlug}`, conversationId);
}

function loadBookConversation(bookSlug: string): string | null {
  return localStorage.getItem(`novel-engine-convo:${bookSlug}`);
}

function clearBookConversation(bookSlug: string): void {
  localStorage.removeItem(`novel-engine-convo:${bookSlug}`);
}

/**
 * Module-level timer for the recovery poll.
 * After a renderer refresh, we poll the main process every 2s to detect
 * when the active CLI stream finishes (in case the `done` event was missed
 * during the brief reload gap). Cleared on `done` or when polling detects
 * the stream has ended.
 */
let _recoveryPollTimer: ReturnType<typeof setInterval> | null = null;

function clearRecoveryPoll(): void {
  if (_recoveryPollTimer) {
    clearInterval(_recoveryPollTimer);
    _recoveryPollTimer = null;
  }
}

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

  // New tracking fields
  progressStage: ProgressStage;
  thinkingSummary: string;
  toolTimings: TimestampedToolUse[];

  // Orphan recovery
  interruptedSession: StreamSessionRecord | null;
  dismissInterrupted: () => void;

  // Call scoping — prevents cross-book stream bleed
  _activeCallId: string | null;
  // Discriminator: 'self' = user-initiated via chat input, 'external' = background (auto-draft, revision, hot take)
  _streamOrigin: 'self' | 'external' | null;

  loadConversations: (bookSlug: string) => Promise<void>;
  createConversation: (agentName: AgentName, bookSlug: string, phase: PipelinePhaseId | null, purpose?: ConversationPurpose) => Promise<void>;
  setActiveConversation: (conversationId: string) => Promise<void>;
  sendMessage: (content: string, thinkingBudgetOverride?: number) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;

  // External stream attachment (used by auto-draft, revision queue, etc.)
  attachToExternalStream: (callId: string, conversationId: string, optimisticContent?: string) => void;

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
  progressStage: 'idle',
  thinkingSummary: '',
  toolTimings: [],
  interruptedSession: null,
  _activeCallId: null,
  _streamOrigin: null,
  _cleanupListener: null,
  _cleanupFilesChanged: null,

  loadConversations: async (bookSlug: string) => {
    try {
      const conversations = await window.novelEngine.chat.getConversations(bookSlug);
      set({ conversations });

      // Restore previously active conversation from per-book localStorage
      const savedId = loadBookConversation(bookSlug);
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

      // Persist active conversation so it survives refresh (per-book key)
      const currentSlug = useBookStore.getState().activeSlug;
      if (currentSlug) {
        saveBookConversation(currentSlug, conversation.id);
      }
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

      // Persist active conversation so it survives refresh (per-book key)
      const currentSlug = useBookStore.getState().activeSlug;
      if (currentSlug) {
        saveBookConversation(currentSlug, conversationId);
      }
    } catch (error) {
      console.error('Failed to set active conversation:', error);
    }
  },

  sendMessage: async (content: string, thinkingBudgetOverride?: number) => {
    const { activeConversation } = get();
    if (!activeConversation) return;

    const bookSlug = useBookStore.getState().activeSlug;
    const { id: conversationId, agentName } = activeConversation;

    // Generate a unique callId so we only process events from THIS call,
    // preventing cross-book stream bleed when multiple chats run concurrently.
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
      toolActivity: [],
      _activeCallId: callId,
      _streamOrigin: 'self',
    }));

    try {
      await window.novelEngine.chat.send({
        agentName,
        message: content,
        conversationId,
        bookSlug,
        thinkingBudgetOverride,
        callId,
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
        messages: [...state.messages.filter(m => m.id !== tempMessage.id), errorMessage],
        isStreaming: false,
        isThinking: false,
        streamBuffer: '',
        thinkingBuffer: '',
        toolActivity: [],
        _activeCallId: null,
        _streamOrigin: null,
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
        const currentSlug = useBookStore.getState().activeSlug;
        if (currentSlug) {
          clearBookConversation(currentSlug);
        }
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  },

  dismissInterrupted: () => set({ interruptedSession: null }),

  attachToExternalStream: (callId: string, conversationId: string, optimisticContent?: string) => {
    set((state) => ({
      isStreaming: true,
      isThinking: false,
      streamBuffer: '',
      thinkingBuffer: '',
      statusMessage: randomRespondingStatus(),
      toolActivity: [],
      progressStage: 'idle' as ProgressStage,
      thinkingSummary: '',
      toolTimings: [],
      _activeCallId: callId,
      _streamOrigin: 'external',
      ...(optimisticContent
        ? {
            messages: [
              ...state.messages,
              {
                id: 'ext-' + Date.now(),
                role: 'user' as const,
                content: optimisticContent,
                thinking: '',
                conversationId,
                timestamp: new Date().toISOString(),
              },
            ],
          }
        : {}),
    }));
  },

  switchBook: async (newBookSlug: string) => {
    const { activeConversation } = get();

    // Step 1: Save the departing book's active conversation (per-book key)
    const departingSlug = useBookStore.getState().activeSlug;
    if (departingSlug && activeConversation) {
      saveBookConversation(departingSlug, activeConversation.id);
    }

    // Do NOT abort any streams. The CLI calls continue on the main process.
    // When the user switches back, we recover them visually.

    // Step 2: Clear renderer chat state (but don't kill the main process stream)
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
      progressStage: 'idle',
      thinkingSummary: '',
      toolTimings: [],
      interruptedSession: null,
      _activeCallId: null,
      _streamOrigin: null,
    });

    // Step 3: Load conversations for the new book
    try {
      const conversations = await window.novelEngine.chat.getConversations(newBookSlug);
      set({ conversations });

      // Restore previously active conversation for this book
      const savedId = loadBookConversation(newBookSlug);
      if (savedId && conversations.some((c) => c.id === savedId)) {
        await get().setActiveConversation(savedId);
      } else if (conversations.length > 0) {
        // Fallback: select most recent
        await get().setActiveConversation(conversations[0].id);
      }
    } catch (error) {
      console.error('Failed to load conversations for new book:', error);
    }

    // Step 4: Recover any in-flight CLI stream for the new book
    try {
      const active = await window.novelEngine.chat.getActiveStreamForBook(newBookSlug);
      if (active) {
        const conversation = get().conversations.find(
          (c) => c.id === active.conversationId
        ) ?? null;
        if (conversation) {
          const messages = await window.novelEngine.chat.getMessages(active.conversationId);
          set({
            activeConversation: conversation,
            messages,
            isStreaming: true,
            isThinking: (active.thinkingBuffer ?? '').length > 0 && !(active.textBuffer ?? ''),
            streamBuffer: active.textBuffer ?? '',
            thinkingBuffer: active.thinkingBuffer ?? '',
            statusMessage: randomRespondingStatus(),
            progressStage: active.progressStage ?? 'idle',
            _activeCallId: active.callId || null,
          });
          saveBookConversation(newBookSlug, active.conversationId);

          // If this book has a running auto-draft, mark the stream as external
          // so it isn't misidentified as user-initiated.
          const autoDraftSession = useAutoDraftStore.getState().sessions[newBookSlug];
          if (autoDraftSession?.isRunning) {
            set({ _streamOrigin: 'external' });
          }
        }
      }
    } catch (error) {
      console.error('Failed to recover active stream for book:', error);
    }
  },

  _handleStreamEvent: (() => {
    let handler: ((event: StreamEvent) => void) | null = null;
    return (event: StreamEvent) => {
      if (!handler) {
        handler = createStreamHandler({
    getActiveCallId: () => useChatStore.getState()._activeCallId,
    getIsStreaming: () => useChatStore.getState().isStreaming,
    getActiveConversationId: () => useChatStore.getState().activeConversation?.id ?? null,
    // chatStore intentionally skips conversationId guard in main path —
    // the user may switch conversations mid-stream, lifecycle events
    // must still be processed. The callId guard is sufficient.
    alwaysCheckConversationId: false,

    onStatus: (message) => useChatStore.setState({ statusMessage: message }),
    onBlockStart: (blockType) => {
      if (blockType === 'thinking') {
        useChatStore.setState({ isThinking: true, isStreaming: true, statusMessage: '' });
      } else if (blockType === 'text') {
        useChatStore.setState({ isThinking: false, statusMessage: '' });
      }
    },
    onThinkingDelta: (text) => useChatStore.setState((s) => ({ thinkingBuffer: s.thinkingBuffer + text })),
    onTextDelta: (text) => useChatStore.setState((s) => ({ streamBuffer: s.streamBuffer + text })),

    onToolUse: (tool) => {
      if (tool.status === 'complete' && tool.filePath) {
        useChatStore.setState((s) => ({ toolActivity: [...s.toolActivity, tool.filePath!] }));
      }
    },
    onProgressStage: (stage) => useChatStore.setState({ progressStage: stage }),
    onThinkingSummary: (summary) => useChatStore.setState({ thinkingSummary: summary.text }),
    onToolDuration: (tool) => useChatStore.setState((s) => ({ toolTimings: [...s.toolTimings, tool] })),
    onFilesChanged: (paths) => useChatStore.setState({ lastChangedFiles: paths }),

    onDone: () => {
      clearRecoveryPoll();
      const { activeConversation, toolActivity } = useChatStore.getState();
      const doneConversationId = activeConversation?.id ?? null;

      if (doneConversationId) {
        const currentToolActivity = toolActivity;

        Promise.all([
          window.novelEngine.chat.getMessages(doneConversationId),
          window.novelEngine.usage.byConversation(doneConversationId),
        ]).then(([messages, usage]) => {
          const stillActive = useChatStore.getState().activeConversation?.id === doneConversationId;
          if (!stillActive) return;

          const lastAssistantMessage = messages.filter((m) => m.role === 'assistant').pop();
          const updatedToolActivity: Record<string, string[]> = {};
          if (lastAssistantMessage && currentToolActivity.length > 0) {
            updatedToolActivity[lastAssistantMessage.id] = currentToolActivity;
          }

          useChatStore.setState((state) => ({
            messages,
            conversationUsage: usage,
            isStreaming: false,
            isThinking: false,
            streamBuffer: '',
            thinkingBuffer: '',
            statusMessage: '',
            messageToolActivity: { ...state.messageToolActivity, ...updatedToolActivity },
            toolActivity: [],
            lastChangedFiles: [],
            progressStage: 'idle',
            thinkingSummary: '',
            toolTimings: [],
            _activeCallId: null,
            _streamOrigin: null,
          }));
        }).catch((error) => {
          console.error('Failed to reload messages after done:', error);
          if (useChatStore.getState().activeConversation?.id === doneConversationId) {
            const { streamBuffer, thinkingBuffer } = useChatStore.getState();
            const fallbackMessages: Message[] = [];
            if (streamBuffer || thinkingBuffer) {
              fallbackMessages.push({
                id: 'fallback-' + Date.now(),
                role: 'assistant' as const,
                content: streamBuffer,
                thinking: thinkingBuffer,
                conversationId: doneConversationId,
                timestamp: new Date().toISOString(),
              });
            }
            useChatStore.setState((state) => ({
              messages: fallbackMessages.length > 0
                ? [...state.messages, ...fallbackMessages]
                : state.messages,
              isStreaming: false,
              isThinking: false,
              streamBuffer: '',
              thinkingBuffer: '',
              statusMessage: '',
              toolActivity: [],
              lastChangedFiles: [],
              progressStage: 'idle',
              thinkingSummary: '',
              toolTimings: [],
              _activeCallId: null,
              _streamOrigin: null,
            }));
          }
        });
      } else {
        useChatStore.setState({
          isStreaming: false,
          isThinking: false,
          streamBuffer: '',
          thinkingBuffer: '',
          statusMessage: '',
          toolActivity: [],
          lastChangedFiles: [],
          progressStage: 'idle',
          thinkingSummary: '',
          toolTimings: [],
          _activeCallId: null,
          _streamOrigin: null,
        });
      }
    },

    onError: (message) => {
      clearRecoveryPoll();
      useChatStore.setState((state) => {
        const errorMessage: Message = {
          id: 'error-' + Date.now(),
          role: 'assistant',
          content: `Error: ${message}`,
          thinking: '',
          conversationId: useChatStore.getState().activeConversation?.id ?? '',
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
          _activeCallId: null,
          _streamOrigin: null,
        };
      });
    },
        });
      }
      handler(event);
    };
  })(),

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
    clearRecoveryPoll();
    set({ _cleanupListener: null, _cleanupFilesChanged: null });
  },

  /**
   * Check the main process for an in-flight CLI stream and restore
   * streaming UI state so the user sees the active request after refresh.
   *
   * After restoring the snapshot, live events continue flowing because
   * the main process broadcasts `chat:streamEvent` to ALL windows —
   * the freshly-registered listener picks them up immediately. A polling
   * fallback (every 2s) catches the edge case where the `done` event
   * was sent during the brief reload gap before the listener was registered.
   */
  recoverActiveStream: async () => {
    try {
      const active = await window.novelEngine.chat.getActiveStream();
      if (!active) {
        // Check for orphans from a previous crash
        try {
          const orphans = await window.novelEngine.chat.getOrphanedSessions();
          if (orphans.length > 0) {
            set({ interruptedSession: orphans[0] });
          }
        } catch {
          // Orphan check is best-effort
        }
        return;
      }

      // Restore the callId from the active stream so the event guard
      // scopes incoming events to this specific call — prevents bleed
      // from other concurrent streams after a renderer refresh.
      const recoveredCallId = active.callId || null;

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
          isThinking: (active.thinkingBuffer ?? '').length > 0 && !(active.textBuffer ?? ''),
          streamBuffer: active.textBuffer ?? '',
          thinkingBuffer: active.thinkingBuffer ?? '',
          statusMessage: randomRespondingStatus(),
          progressStage: active.progressStage ?? 'idle',
          _activeCallId: recoveredCallId,
        });
      } else {
        // Conversation not in the loaded list (e.g. different book) — just flag streaming
        set({
          isStreaming: true,
          isThinking: (active.thinkingBuffer ?? '').length > 0 && !(active.textBuffer ?? ''),
          streamBuffer: active.textBuffer ?? '',
          thinkingBuffer: active.thinkingBuffer ?? '',
          statusMessage: randomRespondingStatus(),
          progressStage: active.progressStage ?? 'idle',
          _activeCallId: recoveredCallId,
        });
      }

      // Start polling fallback: detect stream completion if `done` was
      // lost during the reload gap. Also catches the race where the stream
      // ends between our getActiveStream() call and the set() above.
      clearRecoveryPoll();
      _recoveryPollTimer = setInterval(async () => {
        // If something else already cleared streaming, stop polling
        if (!get().isStreaming) {
          clearRecoveryPoll();
          return;
        }

        try {
          const current = await window.novelEngine.chat.getActiveStream();
          if (!current) {
            // Stream ended — reload final messages from DB and reset
            clearRecoveryPoll();
            const convId = get().activeConversation?.id;
            if (convId) {
              try {
                const [msgs, usage] = await Promise.all([
                  window.novelEngine.chat.getMessages(convId),
                  window.novelEngine.usage.byConversation(convId),
                ]);
                set({
                  messages: msgs,
                  conversationUsage: usage,
                  isStreaming: false,
                  isThinking: false,
                  streamBuffer: '',
                  thinkingBuffer: '',
                  statusMessage: '',
                  toolActivity: [],
                  lastChangedFiles: [],
                  progressStage: 'idle',
                  thinkingSummary: '',
                  toolTimings: [],
                });
              } catch {
                set({
                  isStreaming: false,
                  isThinking: false,
                  streamBuffer: '',
                  thinkingBuffer: '',
                  statusMessage: '',
                });
              }
            } else {
              set({
                isStreaming: false,
                isThinking: false,
                streamBuffer: '',
                thinkingBuffer: '',
                statusMessage: '',
              });
            }
          }
        } catch {
          // Poll failed — try again next tick, don't crash
        }
      }, 2000);
    } catch (error) {
      console.error('Failed to recover active stream:', error);
    }
  },
}));
