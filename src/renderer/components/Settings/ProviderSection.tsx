import { useState, useEffect, useCallback } from 'react';
import { useProviderStore } from '../../stores/providerStore';
import type { ProviderConfig, ModelInfo, ProviderStatus } from '@domain/types';

function StatusDot({ status }: { status: ProviderStatus | undefined }): React.ReactElement {
  const color =
    status === 'available' ? 'bg-green-500' :
    status === 'unavailable' ? 'bg-red-500' :
    status === 'error' ? 'bg-red-500' :
    'bg-zinc-400';
  return <span className={`inline-block h-3 w-3 rounded-full ${color}`} />;
}

function TypeBadge({ type }: { type: string }): React.ReactElement {
  const label = type === 'claude-cli' ? 'Claude CLI' :
    type === 'codex-cli' ? 'Codex CLI' :
    type === 'openai-compatible' ? 'OpenAI Compatible' :
    type;
  return (
    <span className="rounded bg-zinc-200 dark:bg-zinc-700 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-400">
      {label}
    </span>
  );
}

function ProviderCard({ config }: { config: ProviderConfig }): React.ReactElement {
  const { statuses, checkStatus, removeProvider, updateProvider } = useProviderStore();
  const [checking, setChecking] = useState(false);
  const status = statuses[config.id];

  const handleTest = useCallback(async () => {
    setChecking(true);
    try {
      await checkStatus(config.id);
    } finally {
      setChecking(false);
    }
  }, [checkStatus, config.id]);

  const handleToggle = useCallback(async () => {
    await updateProvider(config.id, { enabled: !config.enabled });
  }, [updateProvider, config.id, config.enabled]);

  const handleRemove = useCallback(async () => {
    await removeProvider(config.id);
  }, [removeProvider, config.id]);

  return (
    <div className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-200/50 dark:bg-zinc-800/50 p-4">
      <div className="flex items-center gap-3">
        <StatusDot status={status} />
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{config.name}</span>
        <TypeBadge type={config.type} />
        {!config.capabilities.includes('tool-use') && (
          <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">
            Text only
          </span>
        )}
        <span className="text-xs text-zinc-500">{config.models.length} model{config.models.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={handleTest}
          disabled={checking}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50"
        >
          {checking ? 'Testing...' : 'Test Connection'}
        </button>
        {!config.isBuiltIn && (
          <>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-500">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={handleToggle}
                className="h-3.5 w-3.5 rounded border-zinc-300 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800 text-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
              />
              Enabled
            </label>
            <button
              onClick={handleRemove}
              className="ml-auto rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 transition-colors hover:bg-red-100 dark:hover:bg-red-900/40"
            >
              Remove
            </button>
          </>
        )}
        {config.isBuiltIn && (
          <span className="ml-auto text-xs text-zinc-400">Built-in</span>
        )}
      </div>
      {status && (
        <p className={`mt-2 text-xs ${status === 'available' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {status === 'available' ? 'Connected' : status === 'unavailable' ? 'Unreachable' : status === 'error' ? 'Error' : 'Unknown'}
        </p>
      )}
    </div>
  );
}

function AddProviderForm({ onAdded }: { onAdded: () => void }): React.ReactElement {
  const { addProvider } = useProviderStore();
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [modelLines, setModelLines] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const handleAdd = useCallback(async () => {
    if (!name.trim()) {
      setError('Provider name is required');
      return;
    }
    if (!baseUrl.trim()) {
      setError('Base URL is required');
      return;
    }

    setAdding(true);
    setError('');

    const newId = crypto.randomUUID();
    const models: ModelInfo[] = modelLines
      .split('\n')
      .filter(l => l.trim())
      .map(line => ({
        id: line.trim(),
        label: line.trim(),
        description: '',
        providerId: newId,
      }));

    const config: ProviderConfig = {
      id: newId,
      type: 'openai-compatible',
      name: name.trim(),
      enabled: true,
      isBuiltIn: false,
      apiKey: apiKey || undefined,
      baseUrl: baseUrl.trim(),
      models,
      capabilities: ['text-completion', 'streaming'],
    };

    try {
      await addProvider(config);
      setName('');
      setBaseUrl('');
      setApiKey('');
      setModelLines('');
      setExpanded(false);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add provider');
    } finally {
      setAdding(false);
    }
  }, [name, baseUrl, apiKey, modelLines, addProvider, onAdded]);

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-100/50 dark:bg-zinc-800/30 p-3 text-sm text-zinc-500 transition-colors hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300"
      >
        + Add Provider
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-200/50 dark:bg-zinc-800/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Add OpenAI-Compatible Provider</span>
        <button
          onClick={() => setExpanded(false)}
          className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          Cancel
        </button>
      </div>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Provider name (e.g. Ollama, OpenAI)"
        className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <input
        type="text"
        value={baseUrl}
        onChange={(e) => setBaseUrl(e.target.value)}
        placeholder="Base URL (e.g. https://api.openai.com or http://localhost:11434)"
        className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="API Key (optional for local providers)"
        className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <textarea
        value={modelLines}
        onChange={(e) => setModelLines(e.target.value)}
        placeholder="Model IDs (one per line, e.g. gpt-4o, llama3.1:70b)"
        rows={3}
        className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
      />
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
      <button
        onClick={handleAdd}
        disabled={adding}
        className="rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
      >
        {adding ? 'Adding...' : 'Add Provider'}
      </button>
    </div>
  );
}

export function ProviderSection(): React.ReactElement {
  const { providers, load } = useProviderStore();

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="space-y-3">
      <h3 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Model Providers</h3>
      <p className="text-sm text-zinc-500">
        Configure AI model providers. Claude CLI and Codex CLI support local tool-use workflows. Add OpenAI-compatible providers for BYOK or self-hosted models (text only).
      </p>
      <div className="space-y-3">
        {providers.map((config) => (
          <ProviderCard key={config.id} config={config} />
        ))}
        <AddProviderForm onAdded={load} />
      </div>
    </section>
  );
}
