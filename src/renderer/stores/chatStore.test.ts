import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StreamEvent, StreamEventSource } from '@domain/types';
import { useChatStore, _flushDeltasForTesting } from './chatStore';
import { useBookStore } from './bookStore';
import { usePipelineStore } from './pipelineStore';
import { useFileChangeStore } from './fileChangeStore';
import { useAutoDraftStore } from './autoDraftStore';
import {
  installNovelEngineMock,
  makeActiveStreamInfo,
  makeConversation,
  makeMessage,
  makeUsageRecord,
  type NovelEngineMock,
} from '../../test/novelEngineMock';
import { resetStoresBeforeEach } from '../../test/resetStores';

resetStoresBeforeEach(
  useBookStore,
  usePipelineStore,
  useFileChangeStore,
  useAutoDraftStore,
  useChatStore,
);

/** Bridge events arrive enriched with callId/conversationId/source by the IPC layer. */
type EnrichedEvent = StreamEvent & {
  callId?: string;
  conversationId?: string;
  source?: StreamEventSource;
};

let mock: NovelEngineMock;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mock = installNovelEngineMock();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  // Clears the bridge listeners AND the recovery poll interval
  useChatStore.getState().destroyStreamListener();
  vi.useRealTimers();
  errorSpy.mockRestore();
});

function emit(event: EnrichedEvent): void {
  mock.emit('chat:streamEvent', event);
}

const convA = makeConversation({ id: 'conv-a', bookSlug: 'book-a' });

