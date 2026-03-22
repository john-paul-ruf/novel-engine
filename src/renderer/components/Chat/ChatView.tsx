import { useCallback, useEffect, useMemo, useState } from 'react';
import { AGENT_REGISTRY, CREATIVE_AGENT_NAMES, PIPELINE_PHASES } from '@domain/constants';
import type { AgentName, ConversationPurpose, CreativeAgentName, PipelinePhaseId, StreamSessionRecord } from '@domain/types';
import { useBookStore } from '../../stores/bookStore';
import { useChatStore } from '../../stores/chatStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useViewStore } from '../../stores/viewStore';
import { AgentHeader } from './AgentHeader';
import { ChatInput } from './ChatInput';
import { ChatTitleBar } from './ChatTitleBar';
import { ConversationList } from './ConversationList';
import { MessageList } from './MessageList';
import { PipelineLockBanner } from './PipelineLockBanner';

function InterruptedSessionBanner({ session, onDismiss }: { session: StreamSessionRecord; onDismiss: () => void }): React.ReactElement {
  return (
    <div className="mx-4 mt-2 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
      <div className="flex items-center gap-2 text-sm text-amber-300">
        <span>⚠️</span>
        <span>
          Previous <strong>{session.agentName}</strong> session was interrupted
          {session.finalStage !== 'idle' && (
            <> during <strong>{session.finalStage}</strong></>
          )}
        </span>
      </div>
      <button
        onClick={onDismiss}
        className="rounded px-2 py-0.5 text-xs text-amber-400 hover:bg-amber-500/20"
      >
        Dismiss
      </button>
    </div>
  );
}

export function ChatView(): React.ReactElement {
  // Granular selectors — DO NOT use useChatStore() here without a selector.
  // streamBuffer/thinkingBuffer update on every character during streaming;
  // a bare useChatStore() call would re-render the entire ChatView tree on every delta.
  const activeConversation = useChatStore((s) => s.activeConversation);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const createConversation = useChatStore((s) => s.createConversation);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const syncWithPipeline = useChatStore((s) => s.syncWithPipeline);
  const pipelineLocked = useChatStore((s) => s.pipelineLocked);
  const lockedAgentName = useChatStore((s) => s.lockedAgentName);
  const lockedPhaseId = useChatStore((s) => s.lockedPhaseId);
  const interruptedSession = useChatStore((s) => s.interruptedSession);
  const dismissInterrupted = useChatStore((s) => s.dismissInterrupted);
  const { activeSlug } = useBookStore();
  const { activePhase, phases } = usePipelineStore();
  const { payload } = useViewStore();
  const [conversationsExpanded, setConversationsExpanded] = useState(false);

  // True when the currently viewed conversation belongs to a non-active pipeline phase
  // (e.g. a 'complete' or 'pending-completion' phase the user clicked to review).
  // In that case the chat is shown read-only: input disabled, streaming suppressed.
  const isReadOnly = useMemo(() => {
    if (!activeConversation?.pipelinePhase) return false;
    const phase = phases.find((p) => p.id === activeConversation.pipelinePhase);
    return phase ? phase.status !== 'active' && phase.status !== 'pending-completion' : false;
  }, [activeConversation, phases]);

  // Sync pipeline lock state when the active phase changes
  useEffect(() => {
    syncWithPipeline(activePhase);
  }, [activePhase, syncWithPipeline]);
  // Navigate to a specific conversation if payload contains conversationId
  useEffect(() => {
    if (payload.conversationId) {
      setActiveConversation(payload.conversationId);
    }
  }, [payload.conversationId, setActiveConversation]);

  // Load conversations when active book changes
  useEffect(() => {
    if (activeSlug) {
      loadConversations(activeSlug);
    }
  }, [activeSlug, loadConversations]);

  const handleSend = useCallback(
    (content: string) => {
      sendMessage(content);
    },
    [sendMessage]
  );

  return (
    <div className="flex h-full flex-col">
      <ChatTitleBar />
      <ConversationList
        expanded={conversationsExpanded}
        onToggle={() => setConversationsExpanded((prev) => !prev)}
      />
      <PipelineLockBanner />
      {interruptedSession && (
        <InterruptedSessionBanner session={interruptedSession} onDismiss={dismissInterrupted} />
      )}
      {activeConversation ? (
        <>
          <AgentHeader />
          <MessageList hideStreaming={isReadOnly} />
          <ChatInput
            onSend={handleSend}
            disabled={isStreaming || isReadOnly}
            lockedAgentName={pipelineLocked ? lockedAgentName : null}
            agentName={activeConversation.agentName !== 'Wrangler' ? activeConversation.agentName as CreativeAgentName : null}
            readOnly={isReadOnly}
          />
        </>
      ) : (
        <EmptyState activeSlug={activeSlug} createConversation={createConversation} />
      )}
    </div>
  );
}

function EmptyState({
  activeSlug,
  createConversation,
}: {
  activeSlug: string;
  createConversation: (agentName: AgentName, bookSlug: string, phase: PipelinePhaseId | null, purpose?: ConversationPurpose) => Promise<void>;
}): React.ReactElement {
  const pipelineLocked = useChatStore((s) => s.pipelineLocked);
  const lockedAgentName = useChatStore((s) => s.lockedAgentName);
  const lockedPhaseId = useChatStore((s) => s.lockedPhaseId);
  const [selectedAgent, setSelectedAgent] = useState<AgentName>('Spark');

  const handleNewConversation = useCallback(async () => {
    if (!activeSlug) return;

    if (pipelineLocked && lockedAgentName && lockedPhaseId) {
      await createConversation(lockedAgentName, activeSlug, lockedPhaseId);
    } else {
      await createConversation(selectedAgent, activeSlug, null);
    }
  }, [activeSlug, selectedAgent, createConversation, pipelineLocked, lockedAgentName, lockedPhaseId]);

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        {pipelineLocked && lockedAgentName ? (
          <>
            <div
              className="mx-auto mb-3 h-4 w-4 rounded-full"
              style={{ backgroundColor: AGENT_REGISTRY[lockedAgentName].color }}
            />
            <h3 className="text-lg font-medium text-zinc-500 dark:text-zinc-400">
              {lockedAgentName} is ready
            </h3>
            <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-600">
              {AGENT_REGISTRY[lockedAgentName].role}
              {lockedPhaseId && (
                <> — {PIPELINE_PHASES.find(p => p.id === lockedPhaseId)?.label}</>
              )}
            </p>
          </>
        ) : (
          <>
            <h3 className="text-lg font-medium text-zinc-500 dark:text-zinc-400">
              No conversation selected
            </h3>
            <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-600">
              Select a phase from the pipeline or start a new conversation
            </p>
          </>
        )}

        {activeSlug && (
          <div className="mt-6 flex items-center justify-center gap-3">
            {/* Only show agent picker when unlocked */}
            {!pipelineLocked && (
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value as AgentName)}
                className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-blue-500 focus:outline-none"
              >
                {CREATIVE_AGENT_NAMES.map((name) => {
                  const meta = AGENT_REGISTRY[name];
                  return (
                    <option key={name} value={name}>
                      {name} — {meta.role}
                    </option>
                  );
                })}
              </select>
            )}
            <button
              onClick={handleNewConversation}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {pipelineLocked && lockedAgentName
                ? `Start ${lockedAgentName} Conversation`
                : 'New Conversation'}
            </button>
          </div>
        )}

        {!activeSlug && (
          <p className="mt-4 text-sm text-zinc-400 dark:text-zinc-600">
            Create or select a book to get started
          </p>
        )}
      </div>
    </div>
  );
}
