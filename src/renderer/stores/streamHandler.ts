import type { StreamEvent, StreamBlockType, StreamEventSource, ToolUseInfo, ProgressStage, TimestampedToolUse } from '@domain/types';

/**
 * Enriched stream event — the IPC layer injects callId, conversationId,
 * and source so stores can scope events to the correct call/conversation
 * and filter by origin without parsing string prefixes.
 */
type EnrichedStreamEvent = StreamEvent & { callId?: string; conversationId?: string; source?: StreamEventSource };

/**
 * Configuration for the shared stream event handler.
 *
 * Provides store-specific getters and callbacks while the handler
 * encapsulates the common guard logic and event dispatch.
 */
export interface StreamHandlerConfig {
  // --- State getters (called per event to read current store state) ---
  getActiveCallId: () => string | null;
  getIsStreaming: () => boolean;
  getActiveConversationId: () => string | null;

  /**
   * When true, events are rejected if their conversationId doesn't match
   * the active conversation — even when a callId is present.
   * chatStore sets this to false (intentionally allows mid-stream conversation switching).
   * modalChatStore and pitchRoomStore set this to true.
   */
  alwaysCheckConversationId?: boolean;

  // --- Common event callbacks ---
  onStatus: (message: string) => void;
  onWarning?: (message: string) => void;
  onBlockStart: (blockType: StreamBlockType) => void;
  onThinkingDelta: (text: string) => void;
  onTextDelta: (text: string) => void;

  // --- Terminal events (store-specific logic) ---
  onDone: () => void;
  onError: (message: string) => void;

  // --- Optional: store-specific event callbacks ---
  onToolUse?: (tool: ToolUseInfo) => void;
  onProgressStage?: (stage: ProgressStage) => void;
  onThinkingSummary?: (summary: { text: string }) => void;
  onToolDuration?: (tool: TimestampedToolUse) => void;
  onFilesChanged?: (paths: string[]) => void;
  onMultiCallProgress?: (step: number, totalSteps: number, label: string) => void;
}

/**
 * Creates a stream event handler with shared guard logic and event dispatch.
 *
 * All three chat-like stores (chatStore, modalChatStore, pitchRoomStore)
 * share the same event filtering pattern:
 *   1. Skip revision events (callId starts with 'rev:')
 *   2. Primary guard: callId matching (UUID per send)
 *   3. Secondary guard: reject stale events when no call is active
 *   4. Dispatch to type-specific callbacks
 *
 * Store-specific behavior (message reload, cleanup) is handled by the
 * onDone/onError callbacks.
 */
export function createStreamHandler(config: StreamHandlerConfig): (event: StreamEvent) => void {
  return (event: StreamEvent) => {
    const enriched = event as EnrichedStreamEvent;
    const callId = enriched.callId;

    // Skip revision queue events — they're handled by revisionQueueStore
    if (enriched.source === 'revision') return;
    // Fallback for backwards compatibility (e.g., in-flight events from before this change)
    if (!enriched.source && callId && callId.startsWith('rev:')) return;

    const activeCallId = config.getActiveCallId();
    const isStreaming = config.getIsStreaming();

    // Primary guard: callId matching — the callId is a UUID generated per
    // sendMessage call, so this alone prevents cross-call bleed.
    if (activeCallId && callId && callId !== activeCallId) return;

    // Secondary guard: when no call is active, reject stale events.
    // During recovery (isStreaming=true, _activeCallId=null) we allow
    // events through but only if they match the active conversation.
    if (!activeCallId) {
      if (!isStreaming) return;
      // Recovery mode — accept events only for the active conversation
      const activeConvId = config.getActiveConversationId();
      if (enriched.conversationId && activeConvId && enriched.conversationId !== activeConvId) return;
    }

    // Optional conversationId guard for the main (callId-present) path.
    // modalChatStore and pitchRoomStore use this; chatStore does not.
    if (config.alwaysCheckConversationId && activeCallId) {
      const activeConvId = config.getActiveConversationId();
      if (enriched.conversationId && activeConvId && enriched.conversationId !== activeConvId) return;
    }

    switch (event.type) {
      case 'status':
        config.onStatus(event.message);
        break;

      case 'warning':
        config.onWarning?.(event.message);
        break;

      case 'blockStart':
        config.onBlockStart(event.blockType);
        break;

      case 'thinkingDelta':
        config.onThinkingDelta(event.text);
        break;

      case 'textDelta':
        config.onTextDelta(event.text);
        break;

      case 'blockEnd':
        // No-op: transitions handled by blockStart
        break;

      case 'toolUse':
        config.onToolUse?.(event.tool);
        break;

      case 'progressStage':
        config.onProgressStage?.(event.stage);
        break;

      case 'thinkingSummary':
        config.onThinkingSummary?.(event.summary);
        break;

      case 'toolDuration':
        config.onToolDuration?.(event.tool);
        break;

      case 'filesChanged':
        config.onFilesChanged?.(event.paths);
        break;

      case 'multiCallProgress':
        config.onMultiCallProgress?.(event.step, event.totalSteps, event.label);
        break;

      case 'done':
        config.onDone();
        break;

      case 'error':
        config.onError(event.message);
        break;
    }
  };
}
