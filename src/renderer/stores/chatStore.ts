import { create } from 'zustand';
import type { AgentName, Conversation, ConversationPurpose, Message, PipelinePhase, PipelinePhaseId, ProgressStage, StreamEvent, StreamSessionRecord, TimestampedToolUse, UsageRecord } from '@domain/types';
import { randomRespondingStatus } from '@domain/constants';
import { useBookStore } from './bookStore';
import { useFileChangeStore } from './fileChangeStore';
import { usePipelineStore } from './pipelineStore';
import { useViewStore } from './viewStore';
import { streamRouter } from './streamRouter';

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

  // Pipeline lock state
  pipelineLocked: boolean;
  lockedAgentName: AgentName | null;
  lockedPhaseId: PipelinePhaseId | null;

  loadConversations: (bookSlug: string) => Promise<void>;
  createConversation: (agentName: AgentName, bookSlug: string, phase: PipelinePhaseId | null, purpose?: ConversationPurpose) => Promise<void>;
  setActiveConversation: (conversationId: string) => Promise<void>;
  sendMessage: (content: string, thinkingBudgetOverride?: number) => Promise<void>;
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
  progressStage: 'idle',
  thinkingSummary: '',
  toolTimings: [],
  interruptedSession: null,
  _activeCallId: null,
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

  sendMessage: async (content: string, thinkingBudgetOverride?: number) => {
    const { activeConversation } = get();
    if (!activeConversation) return;

    const bookSlug = useBookStore.getState().activeSlug;
    const { id: conversationId, agentName } = activeConversation;

    // Ensure stream events are routed to the main chat store
    streamRouter.target = 'main';

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

  dismissInterrupted: () => set({ interruptedSession: null }),

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
      progressStage: 'idle',
      thinkingSummary: '',
      toolTimings: [],
      interruptedSession: null,
      _activeCallId: null,
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

    // Step 4: Check if this book has an active CLI stream (e.g. the user
    // started a chat, switched away, and is now switching back). If so,
    // recover the streaming UI so thinking/text deltas resume rendering.
    try {
      const active = await window.novelEngine.chat.getActiveStreamForBook(newBookSlug);
      if (active) {
        streamRouter.target = 'main';
        const conversation = get().conversations.find((c) => c.id === active.conversationId) ?? null;
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
          // Persist so refresh also recovers to this conversation
          localStorage.setItem('novel-engine-active-conversation', active.conversationId);
        }
      }
    } catch (error) {
      console.error('Failed to recover active stream for book:', error);
    }
  },

  _handleStreamEvent: (event: StreamEvent) => {
    if (streamRouter.target !== 'main') return;

    // Scope events to the call that THIS store initiated.
    // Each sendMessage generates a unique callId and passes it to the IPC
    // layer, which injects it into every broadcast event. By filtering here,
    // we ensure that events from other concurrent CLI calls (different books,
    // revision queue, auto-draft, etc.) don't bleed into our buffers.
    const enriched = event as StreamEvent & { callId?: string; conversationId?: string };
    const callId = enriched.callId;
    if (callId && callId.startsWith('rev:')) return;

    const { _activeCallId, activeConversation, isStreaming } = get();

    // Primary guard: callId matching — the callId is a UUID generated per
    // sendMessage call, so this alone prevents cross-call bleed.
    if (_activeCallId && callId && callId !== _activeCallId) return;

    // Secondary guard: when no call is active, reject stale events.
    // During recovery (isStreaming=true, _activeCallId=null) we allow
    // events through but only if they match the active conversation.
    if (!_activeCallId) {
      if (!isStreaming) return;
      // Recovery mode — accept events only for the active conversation
      if (enriched.conversationId && activeConversation && enriched.conversationId !== activeConversation.id) return;
    }

    // NOTE: No conversationId guard in the main (callId-present) path.
    // The user may switch conversations mid-stream, which changes
    // activeConversation. Lifecycle events (done/error) must still be
    // processed to reset isStreaming and clear buffers. The callId guard
    // is sufficient — it's a unique UUID per send call.

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

      case 'progressStage':
        set({ progressStage: event.stage });
        break;

      case 'thinkingSummary':
        set({ thinkingSummary: event.summary.text });
        break;

      case 'toolDuration':
        set((state) => ({
          toolTimings: [...state.toolTimings, event.tool],
        }));
        break;

      case 'filesChanged':
        set({ lastChangedFiles: event.paths });
        break;

      case 'done': {
        // Clear recovery poll — the done event arrived naturally
        clearRecoveryPoll();
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
              progressStage: 'idle',
              thinkingSummary: '',
              toolTimings: [],
              _activeCallId: null,
            }));
          }).catch((error) => {
            console.error('Failed to reload messages after done:', error);
            // Only update if still on the same conversation
            if (get().activeConversation?.id === doneConversationId) {
              // Preserve streamed content as a synthetic message so the user
              // doesn't lose the response when the DB reload fails.
              const { streamBuffer, thinkingBuffer } = get();
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
              set((state) => ({
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
              }));
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
            progressStage: 'idle',
            thinkingSummary: '',
            toolTimings: [],
            _activeCallId: null,
          });
        }
        break;
      }

      case 'error':
        clearRecoveryPoll();
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
            _activeCallId: null,
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

      // Ensure the stream router points to main so events are processed
      streamRouter.target = 'main';

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
