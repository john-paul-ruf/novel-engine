import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThinkingBudgetSlider } from './ThinkingBudgetSlider';

describe('ThinkingBudgetSlider', () => {
  it('formats the current value as a K label', () => {
    render(
      <ThinkingBudgetSlider value={8000} defaultValue={8000} onChange={vi.fn()} />,
    );
    expect(screen.getByText('Thinking: 8K')).toBeInTheDocument();
  });

  it('formats zero as Off', () => {
    render(<ThinkingBudgetSlider value={0} defaultValue={8000} onChange={vi.fn()} />);
    expect(screen.getByText('Thinking: Off')).toBeInTheDocument();
  });

  it('emits numeric values from the range input', () => {
    const onChange = vi.fn();
    render(
      <ThinkingBudgetSlider value={8000} defaultValue={8000} onChange={onChange} />,
    );

    fireEvent.change(document.querySelector('input[type="range"]') as HTMLInputElement, {
      target: { value: '12000' },
    });

    expect(onChange).toHaveBeenCalledWith(12000);
  });

  it('hides the reset button while at the default value', () => {
    render(
      <ThinkingBudgetSlider value={8000} defaultValue={8000} onChange={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
  });

  it('shows Reset when modified and resets back to the default', () => {
    const onChange = vi.fn();
    render(
      <ThinkingBudgetSlider value={2000} defaultValue={8000} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onChange).toHaveBeenCalledWith(8000);
  });

  it('disables the slider and reset button when disabled', () => {
    render(
      <ThinkingBudgetSlider value={2000} defaultValue={8000} onChange={vi.fn()} disabled />,
    );

    expect(document.querySelector('input[type="range"]')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled();
  });
});
