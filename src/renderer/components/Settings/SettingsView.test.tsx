import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { ModelInfo, ProviderId } from '@domain/types';
import { SettingsView } from './SettingsView';
import { useSettingsStore } from '../../stores/settingsStore';
import { useProviderStore } from '../../stores/providerStore';
import { useTourStore } from '../../stores/tourStore';
import { useViewStore } from '../../stores/viewStore';
import { renderApp, type StoreSeed } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { makeAppSettings, type BridgeOverrides } from '../../../test/novelEngineMock';

resetStoresBeforeEach(useSettingsStore, useProviderStore, useTourStore, useViewStore);

function model(id: string, providerId: string): ModelInfo {
  return { id, label: id.toUpperCase(), description: '', providerId: providerId as ProviderId };
}

const MODELS = [model('model-a', 'prov-a'), model('model-b', 'prov-b')];

function renderSettings(opts: { bridge?: BridgeOverrides; stores?: StoreSeed } = {}) {
  return renderApp(<SettingsView />, {
    stores: [
      [useSettingsStore, { settings: makeAppSettings({ activeProviderId: 'prov-a' as ProviderId }) }],
      ...(opts.stores ?? []),
    ],
    bridge: {
      models: { getAvailable: vi.fn(async () => MODELS) },
      ...opts.bridge,
    },
  });
}

describe('SettingsView', () => {
  it('opens on the Writing tab and warns when no models are available', async () => {
    renderSettings({ bridge: { models: { getAvailable: vi.fn(async () => []) } } });

    expect(screen.getByText('Model Selection')).toBeInTheDocument();
    expect(await screen.findByText(/No models are available yet/)).toBeInTheDocument();
    // Other tabs' content is not mounted
    expect(screen.queryByText('Built-in CLI Status')).not.toBeInTheDocument();
  });

  it('selecting a primary model saves it and switches the active provider', async () => {
    const { bridge } = renderSettings();
    await screen.findAllByText('MODEL-B');

    // Primary section renders first
    fireEvent.click(screen.getAllByRole('button', { name: /MODEL-B/ })[0]);

    await waitFor(() =>
      expect(bridge.settings.update).toHaveBeenCalledWith({ model: 'model-b' }),
    );
    await waitFor(() => expect(bridge.providers.setDefault).toHaveBeenCalledWith('prov-b'));
  });

  it('selecting a secondary model never switches the provider', async () => {
    const { bridge } = renderSettings();
    await screen.findAllByText('MODEL-B');

    // Second MODEL-B button lives in the secondary section
    fireEvent.click(screen.getAllByRole('button', { name: /MODEL-B/ })[1]);

    await waitFor(() =>
      expect(bridge.settings.update).toHaveBeenCalledWith({ secondaryModel: 'model-b' }),
    );
    expect(bridge.providers.setDefault).not.toHaveBeenCalled();
  });

  it('toggles extended thinking and the thinking budget', async () => {
    const { bridge } = renderSettings();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show agent thinking' }));
    await waitFor(() =>
      expect(bridge.settings.update).toHaveBeenCalledWith({ enableThinking: false }),
    );

    fireEvent.change(screen.getByRole('slider'), { target: { value: '2048' } });
    await waitFor(() =>
      expect(bridge.settings.update).toHaveBeenCalledWith({ thinkingBudget: 2048 }),
    );
  });

  it('Providers tab shows CLI status rows and re-checks a CLI', async () => {
    const { bridge } = renderSettings();

    fireEvent.click(screen.getByRole('button', { name: /Providers/ }));

    expect(screen.getByText('Claude CLI')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument(); // hasClaudeCli: true
    expect(screen.getAllByText('Not connected')).toHaveLength(2); // codex + ollama

    // Row order: claude, codex, ollama
    fireEvent.click(screen.getAllByRole('button', { name: 'Re-check' })[1]);
    await waitFor(() => expect(bridge.settings.detectCodexCli).toHaveBeenCalled());
  });

  it('Appearance tab reflects the theme and saves changes', async () => {
    const { bridge } = renderSettings();

    fireEvent.click(screen.getByRole('button', { name: /Appearance/ }));

    expect(screen.getByRole('radio', { name: /System/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /Light/ }));
    await waitFor(() => expect(bridge.settings.update).toHaveBeenCalledWith({ theme: 'light' }));

    fireEvent.click(
      screen.getByRole('checkbox', { name: /Show OS notifications when agents finish/ }),
    );
    await waitFor(() =>
      expect(bridge.settings.update).toHaveBeenCalledWith({ enableNotifications: true }),
    );
  });

  it('Profile tab renders the author profile and saves the author name', async () => {
    const { bridge } = renderSettings({
      bridge: {
        settings: { loadAuthorProfile: vi.fn(async () => '# Voice\n\nGritty prose') },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /Profile/ }));

    expect(await screen.findByText('Voice')).toBeInTheDocument();
    expect(screen.getByText('Gritty prose')).toBeInTheDocument();

    const nameInput = screen.getByDisplayValue('Test Author');
    fireEvent.change(nameInput, { target: { value: 'New Name' } });
    await waitFor(() =>
      expect(bridge.settings.update).toHaveBeenCalledWith({ authorName: 'New Name' }),
    );
  });

  it('saves a manually edited author profile', async () => {
    const { bridge } = renderSettings({
      bridge: { settings: { loadAuthorProfile: vi.fn(async () => 'Old profile') } },
    });

    fireEvent.click(screen.getByRole('button', { name: /Profile/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Manually' }));

    const textarea = screen.getByPlaceholderText(/What genres do you write/);
    fireEvent.change(textarea, { target: { value: 'New profile text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(bridge.settings.saveAuthorProfile).toHaveBeenCalledWith('New profile text'),
    );
    // Edit form closes after save
    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/What genres do you write/)).not.toBeInTheDocument(),
    );
  });

  it('Profile tab shows empty usage and completed tours', async () => {
    const resetTour = vi.fn(async () => undefined);
    // startTour is stubbed too — the real one fires on a 300ms timer after replay
    renderSettings({
      stores: [[useTourStore, { completedTours: new Set(['welcome']), resetTour, startTour: vi.fn() }]],
    });

    fireEvent.click(screen.getByRole('button', { name: /Profile/ }));

    expect(await screen.findByText('No usage data yet')).toBeInTheDocument();
    expect(screen.getByTitle('Tour completed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Welcome Tour' }));
    await waitFor(() => expect(resetTour).toHaveBeenCalledWith('welcome'));
    expect(useViewStore.getState().currentView).toBe('workspace');
  });
});
