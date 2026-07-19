import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { AddTargetForm } from './AddTargetForm';
import { useQueryStore } from '../../stores/queryStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';

resetStoresBeforeEach(useQueryStore);

function renderForm() {
  const onDone = vi.fn();
  const addTarget = vi.fn(async () => undefined);
  const utils = renderApp(<AddTargetForm bookSlug="test-book" onDone={onDone} />, {
    stores: [[useQueryStore, { addTarget }]],
  });
  return { ...utils, onDone, addTarget };
}

describe('AddTargetForm', () => {
  it('submits a filled target and closes', async () => {
    const { onDone, addTarget } = renderForm();

    fireEvent.change(screen.getByPlaceholderText('Agent / Publisher name'), {
      target: { value: '  Jane Agent  ' },
    });
    // Type select is the first combobox, method the second
    const [typeSelect, methodSelect] = screen.getAllByRole('combobox');
    fireEvent.change(typeSelect, { target: { value: 'publisher' } });
    fireEvent.change(methodSelect, { target: { value: 'form' } });
    fireEvent.change(screen.getByPlaceholderText('email or URL'), {
      target: { value: 'jane@lit.example' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Target' }));

    await waitFor(() =>
      expect(addTarget).toHaveBeenCalledWith('test-book', {
        name: 'Jane Agent',
        type: 'publisher',
        contact: 'jane@lit.example',
        method: 'form',
        status: 'drafting',
        link: '',
        personalizationNotes: '',
        notes: '',
      }),
    );
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('cancel closes without adding', () => {
    const { onDone, addTarget } = renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onDone).toHaveBeenCalled();
    expect(addTarget).not.toHaveBeenCalled();
  });
});
