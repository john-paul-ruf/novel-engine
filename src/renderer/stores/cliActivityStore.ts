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

/** Metadata about a single CLI call */
type CallMeta = {
  agentName: AgentName;
  agentColor: string;
  agentRole: string;
  model: string;
  modelLabel: string;
  bookSlug: string;
  startedAt: number;
};

/** State for a single CLI call — multiple can be tracked concurrently */
export type CliCall = {
  callId: string;
  callMeta: CallMeta;
  entries: CliActivityEntry[];
  isActive: boolean;
  currentToolName: string | null;
  streamingThinkingChars: number;
  streamingTextChars: number;
  phases: PhaseSpan[];
  _currentPhaseIndex: number | null;
  sessionInputTokens: number;
  sessionOutputTokens: number;
  sessionThinkingTokens: number;
  estimatedCost: number | null;
  callElapsedMs: number;
  toolUseCount: number;
  toolUseBreakdown: Record<string, number>;
  diagnostics: ContextDiagnostics | null;
  _nextEntryId: number;
};

/** StreamEvent augmented with callId injected by the IPC layer */
type TaggedStreamEvent = StreamEvent & { callId?: string };

type CliActivityState = {
  /** All tracked calls, keyed by callId. Includes active and recently completed. */
  calls: Record<string, CliCall>;

  /** Ordered list of callIds (most recent first) for display */
  callOrder: string[];

  /** Which call is currently selected for detail view in the panel */
  selectedCallId: string | null;

  isOpen: boolean;

  toggle: () => void;
  open: () => void;
  close: () => void;
  clear: () => void;
  clearCall: (callId: string) => void;
  selectCall: (callId: string) => void;
  handleStreamEvent: (event: TaggedStreamEvent) => void;
  loadDiagnostics: (callId: string) => Promise<void>;
  updateElapsed: () => void;

  /** Number of currently active calls */
  activeCallCount: () => number;

  _cleanupListener: (() => void) | null;
  initListener: () => void;
  destroyListener: () => void;
  recoverActiveStream: () => Promise<void>;
};

const MAX_ENTRIES_PER_CALL = 500;
const MAX_COMPLETED_CALLS = 10;

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

/** Format milliseconds into a human-readable duration */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
}

function createCall(callId: string, meta: CallMeta): CliCall {
  return {
    callId,
    callMeta: meta,
    entries: [],
    isActive: true,
    currentToolName: null,
    streamingThinkingChars: 0,
    streamingTextChars: 0,
    phases: [],
    _currentPhaseIndex: null,
    sessionInputTokens: 0,
    sessionOutputTokens: 0,
    sessionThinkingTokens: 0,
    estimatedCost: null,
    callElapsedMs: 0,
    toolUseCount: 0,
    toolUseBreakdown: {},
    diagnostics: null,
    _nextEntryId: 0,
  };
}

function pushEntry(call: CliCall, kind: CliActivityEntryKind, message: string, extra?: Partial<CliActivityEntry>): CliCall {
  const entry: CliActivityEntry = {
    id: call._nextEntryId,
    timestamp: Date.now(),
    kind,
    message,
    ...extra,
  };
  return {
    ...call,
    _nextEntryId: call._nextEntryId + 1,
    entries: [...call.entries.slice(-MAX_ENTRIES_PER_CALL + 1), entry],
  };
}

/** Prune completed calls beyond the limit, keeping the most recent */
function pruneCompletedCalls(calls: Record<string, CliCall>, callOrder: string[]): { calls: Record<string, CliCall>; callOrder: string[] } {
  const completedIds = callOrder.filter((id) => !calls[id]?.isActive);
  if (completedIds.length <= MAX_COMPLETED_CALLS) return { calls, callOrder };

  const toRemove = new Set(completedIds.slice(MAX_COMPLETED_CALLS));
  const nextCalls = { ...calls };
  for (const id of toRemove) {
    delete nextCalls[id];
  }
  return {
    calls: nextCalls,
    callOrder: callOrder.filter((id) => !toRemove.has(id)),
  };
}

