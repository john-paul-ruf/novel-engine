import { create } from 'zustand';
import type { ProviderConfig, ProviderId, ProviderStatus } from '@domain/types';

type ProviderState = {
  providers: ProviderConfig[];
  statuses: Record<ProviderId, ProviderStatus>;
  loading: boolean;
  load: () => Promise<void>;
  addProvider: (config: ProviderConfig) => Promise<void>;
  updateProvider: (providerId: ProviderId, partial: Partial<ProviderConfig>) => Promise<void>;
  removeProvider: (providerId: ProviderId) => Promise<void>;
  checkStatus: (providerId: ProviderId) => Promise<ProviderStatus>;
  setDefault: (providerId: ProviderId) => Promise<void>;
};

export const useProviderStore = create<ProviderState>((set, get) => ({
  providers: [],
  statuses: {},
  loading: false,

  load: async () => {
    set({ loading: true });
    try {
      const providers = await window.novelEngine.providers.list();
      set({ providers, loading: false });
    } catch (error) {
      console.error('Failed to load providers:', error);
      set({ loading: false });
    }
  },

  addProvider: async (config) => {
    await window.novelEngine.providers.add(config);
    await get().load();
  },

  updateProvider: async (providerId, partial) => {
    await window.novelEngine.providers.update(providerId, partial);
    await get().load();
  },

  removeProvider: async (providerId) => {
    await window.novelEngine.providers.remove(providerId);
    await get().load();
  },

  checkStatus: async (providerId) => {
    const status = await window.novelEngine.providers.checkStatus(providerId);
    set((s) => ({ statuses: { ...s.statuses, [providerId]: status } }));
    return status;
  },

  setDefault: async (providerId) => {
    await window.novelEngine.providers.setDefault(providerId);
    await get().load();
  },
}));
