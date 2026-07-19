import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useBookStore } from './bookStore';
import { useChatStore } from './chatStore';
import { useViewStore } from './viewStore';
import { useAutoDraftStore } from './autoDraftStore';
import {
  installNovelEngineMock,
  makeBookMeta,
  makeBookSummary,
  makeConversation,
  makeMessage,
  type NovelEngineMock,
} from '../../test/novelEngineMock';
import { resetStoresBeforeEach } from '../../test/resetStores';

resetStoresBeforeEach(useChatStore, useViewStore, useAutoDraftStore, useBookStore);

let mock: NovelEngineMock;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mock = installNovelEngineMock();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

const bookA = makeBookSummary({ slug: 'book-a', title: 'Book A' });
const bookB = makeBookSummary({ slug: 'book-b', title: 'Book B' });

describe('bookStore', () => {
  describe('loadBooks', () => {
    it('populates books and activeSlug, then refreshes the active book word count', async () => {
      mock.books.list.mockResolvedValue([bookA, bookB]);
      mock.books.getActiveSlug.mockResolvedValue('book-a');
      mock.books.wordCount.mockResolvedValue([
        { slug: '01-one', wordCount: 100 },
        { slug: '02-two', wordCount: 50 },
      ]);

      await useBookStore.getState().loadBooks();

      expect(useBookStore.getState().activeSlug).toBe('book-a');
      expect(useBookStore.getState().loading).toBe(false);

      // refreshWordCount is fired without await — settle it
      await vi.waitFor(() => expect(useBookStore.getState().totalWordCount).toBe(150));
      expect(useBookStore.getState().chapters).toHaveLength(2);
      // books[] stays in sync with the freshly computed total
      expect(useBookStore.getState().books.find((b) => b.slug === 'book-a')?.wordCount).toBe(150);
      expect(mock.books.wordCount).toHaveBeenCalledWith('book-a');
    });

    it('skips the word count refresh when no book is active', async () => {
      mock.books.list.mockResolvedValue([bookA]);
      mock.books.getActiveSlug.mockResolvedValue('');

      await useBookStore.getState().loadBooks();

      expect(useBookStore.getState().books).toHaveLength(1);
      expect(mock.books.wordCount).not.toHaveBeenCalled();
    });

    it('clears the loading flag and keeps state unchanged when the bridge rejects', async () => {
      mock.books.list.mockRejectedValue(new Error('ipc down'));

      await useBookStore.getState().loadBooks();

      expect(useBookStore.getState().loading).toBe(false);
      expect(useBookStore.getState().books).toEqual([]);
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('setActiveBook', () => {
    it('activates via the bridge, resets chat, refreshes words, navigates to workspace, reconnects auto-draft', async () => {
      const reconnect = vi.fn();
      useAutoDraftStore.setState({ reconnect });
      useChatStore.setState({
        activeConversation: makeConversation({ id: 'old-conv' }),
        messages: [makeMessage()],
      });
      mock.books.wordCount.mockResolvedValue([{ slug: '01-one', wordCount: 42 }]);

      await useBookStore.getState().setActiveBook('book-b');

      expect(mock.books.setActive).toHaveBeenCalledWith('book-b');
      expect(useBookStore.getState().activeSlug).toBe('book-b');

      // chat context switched to the new book
      expect(mock.chat.getConversations).toHaveBeenCalledWith('book-b');
      expect(useChatStore.getState().messages).toEqual([]);
      expect(useChatStore.getState().activeConversation).toBeNull();

      expect(useBookStore.getState().totalWordCount).toBe(42);
      expect(useViewStore.getState().currentView).toBe('workspace');
      expect(reconnect).toHaveBeenCalledWith('book-b');
    });

    it('leaves state untouched when the bridge rejects', async () => {
      mock.books.setActive.mockRejectedValue(new Error('no such book'));

      await useBookStore.getState().setActiveBook('book-b');

      expect(useBookStore.getState().activeSlug).toBe('');
      expect(useViewStore.getState().currentView).toBe('library');
      expect(mock.chat.getConversations).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('createBook', () => {
    it('creates the book, refreshes the list, and returns the new slug', async () => {
      mock.books.create.mockResolvedValue(makeBookMeta({ slug: 'fresh-book' }));
      mock.books.list.mockResolvedValue([makeBookSummary({ slug: 'fresh-book' })]);

      const slug = await useBookStore.getState().createBook('Fresh Book');

      expect(slug).toBe('fresh-book');
      expect(mock.books.create).toHaveBeenCalledWith('Fresh Book');
      expect(useBookStore.getState().books.map((b) => b.slug)).toEqual(['fresh-book']);
    });

    it('rethrows bridge failures so the caller can show the error', async () => {
      mock.books.create.mockRejectedValue(new Error('title taken'));

      await expect(useBookStore.getState().createBook('Dup')).rejects.toThrow('title taken');
      expect(useBookStore.getState().books).toEqual([]);
    });
  });

  describe('refreshWordCount', () => {
    it('resets totals without a bridge call when no book is active', async () => {
      useBookStore.setState({ totalWordCount: 99, chapters: [{ slug: 'x', wordCount: 99 }] });

      await useBookStore.getState().refreshWordCount();

      expect(useBookStore.getState().totalWordCount).toBe(0);
      expect(useBookStore.getState().chapters).toEqual([]);
      expect(mock.books.wordCount).not.toHaveBeenCalled();
    });

    it('keeps the previous totals when the bridge rejects', async () => {
      useBookStore.setState({ activeSlug: 'book-a', totalWordCount: 99 });
      mock.books.wordCount.mockRejectedValue(new Error('fs error'));

      await useBookStore.getState().refreshWordCount();

      expect(useBookStore.getState().totalWordCount).toBe(99);
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('uploadCover', () => {
    it('refreshes the book list and returns the filename on success', async () => {
      mock.books.uploadCover.mockResolvedValue('cover.jpg');

      const result = await useBookStore.getState().uploadCover('book-a');

      expect(result).toBe('cover.jpg');
      expect(mock.books.list).toHaveBeenCalledTimes(1);
    });

    it('returns null and skips the refresh when the user cancels the picker', async () => {
      mock.books.uploadCover.mockResolvedValue(null);

      const result = await useBookStore.getState().uploadCover('book-a');

      expect(result).toBeNull();
      expect(mock.books.list).not.toHaveBeenCalled();
    });

    it('swallows bridge failures and returns null', async () => {
      mock.books.uploadCover.mockRejectedValue(new Error('bad image'));

      const result = await useBookStore.getState().uploadCover('book-a');

      expect(result).toBeNull();
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('archiveBook', () => {
    it('archiving the active book activates the next remaining book', async () => {
      useAutoDraftStore.setState({ reconnect: vi.fn() });
      useBookStore.setState({ activeSlug: 'book-a', books: [bookA, bookB] });
      mock.books.list.mockResolvedValue([bookB]);
      mock.books.getActiveSlug.mockResolvedValue(''); // main process cleared active-book.json

      await useBookStore.getState().archiveBook('book-a');

      expect(mock.books.archive).toHaveBeenCalledWith('book-a');
      expect(mock.books.setActive).toHaveBeenCalledWith('book-b');
      expect(useBookStore.getState().activeSlug).toBe('book-b');
    });

    it('archiving a non-active book keeps the current selection', async () => {
      useBookStore.setState({ activeSlug: 'book-a', books: [bookA, bookB] });
      mock.books.list.mockResolvedValue([bookA]);
      mock.books.getActiveSlug.mockResolvedValue('book-a');

      await useBookStore.getState().archiveBook('book-b');

      expect(useBookStore.getState().activeSlug).toBe('book-a');
      expect(mock.books.setActive).not.toHaveBeenCalled();
    });

    it('rethrows bridge failures', async () => {
      mock.books.archive.mockRejectedValue(new Error('locked'));

      await expect(useBookStore.getState().archiveBook('book-a')).rejects.toThrow('locked');
    });
  });

  describe('unarchiveBook', () => {
    it('restores the book, refreshes both lists, and activates it', async () => {
      useAutoDraftStore.setState({ reconnect: vi.fn() });
      mock.books.unarchive.mockResolvedValue(makeBookMeta({ slug: 'book-b' }));
      mock.books.list.mockResolvedValue([bookA, bookB]);
      mock.books.getActiveSlug.mockResolvedValue('book-a');
      mock.books.listArchived.mockResolvedValue([]);

      await useBookStore.getState().unarchiveBook('book-b');

      expect(mock.books.unarchive).toHaveBeenCalledWith('book-b');
      expect(mock.books.listArchived).toHaveBeenCalled();
      expect(useBookStore.getState().archivedBooks).toEqual([]);
      expect(mock.books.setActive).toHaveBeenCalledWith('book-b');
      expect(useBookStore.getState().activeSlug).toBe('book-b');
    });
  });

  describe('loadArchivedBooks', () => {
    it('populates the archived list', async () => {
      const archived = makeBookSummary({ slug: 'old-book' });
      mock.books.listArchived.mockResolvedValue([archived]);

      await useBookStore.getState().loadArchivedBooks();

      expect(useBookStore.getState().archivedBooks).toEqual([archived]);
    });
  });

  describe('subscribeToDirectoryChanges', () => {
    it('reloads books on books:changed pushes until unsubscribed', async () => {
      const cleanup = useBookStore.getState().subscribeToDirectoryChanges();
      expect(mock.listenerCount('books:changed')).toBe(1);

      mock.emit('books:changed');
      await vi.waitFor(() => expect(mock.books.list).toHaveBeenCalledTimes(1));

      cleanup();
      expect(mock.listenerCount('books:changed')).toBe(0);

      mock.emit('books:changed');
      expect(mock.books.list).toHaveBeenCalledTimes(1);
    });
  });
});
