import { useState, useEffect, useCallback } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useBookStore } from '../../stores/bookStore';
import { useViewStore } from '../../stores/viewStore';

type Step = 'welcome' | 'claude-setup' | 'model-select' | 'author-profile' | 'ready';

const STEPS: Step[] = ['welcome', 'claude-setup', 'model-select', 'author-profile', 'ready'];

type CliStatus = 'idle' | 'checking' | 'connected' | 'not-found';

type ModelOption = { id: string; label: string; description: string };

function StepIndicator({ currentIndex }: { currentIndex: number }): React.ReactElement {
  return (
    <div className="mb-8 flex items-center justify-center gap-2">
      {STEPS.map((_, i) => (
        <div
          key={i}
          className={`h-2 w-2 rounded-full transition-colors duration-300 ${
            i === currentIndex
              ? 'bg-blue-500'
              : i < currentIndex
                ? 'bg-blue-500/50'
                : 'bg-zinc-200 dark:bg-zinc-700'
          }`}
        />
      ))}
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }): React.ReactElement {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-6 text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
        Novel Engine
      </div>
      <p className="mb-8 max-w-md text-lg text-zinc-500 dark:text-zinc-400">
        Turn your ideas into polished manuscripts with AI agents that collaborate like a
        real publishing team.
      </p>
      <button
        onClick={onNext}
        className="rounded-lg bg-blue-600 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
      >
        Get Started
      </button>
    </div>
  );
}

