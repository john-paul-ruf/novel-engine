import { create } from 'zustand';
import type { QueryTracker, QueryTarget, QueryStatus, QueryLetter, QueryResearchResult, QueryFieldFillResult, QueryFillableField, StreamEvent } from '@domain/types';
import { useBookStore } from './bookStore';

type QueryStoreState = {
  tracker: QueryTracker | null;
  letters: QueryLetter[];
  loading: boolean;
  generatingFor: string | null;
  streamBuffer: string;
  isGenerating: boolean;
  isResearching: boolean;
  researchBuffer: string;
  lastResearchResult: QueryResearchResult | null;
  fillingFor: string | null;
  error: string | null;

  load: (bookSlug: string) => Promise<void>;
  addTarget: (bookSlug: string, target: Omit<QueryTarget, 'id' | 'queryLetterPath' | 'submittedDate' | 'responseDate'>) => Promise<QueryTarget>;
  updateTargetStatus: (bookSlug: string, targetId: string, status: QueryStatus, responseDate?: string) => Promise<void>;
  removeTarget: (bookSlug: string, targetId: string) => Promise<void>;
  generateLetter: (bookSlug: string, targetId: string) => Promise<QueryLetter | null>;
  researchTargets: () => Promise<QueryResearchResult | null>;
  fillTargetField: (targetId: string, field: QueryFillableField) => Promise<QueryFieldFillResult | null>;
  readLetter: (bookSlug: string, targetSlug: string) => Promise<string>;
  saveLetter: (bookSlug: string, targetSlug: string, content: string) => Promise<void>;
  clear: () => void;
  initStreamListener: () => () => void;
};

export const useQueryStore = create<QueryStoreState>((set, get) => ({
  tracker: null,
  letters: [],
  loading: false,
  generatingFor: null,
  streamBuffer: '',
  isGenerating: false,
  isResearching: false,
  researchBuffer: '',
  lastResearchResult: null,
  fillingFor: null,
  error: null,

  load: async (bookSlug: string) => {
    set({ loading: true, error: null });
    try {
      const [tracker, letters] = await Promise.all([
        window.novelEngine.query.loadTracker(bookSlug),
        window.novelEngine.query.listLetters(bookSlug),
      ]);
      set({ tracker, letters, loading: false });
    } catch (err) {
      console.error('[queryStore] Failed to load:', err);
      set({ loading: false, error: 'Failed to load query tracker' });
    }
  },

  addTarget: async (bookSlug, target) => {
    const created = await window.novelEngine.query.addTarget(bookSlug, target);
    await get().load(bookSlug);
    return created;
  },

  updateTargetStatus: async (bookSlug, targetId, status, responseDate) => {
    await window.novelEngine.query.updateTargetStatus(bookSlug, targetId, status, responseDate);
    await get().load(bookSlug);
  },

  removeTarget: async (bookSlug, targetId) => {
    await window.novelEngine.query.removeTarget(bookSlug, targetId);
    await get().load(bookSlug);
  },

  generateLetter: async (bookSlug, targetId) => {
    set({ generatingFor: targetId, isGenerating: true, streamBuffer: '', error: null });
    try {
      const result = await window.novelEngine.query.generateLetter(bookSlug, targetId);
      set({ generatingFor: null, isGenerating: false, streamBuffer: '' });
      await get().load(bookSlug);
      return result;
    } catch (err) {
      console.error('[queryStore] Letter generation failed:', err);
      set({ generatingFor: null, isGenerating: false, error: 'Letter generation failed' });
      return null;
    }
  },

  researchTargets: async () => {
    const bookSlug = useBookStore.getState().activeSlug;
    if (!bookSlug) return null;
    set({ isResearching: true, researchBuffer: '', lastResearchResult: null, error: null });
    try {
      const result = await window.novelEngine.query.researchTargets(bookSlug);
      set({ isResearching: false, researchBuffer: '', lastResearchResult: result });
      await get().load(bookSlug);
      return result;
    } catch (err) {
      console.error('[queryStore] Research failed:', err);
      // IPC rejections arrive as "Error invoking remote method '...': Error: <message>"
      const raw = err instanceof Error ? err.message : 'Target research failed';
      const message = raw.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '');
      set({ isResearching: false, researchBuffer: '', error: message });
      return null;
    }
  },

  fillTargetField: async (targetId, field) => {
    const bookSlug = useBookStore.getState().activeSlug;
    if (!bookSlug) return null;
    set({ fillingFor: targetId, error: null });
    try {
      const result = await window.novelEngine.query.fillTargetField(bookSlug, targetId, field);
      set({ fillingFor: null });
      await get().load(bookSlug);
      return result;
    } catch (err) {
      console.error('[queryStore] Field fill failed:', err);
      set({ fillingFor: null, error: 'Field research failed' });
      return null;
    }
  },

  readLetter: async (bookSlug, targetSlug) => {
    return window.novelEngine.query.readLetter(bookSlug, targetSlug);
  },

  saveLetter: async (bookSlug, targetSlug, content) => {
    await window.novelEngine.query.saveLetter(bookSlug, targetSlug, content);
    await get().load(bookSlug);
  },

  clear: () => {
    set({ tracker: null, letters: [], loading: false, error: null, generatingFor: null, isGenerating: false, streamBuffer: '', isResearching: false, researchBuffer: '', lastResearchResult: null, fillingFor: null });
  },

  initStreamListener: () => {
    const cleanup = window.novelEngine.query.onStream((event: StreamEvent) => {
      if (event.type === 'textDelta') {
        set((state) => ({
          streamBuffer: state.isGenerating ? state.streamBuffer + event.text : state.streamBuffer,
          researchBuffer: state.isResearching ? state.researchBuffer + event.text : state.researchBuffer,
        }));
      }
    });
    return cleanup;
  },
}));