describe('chatStore', () => {
  describe('loadConversations', () => {
    it('populates the conversation list', async () => {
      mock.chat.getConversations.mockResolvedValue([convA]);

      await useChatStore.getState().loadConversations('book-a');

      expect(useChatStore.getState().conversations).toEqual([convA]);
      expect(useChatStore.getState().activeConversation).toBeNull();
    });

    it('restores the saved per-book conversation when it still exists', async () => {
      const conv2 = makeConversation({ id: 'conv-2', bookSlug: 'book-a' });
      window.localStorage.setItem('novel-engine-convo:book-a', 'conv-2');
      mock.chat.getConversations.mockResolvedValue([convA, conv2]);
      mock.chat.getMessages.mockResolvedValue([makeMessage({ conversationId: 'conv-2' })]);
      mock.usage.byConversation.mockResolvedValue([makeUsageRecord()]);

      await useChatStore.getState().loadConversations('book-a');

      await vi.waitFor(() =>
        expect(useChatStore.getState().activeConversation?.id).toBe('conv-2'),
      );
      expect(useChatStore.getState().messages).toHaveLength(1);
      expect(useChatStore.getState().conversationUsage).toHaveLength(1);
    });

    it('ignores a saved conversation id that is no longer in the list', async () => {
      window.localStorage.setItem('novel-engine-convo:book-a', 'ghost-conv');
      mock.chat.getConversations.mockResolvedValue([convA]);

      await useChatStore.getState().loadConversations('book-a');

      expect(useChatStore.getState().activeConversation).toBeNull();
      expect(mock.chat.getMessages).not.toHaveBeenCalled();
    });
  });

  describe('createConversation', () => {
    it('prepends the new conversation, activates it, and persists the per-book key', async () => {
      useBookStore.setState({ activeSlug: 'book-a' });
      useChatStore.setState({ conversations: [convA], messages: [makeMessage()] });
      const created = makeConversation({ id: 'conv-new', bookSlug: 'book-a' });
      mock.chat.createConversation.mockResolvedValue(created);

      await useChatStore.getState().createConversation('Spark', 'book-a', 'pitch');

      expect(mock.chat.createConversation).toHaveBeenCalledWith({
        bookSlug: 'book-a',
        agentName: 'Spark',
        pipelinePhase: 'pitch',
        purpose: 'pipeline',
      });
      expect(useChatStore.getState().conversations.map((c) => c.id)).toEqual(['conv-new', 'conv-a']);
      expect(useChatStore.getState().activeConversation?.id).toBe('conv-new');
      expect(useChatStore.getState().messages).toEqual([]);
      expect(window.localStorage.getItem('novel-engine-convo:book-a')).toBe('conv-new');
    });
  });

  describe('setActiveConversation', () => {
    it('loads messages and usage, activates, and persists the per-book key', async () => {
      useBookStore.setState({ activeSlug: 'book-a' });
      useChatStore.setState({ conversations: [convA] });
      mock.chat.getMessages.mockResolvedValue([makeMessage({ conversationId: 'conv-a' })]);
      mock.usage.byConversation.mockResolvedValue([makeUsageRecord({ conversationId: 'conv-a' })]);

      await useChatStore.getState().setActiveConversation('conv-a');

      expect(useChatStore.getState().activeConversation?.id).toBe('conv-a');
      expect(useChatStore.getState().messages).toHaveLength(1);
      expect(useChatStore.getState().conversationUsage).toHaveLength(1);
      expect(window.localStorage.getItem('novel-engine-convo:book-a')).toBe('conv-a');
    });
  });

  describe('sendMessage', () => {
    it('does nothing without an active conversation', async () => {
      await useChatStore.getState().sendMessage('hello');
      expect(mock.chat.send).not.toHaveBeenCalled();
    });

    it('optimistically appends the user message and scopes the stream to a fresh callId', async () => {
      useBookStore.setState({ activeSlug: 'book-a' });
      useChatStore.setState({ activeConversation: convA });

      await useChatStore.getState().sendMessage('write chapter one', 5000);

      const params = mock.chat.send.mock.calls[0][0];
      expect(params).toMatchObject({
        agentName: 'Spark',
        message: 'write chapter one',
        conversationId: 'conv-a',
        bookSlug: 'book-a',
        thinkingBudgetOverride: 5000,
      });
      expect(params.callId).toBeTruthy();

      const state = useChatStore.getState();
      expect(state._activeCallId).toBe(params.callId);
      expect(state.isStreaming).toBe(true);
      expect(state.statusMessage).not.toBe('');
      expect(state.messages.at(-1)).toMatchObject({ role: 'user', content: 'write chapter one' });
    });

    it('replaces the optimistic message with an error message when the bridge rejects', async () => {
      useBookStore.setState({ activeSlug: 'book-a' });
      useChatStore.setState({ activeConversation: convA });
      mock.chat.send.mockRejectedValue(new Error('CLI not available'));

      await useChatStore.getState().sendMessage('hello');

      const state = useChatStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]).toMatchObject({
        role: 'assistant',
        content: 'Error: CLI not available',
      });
      expect(state.isStreaming).toBe(false);
      expect(state._activeCallId).toBeNull();
    });
  });

  describe('deleteConversation', () => {
    it('removes the active conversation, clears messages, and drops the persisted key', async () => {
      useBookStore.setState({ activeSlug: 'book-a' });
      window.localStorage.setItem('novel-engine-convo:book-a', 'conv-a');
      useChatStore.setState({
        conversations: [convA],
        activeConversation: convA,
        messages: [makeMessage()],
      });

      await useChatStore.getState().deleteConversation('conv-a');

      expect(mock.chat.deleteConversation).toHaveBeenCalledWith('conv-a');
      expect(useChatStore.getState().conversations).toEqual([]);
      expect(useChatStore.getState().activeConversation).toBeNull();
      expect(useChatStore.getState().messages).toEqual([]);
      expect(window.localStorage.getItem('novel-engine-convo:book-a')).toBeNull();
    });

    it('keeps the active conversation when deleting a different one', async () => {
      const other = makeConversation({ id: 'conv-x' });
      useChatStore.setState({
        conversations: [convA, other],
        activeConversation: convA,
        messages: [makeMessage()],
      });

      await useChatStore.getState().deleteConversation('conv-x');

      expect(useChatStore.getState().conversations).toEqual([convA]);
      expect(useChatStore.getState().activeConversation?.id).toBe('conv-a');
      expect(useChatStore.getState().messages).toHaveLength(1);
    });
  });

  describe('stream listener + event guards', () => {
    it('initStreamListener registers exactly one listener per channel, re-init replaces it', () => {
      useChatStore.getState().initStreamListener();
      useChatStore.getState().initStreamListener();
      expect(mock.listenerCount('chat:streamEvent')).toBe(1);
      expect(mock.listenerCount('chat:filesChanged')).toBe(1);

      useChatStore.getState().destroyStreamListener();
      expect(mock.listenerCount('chat:streamEvent')).toBe(0);
      expect(mock.listenerCount('chat:filesChanged')).toBe(0);
    });

    it('accumulates deltas and tracks thinking state for the active call', () => {
      useChatStore.getState().initStreamListener();
      useChatStore.setState({ isStreaming: true, _activeCallId: 'call-1' });

      emit({ type: 'blockStart', blockType: 'thinking', callId: 'call-1' });
      expect(useChatStore.getState().isThinking).toBe(true);

      emit({ type: 'thinkingDelta', text: 'hmm ', callId: 'call-1' });
      emit({ type: 'thinkingDelta', text: 'ok', callId: 'call-1' });
      _flushDeltasForTesting();
      expect(useChatStore.getState().thinkingBuffer).toBe('hmm ok');

      emit({ type: 'blockStart', blockType: 'text', callId: 'call-1' });
      expect(useChatStore.getState().isThinking).toBe(false);

      emit({ type: 'textDelta', text: 'Once upon', callId: 'call-1' });
      emit({ type: 'textDelta', text: ' a time', callId: 'call-1' });
      _flushDeltasForTesting();
      expect(useChatStore.getState().streamBuffer).toBe('Once upon a time');

      emit({ type: 'status', message: 'Reading files…', callId: 'call-1' });
      expect(useChatStore.getState().statusMessage).toBe('Reading files…');

      emit({ type: 'warning', message: 'context is tight', callId: 'call-1' });
      expect(useChatStore.getState().warningMessage).toBe('context is tight');

      emit({ type: 'multiCallProgress', step: 2, totalSteps: 5, label: 'Pass 2', callId: 'call-1' });
      expect(useChatStore.getState().multiCallProgress).toEqual({
        step: 2,
        totalSteps: 5,
        label: 'Pass 2',
      });
    });

    it('ignores events from other calls, revision events, and stale events', () => {
      useChatStore.getState().initStreamListener();
      useChatStore.setState({ isStreaming: true, _activeCallId: 'call-1' });

      emit({ type: 'textDelta', text: 'bleed', callId: 'other-call' });
      emit({ type: 'textDelta', text: 'bleed', callId: 'call-1', source: 'revision' });
      emit({ type: 'textDelta', text: 'bleed', callId: 'rev:session-1' });
      _flushDeltasForTesting();
      expect(useChatStore.getState().streamBuffer).toBe('');

      // Stale: no active call, not streaming
      useChatStore.setState({ isStreaming: false, _activeCallId: null });
      emit({ type: 'textDelta', text: 'stale' });
      _flushDeltasForTesting();
      expect(useChatStore.getState().streamBuffer).toBe('');
    });

    it('recovery mode (streaming without callId) accepts only the active conversation', () => {
      useChatStore.getState().initStreamListener();
      useChatStore.setState({
        isStreaming: true,
        _activeCallId: null,
        activeConversation: convA,
      });

      emit({ type: 'textDelta', text: 'wrong', conversationId: 'conv-x' });
      _flushDeltasForTesting();
      expect(useChatStore.getState().streamBuffer).toBe('');

      emit({ type: 'textDelta', text: 'right', conversationId: 'conv-a' });
      _flushDeltasForTesting();
      expect(useChatStore.getState().streamBuffer).toBe('right');
    });

    it('done reloads messages + usage and maps tool activity to the last assistant message', async () => {
      useChatStore.getState().initStreamListener();
      useChatStore.setState({
        isStreaming: true,
        _activeCallId: 'call-1',
        activeConversation: convA,
      });
      const assistant = makeMessage({ id: 'msg-final', conversationId: 'conv-a' });
      mock.chat.getMessages.mockResolvedValue([
        makeMessage({ id: 'msg-user', role: 'user', conversationId: 'conv-a' }),
        assistant,
      ]);
      mock.usage.byConversation.mockResolvedValue([makeUsageRecord({ conversationId: 'conv-a' })]);

      emit({
        type: 'toolUse',
        tool: { toolName: 'Write', toolId: 't1', filePath: 'chapters/01-one/draft.md', status: 'complete' },
        callId: 'call-1',
      });
      expect(useChatStore.getState().toolActivity).toEqual(['chapters/01-one/draft.md']);

      emit({
        type: 'done',
        inputTokens: 10,
        outputTokens: 20,
        thinkingTokens: 0,
        filesTouched: {},
        callId: 'call-1',
      });

      await vi.waitFor(() => expect(useChatStore.getState().isStreaming).toBe(false));
      const state = useChatStore.getState();
      expect(state.messages.map((m) => m.id)).toEqual(['msg-user', 'msg-final']);
      expect(state.conversationUsage).toHaveLength(1);
      expect(state.messageToolActivity['msg-final']).toEqual(['chapters/01-one/draft.md']);
      expect(state.toolActivity).toEqual([]);
      expect(state.streamBuffer).toBe('');
      expect(state._activeCallId).toBeNull();
    });

    it('error events append an error message and reset the streaming state', () => {
      useChatStore.getState().initStreamListener();
      useChatStore.setState({
        isStreaming: true,
        _activeCallId: 'call-1',
        activeConversation: convA,
        streamBuffer: 'partial',
      });

      emit({ type: 'error', message: 'CLI crashed', callId: 'call-1' });

      const state = useChatStore.getState();
      expect(state.messages.at(-1)).toMatchObject({
        role: 'assistant',
        content: 'Error: CLI crashed',
      });
      expect(state.isStreaming).toBe(false);
      expect(state.streamBuffer).toBe('');
      expect(state._activeCallId).toBeNull();
    });

    it('filesChanged pushes refresh the changed book pipeline, but file/word UI only for the active book', async () => {
      const loadPipeline = vi.fn(async () => undefined);
      usePipelineStore.setState({ loadPipeline });
      useBookStore.setState({ activeSlug: 'book-a' });
      useChatStore.getState().initStreamListener();

      mock.emit('chat:filesChanged', ['chapters/01-one/draft.md'], 'book-a');
      expect(loadPipeline).toHaveBeenCalledWith('book-a');
      expect(useFileChangeStore.getState().revision).toBe(1);
      await vi.waitFor(() => expect(mock.books.wordCount).toHaveBeenCalledTimes(1));

      // Background book: pipeline cache refresh only — no revision bump, no word count
      mock.emit('chat:filesChanged', ['chapters/02-two/draft.md'], 'book-b');
      expect(loadPipeline).toHaveBeenCalledWith('book-b');
      expect(useFileChangeStore.getState().revision).toBe(1);
      expect(mock.books.wordCount).toHaveBeenCalledTimes(1);

      // Legacy push without a slug falls back to the active book
      mock.emit('chat:filesChanged', ['source/pitch.md'], undefined);
      expect(loadPipeline).toHaveBeenLastCalledWith('book-a');
      expect(useFileChangeStore.getState().revision).toBe(2);
    });
  });

  describe('attachToExternalStream', () => {
    it('marks the stream external and optionally appends an optimistic user message', () => {
      useChatStore.getState().attachToExternalStream('call-ext', 'conv-a', 'Revise chapter 3');

      const state = useChatStore.getState();
      expect(state.isStreaming).toBe(true);
      expect(state._activeCallId).toBe('call-ext');
      expect(state._streamOrigin).toBe('external');
      expect(state.messages.at(-1)).toMatchObject({ role: 'user', content: 'Revise chapter 3' });
    });
  });

  describe('switchBook', () => {
    // Regression (S22 bug candidate, fixed): setActiveBook flips bookStore.activeSlug
    // BEFORE calling switchBook, so the departing slug is now passed explicitly —
    // the departing conversation saves under the OLD book's key and the new book's
    // saved spot survives.
    it('saves the departing conversation under its own key and restores the new book saved spot', async () => {
      const convB1 = makeConversation({ id: 'conv-b1', bookSlug: 'book-b' });
      const convB2 = makeConversation({ id: 'conv-b2', bookSlug: 'book-b' });
      window.localStorage.setItem('novel-engine-convo:book-b', 'conv-b2');
      useBookStore.setState({ activeSlug: 'book-b' }); // setActiveBook already flipped the slug
      useChatStore.setState({ activeConversation: convA, messages: [makeMessage()] });
      mock.chat.getConversations.mockResolvedValue([convB1, convB2]);
      mock.chat.getMessages.mockResolvedValue([]);

      await useChatStore.getState().switchBook('book-b', 'book-a');

      // The new book's saved spot survives and is restored
      expect(useChatStore.getState().activeConversation?.id).toBe('conv-b2');
      // The departing book's conversation was saved under its own key
      expect(window.localStorage.getItem('novel-engine-convo:book-a')).toBe(convA.id);
      expect(window.localStorage.getItem('novel-engine-convo:book-b')).toBe('conv-b2');
    });

    it('restores the saved conversation when no conversation was active on the departing book', async () => {
      const convB1 = makeConversation({ id: 'conv-b1', bookSlug: 'book-b' });
      const convB2 = makeConversation({ id: 'conv-b2', bookSlug: 'book-b' });
      window.localStorage.setItem('novel-engine-convo:book-b', 'conv-b2');
      useBookStore.setState({ activeSlug: 'book-b' });
      mock.chat.getConversations.mockResolvedValue([convB1, convB2]);
      mock.chat.getMessages.mockResolvedValue([]);

      await useChatStore.getState().switchBook('book-b');

      expect(useChatStore.getState().activeConversation?.id).toBe('conv-b2');
    });

    it('recovers an in-flight stream on the new book and re-scopes the callId', async () => {
      const convB = makeConversation({ id: 'conv-b', bookSlug: 'book-b' });
      useBookStore.setState({ activeSlug: 'book-b' });
      mock.chat.getConversations.mockResolvedValue([convB]);
      mock.chat.getMessages.mockResolvedValue([makeMessage({ conversationId: 'conv-b' })]);
      mock.chat.getActiveStreamForBook.mockResolvedValue(
        makeActiveStreamInfo({
          conversationId: 'conv-b',
          bookSlug: 'book-b',
          callId: 'call-live',
          textBuffer: 'partial text',
          thinkingBuffer: '',
        }),
      );

      await useChatStore.getState().switchBook('book-b');

      const state = useChatStore.getState();
      expect(state.isStreaming).toBe(true);
      expect(state.streamBuffer).toBe('partial text');
      expect(state._activeCallId).toBe('call-live');
      expect(state.activeConversation?.id).toBe('conv-b');
      expect(window.localStorage.getItem('novel-engine-convo:book-b')).toBe('conv-b');
    });
  });

  describe('recoverActiveStream', () => {
    it('surfaces the first orphaned session when nothing is streaming', async () => {
      mock.chat.getOrphanedSessions.mockResolvedValue([
        {
          id: 'sess-1',
          conversationId: 'conv-a',
          agentName: 'Spark',
          model: 'test-model',
          bookSlug: 'book-a',
          startedAt: '2026-01-01T00:00:00.000Z',
          endedAt: null,
          finalStage: 'drafting',
          filesTouched: {},
          interrupted: true,
        },
      ]);

      await useChatStore.getState().recoverActiveStream();

      expect(useChatStore.getState().interruptedSession?.id).toBe('sess-1');
      useChatStore.getState().dismissInterrupted();
      expect(useChatStore.getState().interruptedSession).toBeNull();
    });

    it('restores streaming UI from the active stream snapshot and polls until the stream ends', async () => {
      vi.useFakeTimers();
      useChatStore.setState({ conversations: [convA] });
      mock.chat.getActiveStream.mockResolvedValue(
        makeActiveStreamInfo({
          conversationId: 'conv-a',
          callId: 'call-rec',
          textBuffer: 'so far',
          thinkingBuffer: 'pondering',
          progressStage: 'editing',
        }),
      );
      mock.chat.getMessages.mockResolvedValue([makeMessage({ conversationId: 'conv-a' })]);

      await useChatStore.getState().recoverActiveStream();

      const state = useChatStore.getState();
      expect(state.isStreaming).toBe(true);
      expect(state.streamBuffer).toBe('so far');
      expect(state.thinkingBuffer).toBe('pondering');
      expect(state.progressStage).toBe('editing');
      expect(state._activeCallId).toBe('call-rec');
      expect(state.activeConversation?.id).toBe('conv-a');

      // Stream finishes while only the poll is watching
      mock.chat.getActiveStream.mockResolvedValue(null);
      mock.usage.byConversation.mockResolvedValue([makeUsageRecord()]);
      await vi.advanceTimersByTimeAsync(2000);

      expect(useChatStore.getState().isStreaming).toBe(false);
      expect(useChatStore.getState().streamBuffer).toBe('');

      // Poll cleared itself — no further getActiveStream calls
      const calls = mock.chat.getActiveStream.mock.calls.length;
      await vi.advanceTimersByTimeAsync(4000);
      expect(mock.chat.getActiveStream.mock.calls.length).toBe(calls);
    });
  });
});
