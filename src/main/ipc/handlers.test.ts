import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { registerIpcHandlers } from './handlers';
import { setTrustedUrlConfig } from '../trustedUrl';
import { makeFakeAgents, makeFakeSettings, type FakeSettings } from '../../test/fakes';
import { cleanupTempDirs, makeTempDir } from '../../test/tempDir';

vi.mock('electron', () => import('../../test/mocks/electron'));

/**
 * Handlers are thin adapters — these tests verify WIRING (registration,
 * arg forwarding, result/error passthrough), not business logic. Services
 * are recording fakes; any method not explicitly stubbed resolves undefined.
 *
 * `src/main/index.ts` (composition root) is excluded from unit coverage —
 * it is exercised only by launching Electron. It owns the `window:*`
 * channels, which the completeness test therefore treats as exceptions.
 */

type AnyFn = ReturnType<typeof vi.fn>;
type ServiceFake = Record<string, AnyFn>;

/** Recording service fake: every method is a memoized vi.fn resolving undefined. */
function auto(impl: Record<string, AnyFn> = {}): ServiceFake {
  const fns = new Map<PropertyKey, AnyFn>(Object.entries(impl));
  return new Proxy({} as ServiceFake, {
    get(_target, prop) {
      if (!fns.has(prop)) fns.set(prop, vi.fn(async () => undefined));
      return fns.get(prop);
    },
  });
}

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

let userDataPath: string;
let settings: FakeSettings;
let svc: Record<string, ServiceFake>;
let hooks: { onActiveBookChanged: ReturnType<typeof vi.fn<(slug: string) => void>> };
let handlers: Map<string, Handler>;
let win: BrowserWindow;

/** A trusted sender: the app's own `file://` frame, backed by a real window. */
const fakeEvent = { sender: {}, senderFrame: { url: 'file:///app/index.html' } } as unknown as IpcMainInvokeEvent;
const invokeAs = (event: IpcMainInvokeEvent, channel: string, ...args: unknown[]): unknown => {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`No handler registered for ${channel}`);
  return handler(event, ...args);
};
const invoke = (channel: string, ...args: unknown[]): unknown => invokeAs(fakeEvent, channel, ...args);

beforeEach(async () => {
  vi.clearAllMocks();
  // The trusted sender frames in these tests use this exact index href.
  setTrustedUrlConfig({ prodIndexHref: 'file:///app/index.html' });
  userDataPath = await makeTempDir();
  win = new BrowserWindow();
  // Default: a trusted sender resolves to a real window so the IPC guard passes.
  vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(win);
  vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([]);
  vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: true, filePaths: [] });

  settings = makeFakeSettings({ authorName: 'Jane Author' });
  svc = {
    settings: settings as unknown as ServiceFake,
    agents: makeFakeAgents() as unknown as ServiceFake,
    db: auto(), fs: auto(), chat: auto(), audit: auto(), pipeline: auto(),
    build: auto(), usage: auto(), revisionQueue: auto(), motifLedger: auto(),
    notifications: auto(), version: auto(), providerRegistry: auto(),
    manuscriptImport: auto(), sourceGeneration: auto(), series: auto(),
    seriesImport: auto(), helper: auto(), findReplace: auto(),
    dashboard: auto(), statistics: auto(), query: auto(),
  };
  hooks = { onActiveBookChanged: vi.fn<(slug: string) => void>() };

  registerIpcHandlers(
    svc as unknown as Parameters<typeof registerIpcHandlers>[0],
    { userDataPath, booksDir: '/fake/books-dir' },
    hooks,
  );

  handlers = new Map<string, Handler>();
  for (const [channel, listener] of vi.mocked(ipcMain.handle).mock.calls) {
    handlers.set(channel, listener as Handler);
  }
});

afterEach(async () => {
  await cleanupTempDirs();
  vi.restoreAllMocks();
});