function ClaudeSetupStep({ onNext }: { onNext: () => void }): React.ReactElement {
  const [status, setStatus] = useState<CliStatus>('idle');
  const { detectClaudeCli } = useSettingsStore();

  const handleCheck = useCallback(async () => {
    setStatus('checking');
    const found = await detectClaudeCli();
    setStatus(found ? 'connected' : 'not-found');
  }, [detectClaudeCli]);

  const handleOpenDocs = useCallback(() => {
    window.novelEngine.shell.openExternal('https://docs.anthropic.com/en/docs/claude-code');
  }, []);

  return (
    <div className="flex flex-col items-center">
      <h2 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">Connect to Claude</h2>
      <p className="mb-6 max-w-md text-center text-sm text-zinc-500 dark:text-zinc-400">
        Novel Engine uses the Claude Code CLI for AI interactions. This is cheaper than
        direct API access and uses your existing Claude subscription.
      </p>

      <div className="mb-6 w-full space-y-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-200/50 dark:bg-zinc-800/50 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700 text-xs font-bold text-zinc-700 dark:text-zinc-300">
            1
          </span>
          <div>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">Install Claude Code CLI:</p>
            <code className="mt-1 block rounded bg-zinc-50 dark:bg-zinc-900 px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300">
              npm install -g @anthropic-ai/claude-code
            </code>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700 text-xs font-bold text-zinc-700 dark:text-zinc-300">
            2
          </span>
          <div>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              Authenticate: Run{' '}
              <code className="rounded bg-zinc-50 dark:bg-zinc-900 px-1.5 py-0.5 text-xs">claude login</code>{' '}
              in your terminal
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={handleOpenDocs}
        className="mb-6 text-sm text-blue-600 dark:text-blue-400 underline decoration-blue-600/30 dark:decoration-blue-400/30 transition-colors hover:text-blue-600 dark:hover:text-blue-300"
      >
        Learn more at docs.anthropic.com
      </button>

      {(status === 'not-found' || status === 'idle') && (
          <button
            onClick={onNext}
            className="rounded-lg px-6 py-2.5 text-sm text-zinc-500 dark:text-zinc-400 transition-colors hover:text-zinc-800 dark:text-zinc-200"
          >
            Skip for now
          </button>
        )}
        {status === 'connected' && (
        <div className="mb-4 flex items-center gap-2 text-green-600 dark:text-green-400">
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-sm font-medium">Claude CLI detected!</span>
        </div>
      )}

      {status === 'not-found' && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2">
          <p className="text-sm text-red-600 dark:text-red-400">
            Claude Code CLI not found. Make sure it&apos;s installed and you&apos;ve run{' '}
            <code className="rounded bg-zinc-50 dark:bg-zinc-900 px-1.5 py-0.5 text-xs">claude login</code>.
          </p>
        </div>
      )}

      <div className="flex gap-3">
        {status !== 'connected' && (
          <button
            onClick={handleCheck}
            disabled={status === 'checking'}
            className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'checking' ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Checking...
              </span>
            ) : (
              'Check Connection'
            )}
          </button>
        )}
        {status === 'connected' && (
          <button
            onClick={onNext}
            className="rounded-lg bg-blue-600 px-8 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}

function ModelSelectStep({ onNext }: { onNext: (model: string) => void }): React.ReactElement {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selected, setSelected] = useState('claude-opus-4-20250514');

  useEffect(() => {
    window.novelEngine.models.getAvailable().then(setModels).catch(console.error);
  }, []);

  return (
    <div className="flex flex-col items-center">
      <h2 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">Choose Your Model</h2>
      <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        Select the Claude model to use for your AI agents.
      </p>

      <div className="mb-6 w-full space-y-3">
        {models.map((model) => (
          <button
            key={model.id}
            onClick={() => setSelected(model.id)}
            className={`w-full rounded-lg border p-4 text-left transition-colors ${
              selected === model.id
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-zinc-300 dark:border-zinc-700 bg-zinc-200/50 dark:bg-zinc-800/50 hover:border-zinc-300 dark:border-zinc-600'
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
              <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{model.label}</span>
              {model.id === 'claude-opus-4-20250514' && (
                <span className="rounded bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                  Recommended
                </span>
              )}
            </div>
            <p className="mt-1 pl-6 text-sm text-zinc-500">{model.description}</p>
          </button>
        ))}
      </div>

      <button
        onClick={() => onNext(selected)}
        className="rounded-lg bg-blue-600 px-8 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
      >
        Next
      </button>
    </div>
  );
}

function AuthorProfileStep({
  onNext,
}: {
  onNext: (authorName: string, profile: string) => void;
}): React.ReactElement {
  const [authorName, setAuthorName] = useState('');
  const [profileText, setProfileText] = useState('');

  return (
    <div className="flex w-full flex-col items-center text-center">
      <h2 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">Tell Us About Your Writing</h2>
      <p className="mb-6 text-zinc-500 dark:text-zinc-400">
        Your author profile helps every agent understand your creative identity.
        You can set this up now or come back to it later.
      </p>

      <div className="w-full max-w-md space-y-4">
        {/* Author Name */}
        <div className="text-left">
          <label className="mb-1 block text-sm text-zinc-500 dark:text-zinc-400">
            Your name (as it appears on book covers)
          </label>
          <input
            type="text"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            placeholder="Jane Doe"
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-4 py-3 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        {/* Quick profile textarea */}
        <div className="text-left">
          <label className="mb-1 block text-sm text-zinc-500 dark:text-zinc-400">
            Quick profile (optional — you can refine this with Verity later)
          </label>
          <textarea
            value={profileText}
            onChange={(e) => setProfileText(e.target.value)}
            rows={4}
            placeholder="What genres do you write? What's your style? Who are your influences?"
            className="w-full resize-none rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-4 py-3 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center gap-3">
        <button
          onClick={() => onNext(authorName, profileText)}
          className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-500"
        >
          Save & Continue
        </button>
        <button
          onClick={() => onNext('', '')}
          className="text-sm text-zinc-500 hover:text-zinc-500 dark:text-zinc-400"
        >
          Skip — I'll set this up later
        </button>
      </div>
    </div>
  );
}

function ReadyStep({
  model,
  authorName,
  hasProfile,
  hasClaudeCli,
  onLaunch,
}: {
  model: string;
  authorName: string;
  hasProfile: boolean;
  hasClaudeCli: boolean;
  onLaunch: (bookTitle: string) => void;
}): React.ReactElement {
  const [bookTitle, setBookTitle] = useState('');
  const [models, setModels] = useState<ModelOption[]>([]);

  useEffect(() => {
    window.novelEngine.models.getAvailable().then(setModels).catch(console.error);
  }, []);

  const modelLabel = models.find((m) => m.id === model)?.label ?? model;

  return (
    <div className="flex flex-col items-center">
      <h2 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">You&apos;re All Set!</h2>
      <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        Here&apos;s a summary of your configuration:
      </p>

      <div className="mb-6 w-full space-y-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-200/50 dark:bg-zinc-800/50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">Claude CLI</span>
          <span className="flex items-center gap-1.5 text-sm">
            {hasClaudeCli ? (
              <>
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-green-600 dark:text-green-400">Connected</span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-red-500" />
                <span className="text-red-600 dark:text-red-400">Not connected</span>
              </>
            )}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">Model</span>
          <span className="text-sm text-zinc-800 dark:text-zinc-200">{modelLabel}</span>
        </div>
        {authorName && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">Author</span>
            <span className="text-sm text-zinc-800 dark:text-zinc-200">{authorName}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">Author Profile</span>
          <span className="text-sm text-zinc-800 dark:text-zinc-200">
            {hasProfile ? 'Saved' : 'Skipped'}
          </span>
        </div>
      </div>

      <div className="mb-6 w-full">
        <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Create your first book (optional)
        </label>
        <input
          type="text"
          value={bookTitle}
          onChange={(e) => setBookTitle(e.target.value)}
          placeholder="My First Novel"
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-4 py-3 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      <button
        onClick={() => onLaunch(bookTitle)}
        className="rounded-lg bg-blue-600 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
      >
        Launch Novel Engine
      </button>
    </div>
  );
}

export function OnboardingWizard(): React.ReactElement {
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [selectedModel, setSelectedModel] = useState('claude-opus-4-20250514');
  const [authorName, setAuthorName] = useState('');
  const [hasProfile, setHasProfile] = useState(false);
  const { settings, update } = useSettingsStore();
  const { createBook, setActiveBook } = useBookStore();
  const { navigate } = useViewStore();

  const stepIndex = STEPS.indexOf(currentStep);

  const goTo = useCallback((step: Step) => {
    setCurrentStep(step);
  }, []);

  const handleModelSelect = useCallback(
    async (model: string) => {
      setSelectedModel(model);
      await update({ model });
      goTo('author-profile');
    },
    [update, goTo],
  );

  const handleAuthorProfile = useCallback(
    async (name: string, profile: string) => {
      if (name) {
        setAuthorName(name);
        await update({ authorName: name });
      }
      if (profile) {
        await window.novelEngine.settings.saveAuthorProfile(profile);
        setHasProfile(true);
      }
      goTo('ready');
    },
    [update, goTo],
  );

  const handleLaunch = useCallback(
    async (bookTitle: string) => {
      await update({ initialized: true });
      if (bookTitle.trim()) {
        try {
          const slug = await createBook(bookTitle.trim());
          await setActiveBook(slug);
        } catch (error) {
          console.error('Failed to create book during onboarding:', error);
        }
      }
      navigate('chat');
    },
    [update, createBook, setActiveBook, navigate],
  );

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-white dark:bg-zinc-950">
      <div className="w-full max-w-[600px] px-6">
        <StepIndicator currentIndex={stepIndex} />

        <div className="flex justify-center">
          <div className="w-full">
            {currentStep === 'welcome' && (
              <WelcomeStep onNext={() => goTo('claude-setup')} />
            )}
            {currentStep === 'claude-setup' && (
              <ClaudeSetupStep onNext={() => goTo('model-select')} />
            )}
            {currentStep === 'model-select' && (
              <ModelSelectStep onNext={handleModelSelect} />
            )}
            {currentStep === 'author-profile' && (
              <AuthorProfileStep onNext={handleAuthorProfile} />
            )}
            {currentStep === 'ready' && (
              <ReadyStep
                model={selectedModel}
                authorName={authorName}
                hasProfile={hasProfile}
                hasClaudeCli={settings?.hasClaudeCli ?? false}
                onLaunch={handleLaunch}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
