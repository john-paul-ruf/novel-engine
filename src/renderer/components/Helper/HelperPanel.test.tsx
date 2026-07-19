import { describe, it, expect, vi, beforeAll } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { HelperPanel } from './HelperPanel';
import { useHelperStore } from '../../stores/helperStore';
import { renderApp, type StoreSeed } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { makeMessage } from '../../../test/novelEngineMock';

resetStoresBeforeEach(useHelperStore);

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
});

function renderPanel(extra: Record<string, unknown> = {}) {
  const stores: StoreSeed = [[useHelperStore, { isOpen: true, ...extra }]];
  return renderApp(<HelperPanel />, { stores });
}

describe('HelperPanel', () => {
  it('renders nothing while closed', () => {
    const { container } = renderApp(<HelperPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the header, greeting, and message history', () => {
    renderPanel({
      messages: [makeMessage({ id: 'a1', role: 'assistant', content: 'Ask away!' })],
    });

    expect(screen.getByText('Help & FAQ')).toBeInTheDocument();
    expect(screen.getByText('Ask away!')).toBeInTheDocument();
  });

  it('sends the typed question and clears the input', async () => {
    const sendMessage = vi.fn(async () => undefined);
    renderPanel({ sendMessage });

    const input = screen.getByPlaceholderText('Ask anything about Novel Engine...');
    fireEvent.change(input, { target: { value: 'What is Forge?' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(sendMessage).toHaveBeenCalledWith('What is Forge?');
    expect(input).toHaveValue('');
  });

  it('disables input while streaming', () => {
    renderPanel({ isStreaming: true });

    expect(screen.getByPlaceholderText('Waiting for response...')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('close hides the panel; reset starts a fresh conversation', async () => {
    const resetConversation = vi.fn(async () => undefined);
    const open = vi.fn(async () => undefined);
    renderPanel({ resetConversation, open });

    fireEvent.click(screen.getByTitle('Start fresh conversation'));
    await waitFor(() => expect(resetConversation).toHaveBeenCalled());
    expect(open).toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('Close'));
    expect(useHelperStore.getState().isOpen).toBe(false);
  });
});
