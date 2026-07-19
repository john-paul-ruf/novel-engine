import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PitchDraft, StreamEvent, StreamEventSource } from '@domain/types';
import { PITCH_ROOM_SLUG } from '@domain/constants';
import { usePitchRoomStore } from './pitchRoomStore';
import {
  installNovelEngineMock,
  makeBookMeta,
  makeConversation,
  makeMessage,
  type NovelEngineMock,
} from '../../test/novelEngineMock';
import { resetStoresBeforeEach } from '../../test/resetStores';

resetStoresBeforeEach(usePitchRoomStore);

type EnrichedEvent = StreamEvent & { callId?: string; conversationId?: string; source?: StreamEventSource };

const pitch1 = makeConversation({
  id: 'pitch-1',
  bookSlug: PITCH_ROOM_SLUG,
  agentName: 'Spark',
  purpose: 'pitch-room',
});
const pitch2 = makeConversation({
  id: 'pitch-2',
  bookSlug: PITCH_ROOM_SLUG,
  agentName: 'Spark',
  purpose: 'pitch-room',
});

function makeDraft(overrides: Partial<PitchDraft> = {}): PitchDraft {
  return {
    conversationId: 'pitch-1',
    title: 'Storm Book',
    hasPitch: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

let mock: NovelEngineMock;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mock = installNovelEngineMock();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  usePitchRoomStore.getState().destroyStreamListener();
  errorSpy.mockRestore();
});

function emit(event: EnrichedEvent): void {
  mock.emit('chat:streamEvent', event);
}

