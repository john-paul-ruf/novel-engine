/**
 * Mutable routing flag for stream events.
 * When 'main', the chatStore processes stream events.
 * When 'modal', the modalChatStore processes them.
 * This is NOT reactive — it's only checked inside event handlers.
 */
export const streamRouter = {
  target: 'main' as 'main' | 'modal',
};
