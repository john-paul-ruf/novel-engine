import { create } from 'zustand';
import { useChatStore } from './chatStore';
import { usePipelineStore } from './pipelineStore';
import { useViewStore } from './viewStore';
import { useBookStore } from './bookStore';
import { useFileChangeStore } from './fileChangeStore';

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
 * How long to wait after sendMessage() for async state to settle.
 *
 * The chatStore 'done' handler reloads messages from DB asynchronously, and
 * stream events arrive via ipcRenderer.on before the invoke response resolves.
 * 400 ms is enough for both to complete before we inspect chatStore.messages.
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
   * - The active book changes
   * - MAX_ITERATIONS is reached (safety valve)
   * - An unrecoverable exception is thrown
   *
   * On CLI errors, the loop pauses (isPaused = true) and waits for resume() or stop().
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
 * Inspect chatStore.messages to determine if the most recent assistant turn
 * was a stream error rather than a clean response.
 *
 * chatStore adds synthetic error messages with id 'error-<timestamp>' when the
 * CLI emits a stream error event. These are renderer-only (not persisted to DB).
 * Real saved messages use nanoid IDs (21-char alphanumeric). This distinction
 * is fully reliable: nanoid IDs never start with the literal string "error-".
 */
function lastMessageWasStreamError(): { wasError: boolean; message: string } {
  const messages = useChatStore.getState().messages;
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  if (!lastAssistant?.id.startsWith('error-')) {
    return { wasError: false, message: '' };
  }
  // Strip the "Error: " prefix chatStore prepends so the UI gets the raw text
  const rawMessage = lastAssistant.content.replace(/^Error:\s*/i, '').trim();
  return { wasError: true, message: rawMessage || 'Unknown CLI error' };
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

      // ── Step 2: Navigate to chat so the author can watch progress ──

      useViewStore.getState().navigate('chat');

      // Brief pause — let the view settle before the first message fires
      await delay(300);

      // ── Step 3: The chapter loop ──

      let iteration = 0;

      while (!get().stopRequested && iteration < MAX_ITERATIONS) {
        // Guard: abort if the user switched to a different book
        if (useBookStore.getState().activeSlug !== bookSlug) break;

        iteration++;

        // Count chapters before this call
        const countBefore = await getChapterCount(bookSlug);
        if (countBefore === -1) break; // FS unreadable — bail

        // Re-ensure our conversation is still active (user may have clicked away)
        const currentActive = useChatStore.getState().activeConversation;
        if (!currentActive || currentActive.id !== conversationId) {
          await useChatStore.getState().setActiveConversation(conversationId);
          await delay(100);
        }

        // Send the chapter-writing prompt.
        // chatStore.sendMessage awaits window.novelEngine.chat.send, which only
        // resolves once the full CLI stream is complete — perfect for sequencing.
        await useChatStore.getState().sendMessage(AUTO_DRAFT_PROMPT);

        // Wait for async state to settle:
        // - chatStore 'done' handler reloads messages from DB via Promise.all
        // - Stream events from ipcRenderer.on need to process through the event loop
        await delay(POST_SEND_SETTLE_MS);

        // ── Determine what happened ──

        const { wasError, message: errorMsg } = lastMessageWasStreamError();

        const countAfter = await getChapterCount(bookSlug);
        if (countAfter === -1) break; // FS unreadable — bail

        if (countAfter > countBefore) {
          // ✓ A new chapter was written — update progress and continue
          const newChapters = countAfter - countBefore;
          set((s) => ({ chaptersWritten: s.chaptersWritten + newChapters }));

          // Refresh pipeline tracker, file tree, word count badge
          usePipelineStore.getState().loadPipeline(bookSlug);
          useFileChangeStore.getState().notifyChange();
          useBookStore.getState().refreshWordCount();

          // Brief pause before the next chapter
          await delay(INTER_CHAPTER_DELAY_MS);
        } else if (wasError) {
          // ✗ CLI error — pause and wait for the user to decide
          //
          // We store the Promise resolver in Zustand state so resume() and stop()
          // can unblock the loop from outside. Storing functions in Zustand is safe
          // when there is no persist middleware (this store has none).
          await new Promise<void>((resolve) => {
            set({ isPaused: true, pauseReason: errorMsg, _resumeResolve: resolve });
          });

          // Pause resolved — clean up before the next iteration
          set({ isPaused: false, pauseReason: null, _resumeResolve: null });

          // If stop() unblocked us, honour it
          if (get().stopRequested) break;

          // Otherwise: resume was requested — retry the same chapter
          // (iteration will increment at the top of the loop, which is fine —
          // we're just retrying; the chapter count will be re-read fresh)
        } else {
          // ✓ No error, no new chapter: Verity replied DRAFT_COMPLETE (or there
          // was nothing left to write). The draft is done — exit cleanly.
          break;
        }
      }
    } catch (err) {
      // Uncaught exception (not a CLI stream error) — surface as hard error
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message, isPaused: false, pauseReason: null, _resumeResolve: null });
    } finally {
      set({ isRunning: false, stopRequested: false });
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
