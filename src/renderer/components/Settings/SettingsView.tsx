import { useState, useEffect, useCallback } from 'react';
import { marked } from 'marked';
import { useSettingsStore } from '../../stores/settingsStore';
import { useBookStore } from '../../stores/bookStore';
import { useModalChatStore } from '../../stores/modalChatStore';
import type { ModelInfo, UsageSummary } from '@domain/types';
import { ProviderSection } from './ProviderSection';
import { useProviderStore } from '../../stores/providerStore';

function SectionDivider(): React.ReactElement {
  return <div className="border-b border-zinc-200 dark:border-zinc-800" />;
}

function SectionHeading({ children }: { children: React.ReactNode }): React.ReactElement {
  return <h3 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{children}</h3>;
}

function HelpText({ children }: { children: React.ReactNode }): React.ReactElement {
  return <p className="text-sm text-zinc-500">{children}</p>;
}

function ClaudeCliSection(): React.ReactElement {
  const { settings, detectClaudeCli } = useSettingsStore();
  const [checking, setChecking] = useState(false);

  const handleRecheck = useCallback(async () => {
    setChecking(true);
    await detectClaudeCli();
    setChecking(false);
  }, [detectClaudeCli]);

  const connected = settings?.hasClaudeCli ?? false;

  return (
    <section className="space-y-3">
      <SectionHeading>Claude CLI Status</SectionHeading>
      <div className="flex items-center gap-3">
        <span
          className={`h-3 w-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
        />
        <span className={`text-sm font-medium ${connected ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {connected ? 'Connected' : 'Not connected'}
        </span>
        <button
          onClick={handleRecheck}
          disabled={checking}
          className="ml-auto rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50"
        >
          {checking ? 'Checking...' : 'Re-check'}
        </button>
      </div>
      {!connected && (
        <div className="mt-2">
          <button
            onClick={() =>
              window.novelEngine.shell.openExternal(
                'https://docs.anthropic.com/en/docs/claude-code',
              )
            }
            className="text-sm text-blue-600 dark:text-blue-400 underline decoration-blue-600/30 dark:decoration-blue-400/30 transition-colors hover:text-blue-600 dark:hover:text-blue-300"
          >
            Installation instructions
          </button>
        </div>
      )}
    </section>
  );
}

function ModelSelectionSection(): React.ReactElement {
  const { settings, update } = useSettingsStore();
  const { providers } = useProviderStore();
  const [models, setModels] = useState<ModelInfo[]>([]);

  useEffect(() => {
    window.novelEngine.models.getAvailable().then(setModels).catch(console.error);
  }, []);

  const selected = settings?.model ?? 'claude-opus-4-20250514';

  const handleSelect = useCallback(
    async (model: ModelInfo) => {
      await update({ model: model.id });
      // If selecting a model from a different provider, update the active provider
      const currentProvider = settings?.activeProviderId;
      if (model.providerId && model.providerId !== currentProvider) {
        await window.novelEngine.providers.setDefault(model.providerId);
      }
    },
    [update, settings?.activeProviderId],
  );

  // Group models by provider
  const groupedModels: Record<string, ModelInfo[]> = {};
  for (const model of models) {
    const pid = model.providerId || 'unknown';
    if (!groupedModels[pid]) groupedModels[pid] = [];
    groupedModels[pid].push(model);
  }

  // Resolve provider names
  const providerNames: Record<string, string> = {};
  for (const p of providers) {
    providerNames[p.id] = p.name;
  }

  return (
    <section className="space-y-3">
      <SectionHeading>Model Selection</SectionHeading>
      <div className="space-y-4">
        {Object.entries(groupedModels).map(([providerId, providerModels]) => (
          <div key={providerId} className="space-y-2">
            {Object.keys(groupedModels).length > 1 && (
              <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                {providerNames[providerId] ?? providerId}
              </h4>
            )}
            {providerModels.map((model) => (
              <button
                key={model.id}
                onClick={() => handleSelect(model)}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  selected === model.id
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-zinc-300 dark:border-zinc-700 bg-zinc-200/50 dark:bg-zinc-800/50 hover:border-zinc-400 dark:hover:border-zinc-600'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`h-4 w-4 rounded-full border-2 ${
                      selected === model.id
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-zinc-300 dark:border-zinc-600'
                    }`}
                  >
                    {selected === model.id && (
                      <div className="flex h-full items-center justify-center">
                        <div className="h-1.5 w-1.5 rounded-full bg-white" />
                      </div>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{model.label}</span>
                  {model.id === 'claude-opus-4-20250514' && (
                    <span className="rounded bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                      Recommended
                    </span>
                  )}
                  {model.supportsToolUse === false && (
                    <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">
                      Text only
                    </span>
                  )}
                </div>
                <p className="mt-1 pl-6 text-xs text-zinc-500">{model.description}</p>
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function ThinkingSection(): React.ReactElement {
  const { settings, update } = useSettingsStore();

  const enableThinking = settings?.enableThinking ?? false;
  const thinkingBudget = settings?.thinkingBudget ?? 10000;
  const overrideThinkingBudget = settings?.overrideThinkingBudget ?? false;
  const autoCollapse = settings?.autoCollapseThinking ?? true;

  const formatBudget = (value: number): string => {
    if (value >= 1000) {
      return `${Math.round(value / 1000)}K`;
    }
    return String(value);
  };

  return (
    <section className="space-y-4">
      <SectionHeading>Extended Thinking</SectionHeading>

      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={enableThinking}
          onChange={(e) => update({ enableThinking: e.target.checked })}
          className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800 text-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
        />
        <span className="text-sm text-zinc-700 dark:text-zinc-300">Show agent thinking</span>
      </label>

      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={overrideThinkingBudget}
          onChange={(e) => update({ overrideThinkingBudget: e.target.checked })}
          disabled={!enableThinking}
          className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800 text-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 disabled:opacity-40"
        />
        <div>
          <span className={`text-sm ${enableThinking ? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-400 dark:text-zinc-600'}`}>
            Override per-agent thinking budgets
          </span>
          <p className={`text-xs ${enableThinking && overrideThinkingBudget ? 'text-amber-500' : 'text-zinc-500'}`}>
            {overrideThinkingBudget && enableThinking
              ? `All agents will use ${thinkingBudget.toLocaleString()} tokens for thinking`
              : 'Each agent uses its own default thinking budget (Spark 8K, Verity 10K, Lumen 16K, etc.)'}
          </p>
        </div>
      </label>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-700 dark:text-zinc-300">
            {overrideThinkingBudget && enableThinking ? 'Global thinking budget' : 'Default thinking budget'}
          </span>
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            {thinkingBudget.toLocaleString()} tokens
          </span>
        </div>
        <input
          type="range"
          min={1024}
          max={32000}
          step={1024}
          value={thinkingBudget}
          onChange={(e) => update({ thinkingBudget: Number(e.target.value) })}
          className="w-full accent-blue-500"
        />
        <div className="flex justify-between text-xs text-zinc-500">
          <span>{formatBudget(1024)} (quick)</span>
          <span>{formatBudget(10240)} (default)</span>
          <span>{formatBudget(32000)} (deep)</span>
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={autoCollapse}
          onChange={(e) => update({ autoCollapseThinking: e.target.checked })}
          className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800 text-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
        />
        <span className="text-sm text-zinc-700 dark:text-zinc-300">Auto-collapse thinking after response</span>
      </label>
    </section>
  );
}

function NotificationsSection(): React.ReactElement {
  const { settings, update } = useSettingsStore();
  const enabled = settings?.enableNotifications ?? true;

  return (
    <section className="space-y-3">
      <SectionHeading>Notifications</SectionHeading>
      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => update({ enableNotifications: e.target.checked })}
          className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800 text-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
        />
        <span className="text-sm text-zinc-700 dark:text-zinc-300">
          Show OS notifications when agents finish
        </span>
      </label>
      <HelpText>
        Get notified when a chat response, build, or revision session completes while the app is in the background
      </HelpText>
    </section>
  );
}

function AppearanceSection(): React.ReactElement {
  const { settings, update } = useSettingsStore();
  const currentTheme = settings?.theme ?? 'dark';

  const themes = [
    { value: 'dark' as const, label: 'Dark', description: 'Always use dark theme' },
    { value: 'light' as const, label: 'Light', description: 'Always use light theme' },
    { value: 'system' as const, label: 'System', description: 'Follow your OS appearance setting' },
  ];

  return (
    <section className="space-y-3">
      <SectionHeading>Appearance</SectionHeading>
      <div className="space-y-2">
        {themes.map(({ value, label, description }) => (
          <label
            key={value}
            className="flex cursor-pointer items-center gap-3"
          >
            <input
              type="radio"
              name="theme"
              value={value}
              checked={currentTheme === value}
              onChange={() => update({ theme: value })}
              className="h-4 w-4 border-zinc-300 bg-white text-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800"
            />
            <div>
              <span className="text-sm text-zinc-700 dark:text-zinc-300">{label}</span>
              <p className="text-xs text-zinc-500">{description}</p>
            </div>
          </label>
        ))}
      </div>
    </section>
  );
}

function UsageSection(): React.ReactElement {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.novelEngine.usage
      .summary()
      .then(setSummary)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const formatTokens = (tokens: number): string => {
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
    if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
    return String(tokens);
  };

  if (loading) {
    return (
      <section className="space-y-3">
        <SectionHeading>Token Usage Summary</SectionHeading>
        <HelpText>Loading usage data...</HelpText>
      </section>
    );
  }

  const hasUsage = summary && summary.conversationCount > 0;

  return (
    <section className="space-y-3">
      <SectionHeading>Token Usage Summary</SectionHeading>

      {!hasUsage ? (
        <HelpText>No usage data yet</HelpText>
      ) : (
        <div className="space-y-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-200/50 dark:bg-zinc-800/50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">Total tokens used</span>
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              {formatTokens(
                summary.totalInputTokens +
                  summary.totalOutputTokens +
                  summary.totalThinkingTokens,
              )}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">Input</span>
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              {formatTokens(summary.totalInputTokens)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">Output</span>
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              {formatTokens(summary.totalOutputTokens)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">Thinking</span>
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              {formatTokens(summary.totalThinkingTokens)}
            </span>
          </div>
          <div className="mt-2 border-t border-zinc-300 dark:border-zinc-700 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500 dark:text-zinc-400">Conversations</span>
              <span className="text-sm text-zinc-700 dark:text-zinc-300">{summary.conversationCount}</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function CatalogExportSection(): React.ReactElement {
  const [exporting, setExporting] = useState(false);
  const [lastExport, setLastExport] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setLastExport(null);
    try {
      const savedPath = await window.novelEngine.catalog.exportZip();
      if (savedPath) {
        setLastExport(savedPath);
      }
    } catch (error) {
      console.error('Failed to export catalog:', error);
    } finally {
      setExporting(false);
    }
  }, []);

  return (
    <section className="space-y-3">
      <SectionHeading>Catalog Export</SectionHeading>
      <HelpText>
        Export all your books as a single ZIP archive. Includes all source files, chapters, and build outputs.
      </HelpText>
      <button
        onClick={handleExport}
        disabled={exporting}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
      >
        {exporting ? 'Exporting...' : 'Export All Books to ZIP'}
      </button>
      {lastExport && (
        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
          <span>Saved to:</span>
          <button
            onClick={() => window.novelEngine.shell.openPath(lastExport)}
            className="underline decoration-green-600/30 dark:decoration-green-400/30 hover:text-green-700 dark:hover:text-green-300"
          >
            {lastExport}
          </button>
        </div>
      )}
    </section>
  );
}

function AuthorProfileSection(): React.ReactElement {
  const { settings, update } = useSettingsStore();
  const [authorName, setAuthorName] = useState('');
  const [authorProfile, setAuthorProfile] = useState('');
  const [loading, setLoading] = useState(true);
  const [showManualEdit, setShowManualEdit] = useState(false);
  const [editableProfile, setEditableProfile] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAuthorName(settings?.authorName ?? '');
    window.novelEngine.settings
      .loadAuthorProfile()
      .then((profile) => {
        setAuthorProfile(profile);
        setEditableProfile(profile);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [settings?.authorName]);

  const handleAuthorNameChange = useCallback(
    async (name: string) => {
      setAuthorName(name);
      await update({ authorName: name });
    },
    [update],
  );

  const openModal = useModalChatStore((s) => s.open);

  const handleEditWithVerity = useCallback(async () => {
    const { activeSlug } = useBookStore.getState();
    await openModal('author-profile', activeSlug || '');
  }, [openModal]);

  const handleSaveManual = useCallback(async () => {
    setSaving(true);
    try {
      await window.novelEngine.settings.saveAuthorProfile(editableProfile);
      setAuthorProfile(editableProfile);
      setShowManualEdit(false);
    } catch (error) {
      console.error('Failed to save author profile:', error);
    } finally {
      setSaving(false);
    }
  }, [editableProfile]);

  if (loading) {
    return (
      <section className="space-y-3">
        <SectionHeading>Author Profile</SectionHeading>
        <HelpText>Loading...</HelpText>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <SectionHeading>Author Profile</SectionHeading>

      {/* Author name */}
      <div className="space-y-1">
        <label className="block text-sm text-zinc-500 dark:text-zinc-400">
          Your name (as it appears on book covers)
        </label>
        <input
          type="text"
          value={authorName}
          onChange={(e) => handleAuthorNameChange(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-4 py-3 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      {/* Profile content preview */}
      <div className="space-y-1">
        <label className="block text-sm text-zinc-500 dark:text-zinc-400">
          Your creative DNA — loaded by agents to understand your writing identity
        </label>
        <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 p-4">
          {authorProfile ? (
            <div
              className="prose dark:prose-invert prose-sm"
              dangerouslySetInnerHTML={{ __html: String(marked.parse(authorProfile)) }}
            />
          ) : (
            <p className="italic text-zinc-500">No author profile yet.</p>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleEditWithVerity}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm text-white transition-colors hover:bg-purple-700"
        >
          <span>🎙</span>
          {authorProfile ? 'Refine with Verity' : 'Set Up with Verity'}
        </button>
        <button
          onClick={() => {
            setEditableProfile(authorProfile);
            setShowManualEdit(true);
          }}
          className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm text-zinc-500 dark:text-zinc-400 transition-colors hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          Edit Manually
        </button>
      </div>

      {/* Manual edit textarea (hidden by default) */}
      {showManualEdit && (
        <div className="mt-4">
          <textarea
            value={editableProfile}
            onChange={(e) => setEditableProfile(e.target.value)}
            rows={8}
            className="w-full resize-y rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-4 py-3 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="What genres do you write? What's your style? Who are your influences?"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={handleSaveManual}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => setShowManualEdit(false)}
              className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function AboutSection(): React.ReactElement {
  return (
    <section className="space-y-3">
      <SectionHeading>About</SectionHeading>
      <div className="space-y-2">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          <span className="font-medium">Novel Engine</span> v0.1.0
        </p>
        <HelpText>Powered by Claude Code CLI</HelpText>
        <div className="flex gap-4">
          <button
            onClick={() =>
              window.novelEngine.shell.openExternal(
                'https://github.com/novel-engine/novel-engine',
              )
            }
            className="text-sm text-blue-600 dark:text-blue-400 underline decoration-blue-600/30 dark:decoration-blue-400/30 transition-colors hover:text-blue-600 dark:hover:text-blue-300"
          >
            GitHub
          </button>
          <button
            onClick={() =>
              window.novelEngine.shell.openExternal(
                'https://docs.anthropic.com/en/docs/claude-code',
              )
            }
            className="text-sm text-blue-600 dark:text-blue-400 underline decoration-blue-600/30 dark:decoration-blue-400/30 transition-colors hover:text-blue-600 dark:hover:text-blue-300"
          >
            Claude Code Docs
          </button>
        </div>
      </div>
    </section>
  );
}

export function SettingsView(): React.ReactElement {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[700px] space-y-8 px-6 py-8">
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Settings</h2>

        <ClaudeCliSection />
        <SectionDivider />
        <ProviderSection />
        <SectionDivider />
        <ModelSelectionSection />
        <SectionDivider />
        <ThinkingSection />
        <SectionDivider />
        <NotificationsSection />
        <SectionDivider />
        <AppearanceSection />
        <SectionDivider />
        <UsageSection />
        <SectionDivider />
        <CatalogExportSection />
        <SectionDivider />
        <AuthorProfileSection />
        <SectionDivider />
        <AboutSection />
      </div>
    </div>
  );
}