describe('channel completeness', () => {
  it('registers a handler for every channel the preload bridge invokes, with no orphans', async () => {
    const preloadSource = await readFile(new URL('../../preload/index.ts', import.meta.url), 'utf-8');
    const invoked = [...preloadSource.matchAll(/ipcRenderer\.invoke\(\s*'([^']+)'/g)].map((m) => m[1]);
    const sent = [...preloadSource.matchAll(/ipcRenderer\.send\(\s*'([^']+)'/g)].map((m) => m[1]);

    // window:* channels are registered by the composition root (src/main/index.ts)
    const compositionRootChannels = new Set(['window:isMaximized', 'window:minimize', 'window:maximize', 'window:close']);

    const missing = invoked.filter((ch) => !handlers.has(ch) && !compositionRootChannels.has(ch));
    expect(missing, 'preload invokes without a registered handler').toEqual([]);

    const orphaned = [...handlers.keys()].filter((ch) => !invoked.includes(ch));
    expect(orphaned, 'registered handlers no preload method invokes').toEqual([]);

    // Fire-and-forget send() is reserved for composition-root window controls
    expect(sent.filter((ch) => !compositionRootChannels.has(ch))).toEqual([]);
  });

  it('registers no ipcMain.on listeners (those belong to the composition root)', () => {
    expect(vi.mocked(ipcMain.on).mock.calls).toEqual([]);
  });

  it('every registered channel follows the namespace:action pattern', () => {
    for (const channel of handlers.keys()) {
      expect(channel).toMatch(/^[a-zA-Z-]+:[a-zA-Z]+$/);
    }
  });
});

describe('IPC sender trust guard', () => {
  const trusted = (url: string) => ({ sender: {}, senderFrame: { url } }) as unknown as IpcMainInvokeEvent;

  it('accepts the app\'s own file:// frame and runs the handler', async () => {
    expect(await invokeAs(trusted('file:///app/index.html'), 'settings:load')).toEqual(settings.current);
  });

  it('accepts the exact dev-server origin when running against Vite', async () => {
    setTrustedUrlConfig({ devServerUrl: 'http://localhost:5173' });
    expect(await invokeAs(trusted('http://localhost:5173/#/chapters'), 'settings:load')).toEqual(
      settings.current,
    );
  });

  it('rejects a look-alike localhost host that a prefix check would pass', async () => {
    setTrustedUrlConfig({ devServerUrl: 'http://localhost:5173' });
    await expect(
      Promise.resolve(invokeAs(trusted('http://localhost:5173.evil.com/'), 'books:list')),
    ).rejects.toThrow('Untrusted IPC sender for books:list');
    expect(svc.fs.listBooks).not.toHaveBeenCalled();
  });

  it('rejects an arbitrary file:// page planted in the books folder (packaged build)', async () => {
    // beforeEach configures prodIndexHref = file:///app/index.html.
    await expect(
      Promise.resolve(invokeAs(trusted('file:///app/books/mybook/pwn.html'), 'books:list')),
    ).rejects.toThrow('Untrusted IPC sender for books:list');
    expect(svc.fs.listBooks).not.toHaveBeenCalled();
  });

  it('rejects a foreign origin before the handler runs', async () => {
    const evil = trusted('https://evil.test/phish.html');
    await expect(Promise.resolve(invokeAs(evil, 'books:list'))).rejects.toThrow(
      'Untrusted IPC sender for books:list',
    );
    // The guard short-circuits — the service is never touched.
    expect(svc.fs.listBooks).not.toHaveBeenCalled();
  });

  it('rejects when the event has no sender frame', async () => {
    const noFrame = { sender: {} } as unknown as IpcMainInvokeEvent;
    await expect(Promise.resolve(invokeAs(noFrame, 'books:list'))).rejects.toThrow(
      'Untrusted IPC sender for books:list',
    );
  });

  it('rejects when the sender has no backing BrowserWindow', async () => {
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(null);
    await expect(Promise.resolve(invokeAs(trusted('file:///app/index.html'), 'books:list'))).rejects.toThrow(
      'Untrusted IPC sender for books:list',
    );
    expect(svc.fs.listBooks).not.toHaveBeenCalled();
  });
});

describe('shell IPC allowlist', () => {
  it.each(['https://example.com/doc', 'mailto:someone@example.com'])(
    'shell:openExternal allows %s',
    async (url) => {
      await invoke('shell:openExternal', url);
      expect(shell.openExternal).toHaveBeenCalledWith(url);
    },
  );

  it.each(['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,<script>'])(
    'shell:openExternal blocks %s',
    async (url) => {
      await expect(Promise.resolve(invoke('shell:openExternal', url))).rejects.toThrow();
      expect(shell.openExternal).not.toHaveBeenCalled();
    },
  );

  it('shell:openPath rejects a non-absolute path and opens an absolute one', async () => {
    await expect(Promise.resolve(invoke('shell:openPath', 'relative/export.pdf'))).rejects.toThrow(
      'absolute path',
    );
    expect(shell.openPath).not.toHaveBeenCalled();

    await invoke('shell:openPath', '/Users/me/exports/book.pdf');
    expect(shell.openPath).toHaveBeenCalledWith('/Users/me/exports/book.pdf');
  });
});

describe('settings namespace', () => {
  it('settings:load passes the settings object through', async () => {
    expect(await invoke('settings:load')).toEqual(settings.current);
  });

  it('settings:update syncs nativeTheme only when theme is present', async () => {
    nativeTheme.themeSource = 'light';

    await invoke('settings:update', { fontSize: 14 });
    expect(nativeTheme.themeSource).toBe('light');

    await invoke('settings:update', { theme: 'dark' });
    expect(nativeTheme.themeSource).toBe('dark');
    expect(settings.current.theme).toBe('dark');

    await invoke('settings:update', { theme: 'system' });
    expect(nativeTheme.themeSource).toBe('system');
  });

  it('author profile round-trips through the real userData path, empty when missing', async () => {
    expect(await invoke('settings:loadAuthorProfile')).toBe('');
    await invoke('settings:saveAuthorProfile', 'My writing voice.');
    expect(await invoke('settings:loadAuthorProfile')).toBe('My writing voice.');
  });
});

describe('agents namespace', () => {
  it('agents:list strips systemPrompt from every agent', async () => {
    const result = (await invoke('agents:list')) as Record<string, unknown>[];
    expect(result.length).toBeGreaterThan(0);
    for (const meta of result) {
      expect(meta).toHaveProperty('name');
      expect(meta).toHaveProperty('filename');
      expect(meta).not.toHaveProperty('systemPrompt');
    }
  });
});

describe('books namespace', () => {
  it('books:create injects the configured author name and fires the active-book hook', async () => {
    svc.fs.createBook.mockResolvedValue({ slug: 'new-book', title: 'My Title' });

    const result = await invoke('books:create', 'My Title');

    expect(svc.fs.createBook).toHaveBeenCalledWith('My Title', 'Jane Author');
    expect(hooks.onActiveBookChanged).toHaveBeenCalledWith('new-book');
    expect(result).toEqual({ slug: 'new-book', title: 'My Title' });
  });

  it('books:updateMeta migrates conversations and refires the hook only on slug change', async () => {
    svc.fs.updateBookMeta.mockResolvedValue({ slug: 'old-slug', title: 'Same' });
    await invoke('books:updateMeta', 'old-slug', { title: 'Same' });
    expect(svc.db.updateBookSlug).not.toHaveBeenCalled();
    expect(hooks.onActiveBookChanged).not.toHaveBeenCalled();

    svc.fs.updateBookMeta.mockResolvedValue({ slug: 'new-slug', title: 'Renamed' });
    await invoke('books:updateMeta', 'old-slug', { title: 'Renamed' });
    expect(svc.db.updateBookSlug).toHaveBeenCalledWith('old-slug', 'new-slug');
    expect(hooks.onActiveBookChanged).toHaveBeenCalledWith('new-slug');
  });

  it('books:uploadCover returns null on a canceled dialog and forwards the chosen file', async () => {
    expect(await invoke('books:uploadCover', 'book-a')).toBeNull();
    expect(svc.fs.saveCoverImage).not.toHaveBeenCalled();

    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: false, filePaths: ['/tmp/cover.png'] });
    await invoke('books:uploadCover', 'book-a');
    expect(svc.fs.saveCoverImage).toHaveBeenCalledWith('book-a', '/tmp/cover.png');
  });

  it('books:getAbsolutePath delegates to the containment-checked fs.getAbsolutePath', async () => {
    svc.fs.getAbsolutePath.mockReturnValue('/fake/books-dir/book-a/chapters/01/draft.md');

    const result = await invoke('books:getAbsolutePath', 'book-a', 'chapters/01/draft.md');

    expect(svc.fs.getAbsolutePath).toHaveBeenCalledWith('book-a', 'chapters/01/draft.md');
    expect(result).toBe('/fake/books-dir/book-a/chapters/01/draft.md');
  });

  it('books:getAbsolutePath surfaces an escape rejection from fs.getAbsolutePath', async () => {
    svc.fs.getAbsolutePath.mockImplementation(() => {
      throw new Error('Path escapes book directory: ../../secret');
    });
    await expect(Promise.resolve(invoke('books:getAbsolutePath', 'book-a', '../../secret'))).rejects.toThrow(
      'Path escapes book directory',
    );
  });
});

