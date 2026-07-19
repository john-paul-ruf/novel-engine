import { describe, it, expect, beforeAll, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { ChatModal } from './ChatModal';
import { useModalChatStore } from '../../stores/modalChatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { makeAppSettings, makeMessage } from '../../../test/novelEngineMock';

resetStoresBeforeEach(useModalChatStore, useSettingsStore);

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
});

function renderModal(state: Record<string, unknown> = {}) {
  const actions = {
    sendMessage: vi.fn(async () => undefined),
    close: vi.fn(),
    initStreamListener: vi.fn(),
    destroyStreamListener: vi.fn(),
  };
  const utils = renderApp(<ChatModal />, {
    stores: [
      [useSettingsStore, { settings: makeAppSettings() }],
      [useModalChatStore, { purpose: 'voice-setup', ...actions, ...state }],
    ],
  });
  return { ...utils, ...actions };
}

describe('ChatModal', () => {
  it('renders purpose-specific header, badge, and the Verity agent bar', () => {
    renderModal();

    expect(screen.getByText('Voice Profile Setup')).toBeInTheDocument();
    expect(
      screen.getByText('Chat with Verity to establish your voice profile'),
    ).toBeInTheDocument();
    expect(screen.getByText('Voice Setup')).toBeInTheDocument();
    expect(screen.getByText('Verity')).toBeInTheDocument();
    expect(screen.getByText('Ghostwriter')).toBeInTheDocument();
  });

  it('shows the empty-conversation hint when idle with no messages', () => {
    renderModal();
    expect(
      screen.getByText('Start the conversation — Verity will guide you.'),
    ).toBeInTheDocument();
  });

  it('renders messages and a pluralised message count', () => {
    renderModal({
      messages: [
        makeMessage({ id: 'm1', role: 'user', content: 'Hi Verity' }),
        makeMessage({ id: 'm2', role: 'assistant', content: 'Hello author' }),
      ],
    });

    expect(screen.getByText('Hi Verity')).toBeInTheDocument();
    expect(screen.getByText('Hello author')).toBeInTheDocument();
    expect(screen.getByText('2 messages')).toBeInTheDocument();
  });

  it("sends with Verity's default thinking budget and registers stream listeners", () => {
    const { sendMessage, initStreamListener, destroyStreamListener, unmount } =
      renderModal();

    expect(initStreamListener).toHaveBeenCalled();

    const textarea = screen.getByPlaceholderText('Type a message...');
    fireEvent.change(textarea, { target: { value: 'Set up my voice' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    // enableThinking on, no override → AGENT_REGISTRY.Verity.thinkingBudget (10000)
    expect(sendMessage).toHaveBeenCalledWith('Set up my voice', 10000);

    unmount();
    expect(destroyStreamListener).toHaveBeenCalled();
  });

  it('closes via the header button when idle', () => {
    const { close } = renderModal();
    fireEvent.click(screen.getByText('✕'));
    expect(close).toHaveBeenCalled();
  });

  it('blocks closing while streaming (button disabled, Escape ignored)', () => {
    const { close } = renderModal({ isStreaming: true });

    expect(screen.getByText('✕')).toBeDisabled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(close).not.toHaveBeenCalled();
  });

  it('closes on Escape when idle', () => {
    const { close } = renderModal();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(close).toHaveBeenCalled();
  });

  it('closes on backdrop click but not on clicks inside the dialog', () => {
    const { close, container } = renderModal();

    fireEvent.click(screen.getByText('Voice Profile Setup'));
    expect(close).not.toHaveBeenCalled();

    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(close).toHaveBeenCalled();
  });

  it('renders the live stream buffer as markdown while streaming', () => {
    renderModal({ isStreaming: true, streamBuffer: 'A **bold** reply' });

    expect(document.querySelector('strong')).toHaveTextContent('bold');
    // Input is disabled during streaming
    expect(screen.getByPlaceholderText('Type a message...')).toBeDisabled();
  });
});
