import { create } from 'zustand';
import type { StreamEvent, ToolUseInfo, ContextDiagnostics } from '@domain/types';

type CliActivityEntryKind =
  | 'spawn'
  | 'status'
  | 'thinking-start'
  | 'thinking-end'
  | 'text-start'
  | 'text-end'
  | 'tool-start'
  | 'tool-complete'
  | 'tool-error'
  | 'files-changed'
  | 'done'
  | 'error'
  | 'context-loaded';

type CliActivityEntry = {
  id: number;
  timestamp: number;
  kind: CliActivityEntryKind;
  message: string;
  detail?: string;
  tokens?: { input: number; output: number; thinking: number };
  tool?: ToolUseInfo;
};

type CliActivityState = {
  entries: CliActivityEntry[];
  isOpen: boolean;
  isActive: boolean;
  currentToolName: string | null;
  diagnostics: ContextDiagnostics | null;

  // Token accumulation for current session
  sessionInputTokens: number;
  sessionOutputTokens: number;
  sessionThinkingTokens: number;

  toggle: () => void;
  open: () => void;
  close: () => void;
  clear: () => void;
  handleStreamEvent: (event: StreamEvent) => void;
  loadDiagnostics: () => Promise<void>;

  _nextId: number;
  _push: (kind: CliActivityEntryKind, message: string, extra?: Partial<CliActivityEntry>) => void;

  _cleanupListener: (() => void) | null;
  initListener: () => void;
  destroyListener: () => void;
};

const MAX_ENTRIES = 500;

export const useCliActivityStore = create<CliActivityState>((set, get) => ({
  entries: [],
  isOpen: false,
  isActive: false,
  currentToolName: null,
  diagnostics: null,
  sessionInputTokens: 0,
  sessionOutputTokens: 0,
  sessionThinkingTokens: 0,
  _nextId: 0,
  _cleanupListener: null,

  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),

  clear: () => set({
    entries: [],
    isActive: false,
    currentToolName: null,
    diagnostics: null,
    sessionInputTokens: 0,
    sessionOutputTokens: 0,
    sessionThinkingTokens: 0,
  }),

  _push: (kind, message, extra) => {
    const id = get()._nextId;
    const entry: CliActivityEntry = {
      id,
      timestamp: Date.now(),
      kind,
      message,
      ...extra,
    };
    set((s) => ({
      _nextId: id + 1,
      entries: [...s.entries.slice(-MAX_ENTRIES + 1), entry],
    }));
  },

  handleStreamEvent: (event: StreamEvent) => {
    const { _push } = get();

    switch (event.type) {
      case 'status':
        if (!get().isActive) {
          set({ isActive: true });
          _push('spawn', 'CLI process started');
        }
        _push('status', event.message);
        break;

      case 'blockStart':
        if (event.blockType === 'thinking') {
          _push('thinking-start', 'Extended thinking started');
        } else if (event.blockType === 'text') {
          _push('text-start', 'Response text streaming');
        }
        break;

      case 'blockEnd':
        if (event.blockType === 'thinking') {
          _push('thinking-end', 'Thinking complete');
        } else if (event.blockType === 'text') {
          _push('text-end', 'Text block complete');
        }
        break;

      case 'toolUse': {
        const { tool } = event;
        if (tool.status === 'started') {
          set({ currentToolName: tool.toolName });
          const fileInfo = tool.filePath ? ` → ${tool.filePath}` : '';
          _push('tool-start', `${tool.toolName}${fileInfo}`, { tool });
        } else if (tool.status === 'complete') {
          const fileInfo = tool.filePath ? ` → ${tool.filePath}` : '';
          _push('tool-complete', `${tool.toolName} done${fileInfo}`, { tool });
          set({ currentToolName: null });
        } else if (tool.status === 'error') {
          _push('tool-error', `${tool.toolName} failed`, { tool });
          set({ currentToolName: null });
        }
        break;
      }

      case 'filesChanged':
        _push('files-changed', `${event.paths.length} file(s) modified`, {
          detail: event.paths.join('\n'),
        });
        break;

      case 'done':
        set({
          isActive: false,
          currentToolName: null,
          sessionInputTokens: event.inputTokens,
          sessionOutputTokens: event.outputTokens,
          sessionThinkingTokens: event.thinkingTokens,
        });
        _push('done', 'CLI call complete', {
          tokens: {
            input: event.inputTokens,
            output: event.outputTokens,
            thinking: event.thinkingTokens,
          },
        });
        // Auto-load diagnostics when a call completes
        get().loadDiagnostics();
        break;

      case 'error':
        set({ isActive: false, currentToolName: null });
        _push('error', event.message);
        break;

      // thinkingDelta and textDelta are high-frequency — we don't log each one
      default:
        break;
    }
  },

  loadDiagnostics: async () => {
    try {
      const diag = await window.novelEngine.context.getLastDiagnostics();
      if (diag) {
        set({ diagnostics: diag });
        get()._push('context-loaded', `Context: ${diag.filesAvailable.length} files, ${diag.conversationTurnsSent} turns sent (${diag.conversationTurnsDropped} dropped), ~${diag.manifestTokenEstimate.toLocaleString()} manifest tokens`);
      }
    } catch {
      // Non-critical — diagnostics are optional
    }
  },

  initListener: () => {
    const { _cleanupListener } = get();
    if (_cleanupListener) _cleanupListener();

    const cleanup = window.novelEngine.chat.onStreamEvent((event) => {
      get().handleStreamEvent(event);
    });
    set({ _cleanupListener: cleanup });
  },

  destroyListener: () => {
    const { _cleanupListener } = get();
    if (_cleanupListener) _cleanupListener();
    set({ _cleanupListener: null });
  },
}));