export const useCliActivityStore = create<CliActivityState>((set, get) => ({
  calls: {},
  callOrder: [],
  selectedCallId: null,
  isOpen: false,
  _cleanupListener: null,

  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),

  clear: () => set({
    calls: {},
    callOrder: [],
    selectedCallId: null,
  }),

  clearCall: (callId: string) => set((s) => {
    const nextCalls = { ...s.calls };
    delete nextCalls[callId];
    const nextOrder = s.callOrder.filter((id) => id !== callId);
    const nextSelected = s.selectedCallId === callId
      ? (nextOrder[0] ?? null)
      : s.selectedCallId;
    return { calls: nextCalls, callOrder: nextOrder, selectedCallId: nextSelected };
  }),

  selectCall: (callId: string) => set({ selectedCallId: callId }),

  activeCallCount: () => {
    const { calls } = get();
    return Object.values(calls).filter((c) => c.isActive).length;
  },

  updateElapsed: () => {
    const { calls } = get();
    let changed = false;
    const updated: Record<string, CliCall> = {};

    for (const [id, call] of Object.entries(calls)) {
      if (call.isActive && call.callMeta) {
        changed = true;
        updated[id] = { ...call, callElapsedMs: Date.now() - call.callMeta.startedAt };
      } else {
        updated[id] = call;
      }
    }

    if (changed) set({ calls: updated });
  },

  handleStreamEvent: (event: TaggedStreamEvent) => {
    const { calls, callOrder, selectedCallId } = get();

    // Determine callId — use the injected one, or fall back to a default
    let callId = event.callId ?? '_default';

    if (event.type === 'callStart') {
      const agentInfo = AGENT_REGISTRY[event.agentName];
      const meta: CallMeta = {
        agentName: event.agentName,
        agentColor: agentInfo?.color ?? '#71717A',
        agentRole: agentInfo?.role ?? '',
        model: event.model,
        modelLabel: getModelLabel(event.model),
        bookSlug: event.bookSlug,
        startedAt: Date.now(),
      };

      let newCall = createCall(callId, meta);
      newCall = pushEntry(newCall, 'spawn', `${event.agentName} call started (${getModelLabel(event.model)})`);

      const newOrder = [callId, ...callOrder.filter((id) => id !== callId)];
      const newCalls = { ...calls, [callId]: newCall };
      const pruned = pruneCompletedCalls(newCalls, newOrder);

      set({
        calls: pruned.calls,
        callOrder: pruned.callOrder,
        // Auto-select the new call if nothing is selected or if the panel just opened
        selectedCallId: selectedCallId && calls[selectedCallId]?.isActive ? selectedCallId : callId,
      });
      return;
    }

    // For non-callStart events, find the call to update
    let call = calls[callId];

    // Fallback: if no callId match, try the most recently started active call
    if (!call) {
      const activeId = callOrder.find((id) => calls[id]?.isActive);
      if (activeId) {
        callId = activeId;
        call = calls[activeId];
      }
    }

    // If still no match and it's a status event without any calls, create a default call
    if (!call) {
      if (event.type === 'status') {
        const defaultCall = createCall(callId, {
          agentName: 'Wrangler' as AgentName,
          agentColor: '#71717A',
          agentRole: '',
          model: 'unknown',
          modelLabel: 'Unknown',
          bookSlug: '',
          startedAt: Date.now(),
        });
        const updated = pushEntry(defaultCall, 'status', (event as { message: string }).message);
        set({
          calls: { ...calls, [callId]: updated },
          callOrder: [callId, ...callOrder],
          selectedCallId: selectedCallId ?? callId,
        });
      }
      return;
    }

    let updated = { ...call };

    switch (event.type) {
      case 'status':
        updated = pushEntry(updated, 'status', event.message);
        break;

      case 'blockStart': {
        const now = Date.now();
        if (event.blockType === 'thinking') {
          const span: PhaseSpan = { label: 'Thinking', startedAt: now, endedAt: null, durationMs: null };
          updated = {
            ...updated,
            phases: [...updated.phases, span],
            _currentPhaseIndex: updated.phases.length,
          };
          updated = pushEntry(updated, 'thinking-start', 'Extended thinking started');
        } else if (event.blockType === 'text') {
          const span: PhaseSpan = { label: 'Generating', startedAt: now, endedAt: null, durationMs: null };
          updated = {
            ...updated,
            phases: [...updated.phases, span],
            _currentPhaseIndex: updated.phases.length,
          };
          updated = pushEntry(updated, 'text-start', 'Response text streaming');
        }
        break;
      }

      case 'blockEnd': {
        const now = Date.now();
        if (updated._currentPhaseIndex !== null && updated.phases[updated._currentPhaseIndex]) {
          const updatedPhases = [...updated.phases];
          const phase = { ...updatedPhases[updated._currentPhaseIndex] };
          phase.endedAt = now;
          phase.durationMs = now - phase.startedAt;
          updatedPhases[updated._currentPhaseIndex] = phase;
          updated = { ...updated, phases: updatedPhases, _currentPhaseIndex: null };
        }
        if (event.blockType === 'thinking') {
          const estTokens = Math.round(updated.streamingThinkingChars / CHARS_PER_TOKEN);
          updated = pushEntry(updated, 'thinking-end', `Thinking complete (~${estTokens.toLocaleString()} tokens est.)`);
        } else if (event.blockType === 'text') {
          const estTokens = Math.round(updated.streamingTextChars / CHARS_PER_TOKEN);
          updated = pushEntry(updated, 'text-end', `Text complete (~${estTokens.toLocaleString()} tokens est.)`);
        }
        break;
      }

      case 'thinkingDelta':
        updated = { ...updated, streamingThinkingChars: updated.streamingThinkingChars + event.text.length };
        break;

      case 'textDelta':
        updated = { ...updated, streamingTextChars: updated.streamingTextChars + event.text.length };
        break;

      case 'toolUse': {
        const { tool } = event;
        if (tool.status === 'started') {
          const now = Date.now();
          const span: PhaseSpan = { label: `Tool: ${tool.toolName}`, startedAt: now, endedAt: null, durationMs: null };
          updated = {
            ...updated,
            currentToolName: tool.toolName,
            phases: [...updated.phases, span],
            _currentPhaseIndex: updated.phases.length,
            toolUseCount: updated.toolUseCount + 1,
            toolUseBreakdown: {
              ...updated.toolUseBreakdown,
              [tool.toolName]: (updated.toolUseBreakdown[tool.toolName] ?? 0) + 1,
            },
          };
          const fileInfo = tool.filePath ? ` \u2192 ${tool.filePath}` : '';
          updated = pushEntry(updated, 'tool-start', `${tool.toolName}${fileInfo}`, { tool });
        } else if (tool.status === 'complete') {
          const now = Date.now();
          if (updated._currentPhaseIndex !== null && updated.phases[updated._currentPhaseIndex]) {
            const updatedPhases = [...updated.phases];
            const phase = { ...updatedPhases[updated._currentPhaseIndex] };
            phase.endedAt = now;
            phase.durationMs = now - phase.startedAt;
            updatedPhases[updated._currentPhaseIndex] = phase;
            updated = { ...updated, phases: updatedPhases, _currentPhaseIndex: null };
          }
          const fileInfo = tool.filePath ? ` \u2192 ${tool.filePath}` : '';
          updated = pushEntry(updated, 'tool-complete', `${tool.toolName} done${fileInfo}`, { tool });
          updated = { ...updated, currentToolName: null };
        } else if (tool.status === 'error') {
          const now = Date.now();
          if (updated._currentPhaseIndex !== null && updated.phases[updated._currentPhaseIndex]) {
            const updatedPhases = [...updated.phases];
            const phase = { ...updatedPhases[updated._currentPhaseIndex] };
            phase.endedAt = now;
            phase.durationMs = now - phase.startedAt;
            updatedPhases[updated._currentPhaseIndex] = phase;
            updated = { ...updated, phases: updatedPhases, _currentPhaseIndex: null };
          }
          updated = pushEntry(updated, 'tool-error', `${tool.toolName} failed`, { tool });
          updated = { ...updated, currentToolName: null };
        }
        break;
      }

      case 'filesChanged':
        updated = pushEntry(updated, 'files-changed', `${event.paths.length} file(s) modified`, {
          detail: event.paths.join('\n'),
        });
        break;

      case 'done': {
        const finalElapsed = Date.now() - updated.callMeta.startedAt;
        const cost = estimateCost(updated.callMeta.model, event.inputTokens, event.outputTokens);

        updated = {
          ...updated,
          isActive: false,
          currentToolName: null,
          _currentPhaseIndex: null,
          sessionInputTokens: event.inputTokens,
          sessionOutputTokens: event.outputTokens,
          sessionThinkingTokens: event.thinkingTokens,
          callElapsedMs: finalElapsed,
          estimatedCost: cost,
        };

        const durationStr = formatDuration(finalElapsed);
        const costStr = cost > 0 ? ` \u00b7 $${cost.toFixed(4)}` : '';
        updated = pushEntry(updated, 'done', `Complete in ${durationStr}${costStr}`, {
          tokens: {
            input: event.inputTokens,
            output: event.outputTokens,
            thinking: event.thinkingTokens,
          },
        });
        break;
      }

      case 'error':
        updated = {
          ...updated,
          isActive: false,
          currentToolName: null,
          _currentPhaseIndex: null,
        };
        updated = pushEntry(updated, 'error', event.message);
        break;

      default:
        break;
    }

    const nextCalls = { ...calls, [callId]: updated };
    set({ calls: nextCalls });

    // Auto-load diagnostics when a call completes
    if (event.type === 'done') {
      get().loadDiagnostics(callId);
    }
  },

  loadDiagnostics: async (callId: string) => {
    try {
      const diag = await window.novelEngine.context.getLastDiagnostics();
      if (!diag) return;

      const { calls } = get();
      const call = calls[callId];
      if (!call) return;

      let updated: CliCall = { ...call, diagnostics: diag };
      updated = pushEntry(
        updated,
        'context-loaded',
        `Context: ${diag.filesAvailable.length} files, ${diag.conversationTurnsSent} turns sent (${diag.conversationTurnsDropped} dropped), ~${diag.manifestTokenEstimate.toLocaleString()} manifest tokens`,
      );

      set({ calls: { ...get().calls, [callId]: updated } });
    } catch {
      // Non-critical — diagnostics are optional
    }
  },

  initListener: () => {
    const { _cleanupListener } = get();
    if (_cleanupListener) _cleanupListener();

    const cleanup = window.novelEngine.chat.onStreamEvent((event) => {
      get().handleStreamEvent(event as TaggedStreamEvent);
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
      const callId = `recovered:${active.conversationId}`;

      const meta: CallMeta = {
        agentName: active.agentName,
        agentColor: agentInfo?.color ?? '#71717A',
        agentRole: agentInfo?.role ?? '',
        model: active.model,
        modelLabel: getModelLabel(active.model),
        bookSlug: active.bookSlug,
        startedAt,
      };

      let call = createCall(callId, meta);
      call = {
        ...call,
        callElapsedMs: Date.now() - startedAt,
      };
      call = pushEntry(call, 'status', `Reconnected to active ${active.agentName} call (started ${new Date(active.startedAt).toLocaleTimeString()})`);

      set((s) => ({
        calls: { ...s.calls, [callId]: call },
        callOrder: [callId, ...s.callOrder.filter((id) => id !== callId)],
        selectedCallId: s.selectedCallId ?? callId,
      }));
    } catch {
      // Non-critical — recovery is best-effort
    }
  },
}));
