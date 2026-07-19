import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IModelProvider, ISettingsService } from '@domain/interfaces';
import type { ModelInfo, ProviderConfig, StreamEvent } from '@domain/types';
import { ProviderRegistry } from './ProviderRegistry';

function makeModel(id: string, providerId: string): ModelInfo {
  return { id, label: id, description: id, providerId, supportsThinking: false, supportsToolUse: false };
}

function makeConfig(id: string, overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id,
    type: 'openai-compatible',
    name: id,
    enabled: true,
    isBuiltIn: false,
    models: [makeModel(`${id}-model`, id)],
    defaultModel: `${id}-model`,
    capabilities: ['text-completion', 'streaming'],
    ...overrides,
  };
}

function makeProvider(id: string): IModelProvider {
  return {
    providerId: id,
    capabilities: ['text-completion', 'streaming'],
    isAvailable: vi.fn(async () => true),
    invalidateAvailabilityCache: vi.fn(),
    sendMessage: vi.fn(async () => undefined),
    abortStream: vi.fn(),
    hasActiveProcesses: vi.fn(() => false),
    hasActiveProcessesForBook: vi.fn(() => false),
  } as unknown as IModelProvider;
}

let settingsUpdate: ReturnType<typeof vi.fn>;
let registry: ProviderRegistry;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  settingsUpdate = vi.fn(async () => undefined);
  registry = new ProviderRegistry({ update: settingsUpdate } as unknown as ISettingsService);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('registration + lookup', () => {
  it('registers providers, the first becoming the default', () => {
    const a = makeProvider('alpha');
    const b = makeProvider('beta');
    registry.registerProvider(a, makeConfig('alpha'));
    registry.registerProvider(b, makeConfig('beta'));

    expect(registry.getProvider('alpha')).toBe(a);
    expect(registry.getProvider('missing')).toBeNull();
    expect(registry.getDefaultProvider()).toBe(a);

    registry.setDefaultProvider('beta');
    expect(registry.getDefaultProvider()).toBe(b);

    registry.setDefaultProvider('ghost'); // unknown → ignored
    expect(registry.getDefaultProvider()).toBe(b);
  });

  it('getDefaultProvider throws when nothing is registered', () => {
    expect(() => registry.getDefaultProvider()).toThrow(/No model providers registered/);
  });

  it('removeProvider deletes custom providers and persists, but protects built-ins', () => {
    registry.registerProvider(makeProvider('builtin'), makeConfig('builtin', { isBuiltIn: true }));
    registry.registerProvider(makeProvider('custom'), makeConfig('custom'));

    registry.removeProvider('builtin');
    expect(registry.getProvider('builtin')).not.toBeNull();

    registry.removeProvider('custom');
    expect(registry.getProvider('custom')).toBeNull();
    expect(settingsUpdate).toHaveBeenCalledWith({ providers: expect.any(Array) });
  });

  it('routes model IDs to providers, preferring built-ins on collisions and skipping disabled configs', () => {
    const custom = makeProvider('custom');
    const builtin = makeProvider('builtin');
    const shared = 'shared-model';
    registry.registerProvider(custom, makeConfig('custom', { models: [makeModel(shared, 'custom')] }));
    registry.registerProvider(builtin, makeConfig('builtin', { isBuiltIn: true, models: [makeModel(shared, 'builtin')] }));

    expect(registry.getProviderForModel(shared)).toBe(builtin);
    expect(registry.getProviderForModel('unknown')).toBeNull();

    registry.registerProvider(makeProvider('off'), makeConfig('off', { enabled: false, models: [makeModel('off-model', 'off')] }));
    expect(registry.getProviderForModel('off-model')).toBeNull();
    expect(registry.listAllModels().map((m) => m.id)).not.toContain('off-model');
  });
});

describe('resolveModelSelection', () => {
  it('returns the requested model without fallback when indexed', () => {
    registry.registerProvider(makeProvider('alpha'), makeConfig('alpha'));

    expect(registry.resolveModelSelection('alpha-model')).toEqual({
      requestedModel: 'alpha-model',
      model: 'alpha-model',
      providerId: 'alpha',
      didFallback: false,
      reason: 'requested-model-available',
    });
  });

  it('falls back: preferred provider default → default provider default → first enabled', () => {
    registry.registerProvider(makeProvider('alpha'), makeConfig('alpha'));
    registry.registerProvider(makeProvider('beta'), makeConfig('beta'));

    expect(registry.resolveModelSelection('ghost-model', 'beta')).toMatchObject({
      model: 'beta-model',
      providerId: 'beta',
      didFallback: true,
      reason: 'active-provider-default',
    });

    expect(registry.resolveModelSelection('ghost-model')).toMatchObject({
      model: 'alpha-model',
      reason: 'default-provider-default',
    });
  });

  it('throws when no enabled models exist anywhere', () => {
    registry.registerProvider(makeProvider('empty'), makeConfig('empty', { models: [], defaultModel: undefined }));
    expect(() => registry.resolveModelSelection('anything')).toThrow(/No enabled models are available/);
  });
});

