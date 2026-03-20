import { useEffect } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary';
import { AppLayout } from './components/Layout/AppLayout';
import { useSettingsStore } from './stores/settingsStore';

function AppContent(): React.ReactElement {
  const { settings, loading, load } = useSettingsStore();

  useEffect(() => {
    load();
  }, [load]);

  // Loading state: dark screen to prevent flash
  if (loading || settings === null) {
    return <div className="h-screen w-screen bg-zinc-950" />;
  }

  // Onboarding gate
  if (!settings.initialized) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-zinc-950 text-zinc-100">
        <div className="max-w-md text-center">
          <h1 className="text-3xl font-bold tracking-tight">Welcome to Novel Engine</h1>
          <p className="mt-3 text-zinc-400">
            Onboarding wizard coming soon. For now, mark as initialized in settings.
          </p>
        </div>
      </div>
    );
  }

  return <AppLayout />;
}

export function App(): React.ReactElement {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
