import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contextBridge, ipcRenderer } from 'electron';
import './index';

vi.mock('electron', () => import('../test/mocks/electron'));

// Captured once at module load — do NOT vi.clearAllMocks() or the capture is lost.
const exposeCalls = vi.mocked(contextBridge.exposeInMainWorld).mock.calls;
const api = exposeCalls[0]?.[1] as Window['novelEngine'];

const invoke = vi.mocked(ipcRenderer.invoke);
const send = vi.mocked(ipcRenderer.send);
const on = vi.mocked(ipcRenderer.on);
const removeListener = vi.mocked(ipcRenderer.removeListener);

const isSubscription = (name: string) => /^on[A-Z]/.test(name);

beforeEach(() => {
  invoke.mockClear();
  send.mockClear();
  on.mockClear();
  removeListener.mockClear();
});

describe('bridge surface', () => {
  it('exposes a single API object named novelEngine', () => {
    expect(exposeCalls).toHaveLength(1);
    expect(exposeCalls[0][0]).toBe('novelEngine');
  });

  it('exposes the complete namespace set', () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        'settings', 'agents', 'books', 'import', 'seriesImport', 'files', 'versions',
        'chat', 'pipeline', 'build', 'catalog', 'pitches', 'pitchRoom', 'verity',
        'hotTake', 'adhocRevision', 'usage', 'revision', 'motifLedger', 'context',
        'shell', 'window', 'models', 'providers', 'series', 'findReplace',
        'dashboard', 'statistics', 'helper', 'query',
      ].sort()
    );
  });

  it('every non-subscription method routes exactly one IPC call on a namespace:action channel', () => {
    for (const [nsName, ns] of Object.entries(api)) {
      for (const [methodName, method] of Object.entries(ns as Record<string, unknown>)) {
        if (typeof method !== 'function' || isSubscription(methodName)) continue;
        invoke.mockClear();
        send.mockClear();
        (method as (...args: unknown[]) => unknown)('arg1', 'arg2', 'arg3');
        const calls = [...invoke.mock.calls, ...send.mock.calls];
        expect(calls, `${nsName}.${methodName} must route through the bridge exactly once`).toHaveLength(1);
        expect(String(calls[0][0]), `${nsName}.${methodName} channel`).toMatch(/^[a-zA-Z-]+:[a-zA-Z]+$/);
      }
    }
  });
});

describe('argument forwarding', () => {
  it('forwards positional args verbatim', () => {
    api.files.write('book-a', 'chapters/01/draft.md', 'text');
    expect(invoke).toHaveBeenCalledWith('files:write', 'book-a', 'chapters/01/draft.md', 'text');

    api.versions.getHistory('book-a', 'draft.md', 10, 5);
    expect(invoke).toHaveBeenCalledWith('versions:getHistory', 'book-a', 'draft.md', 10, 5);
  });

  it('verity.fixChapter routes to fixChapterWithAudit only when an audit result is supplied', () => {
    const auditResult = { chapter: '01', violations: [], summary: { total: 0, by_type: {}, severity: 'clean' as const } };

    api.verity.fixChapter('book-a', '01', 'conv-1');
    expect(invoke).toHaveBeenCalledWith('verity:fixChapter', 'book-a', '01', 'conv-1', undefined);

    api.verity.fixChapter('book-a', '01', 'conv-1', auditResult, 'call-9');
    expect(invoke).toHaveBeenCalledWith(
      'verity:fixChapterWithAudit', 'book-a', '01', 'conv-1', JSON.stringify(auditResult), 'call-9'
    );
  });

  it('window controls use fire-and-forget send, except isMaximized', () => {
    api.window.minimize();
    api.window.maximize();
    api.window.close();
    api.window.isMaximized();

    expect(send.mock.calls).toEqual([['window:minimize'], ['window:maximize'], ['window:close']]);
    expect(invoke).toHaveBeenCalledWith('window:isMaximized');
  });
});

describe('event subscriptions', () => {
  it('every on* method registers listeners and its unsubscribe removes exactly those listeners', () => {
    for (const [nsName, ns] of Object.entries(api)) {
      for (const [methodName, method] of Object.entries(ns as Record<string, unknown>)) {
        if (typeof method !== 'function' || !isSubscription(methodName)) continue;
        on.mockClear();
        removeListener.mockClear();
        const unsubscribe = (method as (cb: (...args: unknown[]) => void) => () => void)(vi.fn());
        expect(on.mock.calls.length, `${nsName}.${methodName} registers`).toBeGreaterThan(0);
        unsubscribe();
        expect(removeListener.mock.calls, `${nsName}.${methodName} unsubscribes`).toEqual(on.mock.calls);
      }
    }
  });

  it('chat.onStreamEvent strips the ipc event and forwards the payload', () => {
    const callback = vi.fn();
    api.chat.onStreamEvent(callback);

    const [channel, handler] = on.mock.calls[0] as [string, (event: unknown, payload: unknown) => void];
    expect(channel).toBe('chat:streamEvent');
    handler({ sender: {} }, { type: 'textDelta', text: 'hi' });
    expect(callback).toHaveBeenCalledWith({ type: 'textDelta', text: 'hi' });
  });

  it('window.onMaximizeChange maps the two window events to boolean callbacks', () => {
    const callback = vi.fn();
    api.window.onMaximizeChange(callback);

    const channels = on.mock.calls.map(([ch]) => ch);
    expect(channels).toEqual(['window:maximized', 'window:unmaximized']);
    (on.mock.calls[0][1] as () => void)();
    (on.mock.calls[1][1] as () => void)();
    expect(callback.mock.calls).toEqual([[true], [false]]);
  });
});
