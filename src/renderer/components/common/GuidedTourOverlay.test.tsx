import { describe, it, expect, beforeAll, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { TourStep } from '@domain/types';
import { GuidedTourOverlay } from './GuidedTourOverlay';
import { useViewStore } from '../../stores/viewStore';
import { installNovelEngineMock } from '../../../test/novelEngineMock';
import { resetStoresBeforeEach } from '../../../test/resetStores';

resetStoresBeforeEach(useViewStore);

beforeAll(() => {
  // jsdom gaps: scrollIntoView and ResizeObserver
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
  if (typeof ResizeObserver === 'undefined') {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
  }
});

let warnSpy: MockInstance;

beforeEach(() => {
  installNovelEngineMock();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
});

const STEPS: TourStep[] = [
  { id: 's1', targetSelector: '[data-tour-test="one"]', title: 'Step One', body: 'First body.', placement: 'bottom' },
  { id: 's2', targetSelector: '[data-tour-test="two"]', title: 'Step Two', body: 'Second body.', placement: 'right' },
];

function renderTour(
  overrides: Partial<{ steps: TourStep[]; isActive: boolean; onComplete: () => void; onDismiss: () => void }> = {},
) {
  const onComplete = overrides.onComplete ?? vi.fn();
  const onDismiss = overrides.onDismiss ?? vi.fn();
  const utils = render(
    <>
      <div data-tour-test="one">target one</div>
      <div data-tour-test="two">target two</div>
      <GuidedTourOverlay
        steps={overrides.steps ?? STEPS}
        isActive={overrides.isActive ?? true}
        onComplete={onComplete}
        onDismiss={onDismiss}
      />
    </>,
  );
  return { ...utils, onComplete, onDismiss };
}

describe('GuidedTourOverlay', () => {
  it('renders nothing when inactive', () => {
    renderTour({ isActive: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the first step with title, body and progress counter', () => {
    renderTour();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('Tour step 1 of 2: Step One');
    expect(screen.getByRole('heading', { name: 'Step One' })).toBeInTheDocument();
    expect(screen.getByText('First body.')).toBeInTheDocument();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
  });

  it('advances with Next, shows Back from step 2, and finishes on the last step', () => {
    const { onComplete } = renderTour();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Step Two' })).toBeInTheDocument();
    expect(screen.getByText('2 of 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Step One' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('dismisses via Skip Tour and via Escape', () => {
    const { onDismiss } = renderTour();
    fireEvent.click(screen.getByRole('button', { name: 'Skip Tour' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it('supports arrow-key navigation', () => {
    renderTour();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
  });

  it('skips steps whose target is missing (with a warning)', async () => {
    renderTour({
      steps: [
        { id: 'gone', targetSelector: '#does-not-exist', title: 'Ghost', body: 'x', placement: 'top' },
        STEPS[1],
      ],
    });

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Step Two' })).toBeInTheDocument(),
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Target not found'));
  });

  it('navigates to a step’s required view', () => {
    renderTour({
      steps: [{ ...STEPS[0], requiredView: 'settings' }],
    });
    expect(useViewStore.getState().currentView).toBe('settings');
  });
});