describe('pitchRoomStore', () => {
  it('loadConversations keeps only pitch-room-purpose conversations', async () => {
    mock.chat.getConversations.mockResolvedValue([
      pitch1,
      makeConversation({ id: 'stray', bookSlug: PITCH_ROOM_SLUG, purpose: 'pipeline' }),
    ]);

    await usePitchRoomStore.getState().loadConversations();

    expect(mock.chat.getConversations).toHaveBeenCalledWith(PITCH_ROOM_SLUG);
    expect(usePitchRoomStore.getState().conversations.map((c) => c.id)).toEqual(['pitch-1']);
  });

  it('setActiveConversation loads messages and refreshes the draft status', async () => {
    usePitchRoomStore.setState({ conversations: [pitch1] });
    mock.chat.getMessages.mockResolvedValue([makeMessage({ conversationId: 'pitch-1' })]);
    mock.pitchRoom.getDraft.mockResolvedValue(makeDraft());

    await usePitchRoomStore.getState().setActiveConversation('pitch-1');

    const state = usePitchRoomStore.getState();
    expect(state.activeConversation?.id).toBe('pitch-1');
    expect(state.messages).toHaveLength(1);
    expect(state.hasPitch).toBe(true);
    expect(mock.pitchRoom.getDraft).toHaveBeenCalledWith('pitch-1');
  });

  it('startNewConversation creates a Spark pitch-room conversation and prepends it', async () => {
    usePitchRoomStore.setState({ conversations: [pitch1], hasPitch: true });
    mock.chat.createConversation.mockResolvedValue(pitch2);

    await usePitchRoomStore.getState().startNewConversation();

    expect(mock.chat.createConversation).toHaveBeenCalledWith({
      bookSlug: PITCH_ROOM_SLUG,
      agentName: 'Spark',
      pipelinePhase: null,
      purpose: 'pitch-room',
    });
    const state = usePitchRoomStore.getState();
    expect(state.conversations.map((c) => c.id)).toEqual(['pitch-2', 'pitch-1']);
    expect(state.activeConversation?.id).toBe('pitch-2');
    expect(state.messages).toEqual([]);
    expect(state.hasPitch).toBe(false);
  });

  it('deleteConversation switches to the next most recent when the active one is deleted', async () => {
    usePitchRoomStore.setState({ conversations: [pitch1, pitch2], activeConversation: pitch1 });
    mock.chat.getMessages.mockResolvedValue([makeMessage({ conversationId: 'pitch-2' })]);

    await usePitchRoomStore.getState().deleteConversation('pitch-1');

    const state = usePitchRoomStore.getState();
    expect(state.conversations.map((c) => c.id)).toEqual(['pitch-2']);
    expect(state.activeConversation?.id).toBe('pitch-2');
    expect(state.messages).toHaveLength(1);

    // Deleting the last one clears everything
    await usePitchRoomStore.getState().deleteConversation('pitch-2');
    expect(usePitchRoomStore.getState().activeConversation).toBeNull();
    expect(usePitchRoomStore.getState().messages).toEqual([]);
  });

  describe('ensureConversation', () => {
    it('selects the most recent existing pitch conversation', async () => {
      mock.chat.getConversations.mockResolvedValue([pitch1, pitch2]);
      mock.chat.getMessages.mockResolvedValue([]);

      await usePitchRoomStore.getState().ensureConversation();

      expect(usePitchRoomStore.getState().activeConversation?.id).toBe('pitch-1');
      expect(mock.chat.createConversation).not.toHaveBeenCalled();
    });

    it('creates the first conversation when none exist', async () => {
      mock.chat.createConversation.mockResolvedValue(pitch1);

      await usePitchRoomStore.getState().ensureConversation();

      expect(mock.chat.createConversation).toHaveBeenCalledTimes(1);
      expect(usePitchRoomStore.getState().activeConversation?.id).toBe('pitch-1');
      expect(usePitchRoomStore.getState().loading).toBe(false);
    });

    it('is a no-op when a conversation is already active', async () => {
      usePitchRoomStore.setState({ activeConversation: pitch1 });

      await usePitchRoomStore.getState().ensureConversation();

      expect(mock.chat.getConversations).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    beforeEach(() => {
      usePitchRoomStore.setState({ activeConversation: pitch1, conversations: [pitch1] });
    });

    it('sends under the pitch-room slug with an optimistic user message', async () => {
      await usePitchRoomStore.getState().sendMessage('a heist on a generation ship');

      const params = mock.chat.send.mock.calls[0][0];
      expect(params).toMatchObject({
        agentName: 'Spark',
        conversationId: 'pitch-1',
        bookSlug: PITCH_ROOM_SLUG,
      });
      expect(usePitchRoomStore.getState()._activeCallId).toBe(params.callId);
      expect(usePitchRoomStore.getState().isStreaming).toBe(true);
      expect(usePitchRoomStore.getState().messages.at(-1)).toMatchObject({
        role: 'user',
        content: 'a heist on a generation ship',
      });
    });

    it('bridge rejection swaps the temp message for an error message', async () => {
      mock.chat.send.mockRejectedValue(new Error('Spark unavailable'));

      await usePitchRoomStore.getState().sendMessage('idea');

      const state = usePitchRoomStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]).toMatchObject({ role: 'assistant', content: 'Error: Spark unavailable' });
      expect(state.isStreaming).toBe(false);
    });
  });

  it('done reloads messages + conversations and re-checks the draft status', async () => {
    usePitchRoomStore.setState({
      activeConversation: pitch1,
      conversations: [pitch1],
      isStreaming: true,
      _activeCallId: 'call-p',
    });
    usePitchRoomStore.getState().initStreamListener();
    mock.chat.getMessages.mockResolvedValue([makeMessage({ conversationId: 'pitch-1' })]);
    mock.chat.getConversations.mockResolvedValue([pitch1, pitch2]);
    mock.pitchRoom.getDraft.mockResolvedValue(makeDraft());

    emit({
      type: 'done', inputTokens: 0, outputTokens: 0, thinkingTokens: 0, filesTouched: {},
      callId: 'call-p', conversationId: 'pitch-1',
    });

    await vi.waitFor(() => expect(usePitchRoomStore.getState().isStreaming).toBe(false));
    const state = usePitchRoomStore.getState();
    expect(state.messages).toHaveLength(1);
    expect(state.conversations.map((c) => c.id)).toEqual(['pitch-1', 'pitch-2']);
    await vi.waitFor(() => expect(usePitchRoomStore.getState().hasPitch).toBe(true));
  });

  it('stream deltas honor the strict conversation guard', () => {
    usePitchRoomStore.setState({
      activeConversation: pitch1,
      isStreaming: true,
      _activeCallId: 'call-p',
    });
    usePitchRoomStore.getState().initStreamListener();

    emit({ type: 'textDelta', text: 'What if', callId: 'call-p', conversationId: 'pitch-1' });
    emit({ type: 'textDelta', text: 'BLEED', callId: 'call-p', conversationId: 'other' });

    expect(usePitchRoomStore.getState().streamBuffer).toBe('What if');
  });

  describe('promoteActivePitch', () => {
    it('promotes the active draft and returns the new book slug', async () => {
      usePitchRoomStore.setState({ activeConversation: pitch1, hasPitch: true });
      mock.pitchRoom.promote.mockResolvedValue(makeBookMeta({ slug: 'storm-book' }));

      const slug = await usePitchRoomStore.getState().promoteActivePitch();

      expect(slug).toBe('storm-book');
      expect(mock.pitchRoom.promote).toHaveBeenCalledWith('pitch-1');
      expect(usePitchRoomStore.getState().isPromoting).toBe(false);
      expect(usePitchRoomStore.getState().hasPitch).toBe(false);
    });

    it('returns null without an active conversation or on bridge failure', async () => {
      expect(await usePitchRoomStore.getState().promoteActivePitch()).toBeNull();

      usePitchRoomStore.setState({ activeConversation: pitch1 });
      mock.pitchRoom.promote.mockRejectedValue(new Error('no pitch.md'));

      expect(await usePitchRoomStore.getState().promoteActivePitch()).toBeNull();
      expect(usePitchRoomStore.getState().isPromoting).toBe(false);
    });
  });

  it('refreshDraftStatus failure and missing conversation both clear hasPitch', async () => {
    usePitchRoomStore.setState({ hasPitch: true });
    await usePitchRoomStore.getState().refreshDraftStatus();
    expect(usePitchRoomStore.getState().hasPitch).toBe(false);

    usePitchRoomStore.setState({ activeConversation: pitch1, hasPitch: true });
    mock.pitchRoom.getDraft.mockRejectedValue(new Error('fs error'));
    await usePitchRoomStore.getState().refreshDraftStatus();
    expect(usePitchRoomStore.getState().hasPitch).toBe(false);
  });

  it('initStreamListener keeps the FIRST registration (pinned: no re-register); destroy detaches', () => {
    usePitchRoomStore.getState().initStreamListener();
    usePitchRoomStore.getState().initStreamListener();
    expect(mock.listenerCount('chat:streamEvent')).toBe(1);

    usePitchRoomStore.getState().destroyStreamListener();
    expect(mock.listenerCount('chat:streamEvent')).toBe(0);
  });
});
