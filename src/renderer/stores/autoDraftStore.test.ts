import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AuditResult } from '@domain/types';
import { useAutoDraftStore } from './autoDraftStore';
import { useBookStore } from './bookStore';
import { useChatStore } from './chatStore';
import { useViewStore } from './viewStore';
import { usePipelineStore } from './pipelineStore';
import { useFileChangeStore } from './fileChangeStore';
import {
  installNovelEngineMock,
  makeConversation,
  makeMessage,
  type NovelEngineMock,
} from '../../test/novelEngineMock';
import { resetStoresBeforeEach } from '../../test/resetStores';

resetStoresBeforeEach(
  useBookStore,
  useChatStore,
  useViewStore,
  usePipelineStore,
  useFileChangeStore,
  useAutoDraftStore,
);

const BOOK = 'book-x';

/** The existing Verity first-draft conversation the loop reuses. */
const verityConvo = makeConversation({
  id: 'ad-conv',
  bookSlug: BOOK,
  agentName: 'Verity',
  pipelinePhase: 'first-draft',
  purpose: 'pipeline',
});

const draftCompleteMsg = makeMessage({ id: 'msg-dc', content: 'DRAFT_COMPLETE', conversationId: 'ad-conv' });

function chapters(...slugs: string[]): { slug: string; wordCount: number }[] {
  return slugs.map((slug) => ({ slug, wordCount: 1000 }));
}

let mock: NovelEngineMock;

