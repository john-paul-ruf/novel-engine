import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StreamEvent, StreamEventSource } from '@domain/types';
import { useHelperStore } from './helperStore';
import {
  installNovelEngineMock,
  makeConversation,
  makeMessage,
  type NovelEngineMock,
} from '../../test/novelEngineMock';
import { resetStoresBeforeEach } from '../../test/resetStores';

resetStoresBeforeEach(useHelperStore);

type EnrichedEvent = StreamEvent & { callId?: string; conversationId?: string; source?: StreamEventSource };

const helperConvo = makeConversation({ id: 'helper-conv', agentName: 'Helper', purpose: 'helper' });

let mock: NovelEngineMock;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mock = installNovelEngineMock();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  useHelperStore.getState().destroyStreamListener();
  errorSpy.mockRestore();
});

function emit(event: EnrichedEvent): void {
  mock.emit('chat:streamEvent', event);
}

async function openHelper(): Promise<void> {
  mock.helper.getOrCreateConversation.mockResolvedValue(helperConvo);
  mock.helper.getMessages.mockResolvedValue([makeMessage({ conversationId: 'helper-conv' })]);
  await useHelperStore.getState().open();
}

describe('helperStore', () => {
  it('open loads (or creates) the helper conversation and its messages', async () => {
    await openHelper();

    const state = useHelperStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(state.conversation?.id).toBe('helper-conv');
    expect(state.messages).toHaveLength(1);
  });

  it('open failure clears the loading flag but keeps the panel open', async () => {
    mock.helper.getOrCreateConversation.mockRejectedValue(new Error('db down'));

    await useHelperStore.getState().open();

    expect(useHelperStore.getState().isOpen).toBe(true);
    expect(useHelperStore.getState().isLoading).toBe(false);
    expect(useHelperStore.getState().conversation).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('toggle opens when closed and closes when open; close is blocked while streaming', async () => {
    useHelperStore.getState().toggle();
    expect(useHelperStore.getState().isOpen).toBe(true);

    useHelperStore.setState({ isStreaming: true });
    useHelperStore.getState().close();
    expect(useHelperStore.getState().isOpen).toBe(true); // pinned: no close mid-stream

    useHelperStore.setState({ isStreaming: false });
    useHelperStore.getState().toggle();
    expect(useHelperStore.getState().isOpen).toBe(false);
  });

  it('sendMessage appends optimistically and scopes the stream to a fresh callId', async () => {
    await openHelper();

    await useHelperStore.getState().sendMessage('how do I export?');

    const params = mock.helper.send.mock.calls[0][0];
    expect(params.conversationId).toBe('helper-conv');
    expect(params.callId).toBeTruthy();
    const state = useHelperStore.getState();
    expect(state._activeCallId).toBe(params.callId);
    expect(state.isStreaming).toBe(true);
    expect(state.messages.at(-1)).toMatchObject({ role: 'user', content: 'how do I export?' });
  });

  it('sendMessage without a conversation is a no-op; bridge rejection rolls back the temp message', async () => {
    await useHelperStore.getState().sendMessage('hello?');
    expect(mock.helper.send).not.toHaveBeenCalled();

    await openHelper();
    const messageCount = useHelperStore.getState().messages.length;
    mock.helper.send.mockRejectedValue(new Error('helper offline'));

    await useHelperStore.getState().sendMessage('hello?');

    expect(useHelperStore.getState().messages).toHaveLength(messageCount);
    expect(useHelperStore.getState().isStreaming).toBe(false);
    expect(useHelperStore.getState()._activeCallId).toBeNull();
  });

  it('streams thinking/text deltas for the active call and enforces the conversation guard', async () => {
    await openHelper();
    useHelperStore.getState().initStreamListener();
    useHelperStore.setState({ isStreaming: true, _activeCallId: 'call-h' });

    emit({ type: 'blockStart', blockType: 'thinking', callId: 'call-h', conversationId: 'helper-conv' });
    expect(useHelperStore.getState().isThinking).toBe(true);

    emit({ type: 'thinkingDelta', text: 'let me check', callId: 'call-h', conversationId: 'helper-conv' });
    emit({ type: 'textDelta', text: 'Use Exports.', callId: 'call-h', conversationId: 'helper-conv' });
    expect(useHelperStore.getState().thinkingBuffer).toBe('let me check');
    expect(useHelperStore.getState().streamBuffer).toBe('Use Exports.');

    // alwaysCheckConversationId: another conversation's events never bleed in
    emit({ type: 'textDelta', text: 'BLEED', callId: 'call-h', conversationId: 'other-conv' });
    expect(useHelperStore.getState().streamBuffer).toBe('Use Exports.');
  });

  it('done reloads the messages and resets streaming state', async () => {
    await openHelper();
    useHelperStore.getState().initStreamListener();
    useHelperStore.setState({ isStreaming: true, _activeCallId: 'call-h', streamBuffer: 'partial' });
    mock.helper.getMessages.mockResolvedValue([
      makeMessage({ id: 'q', role: 'user', conversationId: 'helper-conv' }),
      makeMessage({ id: 'a', conversationId: 'helper-conv' }),
    ]);

    emit({
      type: 'done', inputTokens: 1, outputTokens: 2, thinkingTokens: 0, filesTouched: {},
      callId: 'call-h', conversationId: 'helper-conv',
    });

    await vi.waitFor(() => expect(useHelperStore.getState().isStreaming).toBe(false));
    expect(useHelperStore.getState().messages.map((m) => m.id)).toEqual(['q', 'a']);
    expect(useHelperStore.getState().streamBuffer).toBe('');
    expect(useHelperStore.getState()._activeCallId).toBeNull();
  });

  it('error events append an error message and reset', async () => {
    await openHelper();
    useHelperStore.getState().initStreamListener();
    useHelperStore.setState({ isStreaming: true, _activeCallId: 'call-h' });

    emit({ type: 'error', message: 'helper crashed', callId: 'call-h', conversationId: 'helper-conv' });

    const state = useHelperStore.getState();
    expect(state.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'Error: helper crashed' });
    expect(state.isStreaming).toBe(false);
  });

  it('abort forwards to the bridge only with a conversation', async () => {
    useHelperStore.getState().abort();
    expect(mock.helper.abort).not.toHaveBeenCalled();

    await openHelper();
    useHelperStore.getState().abort();
    expect(mock.helper.abort).toHaveBeenCalledWith('helper-conv');
  });

  it('resetConversation clears everything via the bridge', async () => {
    await openHelper();

    await useHelperStore.getState().resetConversation();

    expect(mock.helper.reset).toHaveBeenCalled();
    expect(useHelperStore.getState().conversation).toBeNull();
    expect(useHelperStore.getState().messages).toEqual([]);
  });

  it('initStreamListener registers a single listener; destroy removes it', () => {
    useHelperStore.getState().initStreamListener();
    useHelperStore.getState().initStreamListener();
    expect(mock.listenerCount('chat:streamEvent')).toBe(1);

    useHelperStore.getState().destroyStreamListener();
    expect(mock.listenerCount('chat:streamEvent')).toBe(0);
  });
});
