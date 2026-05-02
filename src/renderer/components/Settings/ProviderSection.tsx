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
    type === 'llama-server' ? 'llama-server' :
    type === 'openai-compatible' ? 'OpenAI Compatible' :
    type;
  return (
    <span className="rounded bg-zinc-200 dark:bg-zinc-700 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-400">
      {label}
    </span>
  );
}

function OllamaEndpointField({ config }: { config: ProviderConfig }): React.ReactElement {
  const { updateProvider, checkStatus, load } = useProviderStore();
  const [endpoint, setEndpoint] = useState(config.baseUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateProvider(config.id, { baseUrl: endpoint.trim() || undefined });
      setDirty(false);
      // Auto-test connection and refresh after saving a new endpoint.
      // Small delay to let the backend's async model refresh settle.
      setTimeout(async () => {
        await checkStatus(config.id);
        await load(); // reload to pick up any refreshed models
        setSaving(false);
      }, 1_000);
    } catch (err) {
      console.error('Failed to update Ollama endpoint:', err);
      setSaving(false);
    }
  }, [endpoint, config.id, updateProvider, checkStatus, load]);

  return (
    <div className="mt-3 flex items-center gap-2">
      <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Endpoint</label>
      <input
        type="text"
        value={endpoint}
        onChange={(e) => { setEndpoint(e.target.value); setDirty(true); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && dirty) handleSave(); }}
        placeholder="http://127.0.0.1:11434"
        className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-2 py-1 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {dirty && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-blue-500 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
        >
          {saving ? '...' : 'Save'}
        </button>
      )}
    </div>
  );
}

function ProviderCard({ config }: { config: ProviderConfig }): React.ReactElement {
  const { statuses, checkStatus, removeProvider, updateProvider } = useProviderStore();
  const [checking, setChecking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState(config.name);
  const [editBaseUrl, setEditBaseUrl] = useState(config.baseUrl ?? '');
  const [editApiKey, setEditApiKey] = useState(config.apiKey ?? '');
  const [editModels, setEditModels] = useState(config.models.map(m => m.id).join('\n'));
  const [editError, setEditError] = useState('');
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

  const handleEdit = useCallback(() => {
    setEditName(config.name);
    setEditBaseUrl(config.baseUrl ?? '');
    setEditApiKey(config.apiKey ?? '');
    setEditModels(config.models.map(m => m.id).join('\n'));
    setEditError('');
    setEditing(true);
  }, [config]);

  const handleCancel = useCallback(() => {
    setEditing(false);
    setEditError('');
  }, []);

  const handleSave = useCallback(async () => {
    if (!editName.trim()) {
      setEditError('Provider name is required');
      return;
    }
    if (!editBaseUrl.trim()) {
      setEditError('Base URL is required');
      return;
    }

    setSaving(true);
    setEditError('');

    const models: ModelInfo[] = editModels
      .split('\n')
      .filter(l => l.trim())
      .map(line => ({
        id: line.trim(),
        label: line.trim(),
        description: '',
        providerId: config.id,
      }));

    try {
      await updateProvider(config.id, {
        name: editName.trim(),
        baseUrl: editBaseUrl.trim(),
        apiKey: editApiKey || undefined,
        models,
      });
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update provider');
    } finally {
      setSaving(false);
    }
  }, [editName, editBaseUrl, editApiKey, editModels, config.id, updateProvider]);

  if (editing) {
    return (
      <div className="rounded-lg border border-blue-400 dark:border-blue-600 bg-zinc-200/50 dark:bg-zinc-800/50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Edit Provider</span>
          <button
            onClick={handleCancel}
            className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            Cancel
          </button>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Name</label>
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Provider name"
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Base URL</label>
          <input
            type="text"
            value={editBaseUrl}
            onChange={(e) => setEditBaseUrl(e.target.value)}
            placeholder="Base URL (e.g. http://localhost:11434)"
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">API Key</label>
          <input
            type="password"
            value={editApiKey}
            onChange={(e) => setEditApiKey(e.target.value)}
            placeholder="API Key (optional for local providers)"
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Models (one per line)</label>
          <textarea
            value={editModels}
            onChange={(e) => setEditModels(e.target.value)}
            placeholder="Model IDs (one per line)"
            rows={3}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          />
        </div>
        {editError && (
          <p className="text-xs text-red-500">{editError}</p>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-blue-500 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            onClick={handleCancel}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

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
              onClick={handleEdit}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700"
            >
              Edit
            </button>
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
      {(config.type === 'ollama-cli' || config.type === 'llama-server') && (
        <OllamaEndpointField config={config} />
      )}
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
        Configure AI model providers. Claude CLI is the primary provider with full tool-use support. Add OpenAI-compatible providers for BYOK or self-hosted models (text only).
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
