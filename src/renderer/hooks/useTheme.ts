import { useEffect } from 'react';
import { useSettingsStore } from '../stores/settingsStore';

/**
 * Applies the current theme to the document root element.
 * Toggles the `dark` class on `<html>` based on the user's preference.
 * When set to 'system', listens for OS-level theme changes via matchMedia.
 */
export function useTheme(): void {
  const theme = useSettingsStore((s) => s.settings?.theme ?? 'dark');

  useEffect(() => {
    const root = document.documentElement;

    const applyTheme = (isDark: boolean) => {
      root.classList.toggle('dark', isDark);
      root.style.colorScheme = isDark ? 'dark' : 'light';
    };

    if (theme === 'dark') {
      applyTheme(true);
      return;
    }

    if (theme === 'light') {
      applyTheme(false);
      return;
    }

    // theme === 'system' — follow OS preference
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    applyTheme(mq.matches);

    const handler = (e: MediaQueryListEvent) => applyTheme(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);
}