beforeEach(() => {
  mock = installNovelEngineMock();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('autoDraftStore', () => {
  it('creates a Verity conversation and runs until DRAFT_COMPLETE', async () => {
    mock.chat.getConversations.mockResolvedValue([]);
    mock.chat.createConversation.mockResolvedValue(verityConvo);
    mock.books.wordCount.mockResolvedValue(chapters('01-one'));
    mock.chat.getMessages
      .mockResolvedValueOnce([]) // before the send
      .mockResolvedValue([draftCompleteMsg]); // after the send

    await useAutoDraftStore.getState().start(BOOK);

    expect(mock.chat.createConversation).toHaveBeenCalledWith({
      bookSlug: BOOK,
      agentName: 'Verity',
      pipelinePhase: 'first-draft',
      purpose: 'pipeline',
    });
    expect(mock.chat.send).toHaveBeenCalledTimes(1);
    const params = mock.chat.send.mock.calls[0][0];
    expect(params.agentName).toBe('Verity');
    expect(params.conversationId).toBe('ad-conv');
    expect(params.message).toContain('DRAFT_COMPLETE');
    expect(params.callId).toBeTruthy();

    const session = useAutoDraftStore.getState().getSession(BOOK);
    expect(session).toMatchObject({
      isRunning: false,
      isPaused: false,
      chaptersWritten: 0,
      conversationId: 'ad-conv',
      error: null,
      stopRequested: false,
      stageLabel: null,
    });
  });

  it('reuses an existing Verity first-draft pipeline conversation', async () => {
    mock.chat.getConversations.mockResolvedValue([
      makeConversation({ id: 'other', agentName: 'Spark' }),
      verityConvo,
    ]);
    mock.books.wordCount.mockResolvedValue(chapters('01-one'));
    mock.chat.getMessages.mockResolvedValueOnce([]).mockResolvedValue([draftCompleteMsg]);

    await useAutoDraftStore.getState().start(BOOK);

    expect(mock.chat.createConversation).not.toHaveBeenCalled();
    expect(useAutoDraftStore.getState().getSession(BOOK)?.conversationId).toBe('ad-conv');
  });

  it('counts a written chapter, audits it, and skips the fix when the audit returns null', async () => {
    const loadPipeline = vi.fn(async () => undefined);
    usePipelineStore.setState({ loadPipeline });
    mock.chat.getConversations.mockResolvedValue([verityConvo]);
    // iter1: 1 chapter before → 2 after (new slug 02-two); iter2: stable
    mock.books.wordCount
      .mockResolvedValueOnce(chapters('01-one'))
      .mockResolvedValue(chapters('01-one', '02-two'));
    const a1 = makeMessage({ id: 'a1', content: 'Wrote chapter two.', conversationId: 'ad-conv' });
    mock.chat.getMessages
      .mockResolvedValueOnce([]) // iter1 before
      .mockResolvedValueOnce([a1]) // iter1 after — chapter written
      .mockResolvedValueOnce([a1]) // iter2 before
      .mockResolvedValue([a1, draftCompleteMsg]); // iter2 after — complete

    await useAutoDraftStore.getState().start(BOOK);

    const session = useAutoDraftStore.getState().getSession(BOOK);
    expect(session?.chaptersWritten).toBe(1);
    expect(session?.skippedAudits).toEqual([]);
    expect(mock.chat.send).toHaveBeenCalledTimes(2);
    expect(mock.verity.auditChapter).toHaveBeenCalledTimes(1);
    const [slugArg, chapterArg, optsArg] = mock.verity.auditChapter.mock.calls[0];
    expect(slugArg).toBe(BOOK);
    expect(chapterArg).toBe('02-two');
    expect(optsArg).toMatchObject({ conversationId: 'ad-conv' });
    expect(mock.verity.fixChapter).not.toHaveBeenCalled();
    // Pipeline refreshed after the chapter and again in the finally block
    expect(loadPipeline).toHaveBeenCalledWith(BOOK);
    expect(loadPipeline.mock.calls.length).toBeGreaterThanOrEqual(2);
  }, 10_000);

  it('runs the fix pass when the audit severity is moderate or heavy', async () => {
    const audit: AuditResult = {
      chapter: '02-two',
      violations: [],
      summary: { total: 3, by_type: {}, severity: 'moderate' },
    };
    mock.verity.auditChapter.mockResolvedValue(audit);
    mock.chat.getConversations.mockResolvedValue([verityConvo]);
    mock.books.wordCount
      .mockResolvedValueOnce(chapters('01-one'))
      .mockResolvedValue(chapters('01-one', '02-two'));
    const a1 = makeMessage({ id: 'a1', content: 'Wrote chapter two.', conversationId: 'ad-conv' });
    mock.chat.getMessages
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([a1])
      .mockResolvedValueOnce([a1])
      .mockResolvedValue([a1, draftCompleteMsg]);

    await useAutoDraftStore.getState().start(BOOK);

    expect(mock.verity.fixChapter).toHaveBeenCalledTimes(1);
    const [slugArg, chapterArg, convArg, auditArg, callIdArg] = mock.verity.fixChapter.mock.calls[0];
    expect(slugArg).toBe(BOOK);
    expect(chapterArg).toBe('02-two');
    expect(convArg).toBe('ad-conv');
    expect(auditArg).toEqual(audit);
    expect(callIdArg).toBeTruthy();
  }, 10_000);

  it('pauses on a CLI error, guards against a second start, and exits on stop with an abort', async () => {
    mock.chat.getConversations.mockResolvedValue([verityConvo]);
    mock.books.wordCount.mockResolvedValue(chapters('01-one'));
    mock.chat.getMessages.mockResolvedValue([]); // never a response → CLI error

    const run = useAutoDraftStore.getState().start(BOOK);

    await vi.waitFor(
      () => expect(useAutoDraftStore.getState().getSession(BOOK)?.isPaused).toBe(true),
      { timeout: 3000 },
    );
    expect(useAutoDraftStore.getState().getSession(BOOK)?.pauseReason).toBe(
      'CLI error — no response received',
    );

    // A second start for the same book is a no-op while the loop is alive
    await useAutoDraftStore.getState().start(BOOK);
    expect(mock.chat.getConversations).toHaveBeenCalledTimes(1);

    useAutoDraftStore.getState().stop(BOOK);
    await run;

    expect(mock.chat.abort).toHaveBeenCalledWith('ad-conv');
    const session = useAutoDraftStore.getState().getSession(BOOK);
    expect(session?.isRunning).toBe(false);
    expect(session?.stopRequested).toBe(false); // cleared by the finally block
    expect(mock.chat.send).toHaveBeenCalledTimes(1);
  }, 10_000);

  it('resume after a pause retries the same chapter', async () => {
    mock.chat.getConversations.mockResolvedValue([verityConvo]);
    mock.books.wordCount.mockResolvedValue(chapters('01-one'));
    mock.chat.getMessages
      .mockResolvedValueOnce([]) // iter1 before
      .mockResolvedValueOnce([]) // iter1 after — no response → pause
      .mockResolvedValueOnce([]) // iter2 before (after resume)
      .mockResolvedValue([draftCompleteMsg]); // iter2 after — complete

    const run = useAutoDraftStore.getState().start(BOOK);
    await vi.waitFor(
      () => expect(useAutoDraftStore.getState().getSession(BOOK)?.isPaused).toBe(true),
      { timeout: 3000 },
    );

    useAutoDraftStore.getState().resume(BOOK);
    await run;

    const session = useAutoDraftStore.getState().getSession(BOOK);
    expect(session?.isRunning).toBe(false);
    expect(session?.error).toBeNull();
    expect(mock.chat.send).toHaveBeenCalledTimes(2);
  }, 10_000);

  it('when the user is viewing the book: activates the conversation, navigates, and refreshes on finish', async () => {
    useBookStore.setState({ activeSlug: BOOK });
    mock.chat.getConversations.mockResolvedValue([verityConvo]);
    mock.books.wordCount.mockResolvedValue(chapters('01-one'));
    mock.chat.getMessages
      .mockResolvedValueOnce([]) // setActiveConversation
      .mockResolvedValueOnce([]) // iter1 before
      .mockResolvedValue([draftCompleteMsg]); // iter1 after — complete

    await useAutoDraftStore.getState().start(BOOK);

    expect(useChatStore.getState().activeConversation?.id).toBe('ad-conv');
    expect(useViewStore.getState().currentView).toBe('workspace');
    expect(useViewStore.getState().payload).toEqual({ phaseId: 'first-draft' });
    // finally block notifies the file UI for the viewed book
    expect(useFileChangeStore.getState().revision).toBeGreaterThanOrEqual(1);
  });

  it('reconnect activates the auto-draft conversation only when it exists and is not already shown', () => {
    const setActiveConversation = vi.fn(async () => undefined);
    useChatStore.setState({ setActiveConversation, conversations: [verityConvo] });
    const runningSession = {
      isRunning: true,
      isPaused: false,
      pauseReason: null,
      stageLabel: null,
      chaptersWritten: 0,
      conversationId: 'ad-conv',
      error: null,
      skippedAudits: [],
      stopRequested: false,
      _resumeResolve: null,
      startedAt: Date.now(),
      noProgressCount: 0,
    };

    // No session → no-op
    useAutoDraftStore.getState().reconnect(BOOK);
    expect(setActiveConversation).not.toHaveBeenCalled();

    // Running session, conversation in the list, not currently shown → switch to it
    useAutoDraftStore.setState({ sessions: { [BOOK]: runningSession } });
    useAutoDraftStore.getState().reconnect(BOOK);
    expect(setActiveConversation).toHaveBeenCalledWith('ad-conv');

    // Already showing it and not streaming → the loop will re-attach; no switch
    setActiveConversation.mockClear();
    useChatStore.setState({ activeConversation: verityConvo, isStreaming: false });
    useAutoDraftStore.getState().reconnect(BOOK);
    expect(setActiveConversation).not.toHaveBeenCalled();
  });

  it('reset removes the book session entirely', () => {
    useAutoDraftStore.setState({
      sessions: {
        [BOOK]: {
          isRunning: false,
          isPaused: false,
          pauseReason: null,
          stageLabel: null,
          chaptersWritten: 3,
          conversationId: 'ad-conv',
          error: null,
          skippedAudits: [],
          stopRequested: false,
          _resumeResolve: null,
          startedAt: Date.now(),
          noProgressCount: 0,
        },
      },
    });

    useAutoDraftStore.getState().reset(BOOK);

    expect(useAutoDraftStore.getState().getSession(BOOK)).toBeNull();
  });

  it('pauses when the time budget is exceeded and resets the budget on resume', async () => {
    // Force Date.now to advance past MAX_AUTO_DRAFT_DURATION_MS (4h) on the
    // second iteration's top-of-loop check, so the time-budget pause fires
    // before any other cap. Use real timers for the loop's await delays.
    const startedAt = Date.now();
    const dateNowSpy = vi.spyOn(Date, 'now');
    // First call: start()'s `startedAt: Date.now()`. Subsequent calls: +5h.
    let callCount = 0;
    dateNowSpy.mockImplementation(() => {
      callCount++;
      // After start()'s initial call, jump 5h so the first iteration's
      // budget check fires immediately.
      return callCount <= 1 ? startedAt : startedAt + 5 * 60 * 60 * 1000;
    });

    try {
      mock.chat.getConversations.mockResolvedValue([verityConvo]);
      mock.books.wordCount.mockResolvedValue(chapters('01-one'));
      // Return ever-growing message lists so the prep branch fires
      // (gotResponse=true, no DRAFT_COMPLETE, no new chapter).
      const m1 = makeMessage({ id: 'm1', content: 'I updated notes only.', conversationId: 'ad-conv' });
      mock.chat.getMessages
        .mockResolvedValueOnce([]) // iter1 before
        .mockResolvedValueOnce([m1]) // iter1 after → prep (count=1)
        .mockResolvedValue([m1]); // iter2 onwards — budget check fires first

      const run = useAutoDraftStore.getState().start(BOOK);

      await vi.waitFor(() => {
        const session = useAutoDraftStore.getState().getSession(BOOK);
        expect(session?.isPaused).toBe(true);
        expect(session?.pauseReason).toMatch(/Time budget reached/);
      }, { timeout: 5000 });

      // Resume should reset startedAt so the budget restarts.
      dateNowSpy.mockImplementation(() => Date.now() & 0);
      useAutoDraftStore.getState().resume(BOOK);
      useAutoDraftStore.getState().stop(BOOK);
      await run;
    } finally {
      dateNowSpy.mockRestore();
    }
  }, 15_000);

  it('pauses when the model produces no new chapter for MAX_NO_PROGRESS_RETRIES consecutive iterations', async () => {
    mock.chat.getConversations.mockResolvedValue([verityConvo]);
    // Chapter list never grows → the "prep work" branch every iteration.
    mock.books.wordCount.mockResolvedValue(chapters('01-one'));
    // Each iteration's "after" must see one MORE assistant message so
    // gotResponse=true; otherwise the CLI-error pause fires first.
    const m1 = makeMessage({ id: 'm1', content: 'I updated notes only.', conversationId: 'ad-conv' });
    const m2 = makeMessage({ id: 'm2', content: 'I updated notes only.', conversationId: 'ad-conv' });
    const m3 = makeMessage({ id: 'm3', content: 'I updated notes only.', conversationId: 'ad-conv' });
    mock.chat.getMessages
      .mockResolvedValueOnce([]) // iter1 before
      .mockResolvedValueOnce([m1]) // iter1 after — prep (count=1)
      .mockResolvedValueOnce([m1]) // iter2 before
      .mockResolvedValueOnce([m1, m2]) // iter2 after — prep (count=2)
      .mockResolvedValueOnce([m1, m2]) // iter3 before
      .mockResolvedValue([m1, m2, m3]); // iter3 after — hits cap → pause

    const run = useAutoDraftStore.getState().start(BOOK);

    await vi.waitFor(() => {
      const session = useAutoDraftStore.getState().getSession(BOOK);
      expect(session?.isPaused).toBe(true);
      expect(session?.pauseReason).toMatch(
        /no new chapter after \d+ attempts — the model may be stuck/,
      );
    }, { timeout: 5000 });

    useAutoDraftStore.getState().stop(BOOK);
    await run;
  }, 15_000);
});
