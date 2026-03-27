import { create } from 'zustand';
import { usePipelineStore } from './pipelineStore';
import { useViewStore } from './viewStore';
import { useBookStore } from './bookStore';
import { useChatStore } from './chatStore';
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

/** Phrase audit cadence — run a full ledger audit every N chapters. */
const PHRASE_AUDIT_CADENCE = 3;

/**
 * Determine whether the fix pass should run based on audit severity.
 * Fix on 'moderate' or 'heavy'. Skip on 'clean' or 'minor'.
 */
function shouldFix(severity: string): boolean {
  return severity === 'moderate' || severity === 'heavy';
}

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

// ── Per-Session State ────────────────────────────────────────────────────────

type AutoDraftSession = {
  /** Whether this session's loop is currently active (running OR paused on error). */
  isRunning: boolean;

  /** True when the loop hit a CLI error and is waiting for user decision. */
  isPaused: boolean;

  /** Error message that triggered the pause. Null when not paused. */
  pauseReason: string | null;

  /** Human-readable label for what the loop is doing right now. */
  stageLabel: string | null;

  /** Number of new chapters written during the current run. */
  chaptersWritten: number;

  /** Conversation ID used for the entire run — constant across iterations. */
  conversationId: string | null;

  /** Hard error that aborted the loop via an uncaught exception. */
  error: string | null;

  /** Set to true when the user clicks Stop. */
  stopRequested: boolean;

  /** Internal: Promise resolver that unblocks a pause. */
  _resumeResolve: (() => void) | null;
};

function defaultSession(): AutoDraftSession {
  return {
    isRunning: false,
    isPaused: false,
    pauseReason: null,
    stageLabel: null,
    chaptersWritten: 0,
    conversationId: null,
    error: null,
    stopRequested: false,
    _resumeResolve: null,
  };
}

// ── Store Shape ──────────────────────────────────────────────────────────────

