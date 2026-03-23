import { create } from 'zustand';
import { usePipelineStore } from './pipelineStore';
import { useViewStore } from './viewStore';
import { useBookStore } from './bookStore';
import { useChatStore } from './chatStore';
import { useFileChangeStore } from './fileChangeStore';
import { streamRouter } from './streamRouter';

/**
 * The prompt sent to Verity on every auto-draft iteration.
 *
 * Verity reads the scene outline, finds the next unwritten chapter, writes the
 * full prose, updates the story bible, and signals DRAFT_COMPLETE when done.
 */
const AUTO_DRAFT_PROMPT = `Write the next chapter of this novel according to the scene outline.

Instructions:
1. Read source/scene-outline.md to identify all planned chapters in order.
2. Check the chapters/ directory to see which chapters already have a draft.md.
3. Find the next chapter that is missing a draft.md and write the complete prose for it as chapters/[NN-slug]/draft.md. Use the correct zero-padded chapter number and a descriptive slug.
4. After writing the chapter, update source/story-bible.md to record any new characters, locations, or significant plot developments introduced.
5. If all chapters in the scene outline already have draft files, respond with only the text: DRAFT_COMPLETE`;

/** Safety valve: stop automatically after this many iterations regardless. */
const MAX_ITERATIONS = 150;

/** Milliseconds to pause between chapters to let state settle. */
const INTER_CHAPTER_DELAY_MS = 600;

/**
 * How long to wait after the IPC send resolves for async state to settle.
 *
 * The ChatService saves messages to DB as part of the stream flow, and
 * file-change notifications propagate asynchronously. 400 ms is enough
 * for both to complete before we inspect DB state.
 */
const POST_SEND_SETTLE_MS = 400;