describe('files + versions namespaces', () => {
  it('files:write writes then auto-snapshots as a user version, tolerating snapshot failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    svc.version.snapshotContent.mockRejectedValue(new Error('db closed'));

    await invoke('files:write', 'book-a', 'notes.md', 'content');

    expect(svc.fs.writeFile).toHaveBeenCalledWith('book-a', 'notes.md', 'content');
    expect(svc.version.snapshotContent).toHaveBeenCalledWith('book-a', 'notes.md', 'content', 'user');
    expect(warn).toHaveBeenCalled();
  });

  it('service errors propagate to the caller as rejections', async () => {
    svc.fs.readFile.mockRejectedValue(new Error('File not found: notes.md in book "book-a"'));
    await expect(Promise.resolve(invoke('files:read', 'book-a', 'notes.md'))).rejects.toThrow(
      'File not found: notes.md in book "book-a"',
    );
  });

  it('versions:revert broadcasts chat:filesChanged to every window and returns the version', async () => {
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([win]);
    svc.version.revertToVersion.mockResolvedValue({ id: 7 });

    const result = await invoke('versions:revert', 'book-a', 'draft.md', 7);

    expect(svc.version.revertToVersion).toHaveBeenCalledWith('book-a', 'draft.md', 7);
    expect(win.webContents.send).toHaveBeenCalledWith('chat:filesChanged', ['draft.md'], 'book-a');
    expect(result).toEqual({ id: 7 });
  });
});

