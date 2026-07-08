import { useEffect } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary';
import { AppLayout } from './components/Layout/AppLayout';
import { OnboardingWizard } from './components/Onboarding/OnboardingWizard';
import { useSettingsStore } from './stores/settingsStore';
import { useTheme } from './hooks/useTheme';

function AppContent(): React.ReactElement {
  const { settings, load } = useSettingsStore();
  useTheme();

  useEffect(() => {
    load();
  }, [load]);

  // Loading state: dark screen to prevent flash. Only gate on the initial
  // load (settings === null) — background reloads (e.g. ProviderSection
  // refreshing settings) must not unmount the app and reset view state.
  if (settings === null) {
    return <div className="h-screen w-screen bg-white dark:bg-zinc-950" />;
  }

  // Onboarding gate
  if (!settings.initialized) {
    return <OnboardingWizard />;
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
