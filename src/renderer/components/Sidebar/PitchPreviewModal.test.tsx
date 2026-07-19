import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import type { ShelvedPitch } from '@domain/types';
import { PitchPreviewModal } from './PitchPreviewModal';
import { usePitchShelfStore } from '../../stores/pitchShelfStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';

resetStoresBeforeEach(usePitchShelfStore);

const PITCH: ShelvedPitch = {
  slug: 'space-opera',
  title: 'Space Opera',
  logline: 'A big adventure.',
  shelvedAt: '2026-01-01T00:00:00.000Z',
  shelvedFrom: '',
  content: '# The Hook\n\nA *daring* rescue.',
};

describe('PitchPreviewModal', () => {
  it('renders nothing when no preview is open', () => {
    const { container } = renderApp(<PitchPreviewModal />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a loading state while the pitch is being read', () => {
    renderApp(<PitchPreviewModal />, {
      stores: [[usePitchShelfStore, { previewLoading: true }]],
    });
    expect(screen.getByText('Loading pitch...')).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders the pitch title and markdown content', () => {
    renderApp(<PitchPreviewModal />, {
      stores: [[usePitchShelfStore, { previewPitch: PITCH }]],
    });
    expect(screen.getByRole('heading', { name: 'Space Opera' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The Hook' })).toBeInTheDocument();
    expect(screen.getByText('daring')).toBeInTheDocument();
  });

  it('closes via the Close button', () => {
    const { container } = renderApp(<PitchPreviewModal />, {
      stores: [[usePitchShelfStore, { previewPitch: PITCH }]],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(usePitchShelfStore.getState().previewPitch).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it('closes on Escape', () => {
    renderApp(<PitchPreviewModal />, {
      stores: [[usePitchShelfStore, { previewPitch: PITCH }]],
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(usePitchShelfStore.getState().previewPitch).toBeNull();
  });

  it('closes on backdrop click but not on inner content click', () => {
    const { container } = renderApp(<PitchPreviewModal />, {
      stores: [[usePitchShelfStore, { previewPitch: PITCH }]],
    });

    fireEvent.click(screen.getByRole('heading', { name: 'Space Opera' }));
    expect(usePitchShelfStore.getState().previewPitch).not.toBeNull();

    fireEvent.click(container.firstElementChild as Element);
    expect(usePitchShelfStore.getState().previewPitch).toBeNull();
  });
});
