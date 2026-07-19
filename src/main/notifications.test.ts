import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserWindow, Notification } from 'electron';
import { NotificationManager } from './notifications';
import { makeFakeSettings } from '../test/fakes';

vi.mock('electron', () => import('../test/mocks/electron'));

// The mock class tracks constructed instances
const MockNotification = Notification as unknown as {
  isSupported: ReturnType<typeof vi.fn>;
  instances: { options: { title?: string; body?: string }; show: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> }[];
};
const MockBrowserWindow = BrowserWindow as unknown as {
  getFocusedWindow: ReturnType<typeof vi.fn>;
  getAllWindows: ReturnType<typeof vi.fn>;
};

function makeManager(enableNotifications = true): NotificationManager {
  return new NotificationManager(makeFakeSettings({ enableNotifications }));
}

beforeEach(() => {
  vi.clearAllMocks();
  MockNotification.instances.length = 0;
  MockNotification.isSupported.mockReturnValue(true);
  MockBrowserWindow.getFocusedWindow.mockReturnValue(null);
  MockBrowserWindow.getAllWindows.mockReturnValue([]);
});

describe('suppression rules', () => {
  it('shows a notification when enabled, supported, and the window is unfocused', async () => {
    await makeManager().notifyChatComplete('Spark');

    expect(MockNotification.instances).toHaveLength(1);
    expect(MockNotification.instances[0].show).toHaveBeenCalledTimes(1);
  });

  it('suppresses when notifications are disabled in settings', async () => {
    await makeManager(false).notifyChatComplete('Spark');
    expect(MockNotification.instances).toHaveLength(0);
  });

  it('suppresses when the OS does not support notifications', async () => {
    MockNotification.isSupported.mockReturnValue(false);
    await makeManager().notifyChatComplete('Spark');
    expect(MockNotification.instances).toHaveLength(0);
  });

  it('suppresses when a window is focused', async () => {
    MockBrowserWindow.getFocusedWindow.mockReturnValue(new BrowserWindow());
    await makeManager().notifyChatComplete('Spark');
    expect(MockNotification.instances).toHaveLength(0);
  });
});

describe('message formatting', () => {
  it('notifyChatComplete uses the agent registry role, with and without a book title', async () => {
    const manager = makeManager();
    await manager.notifyChatComplete('Spark', 'My Novel');
    await manager.notifyChatComplete('Spark');

    expect(MockNotification.instances[0].options).toEqual({
      title: 'Spark is done',
      body: 'Story Pitch has finished responding — My Novel',
    });
    expect(MockNotification.instances[1].options).toEqual({
      title: 'Spark is done',
      body: 'Story Pitch has finished responding',
    });
  });

  it('notifyChatError truncates long messages to 117 chars + ellipsis', async () => {
    const manager = makeManager();
    await manager.notifyChatError('Verity', 'short failure');
    await manager.notifyChatError('Verity', 'x'.repeat(200));

    expect(MockNotification.instances[0].options).toEqual({
      title: 'Verity encountered an error',
      body: 'short failure',
    });
    expect(MockNotification.instances[1].options.body).toBe('x'.repeat(117) + '...');
  });

  it('notifyBuildComplete pluralizes the format count', async () => {
    const manager = makeManager();
    await manager.notifyBuildComplete('My Novel', 1);
    await manager.notifyBuildComplete('My Novel', 3);

    expect(MockNotification.instances[0].options.body).toBe('My Novel — exported 1 format');
    expect(MockNotification.instances[1].options.body).toBe('My Novel — exported 3 formats');
  });

  it('revision notifications use fixed titles', async () => {
    const manager = makeManager();
    await manager.notifyRevisionSessionComplete('Session finished (tasks 1, 2)');
    await manager.notifyRevisionQueueDone();

    expect(MockNotification.instances[0].options).toEqual({
      title: 'Revision session complete',
      body: 'Session finished (tasks 1, 2)',
    });
    expect(MockNotification.instances[1].options).toEqual({
      title: 'Revision queue complete',
      body: 'All sessions have finished processing',
    });
  });
});

describe('click handling', () => {
  it('restores a minimized window and focuses it when the notification is clicked', async () => {
    const win = new BrowserWindow();
    vi.mocked(win.isMinimized).mockReturnValue(true);
    MockBrowserWindow.getAllWindows.mockReturnValue([win]);

    await makeManager().notifyChatComplete('Spark');

    const instance = MockNotification.instances[0];
    const [event, onClick] = instance.on.mock.calls[0] as [string, () => void];
    expect(event).toBe('click');
    onClick();
    expect(win.restore).toHaveBeenCalledTimes(1);
    expect(win.focus).toHaveBeenCalledTimes(1);
  });
});