describe('config updates', () => {
  it('merges partials, protects immutable fields, and persists', () => {
    registry.registerProvider(makeProvider('alpha'), makeConfig('alpha', { isBuiltIn: true }));

    registry.updateProviderConfig('alpha', {
      name: 'Renamed',
      id: 'hacked',
      type: 'claude-cli',
      isBuiltIn: false,
    } as Partial<ProviderConfig>);

    const config = registry.getProviderConfig('alpha');
    expect(config).toMatchObject({ id: 'alpha', type: 'openai-compatible', isBuiltIn: true, name: 'Renamed' });
    expect(settingsUpdate).toHaveBeenCalled();
    expect(registry.getProviderConfig('nope')).toBeNull();
  });

  it('a baseUrl change notifies the provider instance via setBaseUrl', () => {
    const provider = Object.assign(makeProvider('alpha'), { setBaseUrl: vi.fn() });
    registry.registerProvider(provider, makeConfig('alpha', { baseUrl: 'http://old' }));

    registry.updateProviderConfig('alpha', { baseUrl: 'http://new' });

    expect((provider as unknown as { setBaseUrl: ReturnType<typeof vi.fn> }).setBaseUrl).toHaveBeenCalledWith('http://new');
  });

  it('an ollama baseUrl change refreshes the model list from /api/tags', async () => {
    vi.stubGlobal('fetch', (async (input: string | URL | Request) => {
      expect(String(input)).toBe('http://newhost:11434/api/tags');
      return new Response(JSON.stringify({ models: [{ name: 'llama3.2:latest' }] }), { status: 200 });
    }) as typeof fetch);

    registry.registerProvider(
      makeProvider('ollama-cli'),
      makeConfig('ollama-cli', { type: 'ollama-cli', enabled: false, models: [], defaultModel: undefined, baseUrl: 'http://old' })
    );

    registry.updateProviderConfig('ollama-cli', { baseUrl: 'newhost:11434' });

    await vi.waitFor(() => {
      const config = registry.getProviderConfig('ollama-cli');
      expect(config?.models.map((m) => m.id)).toEqual(['llama3.2:latest']);
    });
    const config = registry.getProviderConfig('ollama-cli');
    expect(config).toMatchObject({ enabled: true, defaultModel: 'llama3.2:latest' });
    expect(config?.models[0].label).toBe('llama3.2'); // :latest stripped
  });

  it('a llama-server baseUrl change refreshes models from /v1/models', async () => {
    vi.stubGlobal('fetch', (async () =>
      new Response(JSON.stringify({ data: [{ id: 'models/qwen-32b.gguf' }] }), { status: 200 })) as typeof fetch);

    registry.registerProvider(
      makeProvider('llama-server'),
      makeConfig('llama-server', { type: 'llama-server', enabled: false, models: [], defaultModel: undefined, baseUrl: 'http://old' })
    );

    registry.updateProviderConfig('llama-server', { baseUrl: 'http://new:8080' });

    await vi.waitFor(() => {
      expect(registry.getProviderConfig('llama-server')?.models.length).toBe(1);
    });
    expect(registry.getProviderConfig('llama-server')?.models[0].label).toBe('qwen-32b.gguf'); // path tail
  });
});

describe('delegates', () => {
  it('checkProviderStatus maps availability, errors, and missing providers', async () => {
    const healthy = makeProvider('ok');
    const broken = Object.assign(makeProvider('broken'), {
      isAvailable: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    registry.registerProvider(healthy, makeConfig('ok'));
    registry.registerProvider(broken as unknown as IModelProvider, makeConfig('broken'));

    expect(await registry.checkProviderStatus('ok')).toBe('available');
    expect(await registry.checkProviderStatus('broken')).toBe('error');
    expect(await registry.checkProviderStatus('ghost')).toBe('unavailable');
  });

  it('sendMessage resolves the model, warns on fallback, and forwards to the provider', async () => {
    const alpha = makeProvider('alpha');
    registry.registerProvider(alpha, makeConfig('alpha'));
    const received: StreamEvent[] = [];

    await registry.sendMessage({
      model: 'ghost-model',
      systemPrompt: 's',
      messages: [],
      maxTokens: 100,
      onEvent: (e) => received.push(e),
    });

    expect(received[0]).toMatchObject({
      type: 'warning',
      message: expect.stringContaining('Using alpha-model instead'),
    });
    expect(alpha.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ model: 'alpha-model' }));
  });

  it('abortStream broadcasts and active-process checks aggregate across providers', () => {
    const a = makeProvider('a');
    const b = Object.assign(makeProvider('b'), {
      hasActiveProcesses: vi.fn(() => true),
      hasActiveProcessesForBook: vi.fn((slug: string) => slug === 'busy-book'),
    });
    registry.registerProvider(a, makeConfig('a'));
    registry.registerProvider(b as unknown as IModelProvider, makeConfig('b'));

    registry.abortStream('conv-9');
    expect(a.abortStream).toHaveBeenCalledWith('conv-9');
    expect((b as unknown as IModelProvider).abortStream).toHaveBeenCalledWith('conv-9');

    expect(registry.hasActiveProcesses()).toBe(true);
    expect(registry.hasActiveProcessesForBook('busy-book')).toBe(true);
    expect(registry.hasActiveProcessesForBook('idle-book')).toBe(false);
  });
});
