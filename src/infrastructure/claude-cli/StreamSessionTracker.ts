import type {
  FileTouchMap,
  ProgressStage,
  StreamBlockType,
  ThinkingSummary,
  TimestampedToolUse,
  ToolUseInfo,
} from '@domain/types';

/**
 * Tracks state for a single CLI stream session.
 *
 * Instantiated once per sendMessage() call. Encapsulates:
 * - File touch map (path → write count)
 * - Progress stage inference
 * - Thinking summary extraction
 * - Tool use timestamping
 * - Event sequence numbering for persistence
 *
 * This is a pure state-machine class with no I/O dependencies.
 */
export class StreamSessionTracker {
  readonly sessionId: string;
  private sequenceNumber = 0;
  private fileTouches: Map<string, number> = new Map();
  private currentStage: ProgressStage = 'idle';
  private thinkingBuffer = '';
  private currentBlockType: StreamBlockType | null = null;
  private hasEmittedText = false;
  private currentToolName = '';
  private currentToolId = '';
  private toolInputBuffer = '';
  private activeToolTimestamps: Map<string, number> = new Map(); // toolId → start time

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  // --- Existing State (migrated from ClaudeCodeClient locals) ---

  getCurrentBlockType(): StreamBlockType | null {
    return this.currentBlockType;
  }

  setCurrentBlockType(bt: StreamBlockType | null): void {
    this.currentBlockType = bt;
  }

  getHasEmittedText(): boolean {
    return this.hasEmittedText;
  }

  markTextEmitted(): void {
    this.hasEmittedText = true;
  }

  getCurrentToolName(): string {
    return this.currentToolName;
  }

  setCurrentToolName(name: string): void {
    this.currentToolName = name;
  }

  getCurrentToolId(): string {
    return this.currentToolId;
  }

  setCurrentToolId(id: string): void {
    this.currentToolId = id;
  }

  getToolInputBuffer(): string {
    return this.toolInputBuffer;
  }

  setToolInputBuffer(input: string): void {
    this.toolInputBuffer = input;
  }

  appendToolInput(partial: string): void {
    this.toolInputBuffer += partial;
  }

  getThinkingBuffer(): string {
    return this.thinkingBuffer;
  }

  appendThinkingBuffer(text: string): void {
    this.thinkingBuffer += text;
  }

  resetThinkingBuffer(): void {
    this.thinkingBuffer = '';
  }

  // --- File Tracking ---

  /**
   * Record a file touch from a Write or Edit tool completion.
   * Increments the write count for this path.
   * Returns the new count (1 = first draft, 2+ = revision/re-edit).
   */
  touchFile(filePath: string): number {
    const current = this.fileTouches.get(filePath) ?? 0;
    const next = current + 1;
    this.fileTouches.set(filePath, next);
    return next;
  }

  /** Returns the full file touch map as a plain Record. */
  getFileTouches(): FileTouchMap {
    return Object.fromEntries(this.fileTouches);
  }

  /** Returns paths where writeCount === 1 (first drafts this session). */
  getFirstDrafts(): string[] {
    return [...this.fileTouches.entries()]
      .filter(([, count]) => count === 1)
      .map(([path]) => path);
  }

  /** Returns paths where writeCount > 1 (revised files this session). */
  getRevisedFiles(): string[] {
    return [...this.fileTouches.entries()]
      .filter(([, count]) => count > 1)
      .map(([path]) => path);
  }

  // --- Progress Stage ---

  /**
   * Infer the progress stage from the current event context.
   *
   * State machine transitions:
   *   idle → reading          (Read/LS tool starts)
   *   idle|reading → thinking (thinking block starts)
   *   any → drafting          (first Write to a new path)
   *   any → editing           (Edit tool, or Write to an already-touched path)
   *   any → reviewing         (Read of a path in fileTouches — agent self-reviews)
   *   any → complete          (result event)
   *
   * Returns the new stage, or null if the stage didn't change.
   */
  inferStage(eventType: string, toolName?: string, filePath?: string): ProgressStage | null {
    let newStage: ProgressStage | null = null;

    if (eventType === 'result') {
      newStage = 'complete';
    } else if (eventType === 'blockStart' && this.currentBlockType === 'thinking') {
      newStage = 'thinking';
    } else if (eventType === 'toolUse' && toolName) {
      if (toolName === 'Read' || toolName === 'LS') {
        // Check if reading a file we already wrote → reviewing
        if (filePath && this.fileTouches.has(filePath)) {
          newStage = 'reviewing';
        } else if (this.currentStage === 'idle' || this.currentStage === 'thinking') {
          newStage = 'reading';
        }
      } else if (toolName === 'Write') {
        if (filePath && this.fileTouches.has(filePath)) {
          newStage = 'editing';
        } else {
          newStage = 'drafting';
        }
      } else if (toolName === 'Edit') {
        newStage = 'editing';
      }
    }

    if (newStage && newStage !== this.currentStage) {
      this.currentStage = newStage;
      return newStage;
    }
    return null;
  }

  getCurrentStage(): ProgressStage {
    return this.currentStage;
  }

  // --- Thinking Summary ---

  /**
   * Extract a summary when a thinking block ends.
   *
   * Strategy: take the first ~200 chars. If that cuts mid-sentence,
   * back up to the last sentence boundary (period, question mark,
   * exclamation mark followed by a space or end-of-string).
   * If no sentence boundary found within the first 200, truncate with "…".
   *
   * Returns null if the thinking buffer is empty.
   */
  extractThinkingSummary(): ThinkingSummary | null {
    if (!this.thinkingBuffer.trim()) return null;

    const full = this.thinkingBuffer;
    const maxLen = 200;

    if (full.length <= maxLen) {
      return { text: full.trim(), fullLengthChars: full.length };
    }

    // Look for sentence boundary within first 200 chars
    const snippet = full.slice(0, maxLen);
    const sentenceEnd = snippet.search(/[.!?](?:\s|$)/);

    let text: string;
    if (sentenceEnd !== -1 && sentenceEnd > 40) {
      // Found a reasonable sentence boundary
      text = snippet.slice(0, sentenceEnd + 1).trim();
    } else {
      // No sentence boundary — truncate at last word boundary
      const lastSpace = snippet.lastIndexOf(' ');
      text = (lastSpace > 40 ? snippet.slice(0, lastSpace) : snippet).trim() + '…';
    }

    return { text, fullLengthChars: full.length };
  }

  // --- Tool Timestamping ---

  /** Record when a tool_use block starts. Returns the timestamp. */
  startTool(toolId: string): number {
    const now = Date.now();
    this.activeToolTimestamps.set(toolId, now);
    return now;
  }

  /**
   * Record when a tool_use block ends.
   * Returns a TimestampedToolUse with duration, or the base info if
   * no start timestamp was recorded.
   */
  endTool(toolInfo: ToolUseInfo): TimestampedToolUse {
    const startedAt = this.activeToolTimestamps.get(toolInfo.toolId) ?? Date.now();
    const endedAt = Date.now();
    this.activeToolTimestamps.delete(toolInfo.toolId);
    return {
      ...toolInfo,
      startedAt,
      endedAt,
      durationMs: endedAt - startedAt,
    };
  }

  // --- Event Sequencing ---

  /** Returns the next sequence number for event persistence. */
  nextSequence(): number {
    return this.sequenceNumber++;
  }
}
