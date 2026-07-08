import { useCallback, useEffect, useMemo, useState } from 'react';
import { AGENT_REGISTRY } from '@domain/constants';
import type { CreativeAgentName, PipelinePhase } from '@domain/types';
import { useBookStore } from '../../stores/bookStore';
import { useChatStore } from '../../stores/chatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { agentColor } from '../common/agentColors';
import { ChatInput } from '../Chat/ChatInput';
import { MessageList } from '../Chat/MessageList';
import { Icon } from '../common/Icon';
import { usePhaseConversations } from './usePhaseConversations';

function shortRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Conversation dropdown chip — replaces ConversationList inside the workspace.
 */
function ConversationChip({ phaseId }: { phaseId: string }): React.ReactElement {
  const { conversations, activeConversation, selectConversation, createConversation } =
    usePhaseConversations(phaseId);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative min-w-0">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex max-w-full items-center gap-1.5 rounded-md border border-ne-line bg-ne-bg2 px-2.5 py-1 text-[11px] text-ne-ink-dim transition-colors hover:border-ne-brass/50 hover:text-ne-ink"
        title="Switch conversation"
      >
        <span className="truncate">
          {activeConversation?.title || 'New conversation'}
        </span>
        {conversations.length > 1 && (
          <span className="shrink-0 rounded-full bg-ne-bg3 px-1.5 text-[9px] text-ne-ink-faint">
            {conversations.length}
          </span>
        )}
        <Icon name="chevronDown" size={11} strokeWidth={2} className="shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-40 mt-1 w-72 rounded-lg border border-ne-line bg-ne-bg1 py-1 shadow-xl">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => {
                  setOpen(false);
                  void selectConversation(conversation.id);
                }}
                className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-xs hover:bg-ne-bg2 ${
                  conversation.id === activeConversation?.id
                    ? 'text-ne-brass-hi'
                    : 'text-ne-ink-dim'
                }`}
              >
                <span className="min-w-0 flex-1 truncate">
                  {conversation.title || 'Untitled'}
                </span>
                <span className="shrink-0 text-[10px] text-ne-ink-faint">
                  {shortRelativeTime(conversation.updatedAt)}
                </span>
              </button>
            ))}
            {conversations.length > 0 && <div className="my-1 border-t border-ne-line-soft" />}
            <button
              onClick={() => {
                setOpen(false);
                void createConversation();
              }}
              className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs text-ne-ink-dim hover:bg-ne-bg2 hover:text-ne-ink"
            >
              <Icon name="plus" size={11} strokeWidth={2} />
              New conversation
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The workspace chat pane — ChatView's message/stream logic without its
 * chrome (ChatTitleBar / ConversationList / AgentHeader). Identity lives in
 * the phase header; conversations are switched via the dropdown chip.
 */
export function ChatPane({ phase }: { phase: PipelinePhase | null }): React.ReactElement {
  const isStreaming = useChatStore((s) => s.isStreaming);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const interruptedSession = useChatStore((s) => s.interruptedSession);
  const dismissInterrupted = useChatStore((s) => s.dismissInterrupted);
  const { activeSlug } = useBookStore();
  const enableThinking = useSettingsStore((s) => s.settings?.enableThinking ?? false);
  const overrideThinkingBudget = useSettingsStore((s) => s.settings?.overrideThinkingBudget ?? false);
  const globalThinkingBudget = useSettingsStore((s) => s.settings?.thinkingBudget ?? 5000);

  const { activeConversation: phaseConversation, createConversation } =
    usePhaseConversations(phase?.id ?? null);

  // Ad-hoc override — hot takes, deep dives, Spark sessions (untagged
  // conversations routed here via openConversationInWorkspace).
  const adhocConversationId = useWorkspaceStore((s) => s.adhocConversationId);
  const setAdhocConversation = useWorkspaceStore((s) => s.setAdhocConversation);
  const chatActive = useChatStore((s) => s.activeConversation);
  const adhocConversation =
    adhocConversationId && chatActive?.id === adhocConversationId ? chatActive : null;

  const activeConversation = adhocConversation ?? phaseConversation;

  // Same default-budget derivation as ChatView.
  const defaultThinkingBudget = useMemo(() => {
    if (!activeConversation) return 0;
    if (!enableThinking) return 0;
    if (overrideThinkingBudget) return globalThinkingBudget;
    return AGENT_REGISTRY[activeConversation.agentName]?.thinkingBudget ?? 0;
  }, [activeConversation, enableThinking, overrideThinkingBudget, globalThinkingBudget]);

  const [thinkingBudget, setThinkingBudget] = useState<number>(defaultThinkingBudget);
  useEffect(() => {
    setThinkingBudget(defaultThinkingBudget);
  }, [defaultThinkingBudget]);

  // Read-only when the selected phase is neither active nor pending-completion
  // (same rule the legacy ChatView derived from the conversation's phase).
  // Ad-hoc conversations are never read-only — they have no phase gate.
  const isReadOnly =
    adhocConversation === null &&
    phase !== null &&
    phase.status !== 'active' &&
    phase.status !== 'pending-completion';

  // Same send handling as ChatView, including the hot-take quick action.
  const handleSend = useCallback(
    async (content: string) => {
      if (content === '__HOT_TAKE__') {
        if (!activeSlug) return;
        try {
          const { conversationId, callId } = await window.novelEngine.hotTake.start(activeSlug);
          await useChatStore.getState().loadConversations(activeSlug);
          await useChatStore.getState().setActiveConversation(conversationId);
          useChatStore.getState().attachToExternalStream(callId, conversationId);
        } catch (error) {
          console.error('Failed to start hot take:', error);
        }
        return;
      }
      sendMessage(content, thinkingBudget);
      setThinkingBudget(defaultThinkingBudget);
    },
    [sendMessage, thinkingBudget, defaultThinkingBudget, activeSlug],
  );

  return (
    <div data-tour="chat-view" className="flex h-full min-h-0 flex-col">
      {/* Pane header — conversation dropdown chip, or the ad-hoc banner */}
      <div className="flex shrink-0 items-center gap-2 border-b border-ne-line-soft px-4 py-2">
        {adhocConversation ? (
          <div className="flex min-w-0 items-center gap-1.5 rounded-md border border-ne-line bg-ne-bg2 px-2.5 py-1 text-[11px] text-ne-ink-dim">
            <span
              className="inline-block h-[6px] w-[6px] shrink-0 rounded-full"
              style={{ background: agentColor(adhocConversation.agentName) }}
            />
            <span className="truncate">
              {adhocConversation.agentName} — {adhocConversation.title || 'Untitled'}
            </span>
            <button
              onClick={() => setAdhocConversation(null)}
              title="Back to phase conversations"
              className="ml-1 shrink-0 text-ne-ink-faint transition-colors hover:text-ne-ink"
            >
              <Icon name="x" size={11} strokeWidth={2} />
            </button>
          </div>
        ) : phase ? (
          <ConversationChip phaseId={phase.id} />
        ) : (
          <span className="text-[11px] text-ne-ink-faint">No phase selected</span>
        )}
      </div>

      {interruptedSession && (
        <div className="mx-4 mt-2 flex items-center justify-between rounded-lg border border-ne-spark/30 bg-ne-spark/10 px-4 py-2 text-xs text-ne-ink-dim">
          <span>
            Previous <strong className="text-ne-ink">{interruptedSession.agentName}</strong>{' '}
            session was interrupted
            {interruptedSession.finalStage !== 'idle' && (
              <>
                {' '}
                during <strong className="text-ne-ink">{interruptedSession.finalStage}</strong>
              </>
            )}
          </span>
          <button
            onClick={dismissInterrupted}
            className="rounded px-2 py-0.5 text-[11px] text-ne-spark hover:bg-ne-spark/20"
          >
            Dismiss
          </button>
        </div>
      )}

      {activeConversation ? (
        <>
          <MessageList hideStreaming={isReadOnly} />
          <ChatInput
            onSend={(content) => void handleSend(content)}
            disabled={isStreaming || isReadOnly}
            lockedAgentName={null}
            agentName={
              activeConversation.agentName !== 'Wrangler'
                ? (activeConversation.agentName as CreativeAgentName)
                : null
            }
            readOnly={isReadOnly}
            thinkingBudget={thinkingBudget}
            defaultThinkingBudget={defaultThinkingBudget}
            onThinkingBudgetChange={setThinkingBudget}
            compact
          />
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-ne-ink-dim">No conversation for this phase yet</p>
            {phase?.agent && activeSlug && (
              <button
                onClick={() => void createConversation()}
                className="mt-4 rounded-[7px] bg-gradient-to-b from-ne-brass-hi to-ne-brass px-4 py-2 text-xs font-semibold text-ne-bg0 transition-[filter] hover:brightness-110"
              >
                Start with {phase.agent}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
