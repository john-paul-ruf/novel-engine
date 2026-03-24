/**
 * Mutable routing flag for stream events.
 * When 'main', the chatStore processes stream events.
 * When 'modal', the modalChatStore processes them.
 * This is NOT reactive — it's only checked inside event handlers.
 *
 * Auto-draft does NOT use this router — it relies entirely on callId
 * scoping in chatStore's _handleStreamEvent. Each auto-draft loop
 * generates a unique callId per CLI call, and chatStore's primary
 * guard (`_activeCallId !== callId → drop`) prevents cross-bleed
 * between concurrent auto-draft loops and manual chats.
 */
export const streamRouter = {
  target: 'main' as 'main' | 'modal' | 'pitch-room',
};