type AutoDraftState = {
  /**
   * Per-book auto-draft sessions, keyed by bookSlug.
   * Each book can run its own independent auto-draft loop concurrently.
   */
  sessions: Record<string, AutoDraftSession>;

  /** Get the session for a book, or null if none exists. */
  getSession: (bookSlug: string) => AutoDraftSession | null;

  /**
   * Start the auto-draft loop for the given book.
   *
   * Creates (or reuses) a Verity first-draft conversation, then repeatedly
   * sends the chapter-writing prompt until:
   * - No new chapter was written AND no error (Verity signalled DRAFT_COMPLETE)
   * - The user calls stop(bookSlug)
   * - MAX_ITERATIONS is reached (safety valve)
   * - An unrecoverable exception is thrown
   *
   * On CLI errors, the loop pauses and waits for resume() or stop().
   *
   * Multiple books can auto-draft concurrently — each runs its own loop,
   * each with its own callId, so there is zero cross-book stream bleed.
   */
  start: (bookSlug: string) => Promise<void>;

  /** Resume the loop for a specific book after it has paused on a CLI error. */
  resume: (bookSlug: string) => void;

  /** Request a specific book's loop to stop. */
  stop: (bookSlug: string) => void;

  /** Reset a specific book's session to idle state — clears all state. */
  reset: (bookSlug: string) => void;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getChapterSlugs(bookSlug: string): Promise<string[] | null> {
  try {
    const chapters = await window.novelEngine.books.wordCount(bookSlug);
    return chapters.map((c) => c.slug);
  } catch {
    return null; // sentinel: chapter list unreadable — caller should bail
  }
}

async function getChapterCount(bookSlug: string): Promise<number> {
  try {
    const chapters = await window.novelEngine.books.wordCount(bookSlug);
    return chapters.length;
  } catch {
    return -1; // sentinel: chapter count unreadable — caller should bail
  }
}

function isViewingBook(bookSlug: string): boolean {
  return useBookStore.getState().activeSlug === bookSlug;
}

/**
 * Immutably update a session within the sessions record.
 * If the session doesn't exist, does nothing.
 */
function patchSession(
  sessions: Record<string, AutoDraftSession>,
  bookSlug: string,
  patch: Partial<AutoDraftSession>,
): Record<string, AutoDraftSession> {
  const current = sessions[bookSlug];
  if (!current) return sessions;
  return { ...sessions, [bookSlug]: { ...current, ...patch } };
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useAutoDraftStore = create<AutoDraftState>((set, get) => ({
  sessions: {},

  getSession: (bookSlug: string) => get().sessions[bookSlug] ?? null,

  start: async (bookSlug: string) => {
    // Guard: don't start a second loop for the SAME book.
    // Different books are allowed to run concurrently.
    const existing = get().sessions[bookSlug];
    if (existing?.isRunning) return;

    // Initialize this book's session
    set((state) => ({
      sessions: {
        ...state.sessions,
        [bookSlug]: {
          ...defaultSession(),
          isRunning: true,
        },
      },
    }));

    // Helper to read this session's current state
    const session = () => get().sessions[bookSlug];

    // Helper to patch this session immutably
    const patch = (update: Partial<AutoDraftSession>) => {
      set((state) => ({
        sessions: patchSession(state.sessions, bookSlug, update),
      }));
    };

    try {
      // ── Step 1: Find or create a Verity first-draft conversation ──────
      //
      // Use the IPC bridge directly — NOT chatStore — so we don't hijack
      // the user's current view when they start auto-draft on a book
      // they're not currently viewing.

      const conversations = await window.novelEngine.chat.getConversations(bookSlug);
      const existingConvo = conversations.find(
        (c) =>
          c.agentName === 'Verity' &&
          c.pipelinePhase === 'first-draft' &&
          c.purpose === 'pipeline',
      );

      let conversationId: string;

      if (existingConvo) {
        conversationId = existingConvo.id;
      } else {
        const created = await window.novelEngine.chat.createConversation({
          bookSlug,
          agentName: 'Verity',
          pipelinePhase: 'first-draft',
          purpose: 'pipeline',
        });
        conversationId = created.id;
      }

      patch({ conversationId });

      // Refresh chatStore's conversation list if the user is viewing this book
      // so the new conversation appears in the sidebar.
      if (isViewingBook(bookSlug)) {
        await useChatStore.getState().loadConversations(bookSlug);

        // Navigate to chat and activate the auto-draft conversation
        // only for the initial start — the user explicitly clicked this.
        const chatState = useChatStore.getState();
        if (!chatState.activeConversation || chatState.activeConversation.id !== conversationId) {
          await chatState.setActiveConversation(conversationId);
        }
        useViewStore.getState().navigate('chat');
      }

      // Brief pause — let the view settle before the first message fires
      await delay(300);

      // ── Step 2: The chapter loop ──────────────────────────────────────
      //
      // Each iteration uses window.novelEngine.chat.send() directly with
      // a unique callId. The chatStore's callId guard ensures events from
      // THIS loop's CLI calls never bleed into other conversations or
      // other books' auto-draft loops.

      let iteration = 0;

      while (!session()?.stopRequested && iteration < MAX_ITERATIONS) {
        iteration++;

        // Capture chapter slugs before this call (for detecting new chapters)
        const chapterSlugsBefore = await getChapterSlugs(bookSlug);
        const slugsBefore = new Set(chapterSlugsBefore ?? []);

        // Count chapters before this call
        const countBefore = chapterSlugsBefore?.length ?? -1;
        if (countBefore === -1) break;

        // Count assistant messages before so we can detect errors
        const msgsBefore = await window.novelEngine.chat.getMessages(conversationId);
        const assistantCountBefore = msgsBefore.filter((m) => m.role === 'assistant').length;

        patch({ stageLabel: `Drafting chapter ${iteration}…` });

        // Each CLI call gets a unique callId — this is the primary isolation
        // mechanism. No two concurrent auto-draft loops will ever share a callId.
        const callId = crypto.randomUUID();

        // If the user is currently watching this auto-draft conversation,
        // attach to chatStore so they see live thinking + text streaming.
        // Otherwise, events are silently dropped by chatStore's callId guard.
        const chatState = useChatStore.getState();
        const userIsWatching = chatState.activeConversation?.id === conversationId;

        if (userIsWatching) {
          useChatStore.getState().attachToExternalStream(callId, conversationId, AUTO_DRAFT_PROMPT);
        }

        try {
          await window.novelEngine.chat.send({
            agentName: 'Verity',
            message: AUTO_DRAFT_PROMPT,
            conversationId,
            bookSlug,
            callId,
          });
        } catch {
          // send() rejected — will be caught by the error detection below
        }

        // Wait for async state to settle (DB writes, file-change events)
        await delay(POST_SEND_SETTLE_MS);

        // Bail check after the send completes
        if (session()?.stopRequested) break;

        // ── Determine what happened ──────────────────────────────────────

        const msgsAfter = await window.novelEngine.chat.getMessages(conversationId);
        const assistantCountAfter = msgsAfter.filter((m) => m.role === 'assistant').length;
        const gotResponse = assistantCountAfter > assistantCountBefore;

        const countAfter = await getChapterCount(bookSlug);
        if (countAfter === -1) break;

        const lastAssistant = msgsAfter.filter((m) => m.role === 'assistant').pop();
        const responseText = lastAssistant?.content ?? '';
        const isDraftComplete = responseText.includes('DRAFT_COMPLETE');

        if (countAfter > countBefore) {
          // ✓ New chapter written — update progress
          const newChapters = countAfter - countBefore;
          patch({ chaptersWritten: (session()?.chaptersWritten ?? 0) + newChapters });

          // ── Pass 2: Audit ──────────────────────────────────────────
          // Detect which chapter was just written by comparing slug lists
          const slugsAfter = await getChapterSlugs(bookSlug);
          const newChapterSlug = slugsAfter?.find((s) => !slugsBefore.has(s));

          if (newChapterSlug && !session()?.stopRequested) {
            try {
              patch({ stageLabel: `Auditing ${newChapterSlug}…` });
              console.log(`[auto-draft] Starting audit for ${newChapterSlug}`);

              const auditCallId = crypto.randomUUID();
              const userIsWatchingAudit = useChatStore.getState().activeConversation?.id === conversationId;
              if (userIsWatchingAudit) {
                useChatStore.getState().attachToExternalStream(auditCallId, conversationId, `[Auto-audit: ${newChapterSlug}]`);
              }

              const auditResult = await window.novelEngine.verity.auditChapter(
                bookSlug,
                newChapterSlug,
                { callId: auditCallId, conversationId },
              );
              console.log(`[auto-draft] Audit returned for ${newChapterSlug}:`, auditResult ? `${auditResult.summary.severity} (${auditResult.summary.total} violations)` : 'null');

              if (userIsWatchingAudit && useChatStore.getState().activeConversation?.id === conversationId) {
                await useChatStore.getState().setActiveConversation(conversationId);
              }

              if (auditResult && shouldFix(auditResult.summary.severity)) {
                if (!session()?.stopRequested) {
                  patch({ stageLabel: `Fixing ${auditResult.summary.total} violations in ${newChapterSlug}…` });
                  console.log(`[auto-draft] Starting fix for ${newChapterSlug}`);

                  const fixCallId = crypto.randomUUID();
                  const userIsWatchingFix = useChatStore.getState().activeConversation?.id === conversationId;
                  if (userIsWatchingFix) {
                    useChatStore.getState().attachToExternalStream(fixCallId, conversationId, `[Auto-fix: ${auditResult.summary.total} violations in ${newChapterSlug}]`);
                  }

                  await window.novelEngine.verity.fixChapter(
                    bookSlug,
                    newChapterSlug,
                    conversationId,
                    auditResult,
                    fixCallId,
                  );
                  console.log(`[auto-draft] Fix completed for ${newChapterSlug}`);
                }
              }
            } catch (err) {
              console.warn('[auto-draft] Audit/fix pass failed:', err);
            }
          }

          // Clear stageLabel after audit/fix so it doesn't remain stale
          // during the post-chapter housekeeping steps below.
          patch({ stageLabel: `Preparing next chapter…` });

          // ── Periodic phrase audit ─────────────────────────────────
          const totalChapters = session()?.chaptersWritten ?? 0;
          if (totalChapters > 0 && totalChapters % PHRASE_AUDIT_CADENCE === 0) {
            if (!session()?.stopRequested) {
              try {
                patch({ stageLabel: 'Running phrase audit…' });
                const phraseCallId = crypto.randomUUID();
                const userIsWatchingPhrase = useChatStore.getState().activeConversation?.id === conversationId;
                if (userIsWatchingPhrase) {
                  useChatStore.getState().attachToExternalStream(phraseCallId, conversationId, '[Running phrase audit…]');
                }
                await window.novelEngine.verity.runPhraseAudit(bookSlug, phraseCallId);
              } catch {
                console.warn('[auto-draft] Periodic phrase audit failed');
              }
            }
          }

          // Refresh pipeline tracker (works even for background books)
          usePipelineStore.getState().loadPipeline(bookSlug);

          if (isViewingBook(bookSlug)) {
            useFileChangeStore.getState().notifyChange();
            useBookStore.getState().refreshWordCount();
          }

          // If user is watching, refresh messages so the chat view updates
          if (useChatStore.getState().activeConversation?.id === conversationId) {
            await useChatStore.getState().setActiveConversation(conversationId);
          }

          await delay(INTER_CHAPTER_DELAY_MS);
        } else if (!gotResponse) {
          // ✗ No assistant message saved → CLI error
          await new Promise<void>((resolve) => {
            patch({
              isPaused: true,
              pauseReason: 'CLI error — no response received',
              _resumeResolve: resolve,
            });
          });

          // Pause resolved — clean up
          patch({ isPaused: false, pauseReason: null, _resumeResolve: null });

          if (session()?.stopRequested) break;
          // Otherwise: resume — retry the same chapter
        } else if (isDraftComplete) {
          // ✓ All chapters written
          break;
        } else {
          // Got a response but no new chapter — Verity did prep work. Retry.
          await delay(INTER_CHAPTER_DELAY_MS);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      patch({ error: message, isPaused: false, pauseReason: null, _resumeResolve: null });
    } finally {
      patch({ isRunning: false, stopRequested: false, stageLabel: null });

      // Final pipeline + word count refresh
      usePipelineStore.getState().loadPipeline(bookSlug);
      if (isViewingBook(bookSlug)) {
        useFileChangeStore.getState().notifyChange();
        useBookStore.getState().refreshWordCount();
      }
    }
  },

  resume: (bookSlug: string) => {
    const session = get().sessions[bookSlug];
    if (session?.isPaused && session._resumeResolve) {
      session._resumeResolve();
    }
  },

  stop: (bookSlug: string) => {
    const session = get().sessions[bookSlug];
    if (!session) return;

    set((state) => ({
      sessions: patchSession(state.sessions, bookSlug, { stopRequested: true }),
    }));

    // Kill the in-flight CLI call immediately so the user doesn't have to
    // wait for the current chapter to finish.
    if (session.conversationId) {
      window.novelEngine.chat.abort(session.conversationId).catch(() => {});
    }

    // If paused, unblock so the loop can check stopRequested and exit
    if (session.isPaused && session._resumeResolve) {
      session._resumeResolve();
    }
  },

  reset: (bookSlug: string) => {
    set((state) => {
      const { [bookSlug]: _, ...rest } = state.sessions;
      return { sessions: rest };
    });
  },
}));
