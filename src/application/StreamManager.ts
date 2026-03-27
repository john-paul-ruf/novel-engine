import type { IDatabaseService, IUsageService } from '@domain/interfaces';
import type { ActiveStreamInfo, AgentName, FileTouchMap, ProgressStage, StreamEvent } from '@domain/types';

/**
 * Parameters needed to start a managed stream.
 */
export type StreamParams = {
  conversationId: string;
  agentName: AgentName;
  model: string;
  bookSlug: string;
  sessionId: string;
  callId: string;
  onEvent: (event: StreamEvent) => void;
};

/**
 * Options for customizing stream behavior. All optional.
 */
export type StreamOptions = {
  /** Track filesChanged events into lastChangedFiles (default: true) */
  trackFilesChanged?: boolean;
  /** Callback invoked after the assistant message is saved on 'done'. */
  onDone?: (event: StreamEvent & { type: 'done' }) => void | Promise<void>;
};

/**
 * StreamManager — Owns the activeStreams map and the repetitive
 * stream lifecycle pattern (register → accumulate → save → cleanup).
 *
 * Every CLI stream call in the app should use this instead of manually
 * managing buffers, active stream entries, and done/error cleanup.
 */
export class StreamManager {
  private activeStreams: Map<string, ActiveStreamInfo> = new Map();
  private lastChangedFiles: string[] = [];

  constructor(
    private db: IDatabaseService,
    private usage: IUsageService,
  ) {}

  /**
   * Start tracking a new stream. Returns an `onEvent` callback that the
   * caller passes to `claude.sendMessage()`. The callback handles:
   *
   * - Accumulating text/thinking deltas into buffers
   * - Updating progressStage and filesTouched on the active stream
   * - Saving the assistant message on 'done'
   * - Recording token usage on 'done'
   * - Ending the stream session on 'done' or 'error'
   * - Deleting the active stream entry on 'done' or 'error'
   * - Forwarding all events to the caller's onEvent
   */
  startStream(
    params: StreamParams,
    options: StreamOptions = {},
  ): {
    onEvent: (event: StreamEvent) => void;
    getResponseBuffer: () => string;
    getThinkingBuffer: () => string;
  } {
    const { conversationId, agentName, model, bookSlug, sessionId, callId, onEvent } = params;
    const trackFilesChanged = options.trackFilesChanged ?? true;

    // Register the active stream
    this.activeStreams.set(conversationId, {
      conversationId,
      agentName,
      model,
      bookSlug,
      startedAt: new Date().toISOString(),
      sessionId,
      callId,
      progressStage: 'idle',
      filesTouched: {},
      thinkingBuffer: '',
      textBuffer: '',
    });

    // Emit callStart so the activity monitor knows what's happening
    onEvent({ type: 'callStart', agentName, model, bookSlug });

    // Local buffers
    let responseBuffer = '';
    let thinkingBuffer = '';

    // The event handler that the caller passes to claude.sendMessage()
    const streamOnEvent = (event: StreamEvent): void => {
      const stream = this.activeStreams.get(conversationId);

      // Update activeStream with live progress data
      if (stream) {
        if (event.type === 'progressStage') {
          stream.progressStage = event.stage;
        }
        if (event.type === 'toolDuration') {
          if (event.tool.filePath && (event.tool.toolName === 'Write' || event.tool.toolName === 'Edit')) {
            const current = stream.filesTouched[event.tool.filePath] ?? 0;
            stream.filesTouched[event.tool.filePath] = current + 1;
          }
        }
        if (event.type === 'done') {
          stream.filesTouched = event.filesTouched;
        }
      }

      // Accumulate response content
      if (event.type === 'textDelta') {
        responseBuffer += event.text;
        if (stream) stream.textBuffer = responseBuffer;
      } else if (event.type === 'thinkingDelta') {
        thinkingBuffer += event.text;
        if (stream) stream.thinkingBuffer = thinkingBuffer;
      } else if (event.type === 'filesChanged' && trackFilesChanged) {
        this.lastChangedFiles = event.paths;
      } else if (event.type === 'done') {
        // Save the assistant message
        this.db.saveMessage({
          conversationId,
          role: 'assistant',
          content: responseBuffer,
          thinking: thinkingBuffer,
        });

        // Record token usage
        this.usage.recordUsage({
          conversationId,
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          thinkingTokens: event.thinkingTokens,
          model,
        });

        // End session and clean up
        this.db.endStreamSession(sessionId, 'complete', event.filesTouched);
        this.activeStreams.delete(conversationId);

        // Call optional onDone hook (for chapter validation, etc.)
        if (options.onDone) {
          const result = options.onDone(event as StreamEvent & { type: 'done' });
          if (result instanceof Promise) {
            result.catch((err: unknown) => console.error('[StreamManager] onDone hook error:', err));
          }
        }
      } else if (event.type === 'error') {
        this.db.endStreamSession(sessionId, 'idle', {});
        this.activeStreams.delete(conversationId);
      }

      // Forward ALL events to the caller
      onEvent(event);
    };

    return {
      onEvent: streamOnEvent,
      getResponseBuffer: () => responseBuffer,
      getThinkingBuffer: () => thinkingBuffer,
    };
  }

  /**
   * Reset lastChangedFiles tracker (call before a new interaction).
   */
  resetChangedFiles(): void {
    this.lastChangedFiles = [];
  }

  /**
   * Returns info about any active CLI stream, or null if idle.
   */
  getActiveStream(): ActiveStreamInfo | null {
    for (const stream of this.activeStreams.values()) {
      return stream;
    }
    return null;
  }

  /**
   * Returns the active CLI stream for a specific book, or null.
   */
  getActiveStreamForBook(bookSlug: string): ActiveStreamInfo | null {
    for (const stream of this.activeStreams.values()) {
      if (stream.bookSlug === bookSlug) return stream;
    }
    return null;
  }

  /**
   * Returns the file paths that were changed during the last interaction.
   */
  getLastChangedFiles(): string[] {
    return this.lastChangedFiles;
  }

  /**
   * Clean up an aborted stream: returns the partial stream state for
   * the caller to save a partial message and kill the CLI process.
   * Returns null if no active stream exists for the given conversationId.
   */
  cleanupAbortedStream(conversationId: string): {
    textBuffer: string;
    thinkingBuffer: string;
    sessionId: string;
    progressStage: ProgressStage;
    filesTouched: FileTouchMap;
  } | null {
    const stream = this.activeStreams.get(conversationId);
    if (!stream) return null;

    const result = {
      textBuffer: stream.textBuffer,
      thinkingBuffer: stream.thinkingBuffer,
      sessionId: stream.sessionId,
      progressStage: stream.progressStage,
      filesTouched: stream.filesTouched,
    };

    this.activeStreams.delete(conversationId);
    return result;
  }

  /**
   * End a stream session due to an external error (catch block).
   * Removes the active stream entry.
   */
  cleanupErroredStream(conversationId: string, sessionId: string): void {
    this.db.endStreamSession(sessionId, 'idle', {});
    this.activeStreams.delete(conversationId);
  }
}
