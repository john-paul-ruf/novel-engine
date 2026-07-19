import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Tooltip } from './Tooltip';
import { useTourStore } from '../../stores/tourStore';
import { installNovelEngineMock } from '../../../test/novelEngineMock';
import { resetStoresBeforeEach } from '../../../test/resetStores';

resetStoresBeforeEach(useTourStore);

beforeEach(() => {
  installNovelEngineMock();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function focusTrigger(): HTMLElement {
  const trigger = screen.getByRole('button', { name: 'Trigger' });
  act(() => trigger.focus());
  return trigger;
}

describe('Tooltip', () => {
  it('shows the tooltip after the enter delay and links it via aria-describedby', () => {
    render(
      <Tooltip content="Helpful hint">
        <button>Trigger</button>
      </Tooltip>,
    );
    const trigger = focusTrigger();
    expect(screen.queryByRole('tooltip')).toBeNull();

    act(() => vi.advanceTimersByTime(300));

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Helpful hint');
    expect(trigger).toHaveAttribute('aria-describedby', tooltip.id);
  });

  it('respects a custom enter delay', () => {
    render(
      <Tooltip content="Hint" enterDelay={500}>
        <button>Trigger</button>
      </Tooltip>,
    );
    focusTrigger();
    act(() => vi.advanceTimersByTime(499));
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('hides after the exit delay on blur', () => {
    render(
      <Tooltip content="Hint">
        <button>Trigger</button>
      </Tooltip>,
    );
    const trigger = focusTrigger();
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    act(() => trigger.blur());
    act(() => vi.advanceTimersByTime(100));
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(trigger).not.toHaveAttribute('aria-describedby');
  });

  it('never shows when disabled', () => {
    render(
      <Tooltip content="Hint" disabled>
        <button>Trigger</button>
      </Tooltip>,
    );
    focusTrigger();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('is suppressed while a guided tour is active', () => {
    useTourStore.setState({ activeTourId: 'welcome' });
    render(
      <Tooltip content="Hint">
        <button>Trigger</button>
      </Tooltip>,
    );
    focusTrigger();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('renders \\n content as line breaks', () => {
    render(
      <Tooltip content={'line one\nline two'}>
        <button>Trigger</button>
      </Tooltip>,
    );
    focusTrigger();
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByRole('tooltip').innerHTML).toContain('<br');
  });
});
