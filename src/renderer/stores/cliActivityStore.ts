import { create } from 'zustand';
import type { StreamEvent, ToolUseInfo, ContextDiagnostics, AgentName } from '@domain/types';
import { MODEL_PRICING, CHARS_PER_TOKEN, AGENT_REGISTRY } from '@domain/constants';

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

/** Tracks duration of each phase (thinking, text, tool use) */
type PhaseSpan = {
  label: string;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
};

/** Metadata about the current/last CLI call */
type CallMeta = {
  agentName: AgentName;
  agentColor: string;
  agentRole: string;
  model: string;
  modelLabel: string;
  bookSlug: string;
  startedAt: number;
};

type CliActivityState = {
  entries: CliActivityEntry[];
  isOpen: boolean;
  isActive: boolean;
  currentToolName: string | null;
  diagnostics: ContextDiagnostics | null;

  // Token accumulation for current session (final, from done event)
  sessionInputTokens: number;
  sessionOutputTokens: number;
  sessionThinkingTokens: number;

  // Call metadata
  callMeta: CallMeta | null;

  // Real-time character accumulation (for live token estimate)
  streamingThinkingChars: number;
  streamingTextChars: number;

  // Phase tracking
  phases: PhaseSpan[];
  _currentPhaseIndex: number | null;

  // Cost estimation (set after done)
  estimatedCost: number | null;

  // Elapsed time (updated by the panel via interval)
  callElapsedMs: number;

  // Tool use stats for current call
  toolUseCount: number;
  toolUseBreakdown: Record<string, number>; // toolName -> count

  toggle: () => void;
  open: () => void;
  close: () => void;
  clear: () => void;
  handleStreamEvent: (event: StreamEvent) => void;
  loadDiagnostics: () => Promise<void>;
  updateElapsed: () => void;

  _nextId: number;
  _push: (kind: CliActivityEntryKind, message: string, extra?: Partial<CliActivityEntry>) => void;

  _cleanupListener: (() => void) | null;
  initListener: () => void;
  destroyListener: () => void;
  recoverActiveStream: () => Promise<void>;
};

const MAX_ENTRIES = 500;

function getModelLabel(model: string): string {
  if (model.includes('opus')) return 'Opus 4';
  if (model.includes('sonnet')) return 'Sonnet 4';
  return model;
}

function estimateCost(model: string, input: number, output: number): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (input / 1_000_000) * pricing.input + (output / 1_000_000) * pricing.output;
}

