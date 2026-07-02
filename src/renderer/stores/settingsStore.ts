import { create } from 'zustand';
import type { AppSettings } from '@domain/types';

type SettingsState = {
  settings: AppSettings | null;
  loading: boolean;
  load: () => Promise<void>;
  detectClaudeCli: () => Promise<boolean>;
  detectCodexCli: () => Promise<boolean>;
  update: (partial: Partial<AppSettings>) => Promise<void>;
};

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  loading: false,

  load: async () => {
    set({ loading: true });
    try {
      const settings = await window.novelEngine.settings.load();
      set({ settings, loading: false });
    } catch (error) {
      console.error('Failed to load settings:', error);
      set({ loading: false });
    }
  },

  detectClaudeCli: async () => {
    try {
      const found = await window.novelEngine.settings.detectClaudeCli();
      // Reload settings to get the updated hasClaudeCli value
      const settings = await window.novelEngine.settings.load();
      set({ settings });
      return found;
    } catch (error) {
      console.error('Failed to detect Claude CLI:', error);
      return false;
    }
  },

  detectCodexCli: async () => {
    try {
      const found = await window.novelEngine.settings.detectCodexCli();
      const settings = await window.novelEngine.settings.load();
      set({ settings });
      return found;
    } catch (error) {
      console.error('Failed to detect Codex CLI:', error);
      return false;
    }
  },

  update: async (partial: Partial<AppSettings>) => {
    try {
      await window.novelEngine.settings.update(partial);
      const settings = await window.novelEngine.settings.load();
      set({ settings });
    } catch (error) {
      console.error('Failed to update settings:', error);
    }
  },
}));
