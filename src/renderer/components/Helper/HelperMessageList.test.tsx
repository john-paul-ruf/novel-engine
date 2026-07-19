import { describe, it, expect, beforeAll } from 'vitest';
import { screen, render } from '@testing-library/react';
import type { Message } from '@domain/types';
import { HelperMessageList } from './HelperMessageList';
import { makeMessage } from '../../../test/novelEngineMock';

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
});

function renderList(
  overrides: Partial<{
    messages: Message[];
    isStreaming: boolean;
    isThinking: boolean;
    streamBuffer: string;
    thinkingBuffer: string;
    statusMessage: string;
  }> = {},
) {
  return render(
    <HelperMessageList
      messages={[]}
      isStreaming={false}
      isThinking={false}
      streamBuffer=""
      thinkingBuffer=""
      statusMessage=""
      {...overrides}
    />,
  );
}

describe('HelperMessageList', () => {
  it('greets when there are no messages', () => {
    renderList();
    expect(screen.getByText(/I'm your Novel Engine assistant/)).toBeInTheDocument();
  });

  it('renders user and assistant messages', () => {
    renderList({
      messages: [
        makeMessage({ id: 'u1', role: 'user', content: 'How do I export?' }),
        makeMessage({ id: 'a1', role: 'assistant', content: 'Use the Exports view.' }),
      ],
    });

    expect(screen.getByText('How do I export?')).toBeInTheDocument();
    expect(screen.getByText('Use the Exports view.')).toBeInTheDocument();
  });

  it('streams text with a cursor and shows the thinking marker', () => {
    renderList({ isStreaming: true, isThinking: true, streamBuffer: 'Partial answer' });

    expect(screen.getByText('Thinking...')).toBeInTheDocument();
    expect(screen.getByText(/Partial answer/)).toBeInTheDocument();
  });

  it('falls back to the status message before text arrives', () => {
    renderList({ isStreaming: true, statusMessage: 'Reading the user guide…' });
    expect(screen.getByText('Reading the user guide…')).toBeInTheDocument();
  });
});