describe('thin adapters', () => {
  it('forward args and pass results through untouched', async () => {
    svc.usage.getSummary.mockReturnValue({ totalInputTokens: 1 });
    expect(await invoke('usage:summary', 'book-a')).toEqual({ totalInputTokens: 1 });
    expect(svc.usage.getSummary).toHaveBeenCalledWith('book-a');

    await invoke('pipeline:confirmAdvancement', 'book-a', 'pitch');
    expect(svc.pipeline.confirmPhaseAdvancement).toHaveBeenCalledWith('book-a', 'pitch');

    await invoke('query:updateTargetStatus', 'book-a', 't1', 'submitted', '2026-07-18');
    expect(svc.query.updateTargetStatus).toHaveBeenCalledWith('book-a', 't1', 'submitted', '2026-07-18');

    await invoke('shell:openExternal', 'https://example.com');
    expect(shell.openExternal).toHaveBeenCalledWith('https://example.com');
  });

  it('pitchRoom:discard deletes the draft and its conversation', async () => {
    await invoke('pitchRoom:discard', 'conv-1');
    expect(svc.fs.deletePitchDraft).toHaveBeenCalledWith('conv-1');
    expect(svc.db.deleteConversation).toHaveBeenCalledWith('conv-1');
  });
});

describe('chat:send orchestration', () => {
  const params = { agentName: 'Spark', message: 'hi', conversationId: 'conv-1', bookSlug: 'book-a', callId: 'call-1' };

  beforeEach(() => {
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(win);
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([win]);
  });

  it('tags stream events, notifies completion with the book title, and snapshots changed files', async () => {
    svc.chat.sendMessage.mockImplementation(
      async ({ onEvent }: { onEvent: (e: Record<string, unknown>) => void }) => {
        onEvent({ type: 'textDelta', text: 'hello' });
        return { changedFiles: ['chapters/01/draft.md'] };
      },
    );
    svc.fs.getBookMeta.mockResolvedValue({ title: 'My Novel' });

    await invoke('chat:send', params);

    // Renderer-provided callId is preserved; events tagged for scoping
    const sendCall = svc.chat.sendMessage.mock.calls[0][0] as { callId: string };
    expect(sendCall.callId).toBe('call-1');
    expect(win.webContents.send).toHaveBeenCalledWith('chat:streamEvent', {
      type: 'textDelta', text: 'hello', callId: 'call-1', conversationId: 'conv-1', source: 'chat',
    });
    expect(svc.notifications.notifyChatComplete).toHaveBeenCalledWith('Spark', 'My Novel');
    expect(svc.notifications.notifyChatError).not.toHaveBeenCalled();
    expect(win.webContents.send).toHaveBeenCalledWith('chat:filesChanged', ['chapters/01/draft.md'], 'book-a');
    expect(svc.version.snapshotFile).toHaveBeenCalledWith('book-a', 'chapters/01/draft.md', 'agent');
    expect(svc.statistics.recordWordCountSnapshot).toHaveBeenCalledWith('book-a');
  });

  it('routes stream errors to the error notification instead', async () => {
    svc.chat.sendMessage.mockImplementation(
      async ({ onEvent }: { onEvent: (e: Record<string, unknown>) => void }) => {
        onEvent({ type: 'error', message: 'CLI crashed' });
        return { changedFiles: [] };
      },
    );

    await invoke('chat:send', params);

    expect(svc.notifications.notifyChatError).toHaveBeenCalledWith('Spark', 'CLI crashed');
    expect(svc.notifications.notifyChatComplete).not.toHaveBeenCalled();
    expect(svc.version.snapshotFile).not.toHaveBeenCalled();
  });
});