type AutoDraftState = {
  /** Whether the auto-draft loop is currently active (running OR paused on error). */
  isRunning: boolean;

  /**
   * True when the loop hit a CLI error and is waiting for the user to decide.
   * The loop is suspended — no further API calls are made until resume() or stop().
   */
  isPaused: boolean;

  /**
   * The error message that triggered the pause. Shown in the UI so the author
   * can decide whether to retry or abort. Null when not paused.
   */
  pauseReason: string | null;

  /** Number of new chapters written during the current (or most recent) run. */
  chaptersWritten: number;

  /** The conversation ID used for the whole run — constant across iterations. */
  conversationId: string | null;

  /** The book slug the auto-draft loop is running against. Null when idle. */
  bookSlug: string | null;

  /**
   * Hard error that aborted the loop via an uncaught exception (not a CLI error).
   * CLI errors are surfaced through isPaused/pauseReason instead.
   */
  error: string | null;

  /** Set to true when the user clicks Stop — the loop exits after the pause resolves. */
  stopRequested: boolean;

  /**
   * Internal: stores the Promise resolver that unblocks the pause.
   * Called by resume() and stop(). Not intended for direct use from UI.
   */
  _resumeResolve: (() => void) | null;

  /**
   * Start the auto-draft loop for the given book.
   *
   * Creates (or reuses) a Verity first-draft conversation, navigates to chat,
   * then repeatedly sends the chapter-writing prompt until:
   * - No new chapter was written AND no error (Verity signalled DRAFT_COMPLETE)
   * - The user calls stop()
   * - MAX_ITERATIONS is reached (safety valve)
   * - An unrecoverable exception is thrown
   *
   * On CLI errors, the loop pauses (isPaused = true) and waits for resume() or stop().
   *
   * The loop is **book-independent**: it keeps running even if the user switches
   * to a different book. It uses `window.novelEngine.chat.send()` directly
   * (bypassing chatStore.sendMessage) so it always targets the correct book.
   */
  start: (bookSlug: string) => Promise<void>;

  /**
   * Resume the loop after it has paused on a CLI error.
   * Retries the same chapter that failed — does not skip forward.
   */
  resume: () => void;

  /**
   * Request the loop to stop. If paused, unblocks immediately and exits.
   * If running, the in-progress chapter call is allowed to complete first.
   */
  stop: () => void;

  /** Reset store to idle state — clears all state including errors. */
  reset: () => void;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getChapterCount(bookSlug: string): Promise<number> {
  try {
    const chapters = await window.novelEngine.books.wordCount(bookSlug);
    return chapters.length;
  } catch {
    return -1; // sentinel: chapter count unreadable — caller should bail
  }
}

/**
 * Check if the user is currently viewing the given book.
 */
function isViewingBook(bookSlug: string): boolean {
  return useBookStore.getState().activeSlug === bookSlug;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAutoDraftStore = create<AutoDraftState>((set, get) => ({
  isRunning: false,
  isPaused: false,
  pauseReason: null,
  chaptersWritten: 0,
  conversationId: null,
  bookSlug: null,
  error: null,
  stopRequested: false,
  _resumeResolve: null,

  start: async (bookSlug: string) => {
    if (get().isRunning) return;

    set({
      isRunning: true,
      isPaused: false,
      pauseReason: null,
      stopRequested: false,
      chaptersWritten: 0,
      error: null,
      conversationId: null,
      bookSlug,
      _resumeResolve: null,
    });

    try {
      // ── Step 1: Find or create a Verity first-draft pipeline conversation ──

      const chatStore = useChatStore.getState();
      const existing = chatStore.conversations.find(
        (c) =>
          c.agentName === 'Verity' &&
          c.pipelinePhase === 'first-draft' &&
          c.purpose === 'pipeline',
      );

      let conversationId: string;

      if (existing) {
        await chatStore.setActiveConversation(existing.id);
        conversationId = existing.id;
      } else {
        await chatStore.createConversation('Verity', bookSlug, 'first-draft');
        const created = useChatStore.getState().activeConversation;
        if (!created) throw new Error('Failed to create Verity first-draft conversation.');
        conversationId = created.id;
      }

      set({ conversationId });

      // ── Step 2: Navigate to chat so the author can watch initial progress ──

      useViewStore.getState().navigate('chat');

      // Brief pause — let the view settle before the first message fires
      await delay(300);

      // ── Step 3: The chapter loop ──
      //
      // This loop calls the IPC bridge directly (window.novelEngine.chat.send)
      // instead of chatStore.sendMessage(). This is critical because:
      // - chatStore.sendMessage reads bookSlug from useBookStore.activeSlug,
      //   which would be wrong if the user switched books
      // - chatStore.sendMessage sets the active conversation and stream routing,
      //   which would hijack the user's current chat view
      // - We use our stored bookSlug and conversationId for all operations

      let iteration = 0;

      while (!get().stopRequested && iteration < MAX_ITERATIONS) {
        iteration++;

        // Count chapters before this call
        const countBefore = await getChapterCount(bookSlug);
        if (countBefore === -1) break; // FS unreadable — bail

        // Count assistant messages before so we can detect errors
        const msgsBefore = await window.novelEngine.chat.getMessages(conversationId);
        const assistantCountBefore = msgsBefore.filter((m) => m.role === 'assistant').length;

        // Determine if the user is currently viewing the auto-draft conversation.
        // If so, let stream events flow to chatStore so thinking/text are visible.
        // If not, suppress events so they don't pollute another conversation.
        const callId = crypto.randomUUID();
        const chatState = useChatStore.getState();
        const userIsWatching = chatState.activeConversation?.id === conversationId;

        if (userIsWatching) {
          // Attach to chatStore — shows live thinking + text in the chat view
          streamRouter.target = 'main';
          useChatStore.getState().attachToExternalStream(callId, conversationId, AUTO_DRAFT_PROMPT);
        } else {
          // Suppress events — user is looking at something else
          streamRouter.target = 'auto-draft';
        }

        try {
          await window.novelEngine.chat.send({
            agentName: 'Verity',
            message: AUTO_DRAFT_PROMPT,
            conversationId,
            bookSlug,
            callId,
          });
        } finally {
          // Restore stream router only if we still own it.
          // If the user started a manual chat while auto-draft was running,
          // their sendMessage() set target to 'main' — don't override that.
          if (streamRouter.target === 'auto-draft') {
            streamRouter.target = 'main';
          }
          // If we were attached to chatStore, the done handler already cleaned up.
        }

        // Wait for async state to settle (DB writes, file-change events)
        await delay(POST_SEND_SETTLE_MS);

        // Bail check after the send completes (user may have stopped during the call)
        if (get().stopRequested) break;

        // ── Determine what happened ──

        // Check DB for a new assistant message. ChatService saves the assistant
        // response on the 'done' event but does NOT save on 'error'. So if the
        // assistant count didn't increase, the CLI errored.
        const msgsAfter = await window.novelEngine.chat.getMessages(conversationId);
        const assistantCountAfter = msgsAfter.filter((m) => m.role === 'assistant').length;
        const gotResponse = assistantCountAfter > assistantCountBefore;

        const countAfter = await getChapterCount(bookSlug);
        if (countAfter === -1) break; // FS unreadable — bail

        // Check Verity's actual response text for the explicit DRAFT_COMPLETE signal
        const lastAssistant = msgsAfter.filter((m) => m.role === 'assistant').pop();
        const responseText = lastAssistant?.content ?? '';
        const isDraftComplete = responseText.includes('DRAFT_COMPLETE');

        if (countAfter > countBefore) {
          // ✓ A new chapter was written — update progress and continue
          const newChapters = countAfter - countBefore;
          set((s) => ({ chaptersWritten: s.chaptersWritten + newChapters }));

          // Refresh pipeline tracker for the auto-draft book (works even if
          // the user is viewing a different book — it updates the cache silently)
          usePipelineStore.getState().loadPipeline(bookSlug);

          // Only refresh file tree and word count if the user is viewing this book
          if (isViewingBook(bookSlug)) {
            useFileChangeStore.getState().notifyChange();
            useBookStore.getState().refreshWordCount();
          }

          // Brief pause before the next chapter
          await delay(INTER_CHAPTER_DELAY_MS);
        } else if (!gotResponse) {
          // ✗ No assistant message saved → CLI error
          //
          // We store the Promise resolver in Zustand state so resume() and stop()
          // can unblock the loop from outside. Storing functions in Zustand is safe
          // when there is no persist middleware (this store has none).
          await new Promise<void>((resolve) => {
            set({
              isPaused: true,
              pauseReason: 'CLI error — no response received',
              _resumeResolve: resolve,
            });
          });

          // Pause resolved — clean up before the next iteration
          set({ isPaused: false, pauseReason: null, _resumeResolve: null });

          // If stop() unblocked us, honour it
          if (get().stopRequested) break;

          // Otherwise: resume was requested — retry the same chapter
        } else if (isDraftComplete) {
          // ✓ Verity explicitly signalled all chapters are written — exit cleanly.
          break;
        } else {
          // Got a response but no new chapter and no DRAFT_COMPLETE signal.
          // Verity may have done prep work (story bible update, notes, etc.)
          // Retry — the MAX_ITERATIONS guard prevents infinite loops.
          await delay(INTER_CHAPTER_DELAY_MS);
        }
      }
    } catch (err) {
      // Uncaught exception (not a CLI stream error) — surface as hard error
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message, isPaused: false, pauseReason: null, _resumeResolve: null });
    } finally {
      set({ isRunning: false, stopRequested: false });

      // Final pipeline + word count refresh for the auto-draft book
      const { bookSlug: slug } = get();
      if (slug) {
        usePipelineStore.getState().loadPipeline(slug);
        if (isViewingBook(slug)) {
          useFileChangeStore.getState().notifyChange();
          useBookStore.getState().refreshWordCount();
        }
      }
    }
  },

  resume: () => {
    const { _resumeResolve, isPaused } = get();
    if (isPaused && _resumeResolve) {
      // The loop is suspended awaiting this resolve — calling it lets it proceed
      _resumeResolve();
    }
  },

  stop: () => {
    const { _resumeResolve, isPaused } = get();
    set({ stopRequested: true });
    if (isPaused && _resumeResolve) {
      // Unblock the pause so the loop can check stopRequested and exit
      _resumeResolve();
    }
  },

  reset: () => {
    set({
      isRunning: false,
      isPaused: false,
      pauseReason: null,
      stopRequested: false,
      chaptersWritten: 0,
      conversationId: null,
      bookSlug: null,
      error: null,
      _resumeResolve: null,
    });
  },
}));
