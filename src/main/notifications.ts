import { Notification, BrowserWindow } from 'electron';
import type { AgentName } from '@domain/types';
import type { ISettingsService } from '@domain/interfaces';
import { AGENT_REGISTRY } from '@domain/constants';

/**
 * NotificationManager — Fires OS-level notifications when agent calls complete.
 *
 * Only notifies when:
 * 1. Notifications are enabled in settings
 * 2. The main window is NOT focused (no point buzzing the user if they're watching)
 *
 * Lives in the main process layer because Electron's Notification API
 * is only available in the main process.
 */
export class NotificationManager {
  constructor(private settings: ISettingsService) {}

  /**
   * Notify the user that an agent has finished responding.
   * Clicking the notification brings the window to front.
   */
  async notifyChatComplete(agentName: AgentName, bookTitle?: string): Promise<void> {
    if (!await this.shouldNotify()) return;

    const agentMeta = AGENT_REGISTRY[agentName];
    const title = `${agentName} is done`;
    const body = bookTitle
      ? `${agentMeta.role} has finished responding — ${bookTitle}`
      : `${agentMeta.role} has finished responding`;

    this.show(title, body);
  }

  /**
   * Notify the user that an agent call failed.
   */
  async notifyChatError(agentName: AgentName, errorMessage: string): Promise<void> {
    if (!await this.shouldNotify()) return;

    const title = `${agentName} encountered an error`;
    const body = errorMessage.length > 120
      ? errorMessage.substring(0, 117) + '...'
      : errorMessage;

    this.show(title, body);
  }

  /**
   * Notify the user that a revision queue session completed.
   */
  async notifyRevisionSessionComplete(sessionTitle: string): Promise<void> {
    if (!await this.shouldNotify()) return;

    this.show('Revision session complete', sessionTitle);
  }

  /**
   * Notify the user that the entire revision queue has finished.
   */
  async notifyRevisionQueueDone(): Promise<void> {
    if (!await this.shouldNotify()) return;

    this.show('Revision queue complete', 'All sessions have finished processing');
  }

  /**
   * Notify that a build has completed successfully.
   */
  async notifyBuildComplete(bookTitle: string, formatCount: number): Promise<void> {
    if (!await this.shouldNotify()) return;

    const formats = formatCount === 1 ? '1 format' : `${formatCount} formats`;
    this.show('Build complete', `${bookTitle} — exported ${formats}`);
  }

  private async shouldNotify(): Promise<boolean> {
    // Check if notifications are enabled in settings
    const appSettings = await this.settings.load();
    if (!appSettings.enableNotifications) return false;

    // Check if Notification API is supported (always true on macOS/Windows 10+)
    if (!Notification.isSupported()) return false;

    // Only notify if the window is NOT focused — no point buzzing them
    // if they're already looking at the app
    const focusedWindow = BrowserWindow.getFocusedWindow();
    return focusedWindow === null;
  }

  private show(title: string, body: string): void {
    const notification = new Notification({ title, body });

    notification.on('click', () => {
      // Bring the app window to front when the notification is clicked
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        const win = windows[0];
        if (win.isMinimized()) win.restore();
        win.focus();
      }
    });

    notification.show();
  }
}
