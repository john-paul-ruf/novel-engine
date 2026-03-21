import { create } from 'zustand';
import type { BookSummary } from '@domain/types';
import { useChatStore } from './chatStore';

type BookState = {
  books: BookSummary[];
  activeSlug: string;
  totalWordCount: number;
  loading: boolean;
  loadBooks: () => Promise<void>;
  setActiveBook: (slug: string) => Promise<void>;
  createBook: (title: string) => Promise<string>;
  refreshWordCount: () => Promise<void>;
  /**
   * Open the native file picker and save the selected image as the cover
   * for the given book. Returns the new cover filename (e.g. "cover.jpg")
   * or null if the user cancelled.
   */
  uploadCover: (bookSlug: string) => Promise<string | null>;
  /**
   * Subscribe to `books:changed` push events from the main process.
   * Automatically calls `loadBooks()` whenever the books directory
   * gains or loses a subdirectory (e.g. a book was manually copied in).
   *
   * Returns a cleanup function — pass it to `useEffect`'s return.
   */
  subscribeToDirectoryChanges: () => () => void;
};

export const useBookStore = create<BookState>((set, get) => ({
  books: [],
  activeSlug: '',
  totalWordCount: 0,
  loading: false,

  loadBooks: async () => {
    set({ loading: true });
    try {
      const books = await window.novelEngine.books.list();
      const activeSlug = await window.novelEngine.books.getActiveSlug();
      set({ books, activeSlug, loading: false });

      // Refresh word count for the active book
      if (activeSlug) {
        get().refreshWordCount();
      }
    } catch (error) {
      console.error('Failed to load books:', error);
      set({ loading: false });
    }
  },

  setActiveBook: async (slug: string) => {
    try {
      await window.novelEngine.books.setActive(slug);
      set({ activeSlug: slug });

      // Reset chat context for the new book
      const { switchBook } = useChatStore.getState();
      await switchBook(slug);

      await get().refreshWordCount();
    } catch (error) {
      console.error('Failed to set active book:', error);
    }
  },

  createBook: async (title: string) => {
    try {
      const meta = await window.novelEngine.books.create(title);
      await get().loadBooks();
      return meta.slug;
    } catch (error) {
      console.error('Failed to create book:', error);
      throw error;
    }
  },

  refreshWordCount: async () => {
    const { activeSlug } = get();
    if (!activeSlug) {
      set({ totalWordCount: 0 });
      return;
    }

    try {
      const chapters = await window.novelEngine.books.wordCount(activeSlug);
      const total = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
      set({ totalWordCount: total });
    } catch (error) {
      console.error('Failed to refresh word count:', error);
    }
  },

  uploadCover: async (bookSlug: string) => {
    try {
      const result = await window.novelEngine.books.uploadCover(bookSlug);
      if (result) {
        // Refresh the book list so the updated coverImage field is reflected
        await get().loadBooks();
      }
      return result;
    } catch (error) {
      console.error('Failed to upload cover:', error);
      return null;
    }
  },

  subscribeToDirectoryChanges: () => {
    return window.novelEngine.books.onChanged(() => {
      get().loadBooks();
    });
  },
}));
