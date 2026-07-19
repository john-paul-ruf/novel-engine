import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ProviderConfig } from '@domain/types';
import { useProviderStore } from './providerStore';
import { useSettingsStore } from './settingsStore';
import { installNovelEngineMock, makeAppSettings, type NovelEngineMock } from '../../test/novelEngineMock';
import { resetStoresBeforeEach } from '../../test/resetStores';

resetStoresBeforeEach(useSettingsStore, useProviderStore);

function makeProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'claude-cli',
    type: 'claude-cli',
    name: 'Claude CLI',
    enabled: true,
    isBuiltIn: true,
    models: [],
    capabilities: [],
    ...overrides,
  };
}

let mock: NovelEngineMock;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mock = installNovelEngineMock();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('providerStore', () => {
  it('load populates the provider list; failure clears loading and keeps state', async () => {
    mock.providers.list.mockResolvedValue([makeProvider()]);
    await useProviderStore.getState().load();
    expect(useProviderStore.getState().providers).toHaveLength(1);
    expect(useProviderStore.getState().loading).toBe(false);

    mock.providers.list.mockRejectedValue(new Error('ipc down'));
    await useProviderStore.getState().load();
    expect(useProviderStore.getState().providers).toHaveLength(1); // unchanged
    expect(useProviderStore.getState().loading).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('add/update/remove call the bridge with their args, then reload the list', async () => {
    const ollama = makeProvider({ id: 'ollama-1', type: 'ollama-cli', name: 'Ollama', isBuiltIn: false });
    mock.providers.list.mockResolvedValue([makeProvider(), ollama]);

    await useProviderStore.getState().addProvider(ollama);
    expect(mock.providers.add).toHaveBeenCalledWith(ollama);

    await useProviderStore.getState().updateProvider('ollama-1', { name: 'Local Ollama' });
    expect(mock.providers.update).toHaveBeenCalledWith('ollama-1', { name: 'Local Ollama' });

    await useProviderStore.getState().removeProvider('ollama-1');
    expect(mock.providers.remove).toHaveBeenCalledWith('ollama-1');

    expect(mock.providers.list).toHaveBeenCalledTimes(3); // one reload per mutation
    expect(useProviderStore.getState().providers).toHaveLength(2);
  });

  it('checkStatus records the per-provider availability and returns it', async () => {
    mock.providers.checkStatus.mockResolvedValue('available');
    const status = await useProviderStore.getState().checkStatus('claude-cli');
    expect(status).toBe('available');
    expect(useProviderStore.getState().statuses['claude-cli']).toBe('available');

    mock.providers.checkStatus.mockResolvedValue('unavailable');
    await useProviderStore.getState().checkStatus('ollama-1');
    expect(useProviderStore.getState().statuses).toEqual({
      'claude-cli': 'available',
      'ollama-1': 'unavailable',
    });
  });

  it('setDefault switches the provider and refreshes BOTH providers and settings (pinned)', async () => {
    mock.providers.list.mockResolvedValue([makeProvider()]);
    mock.settings.load.mockResolvedValue(makeAppSettings({ activeProviderId: 'ollama-1' }));

    await useProviderStore.getState().setDefault('ollama-1');

    expect(mock.providers.setDefault).toHaveBeenCalledWith('ollama-1');
    expect(mock.providers.list).toHaveBeenCalledTimes(1);
    expect(mock.settings.load).toHaveBeenCalledTimes(1);
    expect(useSettingsStore.getState().settings?.activeProviderId).toBe('ollama-1');
  });
});
