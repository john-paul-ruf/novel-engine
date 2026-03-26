/** Shared icon/color maps for rendering CLI activity entries by kind. */

export const KIND_ICONS: Record<string, string> = {
  spawn: '🚀',
  status: '📡',
  'thinking-start': '🧠',
  'thinking-end': '🧠',
  'text-start': '📝',
  'text-end': '📝',
  'tool-start': '🔧',
  'tool-complete': '✅',
  'tool-error': '❌',
  'files-changed': '💾',
  done: '🏁',
  error: '🔴',
  'context-loaded': '📊',
};

export const KIND_COLORS: Record<string, string> = {
  spawn: 'text-blue-600 dark:text-blue-400',
  status: 'text-zinc-500 dark:text-zinc-400',
  'thinking-start': 'text-amber-600 dark:text-amber-400',
  'thinking-end': 'text-amber-600 dark:text-amber-400',
  'text-start': 'text-zinc-700 dark:text-zinc-300',
  'text-end': 'text-zinc-700 dark:text-zinc-300',
  'tool-start': 'text-purple-600 dark:text-purple-400',
  'tool-complete': 'text-green-600 dark:text-green-400',
  'tool-error': 'text-red-600 dark:text-red-400',
  'files-changed': 'text-cyan-600 dark:text-cyan-400',
  done: 'text-green-600 dark:text-green-400',
  error: 'text-red-600 dark:text-red-400',
  'context-loaded': 'text-blue-300',
};

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
