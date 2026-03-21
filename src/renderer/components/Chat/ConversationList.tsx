import { useCallback, useState } from 'react';
import { AGENT_REGISTRY, CREATIVE_AGENT_NAMES } from '@domain/constants';
import type { AgentName, Conversation, PipelinePhaseId } from '@domain/types';
import { useBookStore } from '../../stores/bookStore';
import { useChatStore } from '../../stores/chatStore';

function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'Just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;

  return new Date(isoDate).toLocaleDateString();
}

type ConversationListProps = {
  expanded: boolean;
  onToggle: () => void;
};

export function ConversationList({
  expanded,
  onToggle,
}: ConversationListProps): React.ReactElement {
  // Granular selectors — bare useChatStore() re-renders on every streaming delta.
  const conversations = useChatStore((s) => s.conversations);
  const activeConversation = useChatStore((s) => s.activeConversation);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const createConversation = useChatStore((s) => s.createConversation);
  const pipelineLocked = useChatStore((s) => s.pipelineLocked);
  const lockedAgentName = useChatStore((s) => s.lockedAgentName);
  const lockedPhaseId = useChatStore((s) => s.lockedPhaseId);
  const { activeSlug } = useBookStore();
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredConversations = pipelineLocked && lockedAgentName && lockedPhaseId
    ? conversations.filter(
        (c) =>
          // Match the locked phase
          (c.agentName === lockedAgentName && c.pipelinePhase === lockedPhaseId && c.purpose === 'pipeline') ||
          // Always show special-purpose conversations
          c.purpose === 'voice-setup' ||
          c.purpose === 'author-profile',
      )
    : conversations;

  const handleDelete = useCallback(
    async (e: React.MouseEvent, conversationId: string) => {
      e.stopPropagation();
      if (deletingId === conversationId) {
        await deleteConversation(conversationId);
        setDeletingId(null);
      } else {
        setDeletingId(conversationId);
      }
    },
    [deletingId, deleteConversation]
  );

  const handleNewConversation = useCallback(
    async (agentName: AgentName, phase: PipelinePhaseId | null = null) => {
      if (!activeSlug) return;
      await createConversation(agentName, activeSlug, phase);
      setShowAgentPicker(false);
    },
    [activeSlug, createConversation]
  );

  const handleConversationClick = useCallback(
    async (conv: Conversation) => {
      setDeletingId(null);
      await setActiveConversation(conv.id);
    },
    [setActiveConversation]
  );

  return (
    <div className="border-b border-zinc-200 dark:border-zinc-800">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-6 py-2 text-xs font-medium uppercase tracking-wider text-zinc-500 hover:text-zinc-500 dark:hover:text-zinc-400"
      >
        <span>
          Conversations ({filteredConversations.length}
          {pipelineLocked && filteredConversations.length !== conversations.length && (
            <span className="text-zinc-400 dark:text-zinc-600">/{conversations.length}</span>
          )})
        </span>
        <span>{expanded ? '▼' : '▶'}</span>
      </button>

      {expanded && (
        <div className="max-h-48 overflow-y-auto px-3 pb-2">
          {filteredConversations.map((conv) => {
            const meta = AGENT_REGISTRY[conv.agentName];
            const isActive = activeConversation?.id === conv.id;
            const isConfirmingDelete = deletingId === conv.id;

            return (
              <div
                key={conv.id}
                onClick={() => handleConversationClick(conv)}
                className={`group flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm ${
                  isActive
                    ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                <div
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: meta.color }}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center truncate text-xs font-medium">
                    <span className="truncate">{conv.agentName}: {conv.title || 'New conversation'}</span>
                    {conv.purpose === 'voice-setup' && (
                      <span className="ml-2 shrink-0 rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] text-purple-300">
                        Voice Setup
                      </span>
                    )}
                    {conv.purpose === 'author-profile' && (
                      <span className="ml-2 shrink-0 rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] text-purple-300">
                        Author Profile
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-zinc-400 dark:text-zinc-600">
                    {formatRelativeTime(conv.updatedAt)}
                  </div>
                </div>

                <button
                  onClick={(e) => handleDelete(e, conv.id)}
                  className={`shrink-0 rounded p-1 text-xs transition-colors ${
                    isConfirmingDelete
                      ? 'bg-red-600/20 text-red-600 dark:text-red-400'
                      : 'text-zinc-400 dark:text-zinc-600 opacity-0 hover:text-red-600 dark:text-red-400 group-hover:opacity-100'
                  }`}
                  title={isConfirmingDelete ? 'Click again to confirm delete' : 'Delete conversation'}
                >
                  {isConfirmingDelete ? '✕' : '🗑'}
                </button>
              </div>
            );
          })}

          {filteredConversations.length === 0 && (
            <div className="px-3 py-2 text-xs text-zinc-400 dark:text-zinc-600">
              No conversations yet
            </div>
          )}

          <div className="mt-1">
            {pipelineLocked && lockedAgentName && lockedPhaseId ? (
              <button
                onClick={() => handleNewConversation(lockedAgentName, lockedPhaseId)}
                className="flex w-full items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-zinc-500 dark:hover:text-zinc-400"
              >
                <span>+</span> New {lockedAgentName} Conversation
              </button>
            ) : showAgentPicker ? (
              <div className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 p-2">
                <div className="mb-1 text-[10px] font-medium uppercase text-zinc-500">
                  Select Agent
                </div>
                {CREATIVE_AGENT_NAMES.map((name) => {
                  const meta = AGENT_REGISTRY[name];
                  return (
                    <button
                      key={name}
                      onClick={() => handleNewConversation(name)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    >
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: meta.color }}
                      />
                      <span>{name}</span>
                      <span className="text-zinc-400 dark:text-zinc-600">{meta.role}</span>
                    </button>
                  );
                })}
                <button
                  onClick={() => setShowAgentPicker(false)}
                  className="mt-1 w-full rounded px-2 py-1 text-[10px] text-zinc-500 hover:text-zinc-500 dark:hover:text-zinc-400"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAgentPicker(true)}
                className="flex w-full items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-zinc-500 dark:hover:text-zinc-400"
              >
                <span>+</span> New Conversation
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
