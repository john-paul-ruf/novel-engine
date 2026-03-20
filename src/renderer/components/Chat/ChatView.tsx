import { useCallback, useEffect, useState } from 'react';
import { AGENT_REGISTRY, CREATIVE_AGENT_NAMES } from '@domain/constants';
import type { AgentName } from '@domain/types';
import { useBookStore } from '../../stores/bookStore';
import { useChatStore } from '../../stores/chatStore';
import { useViewStore } from '../../stores/viewStore';
import { AgentHeader } from './AgentHeader';
import { ChatInput } from './ChatInput';
import { ConversationList } from './ConversationList';
import { MessageList } from './MessageList';

export function ChatView(): React.ReactElement {
  const { activeConversation, isStreaming, sendMessage, initStreamListener, destroyStreamListener, loadConversations, createConversation, setActiveConversation } = useChatStore();
  const { activeSlug } = useBookStore();
  const { payload } = useViewStore();
  const [conversationsExpanded, setConversationsExpanded] = useState(false);

  // Register stream event handler
  useEffect(() => {
    initStreamListener();
    return () => destroyStreamListener();
  }, [initStreamListener, destroyStreamListener]);

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

  // No active conversation — show empty state
  if (!activeConversation) {
    return (
      <div className="flex h-full flex-col">
        <ConversationList
          expanded={conversationsExpanded}
          onToggle={() => setConversationsExpanded((prev) => !prev)}
        />
        <EmptyState activeSlug={activeSlug} createConversation={createConversation} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ConversationList
        expanded={conversationsExpanded}
        onToggle={() => setConversationsExpanded((prev) => !prev)}
      />
      <AgentHeader />
      <MessageList />
      <ChatInput onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}

function EmptyState({
  activeSlug,
  createConversation,
}: {
  activeSlug: string;
  createConversation: (agentName: AgentName, bookSlug: string, phase: null) => Promise<void>;
}): React.ReactElement {
  const [selectedAgent, setSelectedAgent] = useState<AgentName>('Spark');

  const handleNewConversation = useCallback(async () => {
    if (!activeSlug) return;
    await createConversation(selectedAgent, activeSlug, null);
  }, [activeSlug, selectedAgent, createConversation]);

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <h3 className="text-lg font-medium text-zinc-400">
          No conversation selected
        </h3>
        <p className="mt-1 text-sm text-zinc-600">
          Select a phase from the pipeline or start a new conversation
        </p>

        {activeSlug && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value as AgentName)}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
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
            <button
              onClick={handleNewConversation}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              New Conversation
            </button>
          </div>
        )}

        {!activeSlug && (
          <p className="mt-4 text-sm text-zinc-600">
            Create or select a book to get started
          </p>
        )}
      </div>
    </div>
  );
}
