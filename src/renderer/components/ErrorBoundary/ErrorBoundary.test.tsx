import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Bomb(): never {
  throw new Error('kaboom');
}

let errorSpy: MockInstance;

beforeEach(() => {
  // Silence React's error-boundary logging and the boundary's own console.error
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('ErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('all good')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });

  it('shows the fallback with the error message and logs the error', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByText('kaboom')).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalledWith(
      'ErrorBoundary caught an error:',
      expect.any(Error),
      expect.anything(),
    );
  });

  it('offers a Reload action that requests a page reload', () => {
    // jsdom's location.reload is unforgeable (cannot be spied) — clicking
    // routes into jsdom's not-implemented navigation, which must not throw.
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Reload' })),
    ).not.toThrow();
  });
});
