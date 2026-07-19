import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { ResearchPanel } from './ResearchPanel';
import { useQueryStore } from '../../stores/queryStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';

resetStoresBeforeEach(useQueryStore);

describe('ResearchPanel', () => {
  it('renders nothing while idle with no buffer', () => {
    const { container } = renderApp(<ResearchPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('streams the research buffer while researching', () => {
    renderApp(<ResearchPanel />, {
      stores: [[useQueryStore, { isResearching: true, researchBuffer: 'Scanning MSWL…' }]],
    });

    expect(screen.getByText('Researching targets…')).toBeInTheDocument();
    expect(screen.getByText('Scanning MSWL…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Research again' })).not.toBeInTheDocument();
  });

  it('offers Research again once complete', () => {
    const researchTargets = vi.fn(async () => null);
    renderApp(<ResearchPanel />, {
      stores: [
        [useQueryStore, { isResearching: false, researchBuffer: 'Done.', researchTargets }],
      ],
    });

    expect(screen.getByText('Research complete')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Research again' }));
    expect(researchTargets).toHaveBeenCalledTimes(1);
  });
});
