import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, render } from '@testing-library/react';
import { SeriesForm } from './SeriesForm';

describe('SeriesForm', () => {
  it('create mode submits trimmed name and description', () => {
    const onSubmit = vi.fn();
    render(<SeriesForm mode="create" onSubmit={onSubmit} onCancel={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Create Series' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Series Name'), { target: { value: '  The Saga  ' } });
    fireEvent.change(screen.getByLabelText('Description (optional)'), {
      target: { value: 'Epic tale ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Series' }));

    expect(onSubmit).toHaveBeenCalledWith('The Saga', 'Epic tale');
  });

  it('edit mode pre-fills values and cancels without submitting', () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(
      <SeriesForm
        mode="edit"
        initialName="Old Name"
        initialDescription="Old desc"
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByDisplayValue('Old Name')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Old desc')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
