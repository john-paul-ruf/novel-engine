import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatInput } from './ChatInput';
import { useSettingsStore } from '../../stores/settingsStore';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { installNovelEngineMock } from '../../../test/novelEngineMock';

resetStoresBeforeEach(useSettingsStore);

function renderInput(overrides: Partial<Parameters<typeof ChatInput>[0]> = {}) {
  installNovelEngineMock();
  const onSend = vi.fn();
  const onThinkingBudgetChange = vi.fn();
  const utils = render(
    <ChatInput
      onSend={onSend}
      disabled={false}
      thinkingBudget={8000}
      defaultThinkingBudget={8000}
      onThinkingBudgetChange={onThinkingBudgetChange}
      {...overrides}
    />,
  );
  return { ...utils, onSend, onThinkingBudgetChange };
}

describe('ChatInput', () => {
  it('sends the trimmed message on Enter and clears the input', () => {
    const { onSend } = renderInput();
    const textarea = screen.getByPlaceholderText('Type a message...');

    fireEvent.change(textarea, { target: { value: '  hello there  ' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onSend).toHaveBeenCalledWith('hello there');
    expect(textarea).toHaveValue('');
  });

  it('does not send on Shift+Enter (newline instead)', () => {
    const { onSend } = renderInput();
    const textarea = screen.getByPlaceholderText('Type a message...');

    fireEvent.change(textarea, { target: { value: 'line one' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue('line one');
  });

  it('sends via the Send button', () => {
    const { onSend } = renderInput();
    const textarea = screen.getByPlaceholderText('Type a message...');

    fireEvent.change(textarea, { target: { value: 'button send' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSend).toHaveBeenCalledWith('button send');
  });

  it('disables the Send button while empty or whitespace-only', () => {
    renderInput();
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('Type a message...'), {
      target: { value: '   ' },
    });
    expect(send).toBeDisabled();
  });

  it('disables input and never sends while disabled', () => {
    const { onSend } = renderInput({ disabled: true });
    const textarea = screen.getByPlaceholderText('Type a message...');

    expect(textarea).toBeDisabled();
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('shows the locked-agent placeholder', () => {
    renderInput({ lockedAgentName: 'Verity' });
    expect(screen.getByPlaceholderText('Message Verity...')).toBeInTheDocument();
  });

  it('read-only mode: placeholder swaps and the thinking slider is hidden', () => {
    renderInput({ readOnly: true, agentName: 'Spark' });

    expect(
      screen.getByPlaceholderText('This phase is complete — conversation is read-only'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Thinking: 8K')).toBeNull();
    // Quick actions are also suppressed in read-only mode
    expect(screen.queryByTitle('Quick actions')).toBeNull();
  });

  it('shows the thinking slider and quick actions in the default (non-compact) layout', () => {
    renderInput({ agentName: 'Spark' });

    expect(screen.getByText('Thinking: 8K')).toBeInTheDocument();
    expect(screen.getByTitle('Quick actions')).toBeInTheDocument();
  });

  it('compact mode renders a Thinking chip whose popover hosts the slider', () => {
    const { onThinkingBudgetChange } = renderInput({ compact: true });

    const chip = screen.getByRole('button', { name: /Thinking: 8K/ });
    expect(chip).toBeInTheDocument();
    // Slider is not mounted until the chip opens the popover
    expect(document.querySelector('input[type="range"]')).toBeNull();

    fireEvent.click(chip);
    const slider = document.querySelector('input[type="range"]');
    expect(slider).not.toBeNull();

    fireEvent.change(slider as HTMLInputElement, { target: { value: '4000' } });
    expect(onThinkingBudgetChange).toHaveBeenCalledWith(4000);
  });

  it('quick action selection populates the textarea', () => {
    renderInput({ agentName: 'Spark' });

    fireEvent.click(screen.getByTitle('Quick actions'));
    fireEvent.click(screen.getByText('I have an idea...'));

    expect(screen.getByPlaceholderText('Type a message...')).toHaveValue(
      'I have a story idea. Here it is:',
    );
  });
});
