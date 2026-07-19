import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StreamEvent, StreamEventSource } from '@domain/types';
import { useModalChatStore } from './modalChatStore';
import {
  installNovelEngineMock,
  makeConversation,
  makeMessage,
  type NovelEngineMock,
} from '../../test/novelEngineMock';
import { resetStoresBeforeEach } from '../../test/resetStores';

resetStoresBeforeEach(useModalChatStore);

type EnrichedEvent = StreamEvent & { callId?: string; conversationId?: string; source?: StreamEventSource };

const voiceConvo = makeConversation({
  id: 'voice-conv',
  bookSlug: 'book-a',
  agentName: 'Verity',
  purpose: 'voice-setup',
});

let mock: NovelEngineMock;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mock = installNovelEngineMock();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  useModalChatStore.getState().destroyStreamListener();
  errorSpy.mockRestore();
});

function emit(event: EnrichedEvent): void {
  mock.emit('chat:streamEvent', event);
}

describe('modalChatStore', () => {
  describe('open', () => {
    it('reuses an existing conversation matching purpose + book and loads its messages', async () => {
      mock.chat.getConversations.mockResolvedValue([
        makeConversation({ id: 'other', bookSlug: 'book-a', purpose: 'pipeline' }),
        voiceConvo,
      ]);
      mock.chat.getMessages.mockResolvedValue([makeMessage({ conversationId: 'voice-conv' })]);

      await useModalChatStore.getState().open('voice-setup', 'book-a');

      const state = useModalChatStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.purpose).toBe('voice-setup');
      expect(state.bookSlug).toBe('book-a');
      expect(state.conversation?.id).toBe('voice-conv');
      expect(state.messages).toHaveLength(1);
      expect(mock.chat.createConversation).not.toHaveBeenCalled();
    });

    it('creates a Verity conversation when none exists for the purpose', async () => {
      mock.chat.createConversation.mockResolvedValue(voiceConvo);

      await useModalChatStore.getState().open('voice-setup', 'book-a');

      expect(mock.chat.createConversation).toHaveBeenCalledWith({
        bookSlug: 'book-a',
        agentName: 'Verity',
        pipelinePhase: null,
        purpose: 'voice-setup',
      });
      expect(useModalChatStore.getState().messages).toEqual([]);
      expect(useModalChatStore.getState().isOpen).toBe(true);
    });

    it('open failure leaves the modal closed', async () => {
      mock.chat.getConversations.mockRejectedValue(new Error('db down'));

      await useModalChatStore.getState().open('voice-setup', 'book-a');

      expect(useModalChatStore.getState().isOpen).toBe(false);
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('closes immediately when idle, but defers while streaming until done arrives', async () => {
      mock.chat.createConversation.mockResolvedValue(voiceConvo);
      await useModalChatStore.getState().open('voice-setup', 'book-a');
      useModalChatStore.getState().initStreamListener();

      useModalChatStore.setState({ isStreaming: true, _activeCallId: 'call-m' });
      useModalChatStore.getState().close();
      expect(useModalChatStore.getState().isOpen).toBe(true);
      expect(useModalChatStore.getState()._closeRequested).toBe(true);

      mock.chat.getMessages.mockResolvedValue([makeMessage({ conversationId: 'voice-conv' })]);
      emit({
        type: 'done', inputTokens: 0, outputTokens: 0, thinkingTokens: 0, filesTouched: {},
        callId: 'call-m', conversationId: 'voice-conv',
      });

      await vi.waitFor(() => expect(useModalChatStore.getState().isOpen).toBe(false));
      expect(useModalChatStore.getState()._closeRequested).toBe(false);
      expect(useModalChatStore.getState().isStreaming).toBe(false);

      // Idle close is immediate
      useModalChatStore.setState({ isOpen: true });
      useModalChatStore.getState().close();
      expect(useModalChatStore.getState().isOpen).toBe(false);
    });
  });

  describe('sendMessage', () => {
    beforeEach(async () => {
      mock.chat.createConversation.mockResolvedValue(voiceConvo);
      await useModalChatStore.getState().open('voice-setup', 'book-a');
    });

    it('sends through the bridge with the conversation agent and a fresh callId', async () => {
      await useModalChatStore.getState().sendMessage('describe my voice', 2000);

      const params = mock.chat.send.mock.calls[0][0];
      expect(params).toMatchObject({
        agentName: 'Verity',
        message: 'describe my voice',
        conversationId: 'voice-conv',
        bookSlug: 'book-a',
        thinkingBudgetOverride: 2000,
      });
      expect(useModalChatStore.getState()._activeCallId).toBe(params.callId);
      expect(useModalChatStore.getState().isStreaming).toBe(true);
      expect(useModalChatStore.getState().messages.at(-1)).toMatchObject({
        role: 'user',
        content: 'describe my voice',
      });
    });

    it('replaces the optimistic message with an error message on bridge rejection', async () => {
      mock.chat.send.mockRejectedValue(new Error('CLI busy'));

      await useModalChatStore.getState().sendMessage('hello');

      const state = useModalChatStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]).toMatchObject({ role: 'assistant', content: 'Error: CLI busy' });
      expect(state.isStreaming).toBe(false);
      expect(state._activeCallId).toBeNull();
    });
  });

  describe('stream events', () => {
    beforeEach(async () => {
      mock.chat.createConversation.mockResolvedValue(voiceConvo);
      await useModalChatStore.getState().open('voice-setup', 'book-a');
      useModalChatStore.getState().initStreamListener();
      useModalChatStore.setState({ isStreaming: true, _activeCallId: 'call-m' });
    });

    it('accumulates deltas for its own conversation only (strict conversation guard)', () => {
      emit({ type: 'blockStart', blockType: 'thinking', callId: 'call-m', conversationId: 'voice-conv' });
      expect(useModalChatStore.getState().isThinking).toBe(true);

      emit({ type: 'textDelta', text: 'Your voice is', callId: 'call-m', conversationId: 'voice-conv' });
      emit({ type: 'textDelta', text: 'BLEED', callId: 'call-m', conversationId: 'other-conv' });

      expect(useModalChatStore.getState().streamBuffer).toBe('Your voice is');
    });

    it('error events append an error message, reset, and honor a pending close request', async () => {
      useModalChatStore.getState().close(); // streaming → deferred
      emit({ type: 'error', message: 'stream died', callId: 'call-m', conversationId: 'voice-conv' });

      const state = useModalChatStore.getState();
      expect(state.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'Error: stream died' });
      expect(state.isStreaming).toBe(false);
      expect(state.isOpen).toBe(false); // pending close applied
    });
  });

  it('initStreamListener replaces any prior listener; destroy detaches', () => {
    useModalChatStore.getState().initStreamListener();
    useModalChatStore.getState().initStreamListener();
    expect(mock.listenerCount('chat:streamEvent')).toBe(1);

    useModalChatStore.getState().destroyStreamListener();
    expect(mock.listenerCount('chat:streamEvent')).toBe(0);
  });
});