export const useCliActivityStore = create<CliActivityState>((set, get) => ({
  entries: [],
  isOpen: false,
  isActive: false,
  currentToolName: null,
  diagnostics: null,
  sessionInputTokens: 0,
  sessionOutputTokens: 0,
  sessionThinkingTokens: 0,
  callMeta: null,
  streamingThinkingChars: 0,
  streamingTextChars: 0,
  phases: [],
  _currentPhaseIndex: null,
  estimatedCost: null,
  callElapsedMs: 0,
  toolUseCount: 0,
  toolUseBreakdown: {},
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
    callMeta: null,
    streamingThinkingChars: 0,
    streamingTextChars: 0,
    phases: [],
    _currentPhaseIndex: null,
    estimatedCost: null,
    callElapsedMs: 0,
    toolUseCount: 0,
    toolUseBreakdown: {},
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

  updateElapsed: () => {
    const { callMeta, isActive } = get();
    if (callMeta && isActive) {
      set({ callElapsedMs: Date.now() - callMeta.startedAt });
    }
  },

  handleStreamEvent: (event: StreamEvent) => {
    const { _push } = get();

    switch (event.type) {
      case 'callStart': {
        const agentInfo = AGENT_REGISTRY[event.agentName];
        set({
          isActive: true,
          callMeta: {
            agentName: event.agentName,
            agentColor: agentInfo?.color ?? '#71717A',
            agentRole: agentInfo?.role ?? '',
            model: event.model,
            modelLabel: getModelLabel(event.model),
            bookSlug: event.bookSlug,
            startedAt: Date.now(),
          },
          streamingThinkingChars: 0,
          streamingTextChars: 0,
          phases: [],
          _currentPhaseIndex: null,
          estimatedCost: null,
          callElapsedMs: 0,
          toolUseCount: 0,
          toolUseBreakdown: {},
          sessionInputTokens: 0,
          sessionOutputTokens: 0,
          sessionThinkingTokens: 0,
        });
        _push('spawn', `${event.agentName} call started (${getModelLabel(event.model)})`);
        break;
      }

      case 'status':
        if (!get().isActive && !get().callMeta) {
          set({ isActive: true });
          _push('spawn', 'CLI process started');
        }
        _push('status', event.message);
        break;

      case 'blockStart': {
        const now = Date.now();
        if (event.blockType === 'thinking') {
          const span: PhaseSpan = { label: 'Thinking', startedAt: now, endedAt: null, durationMs: null };
          set((s) => ({
            phases: [...s.phases, span],
            _currentPhaseIndex: s.phases.length,
          }));
          _push('thinking-start', 'Extended thinking started');
        } else if (event.blockType === 'text') {
          const span: PhaseSpan = { label: 'Generating', startedAt: now, endedAt: null, durationMs: null };
          set((s) => ({
            phases: [...s.phases, span],
            _currentPhaseIndex: s.phases.length,
          }));
          _push('text-start', 'Response text streaming');
        }
        break;
      }

      case 'blockEnd': {
        const now = Date.now();
        const { _currentPhaseIndex, phases } = get();
        if (_currentPhaseIndex !== null && phases[_currentPhaseIndex]) {
          const updatedPhases = [...phases];
          const phase = { ...updatedPhases[_currentPhaseIndex] };
          phase.endedAt = now;
          phase.durationMs = now - phase.startedAt;
          updatedPhases[_currentPhaseIndex] = phase;
          set({ phases: updatedPhases, _currentPhaseIndex: null });
        }
        if (event.blockType === 'thinking') {
          const chars = get().streamingThinkingChars;
          const estTokens = Math.round(chars / CHARS_PER_TOKEN);
          _push('thinking-end', `Thinking complete (~${estTokens.toLocaleString()} tokens est.)`);
        } else if (event.blockType === 'text') {
          const chars = get().streamingTextChars;
          const estTokens = Math.round(chars / CHARS_PER_TOKEN);
          _push('text-end', `Text complete (~${estTokens.toLocaleString()} tokens est.)`);
        }
        break;
      }

      case 'thinkingDelta':
        set((s) => ({ streamingThinkingChars: s.streamingThinkingChars + event.text.length }));
        break;

      case 'textDelta':
        set((s) => ({ streamingTextChars: s.streamingTextChars + event.text.length }));
        break;

      case 'toolUse': {
        const { tool } = event;
        if (tool.status === 'started') {
          // Start a tool phase
          const now = Date.now();
          const span: PhaseSpan = { label: `Tool: ${tool.toolName}`, startedAt: now, endedAt: null, durationMs: null };
          set((s) => ({
            currentToolName: tool.toolName,
            phases: [...s.phases, span],
            _currentPhaseIndex: s.phases.length,
            toolUseCount: s.toolUseCount + 1,
            toolUseBreakdown: {
              ...s.toolUseBreakdown,
              [tool.toolName]: (s.toolUseBreakdown[tool.toolName] ?? 0) + 1,
            },
          }));
          const fileInfo = tool.filePath ? ` → ${tool.filePath}` : '';
          _push('tool-start', `${tool.toolName}${fileInfo}`, { tool });
        } else if (tool.status === 'complete') {
          // End the tool phase
          const now = Date.now();
          const { _currentPhaseIndex, phases } = get();
          if (_currentPhaseIndex !== null && phases[_currentPhaseIndex]) {
            const updatedPhases = [...phases];
            const phase = { ...updatedPhases[_currentPhaseIndex] };
            phase.endedAt = now;
            phase.durationMs = now - phase.startedAt;
            updatedPhases[_currentPhaseIndex] = phase;
            set({ phases: updatedPhases, _currentPhaseIndex: null });
          }
          const fileInfo = tool.filePath ? ` → ${tool.filePath}` : '';
          _push('tool-complete', `${tool.toolName} done${fileInfo}`, { tool });
          set({ currentToolName: null });
        } else if (tool.status === 'error') {
          // End the tool phase on error
          const now = Date.now();
          const { _currentPhaseIndex, phases } = get();
          if (_currentPhaseIndex !== null && phases[_currentPhaseIndex]) {
            const updatedPhases = [...phases];
            const phase = { ...updatedPhases[_currentPhaseIndex] };
            phase.endedAt = now;
            phase.durationMs = now - phase.startedAt;
            updatedPhases[_currentPhaseIndex] = phase;
            set({ phases: updatedPhases, _currentPhaseIndex: null });
          }
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

      case 'done': {
        const { callMeta } = get();
        const finalElapsed = callMeta ? Date.now() - callMeta.startedAt : 0;
        const cost = callMeta
          ? estimateCost(callMeta.model, event.inputTokens, event.outputTokens)
          : 0;

        set({
          isActive: false,
          currentToolName: null,
          _currentPhaseIndex: null,
          sessionInputTokens: event.inputTokens,
          sessionOutputTokens: event.outputTokens,
          sessionThinkingTokens: event.thinkingTokens,
          callElapsedMs: finalElapsed,
          estimatedCost: cost,
        });

        const durationStr = formatDuration(finalElapsed);
        const costStr = cost > 0 ? ` · $${cost.toFixed(4)}` : '';
        _push('done', `Complete in ${durationStr}${costStr}`, {
          tokens: {
            input: event.inputTokens,
            output: event.outputTokens,
            thinking: event.thinkingTokens,
          },
        });
        // Auto-load diagnostics when a call completes
        get().loadDiagnostics();
        break;
      }

      case 'error':
        set({ isActive: false, currentToolName: null, _currentPhaseIndex: null });
        _push('error', event.message);
        break;

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

  /**
   * Query the main process for an in-flight CLI stream and restore the
   * activity panel state so the user sees ongoing activity after a refresh.
   */
  recoverActiveStream: async () => {
    try {
      const active = await window.novelEngine.chat.getActiveStream();
      if (!active) return;

      const agentInfo = AGENT_REGISTRY[active.agentName];
      const startedAt = new Date(active.startedAt).getTime();

      set({
        isActive: true,
        callMeta: {
          agentName: active.agentName,
          agentColor: agentInfo?.color ?? '#71717A',
          agentRole: agentInfo?.role ?? '',
          model: active.model,
          modelLabel: active.model.includes('opus') ? 'Opus 4' : active.model.includes('sonnet') ? 'Sonnet 4' : active.model,
          bookSlug: active.bookSlug,
          startedAt,
        },
        callElapsedMs: Date.now() - startedAt,
      });

      get()._push('status', `Reconnected to active ${active.agentName} call (started ${new Date(active.startedAt).toLocaleTimeString()})`);
    } catch {
      // Non-critical — recovery is best-effort
    }
  },
}));

/** Format milliseconds into a human-readable duration */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
}
