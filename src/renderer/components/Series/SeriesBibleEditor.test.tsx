import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, render } from '@testing-library/react';
import { SeriesBibleEditor } from './SeriesBibleEditor';

describe('SeriesBibleEditor', () => {
  it('shows content with word/char stats and a disabled Saved button when clean', () => {
    render(
      <SeriesBibleEditor content="one two three" dirty={false} onChange={vi.fn()} onSave={vi.fn()} />,
    );

    expect(screen.getByDisplayValue('one two three')).toBeInTheDocument();
    expect(screen.getByText('3 words · 13 chars')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Saved' })).toBeDisabled();
  });

  it('edits propagate and Save Bible fires when dirty', () => {
    const onChange = vi.fn();
    const onSave = vi.fn();
    render(<SeriesBibleEditor content="draft" dirty={true} onChange={onChange} onSave={onSave} />);

    fireEvent.change(screen.getByDisplayValue('draft'), { target: { value: 'draft two' } });
    expect(onChange).toHaveBeenCalledWith('draft two');

    fireEvent.click(screen.getByRole('button', { name: 'Save Bible' }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
