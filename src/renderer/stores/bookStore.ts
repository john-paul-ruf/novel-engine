import { create } from 'zustand';
import type { BookSummary } from '@domain/types';

type BookState = {
  books: BookSummary[];
  activeSlug: string;
  totalWordCount: number;
  loading: boolean;
  loadBooks: () => Promise<void>;
  setActiveBook: (slug: string) => Promise<void>;
  createBook: (title: string) => Promise<string>;
  refreshWordCount: () => Promise<void>;
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
}));