describe('broadcast guards', () => {
  const params = { agentName: 'Spark', message: 'hi', conversationId: 'conv-1', bookSlug: 'book-a', callId: 'call-1' };

  beforeEach(() => {
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(win);
  });

  it('skips windows with destroyed webContents when broadcasting stream events', async () => {
    const deadWin = new BrowserWindow();
    deadWin.webContents.isDestroyed = vi.fn((): boolean => true);
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([deadWin]);

    svc.chat.sendMessage.mockImplementation(
      async ({ onEvent }: { onEvent: (e: Record<string, unknown>) => void }) => {
        onEvent({ type: 'textDelta', text: 'hello' });
        return { changedFiles: [] };
      },
    );

    await invoke('chat:send', params);

    expect(deadWin.webContents.send).not.toHaveBeenCalled();
  });
});

describe('hot-take:start', () => {
  it('creates a Ghostlight conversation, fires the stream, and returns the ids', async () => {
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(win);
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([win]);
    svc.db.createConversation.mockImplementation((p: { id: string }) => p);
    svc.chat.sendMessage.mockImplementation(
      async ({ onEvent }: { onEvent: (e: Record<string, unknown>) => void }) => {
        onEvent({ type: 'textDelta', text: 'take' });
        return { changedFiles: [] };
      },
    );

    const result = (await invoke('hot-take:start', 'book-a')) as { conversationId: string; callId: string };

    const created = svc.db.createConversation.mock.calls[0][0] as Record<string, unknown>;
    expect(created).toMatchObject({ bookSlug: 'book-a', agentName: 'Ghostlight', purpose: 'hot-take', pipelinePhase: null });
    expect(result.conversationId).toBe(created.id);
    expect(result.callId).toBeTruthy();
    expect(win.webContents.send).toHaveBeenCalledWith('chat:streamEvent', {
      type: 'textDelta', text: 'take', callId: result.callId, conversationId: result.conversationId, source: 'hot-take',
    });
  });
});

describe('verity namespace', () => {
  it('verity:auditChapter emits a synthetic callStart and forwards to the audit service', async () => {
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([win]);
    svc.audit.auditChapter.mockResolvedValue({ chapter: '01' });

    const result = await invoke('verity:auditChapter', 'book-a', '01-first', 'call-7', 'conv-7');

    expect(win.webContents.send).toHaveBeenCalledWith('chat:streamEvent', {
      type: 'callStart', callId: 'call-7', conversationId: 'conv-7', agentName: 'Verity', model: 'unknown', bookSlug: 'book-a',
    });
    const auditCall = svc.audit.auditChapter.mock.calls[0][0] as Record<string, unknown>;
    expect(auditCall).toMatchObject({ bookSlug: 'book-a', chapterSlug: '01-first', conversationId: 'conv-7' });
    expect(result).toEqual({ chapter: '01' });
  });
});

describe('revision queue event forwarding', () => {
  it('forwards queue events to windows, re-tags stream events, and fires notifications', () => {
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([win]);
    const onQueueEvent = svc.revisionQueue.onEvent.mock.calls[0][0] as (event: Record<string, unknown>) => void;

    const streamEvent = {
      type: 'session:streamEvent', sessionId: 's1', conversationId: 'c1',
      event: { type: 'textDelta', text: 'revising' },
    };
    onQueueEvent(streamEvent);
    expect(win.webContents.send).toHaveBeenCalledWith('revision:event', streamEvent);
    expect(win.webContents.send).toHaveBeenCalledWith('chat:streamEvent', {
      type: 'textDelta', text: 'revising', callId: 'rev:s1', conversationId: 'c1', source: 'revision',
    });

    onQueueEvent({ type: 'session:done', taskNumbers: [1, 2] });
    expect(svc.notifications.notifyRevisionSessionComplete).toHaveBeenCalledWith('Session finished (tasks 1, 2)');

    onQueueEvent({ type: 'queue:done' });
    expect(svc.notifications.notifyRevisionQueueDone).toHaveBeenCalled();
  });
});
