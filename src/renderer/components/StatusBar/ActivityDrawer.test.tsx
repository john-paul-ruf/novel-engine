import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { ActivityDrawer } from './ActivityDrawer';
import { useCliActivityStore } from '../../stores/cliActivityStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';

resetStoresBeforeEach(useCliActivityStore);

const HANDLE_TITLE = 'Drag to resize · Double-click to reset';

function drawer(container: HTMLElement): HTMLElement {
  return container.firstElementChild as HTMLElement;
}

describe('ActivityDrawer', () => {
  it('collapses to zero height when closed', () => {
    const { container } = renderApp(<ActivityDrawer />);
    expect(drawer(container).style.height).toBe('0px');
  });

  it('opens to the default height and shows the CLI activity panel', () => {
    const { container } = renderApp(<ActivityDrawer />, {
      stores: [[useCliActivityStore, { drawerOpen: true }]],
    });
    expect(drawer(container).style.height).toBe('208px');
    expect(screen.getByText('CLI Activity')).toBeInTheDocument();
  });

  it('honors a persisted height from localStorage', () => {
    window.localStorage.setItem('novel-engine:activity-drawer-height', '300');
    const { container } = renderApp(<ActivityDrawer />, {
      stores: [[useCliActivityStore, { drawerOpen: true }]],
    });
    expect(drawer(container).style.height).toBe('300px');
  });

  it('resizes by dragging the top handle (up grows) and persists on release', () => {
    const { container } = renderApp(<ActivityDrawer />, {
      stores: [[useCliActivityStore, { drawerOpen: true }]],
    });
    const handle = screen.getByTitle(HANDLE_TITLE);

    fireEvent.mouseDown(handle, { clientY: 500 });
    fireEvent.mouseMove(document, { clientY: 450 });
    expect(drawer(container).style.height).toBe('258px');

    fireEvent.mouseUp(document);
    expect(window.localStorage.getItem('novel-engine:activity-drawer-height')).toBe('258');
  });

  it('double-click on the handle resets to the default height', () => {
    window.localStorage.setItem('novel-engine:activity-drawer-height', '300');
    const { container } = renderApp(<ActivityDrawer />, {
      stores: [[useCliActivityStore, { drawerOpen: true }]],
    });
    expect(drawer(container).style.height).toBe('300px');

    fireEvent.doubleClick(screen.getByTitle(HANDLE_TITLE));
    expect(drawer(container).style.height).toBe('208px');
    expect(window.localStorage.getItem('novel-engine:activity-drawer-height')).toBe('208');
  });
});
