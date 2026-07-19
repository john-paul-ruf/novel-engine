import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubble } from './MessageBubble';
import { installNovelEngineMock, makeMessage } from '../../../test/novelEngineMock';

beforeEach(() => {
  installNovelEngineMock();
});

describe('MessageBubble', () => {
  it('renders a user message as plain right-aligned text (no markdown)', () => {
    render(
      <MessageBubble message={makeMessage({ role: 'user', content: '**not bold**' })} />,
    );

    // Markdown is NOT parsed for user messages — literal asterisks remain.
    expect(screen.getByText('**not bold**')).toBeInTheDocument();
    expect(document.querySelector('strong')).toBeNull();
    expect(document.querySelector('.justify-end')).not.toBeNull();
  });

  it('renders assistant content as parsed markdown', () => {
    render(
      <MessageBubble
        message={makeMessage({ role: 'assistant', content: 'A **bold** word' })}
      />,
    );

    const strong = document.querySelector('strong');
    expect(strong).not.toBeNull();
    expect(strong).toHaveTextContent('bold');
    expect(document.querySelector('.justify-start')).not.toBeNull();
  });

  it('shows a collapsed thinking block with a token estimate when the message has thinking', () => {
    // 400 chars / CHARS_PER_TOKEN (4) = 100 tokens
    const thinking = 'x'.repeat(400);
    render(
      <MessageBubble message={makeMessage({ role: 'assistant', thinking })} />,
    );

    expect(screen.getByText('Agent Thinking')).toBeInTheDocument();
    expect(screen.getByText('~100 tokens')).toBeInTheDocument();
  });

  it('omits the thinking block when thinking is empty', () => {
    render(<MessageBubble message={makeMessage({ role: 'assistant' })} />);
    expect(screen.queryByText('Agent Thinking')).toBeNull();
  });

  it('lists tool activity with a pluralised file count', () => {
    render(
      <MessageBubble
        message={makeMessage({ role: 'assistant' })}
        toolActivity={['chapters/01-a/draft.md', 'source/story-bible.md']}
      />,
    );

    expect(screen.getByText('2 files written')).toBeInTheDocument();
    expect(screen.getByText('chapters/01-a/draft.md')).toBeInTheDocument();
    expect(screen.getByText('source/story-bible.md')).toBeInTheDocument();
  });

  it('uses the singular label for a single written file', () => {
    render(
      <MessageBubble
        message={makeMessage({ role: 'assistant' })}
        toolActivity={['source/pitch.md']}
      />,
    );

    expect(screen.getByText('1 file written')).toBeInTheDocument();
  });

  it('hides the tool activity panel when there is none', () => {
    render(<MessageBubble message={makeMessage({ role: 'assistant' })} toolActivity={[]} />);
    expect(screen.queryByText(/files? written/)).toBeNull();
  });
});
