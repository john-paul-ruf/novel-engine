import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { ModelInfo, ProviderId } from '@domain/types';
import { OnboardingWizard } from './OnboardingWizard';
import { useSettingsStore } from '../../stores/settingsStore';
import { useBookStore } from '../../stores/bookStore';
import { useViewStore } from '../../stores/viewStore';
import { useTourStore } from '../../stores/tourStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { makeAppSettings, type BridgeOverrides } from '../../../test/novelEngineMock';

resetStoresBeforeEach(useSettingsStore, useBookStore, useViewStore, useTourStore);

const MODELS: ModelInfo[] = [
  { id: 'model-a', label: 'Model A', description: 'Fast', providerId: 'claude-cli' as ProviderId },
  { id: 'model-b', label: 'Model B', description: 'Smart', providerId: 'claude-cli' as ProviderId },
];

function renderWizard(bridge: BridgeOverrides = {}) {
  return renderApp(<OnboardingWizard />, {
    bridge: {
      models: { getAvailable: vi.fn(async () => MODELS) },
      settings: {
        load: vi.fn(async () => makeAppSettings({ hasClaudeCli: true })),
        detectClaudeCli: vi.fn(async () => true),
        ...bridge.settings,
      },
      ...bridge,
    },
    // The post-launch welcome-tour timer must not fire the real tour
    stores: [[useTourStore, { startTour: vi.fn() }]],
  });
}

describe('OnboardingWizard', () => {
  it('starts on the welcome step', () => {
    renderWizard();

    expect(screen.getByText('Novel Engine')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get Started' })).toBeInTheDocument();
  });

  it('detects a CLI backend on the setup step', async () => {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));

    expect(screen.getByText('Connect an AI backend')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check Providers' }));

    expect(await screen.findByText('AI backend detected!')).toBeInTheDocument();
  });

  it('reports when no CLI is found but still allows skipping', async () => {
    renderWizard({
      settings: {
        load: vi.fn(async () => makeAppSettings({ hasClaudeCli: false, hasCodexCli: false })),
        detectClaudeCli: vi.fn(async () => false),
        detectCodexCli: vi.fn(async () => false),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check Providers' }));

    expect(await screen.findByText(/No local CLI provider was found/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(screen.getByText('Choose Your Model')).toBeInTheDocument();
  });

  it('walks model → profile → ready → launch with a first book', async () => {
    const { bridge } = renderWizard();

    // → claude-setup → model-select
    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check Providers' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));

    // Model select — first model is recommended and pre-selected
    expect(await screen.findByText('Model A')).toBeInTheDocument();
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Model B'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(bridge.settings.update).toHaveBeenCalledWith({ model: 'model-b' }));

    // Author profile
    expect(await screen.findByText('Tell Us About Your Writing')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Jane Doe'), { target: { value: 'A. Writer' } });
    fireEvent.change(screen.getByPlaceholderText(/What genres do you write/), {
      target: { value: 'Grim fantasy' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save & Continue' }));
    await waitFor(() =>
      expect(bridge.settings.update).toHaveBeenCalledWith({ authorName: 'A. Writer' }),
    );
    await waitFor(() =>
      expect(bridge.settings.saveAuthorProfile).toHaveBeenCalledWith('Grim fantasy'),
    );

    // Ready summary
    expect(await screen.findByText("You're All Set!")).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument(); // Claude CLI
    expect(screen.getByText('Model B')).toBeInTheDocument();
    expect(screen.getByText('A. Writer')).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();

    // Launch with a first book
    fireEvent.change(screen.getByPlaceholderText('My First Novel'), {
      target: { value: 'Debut' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Launch Novel Engine' }));

    await waitFor(() =>
      expect(bridge.settings.update).toHaveBeenCalledWith({ initialized: true }),
    );
    await waitFor(() => expect(bridge.books.create).toHaveBeenCalledWith('Debut'));
    await waitFor(() => expect(useViewStore.getState().currentView).toBe('workspace'));
  });

  it('launching without a book lands on the library shelf', async () => {
    const { bridge } = renderWizard();

    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Next' })); // model
    fireEvent.click(await screen.findByRole('button', { name: "Skip — I'll set this up later" }));
    fireEvent.click(await screen.findByRole('button', { name: 'Launch Novel Engine' }));

    await waitFor(() =>
      expect(bridge.settings.update).toHaveBeenCalledWith({ initialized: true }),
    );
    expect(bridge.books.create).not.toHaveBeenCalled();
    await waitFor(() => expect(useViewStore.getState().currentView).toBe('library'));
  });
});
