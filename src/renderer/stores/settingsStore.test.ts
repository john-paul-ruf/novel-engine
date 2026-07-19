import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AppSettings } from '@domain/types';
import { useSettingsStore } from './settingsStore';
import {
  installNovelEngineMock,
  makeAppSettings,
  type NovelEngineMock,
} from '../../test/novelEngineMock';
import { resetStoresBeforeEach } from '../../test/resetStores';

resetStoresBeforeEach(useSettingsStore);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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

describe('settingsStore', () => {
  describe('load', () => {
    it('loads settings through the bridge and clears the loading flag', async () => {
      mock.settings.load.mockResolvedValue(makeAppSettings({ model: 'model-x' }));

      await useSettingsStore.getState().load();

      const state = useSettingsStore.getState();
      expect(state.settings?.model).toBe('model-x');
      expect(state.loading).toBe(false);
      expect(mock.settings.load).toHaveBeenCalledTimes(1);
    });

    it('sets loading=true while the bridge call is in flight', async () => {
      const load = deferred<AppSettings>();
      mock.settings.load.mockImplementation(() => load.promise);

      const pending = useSettingsStore.getState().load();
      expect(useSettingsStore.getState().loading).toBe(true);
      expect(useSettingsStore.getState().settings).toBeNull();

      load.resolve(makeAppSettings());
      await pending;
      expect(useSettingsStore.getState().loading).toBe(false);
    });

    it('clears loading and leaves settings null when the bridge rejects', async () => {
      mock.settings.load.mockRejectedValue(new Error('ipc down'));

      await useSettingsStore.getState().load();

      expect(useSettingsStore.getState().loading).toBe(false);
      expect(useSettingsStore.getState().settings).toBeNull();
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('CLI detection', () => {
    it('detectClaudeCli returns the detection result and reloads settings afterwards', async () => {
      mock.settings.detectClaudeCli.mockResolvedValue(true);
      mock.settings.load.mockResolvedValue(makeAppSettings({ hasClaudeCli: true }));

      const found = await useSettingsStore.getState().detectClaudeCli();

      expect(found).toBe(true);
      expect(useSettingsStore.getState().settings?.hasClaudeCli).toBe(true);
      // detection runs before the settings reload
      expect(mock.settings.detectClaudeCli.mock.invocationCallOrder[0]).toBeLessThan(
        mock.settings.load.mock.invocationCallOrder[0],
      );
    });

    it('detectClaudeCli returns false and skips the reload when detection fails', async () => {
      mock.settings.detectClaudeCli.mockRejectedValue(new Error('spawn failed'));

      const found = await useSettingsStore.getState().detectClaudeCli();

      expect(found).toBe(false);
      expect(useSettingsStore.getState().settings).toBeNull();
      expect(mock.settings.load).not.toHaveBeenCalled();
    });

    it('detectCodexCli follows the same detect-then-reload contract', async () => {
      mock.settings.detectCodexCli.mockResolvedValue(true);
      mock.settings.load.mockResolvedValue(makeAppSettings({ hasCodexCli: true }));

      const found = await useSettingsStore.getState().detectCodexCli();

      expect(found).toBe(true);
      expect(useSettingsStore.getState().settings?.hasCodexCli).toBe(true);
    });
  });

  describe('update', () => {
    it('is NOT optimistic — state only changes after the bridge confirms via reload', async () => {
      // Seed loaded settings
      mock.settings.load.mockResolvedValue(makeAppSettings({ model: 'old-model' }));
      await useSettingsStore.getState().load();

      const update = deferred<void>();
      mock.settings.update.mockImplementation(() => update.promise);
      mock.settings.load.mockResolvedValue(makeAppSettings({ model: 'new-model' }));

      const pending = useSettingsStore.getState().update({ model: 'new-model' });

      // Pinned: while the update is in flight, the store still shows the old value
      expect(useSettingsStore.getState().settings?.model).toBe('old-model');

      update.resolve();
      await pending;

      expect(useSettingsStore.getState().settings?.model).toBe('new-model');
      expect(mock.settings.update).toHaveBeenCalledWith({ model: 'new-model' });
      // update is sent before the confirming reload
      expect(mock.settings.update.mock.invocationCallOrder[0]).toBeLessThan(
        mock.settings.load.mock.invocationCallOrder[1],
      );
    });

    it('leaves settings unchanged and skips the reload when the bridge rejects', async () => {
      mock.settings.load.mockResolvedValue(makeAppSettings({ model: 'old-model' }));
      await useSettingsStore.getState().load();
      mock.settings.load.mockClear();

      mock.settings.update.mockRejectedValue(new Error('write failed'));
      await useSettingsStore.getState().update({ model: 'new-model' });

      expect(useSettingsStore.getState().settings?.model).toBe('old-model');
      expect(mock.settings.load).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });
  });
});
