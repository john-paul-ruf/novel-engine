import { create } from 'zustand';
import { useChatStore } from './chatStore';
import { usePipelineStore } from './pipelineStore';
import { useViewStore } from './viewStore';
import { useBookStore } from './bookStore';
import { useFileChangeStore } from './fileChangeStore';

/**
 * The prompt sent to Verity on every auto-draft iteration.
 *
 * Verity will read the scene outline, find the next unwritten chapter,
 * write the full prose, update the story bible, and signal DRAFT_COMPLETE
 * when all chapters have been written.
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

type AutoDraftState = {
  /** Whether the auto-draft loop is currently running. */
  isRunning: boolean;

  /** Number of new chapters written during the current (or most recent) run. */
  chaptersWritten: number;

  /** The conversation ID the loop is using — stays constant across iterations. */
  conversationId: string | null;

  /** Error message if the loop aborted with an exception. Null when clean. */
  error: string | null;

  /** Set to true when the user clicks Stop — the loop exits after the current chapter. */
  stopRequested: boolean;

  /**
   * Start the auto-draft loop for the given book.
   *
   * Creates (or reuses) a Verity first-draft conversation, navigates to the
   * chat view, then repeatedly sends the chapter-writing prompt until:
   * - No new chapter was written (Verity says "done" or replied DRAFT_COMPLETE)
   * - The user calls stop()
   * - The active book changes
   * - MAX_ITERATIONS is reached (safety valve)
   * - An unrecoverable error occurs
   */
  start: (bookSlug: string) => Promise<void>;

  /**
   * Request the loop to stop after the current chapter finishes.
   * Non-destructive — the in-progress chapter call is allowed to complete.
   */
  stop: () => void;

  /** Reset store to idle state (clears error, counts, conversationId). */
  reset: () => void;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getChapterCount(bookSlug: string): Promise<number> {
  try {
    const chapters = await window.novelEngine.books.wordCount(bookSlug);
    return chapters.length;
  } catch {
    return -1; // sentinel: chapter count unreadable
  }
}

export const useAutoDraftStore = create<AutoDraftState>((set, get) => ({
  isRunning: false,
  chaptersWritten: 0,
  conversationId: null,
  error: null,
  stopRequested: false,

  start: async (bookSlug: string) => {
    if (get().isRunning) return;

    set({
      isRunning: true,
      stopRequested: false,
      chaptersWritten: 0,
      error: null,
      conversationId: null,
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

      // ── Step 2: Navigate to the chat view so the author can watch progress ──

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
        if (countBefore === -1) break; // can't read FS — bail

        // Re-ensure our conversation is active in chatStore (user may have clicked away)
        const currentActive = useChatStore.getState().activeConversation;
        if (!currentActive || currentActive.id !== conversationId) {
          await useChatStore.getState().setActiveConversation(conversationId);
          await delay(100);
        }

        // Send the chapter-writing prompt.
        // chatStore.sendMessage awaits window.novelEngine.chat.send, which resolves
        // only when the full CLI stream is complete — perfect for loop sequencing.
        await useChatStore.getState().sendMessage(AUTO_DRAFT_PROMPT);

        // Let async state settle (chatStore 'done' handler reloads messages async)
        await delay(200);

        // Count chapters after this call
        const countAfter = await getChapterCount(bookSlug);
        if (countAfter === -1) break; // can't read FS — bail

        if (countAfter > countBefore) {
          // A new chapter was written — update progress counters
          const newChapters = countAfter - countBefore;
          set((s) => ({ chaptersWritten: s.chaptersWritten + newChapters }));

          // Refresh downstream UI: pipeline phases, file tree, word count badge
          usePipelineStore.getState().loadPipeline(bookSlug);
          useFileChangeStore.getState().notifyChange();
          useBookStore.getState().refreshWordCount();

          // Pause before asking for the next chapter
          await delay(INTER_CHAPTER_DELAY_MS);
        } else {
          // No new chapter was written:
          // Verity responded with DRAFT_COMPLETE, encountered an error, or there
          // is nothing left to write. Either way, the loop ends cleanly.
          break;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
    } finally {
      set({ isRunning: false, stopRequested: false });
    }
  },

  stop: () => {
    set({ stopRequested: true });
  },

  reset: () => {
    set({
      isRunning: false,
      stopRequested: false,
      chaptersWritten: 0,
      conversationId: null,
      error: null,
    });
  },
}));
