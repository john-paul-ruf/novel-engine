import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, render } from '@testing-library/react';
import { FilterBar } from './FilterBar';

function renderBar(activeFilterCount = 0) {
  const handlers = {
    onMethodChange: vi.fn(),
    onStatusChange: vi.fn(),
    onTypeChange: vi.fn(),
    onClearFilters: vi.fn(),
  };
  const utils = render(
    <FilterBar
      methodFilter="all"
      statusFilter="all"
      typeFilter="all"
      activeFilterCount={activeFilterCount}
      {...handlers}
    />,
  );
  return { ...utils, handlers };
}

describe('FilterBar', () => {
  it('routes each select change to its handler', () => {
    const { handlers } = renderBar();
    const [method, status, type] = screen.getAllByRole('combobox');

    fireEvent.change(method, { target: { value: 'email' } });
    expect(handlers.onMethodChange).toHaveBeenCalledWith('email');

    fireEvent.change(status, { target: { value: 'offer' } });
    expect(handlers.onStatusChange).toHaveBeenCalledWith('offer');

    fireEvent.change(type, { target: { value: 'publisher' } });
    expect(handlers.onTypeChange).toHaveBeenCalledWith('publisher');
  });

  it('shows the clear affordance only with active filters', () => {
    const first = renderBar(0);
    expect(screen.queryByRole('button', { name: /Clear/ })).not.toBeInTheDocument();
    first.unmount();

    const { handlers } = renderBar(2);
    fireEvent.click(screen.getByRole('button', { name: 'Clear (2)' }));
    expect(handlers.onClearFilters).toHaveBeenCalled();
  });
});
