import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { ModelInfo, ProviderConfig, ProviderId } from '@domain/types';
import { ProviderSection } from './ProviderSection';
import { useProviderStore } from '../../stores/providerStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { makeAppSettings, type BridgeOverrides } from '../../../test/novelEngineMock';

resetStoresBeforeEach(useProviderStore, useSettingsStore);

function model(id: string, providerId: string): ModelInfo {
  return { id, label: id, description: '', providerId: providerId as ProviderId };
}

function makeProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'claude-cli' as ProviderId,
    type: 'claude-cli',
    name: 'Claude CLI',
    enabled: true,
    isBuiltIn: true,
    models: [model('claude-model', 'claude-cli')],
    capabilities: ['tool-use'],
    ...overrides,
  };
}

const CUSTOM = makeProvider({
  id: 'custom-1' as ProviderId,
  type: 'openai-compatible',
  name: 'My Server',
  isBuiltIn: false,
  baseUrl: 'http://localhost:8080',
  models: [model('local-model', 'custom-1')],
  capabilities: ['text-completion', 'streaming'],
});

function renderSection(providers: ProviderConfig[], bridge: BridgeOverrides = {}) {
  return renderApp(<ProviderSection />, {
    bridge: {
      providers: { list: vi.fn(async () => providers), ...bridge.providers },
      ...bridge,
    },
  });
}

describe('ProviderSection', () => {
  it('renders built-in provider cards without edit/remove and marks the active one', async () => {
    renderSection([makeProvider()], {
      settings: {
        load: vi.fn(async () => makeAppSettings({ activeProviderId: 'claude-cli' as ProviderId })),
      },
    });

    // Name and type badge both read "Claude CLI"
    expect(await screen.findAllByText('Claude CLI')).toHaveLength(2);
    expect(screen.getByText('Built-in')).toBeInTheDocument();
    expect(screen.getByText('1 model')).toBeInTheDocument();
    // Active badge + disabled "Active" action button
    expect(screen.getByRole('button', { name: 'Active' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('flags providers without tool use as text only', async () => {
    renderSection([CUSTOM]);
    expect(await screen.findByText('Text only')).toBeInTheDocument();
  });

  it('Use as Active sets the default provider and its first model', async () => {
    const { bridge } = renderSection([CUSTOM]);

    fireEvent.click(await screen.findByRole('button', { name: 'Use as Active' }));

    await waitFor(() => expect(bridge.providers.setDefault).toHaveBeenCalledWith('custom-1'));
    await waitFor(() =>
      expect(bridge.settings.update).toHaveBeenCalledWith({ model: 'local-model' }),
    );
  });

  it('Test Connection reports the checked status', async () => {
    const { bridge } = renderSection([CUSTOM], {
      providers: {
        list: vi.fn(async () => [CUSTOM]),
        checkStatus: vi.fn(async () => 'available' as const),
      },
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Test Connection' }));

    await waitFor(() => expect(bridge.providers.checkStatus).toHaveBeenCalledWith('custom-1'));
    expect(await screen.findByText('Connected')).toBeInTheDocument();
  });

  it('toggles enabled and removes a custom provider', async () => {
    const { bridge } = renderSection([CUSTOM]);

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Enabled' }));
    await waitFor(() =>
      expect(bridge.providers.update).toHaveBeenCalledWith('custom-1', { enabled: false }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(bridge.providers.remove).toHaveBeenCalledWith('custom-1'));
  });

  it('edits a custom provider through the edit form', async () => {
    const { bridge } = renderSection([CUSTOM]);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));

    fireEvent.change(screen.getByPlaceholderText('Provider name'), {
      target: { value: 'Renamed Server' },
    });
    fireEvent.change(screen.getByPlaceholderText('Model IDs (one per line)'), {
      target: { value: 'model-x\nmodel-y' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() =>
      expect(bridge.providers.update).toHaveBeenCalledWith('custom-1', {
        name: 'Renamed Server',
        baseUrl: 'http://localhost:8080',
        apiKey: undefined,
        models: [
          { id: 'model-x', label: 'model-x', description: '', providerId: 'custom-1' },
          { id: 'model-y', label: 'model-y', description: '', providerId: 'custom-1' },
        ],
      }),
    );
    // Form closes after save
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument(),
    );
  });

  it('validates the add-provider form and adds an OpenAI-compatible provider', async () => {
    const { bridge } = renderSection([]);

    fireEvent.click(await screen.findByRole('button', { name: '+ Add Provider' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Provider' }));
    expect(screen.getByText('Provider name is required')).toBeInTheDocument();
    expect(bridge.providers.add).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText(/Provider name \(e\.g\./), {
      target: { value: 'Remote' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Base URL \(e\.g\./), {
      target: { value: 'https://api.example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Model IDs \(one per line, e\.g\./), {
      target: { value: 'gpt-test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Provider' }));

    await waitFor(() =>
      expect(bridge.providers.add).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'openai-compatible',
          name: 'Remote',
          baseUrl: 'https://api.example.com',
          enabled: true,
          isBuiltIn: false,
          models: [expect.objectContaining({ id: 'gpt-test' })],
        }),
      ),
    );
    // Collapses back to the ghost button and reloads the list
    expect(await screen.findByRole('button', { name: '+ Add Provider' })).toBeInTheDocument();
  });
});
